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

function openingImpact(damage: number): EnemyIntent {
  return { ...impact(damage), matches: (turn) => turn === 1 }
}

function cycle(...rows: Omit<EnemyIntent, 'matches'>[]): EnemyIntent[] {
  return rows.map((row, index) => ({
    ...row, matches: (turn) => (turn - 1) % rows.length === index,
  }))
}

export const ASCENT_ENEMIES = [
  [
    { id: 'thorns', hp: 22, attackPerUnlock: 0, intents: cycle(
      impact(7), combo([3, 2, 2], { kind: 'thorns', value: 2 }), impact(7),
    ) },
    { id: 'lock', hp: 23, attackPerUnlock: 0, intents: cycle(
      impact(7), combo([3, 2, 2], { kind: 'lock' }), impact(8),
    ) },
    { id: 'freeze', hp: 24, attackPerUnlock: 0, intents: [openingImpact(6), ...cycle(
      impact(7), combo([3, 2, 2], { kind: 'freeze' }), impact(8),
    )] },
    { id: 'rage', hp: 23, attackPerUnlock: 0, intents: cycle(
      impact(7), combo([3, 2, 2], { kind: 'rage', value: 2 }), impact(8),
    ) },
  ],
  [
    { id: 'reaction', hp: 35, attackPerUnlock: 2, intents: cycle(
      impact(6),
      impact(10, { kind: 'reaction', value: 8, alternate: { ...combo([2, 2]), matches: () => true } }),
      combo([2, 2]),
      critical(14),
    ) },
    { id: 'vitality', hp: 42, attackPerUnlock: 2, intents: cycle(
      impact(8), impact(0, { kind: 'vitality', divisor: 3, minimum: 6 }), charge, critical(14),
    ) },
    { id: 'escort', hp: 34, attackPerUnlock: 2, intents: cycle(
      { id: 'escort', name: '호위 소환', hits: [], mechanic: { kind: 'escort', hp: 5, bonus: 3 } },
      combo([5, 3], { kind: 'steal', value: 10 }),
      charge,
      critical(14),
    ) },
  ],
  [
    { id: 'boss', hp: 72, attackPerUnlock: 1, attackGrowth: 1, intents: cycle(
      combo([6, 6]),
      charge,
      critical(14),
      { id: 'knockdown', name: '넉다운', hits: [], damageTakenMultiplier: 2 },
      impact(16, { kind: 'seal', value: 5 }),
    ) },
  ],
] as const satisfies readonly (readonly AscentEnemy[])[]

export function enemyForFight(seed: number, fight: number): AscentEnemy {
  const roster = ASCENT_ENEMIES[fight - 1]
  return roster[draw(seed, 0, 40 + fight) % roster.length]
}
