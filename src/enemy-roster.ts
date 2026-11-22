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

function bossCycle(openingHits: readonly number[], criticalDamage: number, sealedDamage: number) {
  return cycle(
    combo(openingHits),
    charge,
    critical(criticalDamage),
    { id: 'knockdown', name: '넉다운', hits: [], damageTakenMultiplier: 2 },
    impact(sealedDamage, { kind: 'seal', value: 5 }),
  )
}

const bossOpening = bossCycle([8, 7], 16, 19)

export const ASCENT_ENEMIES = [
  [
    { id: 'thorns', hp: 22, attackPerUnlock: 0, attackGrowth: 1, intents: [openingImpact(7), ...cycle(
      impact(2), combo([2, 1, 1], { kind: 'thorns', value: 5 }), impact(4),
    )] },
    { id: 'lock', hp: 23, attackPerUnlock: 0, attackGrowth: 1, intents: [openingImpact(7), ...cycle(
      impact(2), combo([1, 2, 2], { kind: 'lock' }), impact(5),
    )] },
    { id: 'freeze', hp: 24, attackPerUnlock: 0, attackGrowth: 1, intents: [openingImpact(7), ...cycle(
      impact(2), combo([2, 2, 2], { kind: 'freeze' }), impact(4),
    )] },
    { id: 'rage', hp: 23, attackPerUnlock: 0, attackGrowth: 1, intents: [openingImpact(7), ...cycle(
      impact(2), combo([2, 2, 2], { kind: 'rage', value: 2 }), impact(5),
    )] },
  ],
  [
    { id: 'reaction', hp: 35, attackPerUnlock: 2, intents: cycle(
      impact(6),
      impact(10, { kind: 'reaction', value: 8, alternate: { ...combo([2, 2]), matches: () => true } }),
      combo([2, 2]),
      critical(22),
    ) },
    { id: 'vitality', hp: 42, attackPerUnlock: 2, attackGrowth: 2, intents: cycle(
      impact(8), impact(0, { kind: 'vitality', divisor: 2, minimum: 9 }), charge, critical(17),
    ) },
    { id: 'escort', hp: 34, attackPerUnlock: 2, intents: cycle(
      { id: 'escort', name: '호위 소환', hits: [], mechanic: { kind: 'escort', hp: 5, bonus: 3 } },
      combo([8, 2], { kind: 'steal', value: 10 }),
      charge,
      critical(19),
    ) },
  ],
  [
    { id: 'boss', hp: 80, attackPerUnlock: 1, attackGrowth: 0, intents: [
      ...bossOpening.map((intent) => ({
        ...intent,
        matches: (turn: number) => turn <= bossOpening.length && intent.matches(turn),
      })),
      ...bossCycle([4, 4], 14, 14),
    ] },
  ],
] as const satisfies readonly (readonly AscentEnemy[])[]

export function enemyForFight(seed: number, fight: number): AscentEnemy {
  const roster = ASCENT_ENEMIES[fight - 1]
  return roster[draw(seed, 0, 40 + fight) % roster.length]
}
