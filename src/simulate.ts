import { startBattle, takeTurn } from './combat.ts'
import type { Action, Battle, Intent } from './combat.ts'

export type Policy = (battle: Battle) => Action

const counters: Record<Intent, Action> = {
  jab: 'attack',
  heavy: 'guard',
  rush: 'interrupt',
}

export const readIntent: Policy = (battle) => counters[battle.intent]
export const attackOnly: Policy = () => 'attack'

export function simulate(seed: number, policy: Policy): Battle[] {
  let battle = startBattle(seed)
  const history = [battle]

  for (let turn = 0; turn < 30 && battle.outcome === 'fighting'; turn += 1) {
    battle = takeTurn(battle, policy(battle))
    history.push(battle)
  }

  return history
}
