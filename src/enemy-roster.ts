import { draw } from './combat.ts'
import type { Enemy, EnemyIntent, EnemyMechanic } from './combat.ts'

interface AscentEnemy extends Enemy {
  readonly id: string
  readonly attackPerUnlock: number
}

function impact(hits: number, mechanic?: EnemyMechanic) {
  return { id: 'impact', name: '한 방', hits: [hits], mechanic }
}

function combo(hits: readonly number[], mechanic?: EnemyMechanic) {
  return { id: 'combo', name: '연타', hits, mechanic }
}

const charge = { id: 'charge', name: '힘 모으기', hits: [], chargeThreshold: 12 }

function critical(damage: number) {
  return { id: 'critical', name: '치명 일격', hits: [damage] }
}

function onTurn(turn: number, row: Omit<EnemyIntent, 'matches'>): EnemyIntent {
  return { ...row, matches: (current) => current === turn }
}

function cycle(...rows: Omit<EnemyIntent, 'matches'>[]): EnemyIntent[] {
  return rows.map((row, index) => ({
    ...row, matches: (turn) => (turn - 1) % rows.length === index,
  }))
}

function bossCycle(openingHits: readonly number[], criticalDamage: number, sealedDamage: number) {
  return cycle(
    combo(openingHits),
    charge,
    critical(criticalDamage),
    { id: 'knockdown', name: '넉다운', hits: [], damageTakenMultiplier: 2 },
    impact(sealedDamage, { kind: 'seal', value: 5 }),
  )
}

function reaction(damage: number, alternateHit = 2) {
  return impact(damage, { kind: 'reaction', value: 8, alternate: { ...combo([alternateHit, alternateHit]), matches: () => true } })
}

function theft(hits: readonly number[]) {
  return combo(hits, { kind: 'steal', value: 10 })
}

function summonEscort(damage: number): Omit<EnemyIntent, 'matches'> {
  return { id: 'escort', name: '호위 소환', hits: [damage], mechanic: { kind: 'escort', hp: 5, bonus: 3 } }
}

const bossOpening = bossCycle([9, 8], 16, 14)

export const ASCENT_ENEMIES = [
  [
    { id: 'thorns', hp: 22, attackPerUnlock: 0, attackGrowth: 1, intents: [onTurn(1, impact(9)), ...cycle(
      impact(2), combo([2, 2, 2], { kind: 'thorns', value: 6 }), impact(4),
    )] },
    { id: 'lock', hp: 23, attackPerUnlock: 0, attackGrowth: 1, intents: [onTurn(1, impact(9)), ...cycle(
      impact(2), combo([2, 2, 2], { kind: 'lock' }), impact(5),
    )] },
    { id: 'freeze', hp: 24, attackPerUnlock: 0, attackGrowth: 1, intents: [onTurn(1, impact(9)), ...cycle(
      impact(2), combo([2, 2, 2], { kind: 'freeze' }), impact(4),
    )] },
    { id: 'rage', hp: 23, attackPerUnlock: 0, attackGrowth: 1, intents: [onTurn(1, impact(9)), ...cycle(
      impact(2), combo([2, 2, 2], { kind: 'rage', value: 2 }), impact(6),
    )] },
  ],
  [
    { id: 'reaction', hp: 26, attackPerUnlock: 2, intents: [
      onTurn(1, impact(16)), onTurn(2, reaction(11)),
      ...cycle(impact(6), reaction(10), combo([2, 2]), critical(21)),
    ] },
    { id: 'vitality', hp: 33, attackPerUnlock: 2, attackGrowth: 2, intents: [
      onTurn(1, impact(19)),
      ...cycle(impact(8), impact(0, { kind: 'vitality', divisor: 2, minimum: 4 }), charge, critical(17)),
    ] },
    { id: 'escort', hp: 26, attackPerUnlock: 2, intents: [
      onTurn(1, theft([10, 9])), onTurn(2, summonEscort(10)),
      ...cycle(theft([8, 2]), summonEscort(4), charge, critical(18)),
    ] },
  ],
  [
    { id: 'boss', hp: 88, attackPerUnlock: 1, attackGrowth: 0, intents: [
      ...bossOpening.map((intent) => ({
        ...intent,
        matches: (turn: number) => turn <= bossOpening.length && intent.matches(turn),
      })),
      ...bossCycle([6, 6], 15, 13),
    ] },
  ],
] as const satisfies readonly (readonly AscentEnemy[])[]

export const MAP_ENEMIES = [
  { id: 'shield-soldier', hp: 23, attackPerUnlock: 0, attackGrowth: 1, intents: cycle(impact(4), reaction(9, 3), combo([3, 3])) },
  { id: 'seal-sentinel', hp: 25, attackPerUnlock: 0, attackGrowth: 1, intents: cycle(combo([5, 4]), impact(12, { kind: 'seal', value: 5 }), impact(9)) },
  { id: 'iron-knight', hp: 30, attackPerUnlock: 1, attackGrowth: 0, intents: cycle(
    combo([6, 5]), charge, critical(15), { id: 'knockdown', name: '넉다운', hits: [], damageTakenMultiplier: 2 },
  ) },
] as const satisfies readonly AscentEnemy[]

export type AscentEnemyId = (typeof ASCENT_ENEMIES)[number][number]['id'] | (typeof MAP_ENEMIES)[number]['id'] | 'chain-warden'

const armor = 'armor' as const
const reflect = 'reflect' as const
const topple = 'topple' as const

export const RULES_SIX_ENEMIES = {
  thorns: [onTurn(1, impact(9)), ...cycle(impact(2), combo([4, 3], { kind: 'thorns', value: 6 }), impact(4))],
  lock: [onTurn(1, combo([5, 4])), ...cycle(impact(2), impact(7, { kind: 'lock' }), combo([1, 2]))],
  freeze: [onTurn(1, combo([3, 3, 2])), ...cycle(impact(2), { ...impact(5), gimmick: 'trip' }, combo([2, 2]))],
  rage: [onTurn(1, combo([7, 2])), ...cycle(impact(2), combo([4, 3]), impact(6, { kind: 'rage', value: 2 }))],
  'shield-soldier': cycle(impact(4), { ...combo([4, 3]), gimmick: armor }, combo([3, 3])),
  reaction: [onTurn(1, impact(16)), onTurn(2, { ...combo([5, 3]), gimmick: armor }),
    ...cycle(impact(6), { ...combo([4, 3]), gimmick: armor }, combo([2, 2]), critical(21))],
  vitality: [onTurn(1, impact(19)), ...cycle(impact(8), { ...impact(6), gimmick: reflect }, charge, critical(17))],
  escort: [onTurn(1, combo([10, 9])), onTurn(2, summonEscort(10)), ...cycle(combo([8, 2]), summonEscort(4), charge, critical(18))],
  'seal-sentinel': cycle(combo([3, 4]), { ...impact(8), gimmick: topple }, impact(9)),
  boss: [onTurn(1, combo([11, 10])), onTurn(3, critical(20)), onTurn(5, { ...impact(18), gimmick: topple }),
    ...cycle(combo([11, 10]), charge, critical(19), impact(16), { ...impact(17), gimmick: topple })],
} satisfies Partial<Record<AscentEnemyId, readonly EnemyIntent[]>>

export const CHAIN_WARDEN = {
  id: 'chain-warden', hp: 62, attackPerUnlock: 0, attackGrowth: 0,
  intents: cycle(combo([9, 8]), { ...impact(10), gimmick: reflect }, charge, critical(19),
    { id: 'knockdown', name: '넉다운', hits: [], damageTakenMultiplier: 2 }),
} as const satisfies AscentEnemy

export function enemyForFight(seed: number, fight: number): AscentEnemy & { readonly id: AscentEnemyId } {
  const roster = ASCENT_ENEMIES[fight - 1]
  return roster[draw(seed, 0, 40 + fight) % roster.length]
}
