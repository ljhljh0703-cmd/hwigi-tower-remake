import {
  assignDie, DIE_COUNT, forecast, rerollDie, resolveTurn, startBattle, throwCounter,
} from './combat.ts'
import type { Battle, Slot } from './combat.ts'

export interface Policy {
  allocation: (battle: Battle) => readonly Slot[]
  reroll?: (battle: Battle) => number
}

const allocations: readonly Slot[][] = Array.from({ length: 1 << DIE_COUNT }, (_, mask) =>
  Array.from({ length: DIE_COUNT }, (_, i) => (mask & (1 << i)) === 0 ? 'attack' : 'guard'),
)

export const allAttack: Policy = { allocation: () => ['attack', 'attack', 'attack'] }
export const allGuard: Policy = { allocation: () => ['guard', 'guard', 'guard'] }
export const balanced: Policy = { allocation: () => ['attack', 'guard', 'guard'] }

export const adapt: Policy = {
  allocation(battle) {
    const score = (plan: readonly Slot[]) => {
      const result = forecast(battle, plan)
      const dealt = result.dealt + result.overflow
      if (dealt >= battle.enemyHp) return 1000
      if (result.damage >= battle.playerHp) return -1000 + dealt
      const expectedCounter = result.counter ? Math.min(3.5, battle.enemyHp - dealt) : 0
      return dealt + expectedCounter - result.damage * (battle.playerHp <= 12 ? 1.8 : 0.85)
    }
    return allocations.reduce((best, plan) => score(plan) > score(best) ? plan : best)
  },
}

export function lowestDie(battle: Battle): number {
  return battle.dice.indexOf(Math.min(...battle.dice))
}

export const adaptAndReroll: Policy = {
  ...adapt,
  reroll: (battle) => Math.min(...battle.dice) <= 3 ? lowestDie(battle) : -1,
}

export const alwaysReroll: Policy = { ...adapt, reroll: lowestDie }

export function countTradeoffs(battle: Battle): number {
  const plans = allocations.map((plan) => {
    const result = forecast(battle, plan)
    return {
      lost: result.damage,
      dealt: Math.min(battle.enemyHp, result.dealt + result.overflow + (result.counter ? 3.5 : 0)),
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
    battle = rerollDie(battle, policy.reroll?.(battle) ?? -1)
    const allocation = policy.allocation(battle)
    allocation.forEach((slot, index) => { battle = assignDie(battle, index, slot) })
    history.push(battle)
    battle = resolveTurn(battle)
    if (battle.phase === 'counter') {
      history.push(battle)
      battle = throwCounter(battle)
    }
    history.push(battle)
  }
  return history
}
