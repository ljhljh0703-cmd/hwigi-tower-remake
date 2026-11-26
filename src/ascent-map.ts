import { draw } from './combat.ts'
import { ASCENT_ENEMIES, CHAIN_WARDEN, MAP_ENEMIES, RULES_SIX_ENEMIES } from './enemy-roster.ts'
import type { AscentEnemyId, enemyForFight } from './enemy-roster.ts'

export const MAP_RULES = 1
export type MapRules = 1 | 2 | 3 | 4 | 5 | 6 | 7
export const CURRENT_MAP_RULES = 7
export const MAP_START = 0
export const MAP_FLOORS = 12
export const MAP_FIGHTS = MAP_FLOORS - 1
export const MAP_REWARD_CHANNEL = 84

export type MapNodeKind = 'fight' | 'elite' | 'rest' | 'boss' | 'event' | 'shop'
export function victoryCoins(kind: MapNodeKind) {
  return kind === 'elite' ? 2 : kind === 'fight' ? 1 : 0
}
export const MAP_EVENTS = ['medicine', 'pulley', 'flag'] as const
export type MapEvent = (typeof MAP_EVENTS)[number]
export type MapLane = 0 | 1 | 2

export interface MapNode {
  readonly id: number
  readonly floor: number
  readonly lane: MapLane
  readonly kind: MapNodeKind
  readonly enemyId?: AscentEnemyId
  readonly event?: MapEvent
  readonly battleSeed: number
  readonly next: readonly number[]
}

export interface AscentMap {
  readonly rules: MapRules
  readonly nodes: readonly MapNode[]
  readonly byId: Readonly<Record<number, MapNode>>
}

const stageOneFloors: readonly (readonly MapNodeKind[])[] = [
  ['fight'], ['fight', 'fight'], ['fight', 'fight'], ['fight', 'fight'],
  ['fight', 'elite'], ['fight', 'fight'], ['fight', 'fight'], ['fight', 'elite'],
  ['fight', 'fight'], ['fight', 'elite'], ['rest'], ['boss'],
]
const normalEnemies = [['lock', 'freeze'], ['thorns', 'rage']] as const
const eliteEnemies = ['reaction', 'vitality', 'escort'] as const
const roster = [...ASCENT_ENEMIES.flat(), ...MAP_ENEMIES]

export const MAP_ENEMY_BADGES = {
  'shield-soldier': { icon: 'reaction', label: '방패병' },
  'seal-sentinel': { icon: 'seal', label: '봉인 파수꾼' },
  'iron-knight': { icon: 'charge', label: '철갑 기사' },
} satisfies Partial<Record<AscentEnemyId, { icon: string; label: string }>>

export const RULES_SIX_BADGES = {
  freeze: { icon: 'sword', label: '엇걸음병' },
  reaction: { icon: 'shield', label: '갑주 강적' },
  vitality: { icon: 'treasure-hammer', label: '철추 강적' },
  escort: { icon: 'escort', label: '호위 강적' },
  'seal-sentinel': { icon: 'knockdown', label: '눈금 파수꾼' },
  'chain-warden': { icon: 'treasure-hammer', label: '쇠사슬 집행관' },
} satisfies Partial<Record<AscentEnemyId, { icon: string; label: string }>>

function forkKinds(seed: number, floor: number, rules: MapRules): readonly MapNodeKind[] {
  const merchantFloor = rules >= 6 ? 7 + draw(seed, 0, 90) % 2 : 6 + draw(seed, 0, 90) % 3
  const earlyEvent = 3 + draw(seed, 0, 91) % 3
  const lateEvent = Math.max(merchantFloor + 1, 8) + draw(seed, 0, 92) % (11 - Math.max(merchantFloor + 1, 8))
  if (floor === merchantFloor) return ['fight', 'shop']
  if (floor === earlyEvent || floor === lateEvent) return ['fight', 'event']
  return ['fight', 'elite']
}

export function generateAscentMap(seed: number, rules: MapRules = MAP_RULES): AscentMap {
  const diagonal = draw(seed, 0, 80) % 2
  const eliteStart = draw(seed, 0, 86) % eliteEnemies.length
  let eliteIndex = 0
  const nodes = stageOneFloors.flatMap((types, index) => {
    const floor = index + 1
    const variants: readonly MapNodeKind[] = rules >= 6 && floor === 6 ? ['boss']
      : rules >= 4 && types.length === 2 ? forkKinds(seed, floor, rules)
      : rules >= 2 && (floor === 4 || floor === 9) ? ['fight', 'event']
      : rules >= 2 && floor === 7 ? ['fight', 'shop'] : types
    const ordered = draw(seed, floor, 81) % 2 ? [...variants].reverse() : variants
    const replacement = rules >= 3 ? draw(seed, floor, 88) % 2 : undefined
    return ordered.map((kind, position): MapNode => {
      const lane = variants.length === 1 ? 2 : position as 0 | 1
      const id = floor * 4 + lane
      const baseEnemy = kind === 'fight' ? normalEnemies[floor % 2][(draw(seed, floor, 82) + position) % 2]
        : kind === 'elite' ? eliteEnemies[(eliteStart + eliteIndex++) % eliteEnemies.length]
          : kind === 'boss' ? (floor === 6 ? 'chain-warden' : 'boss') : undefined
      const enemyId = replacement === 0 && kind === 'fight' && position === ordered.indexOf('fight')
        ? floor === (rules >= 6 ? 8 : 6) ? 'shield-soldier' : floor === 9 ? 'seal-sentinel' : baseEnemy
        : replacement === 1 && floor === 10 && kind === 'elite' ? 'iron-knight' : baseEnemy
      const nextBase = (floor + 1) * 4
      const next = floor === MAP_FLOORS ? [] : floor >= 10 || (rules >= 6 && floor === 5) ? [nextBase + 2]
        : rules >= 4 || lane === 2 ? [nextBase, nextBase + 1]
          : lane === (floor + diagonal) % 2 ? [nextBase, nextBase + 1] : [nextBase + lane]
      const eventOrder = rules >= 4 ? draw(seed, floor, 87) : draw(seed, 0, 87) + Number(floor === 9)
      const event = kind === 'event' ? MAP_EVENTS[eventOrder % MAP_EVENTS.length] : undefined
      return { id, floor, lane, kind, ...(enemyId && { enemyId }), ...(event && { event }), battleSeed: draw(seed, id, 83), next }
    })
  })
  return { rules, nodes, byId: Object.fromEntries(nodes.map((node) => [node.id, node])) }
}

export function nextMapNodes(map: AscentMap, current: number): readonly MapNode[] {
  if (current === MAP_START) return [map.nodes[0]]
  return map.byId[current]?.next.map((id) => map.byId[id]) ?? []
}

export function mapPathIsValid(map: AscentMap, path: readonly number[]): boolean {
  let previous = MAP_START
  for (const id of path) {
    if (!nextMapNodes(map, previous).some((node) => node.id === id)) return false
    previous = id
  }
  return true
}

export function enemyForMapNode(node: MapNode, rules: MapRules): ReturnType<typeof enemyForFight> | undefined {
  if (node.enemyId === 'chain-warden') return CHAIN_WARDEN
  const original = roster.find(({ id }) => id === node.enemyId)
  if (!original) return undefined
  const newIntents = rules >= 6 && original.id !== 'iron-knight' ? RULES_SIX_ENEMIES[original.id] : undefined
  const enemy = newIntents ? { ...original, intents: newIntents } : original
  const boss = node.kind === 'boss'
  const elite = node.kind === 'elite'
  // Rules 1–4 keep the unlock bonus when an existing ascent enters another battle.
  const attackPerUnlock = rules <= 4 ? Number(elite || boss) : 0
  if (boss) return { ...enemy, hp: rules >= 6 ? 83 : rules >= 2 ? 84 : enemy.hp, attackPerUnlock }
  const earlyElite = rules >= 4 && elite && node.floor <= 5
  const growthHp = enemy.hp - (earlyElite ? 4 : 0) + 2 * Math.floor((node.floor - (elite ? 5 : 1)) / 2)
  const hp = rules < 6 ? growthHp : enemy.id === 'seal-sentinel' ? 27
    : growthHp + (elite ? 2 : node.floor >= 2 && node.floor <= 8 ? 4 : 0)
  const firstHitAdjustment = Number(node.floor >= 9) - (elite ? 3 : 0) - (earlyElite ? 2 : 0)
  const first = enemy.intents.find((intent) => intent.matches(1))!
  const intents = firstHitAdjustment && first.hits.length
    ? [{ ...first, matches: (turn: number) => turn === 1, hits: [Math.max(1, first.hits[0] + firstHitAdjustment), ...first.hits.slice(1)] }, ...enemy.intents]
    : enemy.intents
  return { ...enemy, hp, intents, attackPerUnlock }
}
