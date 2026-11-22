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

const charge = { id: 'charge', name: '힘 모으기', hits: [], chargeThreshold: 15 }

function critical(damage: number) {
  return { id: 'critical', name: '치명 일격', hits: [damage] }
}

function cycle(...rows: Omit<EnemyIntent, 'matches'>[]): EnemyIntent[] {
  return rows.map((row, index) => ({
    ...row, matches: (turn) => (turn - 1) % rows.length === index,
  }))
}

export const ASCENT_ENEMIES = [
  [
    { id: 'thorns', hp: 32, attackPerUnlock: 0, intents: cycle(
      impact(14), combo([3, 3, 3], { kind: 'thorns', value: 2 }), impact(8),
    ) },
    { id: 'lock', hp: 32, attackPerUnlock: 0, intents: cycle(
      impact(14), combo([3, 3, 3], { kind: 'lock' }), impact(13),
    ) },
    { id: 'freeze', hp: 33, attackPerUnlock: 0, intents: cycle(
      impact(13), combo([2, 3, 3], { kind: 'freeze' }), impact(12),
    ) },
    { id: 'rage', hp: 32, attackPerUnlock: 0, intents: cycle(
      impact(14), combo([3, 3, 3], { kind: 'rage', value: 2 }), impact(13),
    ) },
  ],
  [
    { id: 'reaction', hp: 54, attackPerUnlock: 2, intents: cycle(
      combo([3, 1, 2]),
      impact(13, { kind: 'reaction', value: 8, alternate: { ...combo([3, 3]), matches: () => true } }),
      charge,
      critical(14),
    ) },
    { id: 'vitality', hp: 57, attackPerUnlock: 2, intents: cycle(
      combo([3, 1, 2]), impact(0, { kind: 'vitality', value: 5 }), charge, critical(14),
    ) },
    { id: 'escort', hp: 49, attackPerUnlock: 2, intents: cycle(
      { id: 'escort', name: '호위 소환', hits: [], mechanic: { kind: 'escort', hp: 5, bonus: 3 } },
      combo([5, 3], { kind: 'steal', value: 10 }),
      charge,
      critical(14),
    ) },
  ],
  [
    { id: 'boss', hp: 58, attackPerUnlock: 1, attackGrowth: 0, intents: cycle(
      combo([2, 2]),
      charge,
      critical(16),
      { id: 'knockdown', name: '넉다운', hits: [], damageTakenMultiplier: 3 },
      impact(12, { kind: 'seal', value: 5 }),
    ) },
  ],
] as const satisfies readonly (readonly AscentEnemy[])[]

export function enemyForFight(seed: number, fight: number): AscentEnemy {
  const roster = ASCENT_ENEMIES[fight - 1]
  return roster[draw(seed, 0, 40 + fight) % roster.length]
}
