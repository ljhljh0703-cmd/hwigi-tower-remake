import { allocationTotals, attackFor, chargedStrikePreview, enemyIntentAt, incomingAttack } from './combat.ts'
import type { Slot } from './combat.ts'
import { adaptAndReroll, expectedReward } from './simulate.ts'
import { canReroll, classifyYachtHand, forecastYacht, yachtCounterRewards } from './yacht-combat.ts'
import type { YachtBattle } from './yacht-combat.ts'

export const yachtPolicies = ['adaptive', 'attackHand', 'guardHand'] as const
export type YachtPolicy = (typeof yachtPolicies)[number] | 'guardFirst'

function enumerateAllocations(diceCount: number, slots: readonly Slot[]): Slot[][] {
  return Array.from({ length: slots.length ** diceCount }, (_, mask) =>
    Array.from({ length: diceCount }, (_, index) => slots[Math.floor(mask / slots.length ** index) % slots.length]),
  )
}

const allocations = [2, 3, 4].map((count) => enumerateAllocations(count, ['attack', 'guard']))
const escortAllocations = [2, 3, 4].map((count) => enumerateAllocations(count, ['attack', 'guard', 'escort']))

function allocationsFor(battle: YachtBattle): readonly Slot[][] {
  return (battle.escort ? escortAllocations : allocations)[battle.dice.length - 2]
}

function allocationScore(battle: YachtBattle, plan: readonly Slot[]) {
  const { dealt, damage, counter, escortDealt, chargeBroken } = forecastYacht(battle, plan)
  if (damage >= battle.playerHp) return -1000 + dealt
  if (dealt >= battle.enemyHp) return 1000
  const expectedCounter = counter ? expectedReward(battle.enemyHp - dealt, yachtCounterRewards(battle, plan)) : 0
  const charge = chargeBroken ? chargedStrikePreview({ ...battle, slots: plan }) : null
  const chargeValue = charge ? charge.fullDamage - charge.totalDamage : 0
  return dealt + escortDealt * 0.85 + expectedCounter + chargeValue -
    damage * (battle.playerHp <= 12 ? 1.8 : 0.85)
}

function bestAllocation(battle: YachtBattle, plans: readonly Slot[][]): readonly Slot[] {
  let best = plans[0]
  let bestScore = -Infinity
  for (const plan of plans) {
    const score = allocationScore(battle, plan)
    if (score >= 1000) return plan
    if (score > bestScore) {
      best = plan
      bestScore = score
    }
  }
  return best
}

function handAllocations(battle: YachtBattle, slot: Slot): Slot[][] {
  return allocationsFor(battle).filter((plan) => {
    const faces = battle.dice.filter((_, index) => plan[index] === slot)
    return classifyYachtHand(battle, faces) !== null && (slot === 'attack' || forecastYacht(battle, plan).counter)
  })
}

const handTargets = [
  ...[6, 5, 4, 3, 2, 1].map((face) => [face, face, face]),
  ...[1, 2, 3, 4].map((face) => [face, face + 1, face + 2]),
]

function keepForHand(battle: YachtBattle, slot: Slot): readonly number[] {
  const { totalDamage } = incomingAttack(battle)
  for (const target of handTargets) {
    if (!classifyYachtHand(battle, target)) continue
    if (slot === 'guard' && target.reduce((sum, face) => sum + face, 0) !== totalDamage) continue
    const needed = [...target]
    const matching = battle.dice.flatMap((face, index) => {
      const match = needed.indexOf(face)
      if (match === -1) return []
      needed.splice(match, 1)
      return [index]
    })
    if (matching.length === 2) return matching
  }
  return []
}

function lowestDie(battle: YachtBattle, indices: readonly number[]): number | undefined {
  return indices.reduce<number | undefined>((lowest, index) =>
    lowest === undefined || battle.dice[index] < battle.dice[lowest] ? index : lowest, undefined)
}

export function chooseAllocation(battle: YachtBattle, policy: YachtPolicy): readonly Slot[] {
  if (policy === 'guardFirst') {
    const target = attackFor(battle, enemyIntentAt(battle)).totalDamage
    let best: readonly Slot[] = []
    let bestCost = Infinity
    for (const plan of allocations[battle.dice.length - 2]) {
      const { guard } = allocationTotals(battle, plan)
      const cost = guard >= target ? guard - target : 1 + 6 * battle.dice.length + target - guard
      if (cost < bestCost) {
        best = plan
        bestCost = cost
      }
    }
    return best
  }
  if (policy === 'attackHand' || policy === 'guardHand') {
    const plans = handAllocations(battle, policy === 'attackHand' ? 'attack' : 'guard')
    if (plans.length > 0) return bestAllocation(battle, plans)
  }
  return bestAllocation(battle, allocationsFor(battle))
}

export function chooseReroll(battle: YachtBattle, policy: YachtPolicy, extra: boolean): readonly number[] {
  let indices: readonly number[] | undefined
  if (policy === 'attackHand' || policy === 'guardHand') {
    const slot = policy === 'attackHand' ? 'attack' : 'guard'
    if (handAllocations(battle, slot).length > 0) return []
    const keep = keepForHand(battle, slot)
    if (keep.length > 0) {
      indices = battle.dice.flatMap((_, index) => keep.includes(index) ? [] : [index])
    }
  }
  indices ??= adaptAndReroll.reroll?.(battle) ?? []
  const mechanic = enemyIntentAt(battle).mechanic
  if (mechanic?.kind === 'seal') {
    indices = [...new Set([...indices, ...battle.dice.flatMap((face, index) => face === mechanic.value ? [index] : [])])]
  }
  indices = indices.filter((index) => canReroll(battle, index))
  if (mechanic?.kind === 'rage' && !battle.rerolled && indices.length) {
    const current = allocationScore(battle, chooseAllocation(battle, policy))
    const improvedDice = battle.dice.map((face, index) => indices.includes(index) ? 4 : face)
    const after = { ...battle, dice: improvedDice, rerolled: true }
    if (allocationScore(after, chooseAllocation(after, policy)) <= current) return []
  }
  if (!extra) return indices
  const sealed = mechanic?.kind === 'seal' ? indices.find((index) => battle.dice[index] === mechanic.value) : undefined
  const lowest = sealed ?? lowestDie(battle, indices)
  return lowest === undefined ? [] : [lowest]
}

export function countYachtTradeoffs(battle: YachtBattle): number {
  const viable = allocationsFor(battle).map((plan) => {
    const { dealt, damage, counter } = forecastYacht(battle, plan)
    return {
      lost: damage,
      dealt: dealt + (counter ? expectedReward(battle.enemyHp - dealt, yachtCounterRewards(battle, plan)) : 0),
    }
  }).filter((plan) => plan.lost < battle.playerHp)

  const distinct = new Map(viable.map((plan) => [`${plan.lost}/${plan.dealt}`, plan]))
  return [...distinct.values()].filter((plan) => !viable.some((other) =>
    other.lost <= plan.lost && other.dealt >= plan.dealt && (other.lost < plan.lost || other.dealt > plan.dealt),
  )).length
}
