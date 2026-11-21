import { DIE_COUNT, incomingAttack } from './combat.ts'
import type { Slot } from './combat.ts'
import { adaptAndReroll, expectedReward } from './simulate.ts'
import { classifyHand, forecastYacht, yachtCounterRewards } from './yacht-combat.ts'
import type { YachtBattle } from './yacht-combat.ts'

export const yachtPolicies = ['adaptive', 'attackHand', 'guardHand'] as const
export type YachtPolicy = (typeof yachtPolicies)[number]

function enumerateAllocations(diceCount: number): Slot[][] {
  return Array.from({ length: 1 << diceCount }, (_, mask) =>
    Array.from({ length: diceCount }, (_, index) => (mask & (1 << index)) === 0 ? 'attack' : 'guard'),
  )
}

const threeDieAllocations = enumerateAllocations(DIE_COUNT)
const fourDieAllocations = enumerateAllocations(DIE_COUNT + 1)

function allocationsFor(battle: YachtBattle): readonly Slot[][] {
  return battle.dice.length === DIE_COUNT ? threeDieAllocations : fourDieAllocations
}

function bestAllocation(battle: YachtBattle, plans: readonly Slot[][]): readonly Slot[] {
  let best = plans[0]
  let bestScore = -Infinity
  for (const plan of plans) {
    const { dealt, damage, counter } = forecastYacht(battle, plan)
    if (dealt >= battle.enemyHp) return plan
    const expectedCounter = counter ? expectedReward(battle.enemyHp - dealt, yachtCounterRewards(battle, plan)) : 0
    const score = damage >= battle.playerHp
      ? -1000 + dealt
      : dealt + expectedCounter - damage * (battle.playerHp <= 12 ? 1.8 : 0.85)
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
    return classifyHand(faces) !== null && (slot === 'attack' || forecastYacht(battle, plan).counter)
  })
}

const handTargets = [
  ...[6, 5, 4, 3, 2, 1].map((face) => [face, face, face]),
  ...[1, 2, 3, 4].map((face) => [face, face + 1, face + 2]),
]

function keepForHand(battle: YachtBattle, slot: Slot): readonly number[] {
  const { totalDamage } = incomingAttack(battle)
  for (const target of handTargets) {
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
  if (policy !== 'adaptive') {
    const plans = handAllocations(battle, policy === 'attackHand' ? 'attack' : 'guard')
    if (plans.length > 0) return bestAllocation(battle, plans)
  }
  return bestAllocation(battle, allocationsFor(battle))
}

export function chooseReroll(battle: YachtBattle, policy: YachtPolicy, extra: boolean): readonly number[] {
  let indices: readonly number[] | undefined
  if (policy !== 'adaptive') {
    const slot = policy === 'attackHand' ? 'attack' : 'guard'
    if (handAllocations(battle, slot).length > 0) return []
    const keep = keepForHand(battle, slot)
    if (keep.length > 0) {
      indices = battle.dice.flatMap((_, index) => keep.includes(index) ? [] : [index])
    }
  }
  indices ??= adaptAndReroll.reroll?.(battle) ?? []
  if (!extra) return indices
  const lowest = lowestDie(battle, indices)
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
