export const ACTIONS = ['attack', 'guard', 'interrupt'] as const
export type Action = (typeof ACTIONS)[number]
export type Intent = 'jab' | 'heavy' | 'rush'
export type Outcome = 'fighting' | 'won' | 'lost'

export const DEFAULT_SEED = 20261121
export const PLAYER_HP = 15
export const ENEMY_HP = 23

export const INTENTS = {
  jab: { label: '견제', damage: 2 },
  heavy: { label: '강타', damage: 6 },
  rush: { label: '돌진', damage: 4 },
} satisfies Record<Intent, { label: string; damage: number }>

const intentOrders = [
  ['jab', 'heavy', 'rush'],
  ['jab', 'rush', 'heavy'],
  ['heavy', 'jab', 'rush'],
  ['heavy', 'rush', 'jab'],
  ['rush', 'jab', 'heavy'],
  ['rush', 'heavy', 'jab'],
] as const

export interface Battle {
  readonly seed: number
  readonly turn: number
  readonly intent: Intent
  readonly playerHp: number
  readonly enemyHp: number
  readonly outcome: Outcome
  readonly lastExchange: {
    readonly action: Action
    readonly intent: Intent
    readonly dealt: number
    readonly taken: number
  } | null
}

export function intentForTurn(seed: number, turn: number): Intent {
  const cycle = Math.floor((turn - 1) / 3)
  let mixed = (seed + Math.imul(cycle + 1, 0x9e3779b9)) >>> 0
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x21f0aaad)
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x735a2d97)
  mixed = (mixed ^ (mixed >>> 15)) >>> 0
  return intentOrders[mixed % intentOrders.length][(turn - 1) % 3]
}

export function startBattle(seed: number): Battle {
  const normalizedSeed = seed >>> 0
  return {
    seed: normalizedSeed,
    turn: 1,
    intent: intentForTurn(normalizedSeed, 1),
    playerHp: PLAYER_HP,
    enemyHp: ENEMY_HP,
    outcome: 'fighting',
    lastExchange: null,
  }
}

const exchanges = {
  attack: {
    jab: { dealt: 5, taken: INTENTS.jab.damage },
    heavy: { dealt: 4, taken: INTENTS.heavy.damage },
    rush: { dealt: 4, taken: INTENTS.rush.damage },
  },
  guard: {
    jab: { dealt: 0, taken: 1 },
    heavy: { dealt: 4, taken: 0 },
    rush: { dealt: 0, taken: 3 },
  },
  interrupt: {
    jab: { dealt: 1, taken: INTENTS.jab.damage },
    heavy: { dealt: 1, taken: INTENTS.heavy.damage },
    rush: { dealt: 6, taken: 0 },
  },
} satisfies Record<Action, Record<Intent, { dealt: number; taken: number }>>

export function takeTurn(battle: Battle, action: Action): Battle {
  if (battle.outcome !== 'fighting') return battle

  const exchange = exchanges[action][battle.intent]
  const dealt = Math.min(battle.enemyHp, exchange.dealt)
  const enemyHp = battle.enemyHp - dealt
  const taken = enemyHp === 0 ? 0 : Math.min(battle.playerHp, exchange.taken)
  const playerHp = battle.playerHp - taken
  const outcome = enemyHp === 0 ? 'won' : playerHp === 0 ? 'lost' : 'fighting'
  const turn = outcome === 'fighting' ? battle.turn + 1 : battle.turn

  return {
    ...battle,
    turn,
    outcome,
    enemyHp,
    playerHp,
    intent: intentForTurn(battle.seed, turn),
    lastExchange: { action, intent: battle.intent, dealt, taken },
  }
}
