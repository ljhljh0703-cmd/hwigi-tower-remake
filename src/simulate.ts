import {
  assignDie, COUNTER_REWARDS, DIE_COUNT, forecast, rerollDice, resolveTurn, spinCounter, startBattle,
} from './combat.ts'
import type { Battle, Slot } from './combat.ts'

export interface Policy {
  allocation: (battle: Battle) => readonly Slot[]
  reroll?: (battle: Battle) => readonly number[]
}

const allocations: readonly Slot[][] = Array.from({ length: 1 << DIE_COUNT }, (_, mask) =>
  Array.from({ length: DIE_COUNT }, (_, i) => (mask & (1 << i)) === 0 ? 'attack' : 'guard'),
)

function expectedReward(enemyHp: number): number {
  return COUNTER_REWARDS.reduce((sum, reward) => sum + Math.min(enemyHp, reward.damage), 0) / COUNTER_REWARDS.length
}

export const allAttack: Policy = { allocation: () => ['attack', 'attack', 'attack'] }
export const allGuard: Policy = { allocation: () => ['guard', 'guard', 'guard'] }
export const balanced: Policy = { allocation: () => ['attack', 'guard', 'guard'] }

export const adapt: Policy = {
  allocation(battle) {
    const score = (plan: readonly Slot[]) => {
      const { dealt, damage, counter } = forecast(battle, plan)
      if (dealt >= battle.enemyHp) return 1000
      if (damage >= battle.playerHp) return -1000 + dealt
      const expectedCounter = counter ? expectedReward(battle.enemyHp - dealt) : 0
      return dealt + expectedCounter - damage * (battle.playerHp <= 12 ? 1.8 : 0.85)
    }
    return allocations.reduce((best, plan) => score(plan) > score(best) ? plan : best)
  },
}

export const adaptAndReroll: Policy = {
  ...adapt,
  reroll: (battle) => battle.dice.flatMap((face, index) => face <= 3 ? [index] : []),
}

export const alwaysReroll: Policy = { ...adapt, reroll: (battle) => battle.dice.map((_, index) => index) }

export function countTradeoffs(battle: Battle): number {
  const plans = allocations.map((plan) => {
    const result = forecast(battle, plan)
    return {
      lost: result.damage,
      dealt: result.dealt + (result.counter ? expectedReward(battle.enemyHp - result.dealt) : 0),
    }
  })
  const viable = plans.filter((plan) => plan.lost < battle.playerHp)
  const distinct = new Map(viable.map((plan) => [`${plan.lost}/${plan.dealt}`, plan]))
  return [...distinct.values()].filter((plan) => !viable.some((other) =>
    other.lost <= plan.lost && other.dealt >= plan.dealt &&
    (other.lost < plan.lost || other.dealt > plan.dealt),
  )).length
}

export function simulate(seed: number, policy: Policy): Battle[] {
  let battle = startBattle(seed)
  const history = [battle]
  for (let turn = 0; turn < 30 && battle.phase === 'assign'; turn += 1) {
    battle = rerollDice(battle, policy.reroll?.(battle) ?? [])
    const allocation = policy.allocation(battle)
    allocation.forEach((slot, index) => { battle = assignDie(battle, index, slot) })
    history.push(battle)
    battle = resolveTurn(battle)
    if (battle.phase === 'counter') {
      history.push(battle)
      battle = spinCounter(battle)
    }
    history.push(battle)
  }
  return history
}
