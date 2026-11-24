import { draw } from './combat.ts'
import { ASCENT_ENEMIES } from './enemy-roster.ts'
import type { AscentEnemyId, enemyForFight } from './enemy-roster.ts'

export const MAP_RULES = 1
export type MapRules = 1 | 2
export const MAP_START = 0
export const MAP_FLOORS = 12
export const MAP_FIGHTS = MAP_FLOORS - 1
export const MAP_REWARD_CHANNEL = 84

export type MapNodeKind = 'fight' | 'elite' | 'rest' | 'boss' | 'event' | 'shop'
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
const roster = ASCENT_ENEMIES.flat()

export function generateAscentMap(seed: number, rules: MapRules = MAP_RULES): AscentMap {
  const diagonal = draw(seed, 0, 80) % 2
  const eliteStart = draw(seed, 0, 86) % eliteEnemies.length
  let eliteIndex = 0
  const nodes = stageOneFloors.flatMap((types, index) => {
    const floor = index + 1
    const variants: readonly MapNodeKind[] = rules === 2 && (floor === 4 || floor === 9) ? ['fight', 'event']
      : rules === 2 && floor === 7 ? ['fight', 'shop'] : types
    const ordered = draw(seed, floor, 81) % 2 ? [...variants].reverse() : variants
    return ordered.map((kind, position): MapNode => {
      const lane = types.length === 1 ? 2 : position as 0 | 1
      const id = floor * 4 + lane
      const enemyId = kind === 'fight' ? normalEnemies[floor % 2][(draw(seed, floor, 82) + position) % 2]
        : kind === 'elite' ? eliteEnemies[(eliteStart + eliteIndex++) % eliteEnemies.length]
          : kind === 'boss' ? 'boss' : undefined
      const nextBase = (floor + 1) * 4
      const next = floor === MAP_FLOORS ? [] : floor >= 10 ? [nextBase + 2]
        : lane === 2 ? [nextBase, nextBase + 1]
          : lane === (floor + diagonal) % 2 ? [nextBase, nextBase + 1] : [nextBase + lane]
      const event = kind === 'event' ? MAP_EVENTS[(draw(seed, 0, 87) + Number(floor === 9)) % MAP_EVENTS.length] : undefined
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

export function enemyForMapNode(node: MapNode): ReturnType<typeof enemyForFight> | undefined {
  const enemy = roster.find(({ id }) => id === node.enemyId)
  if (!enemy || node.kind === 'boss') return enemy
  const elite = node.kind === 'elite'
  const hp = enemy.hp + 2 * Math.floor((node.floor - (elite ? 5 : 1)) / 2)
  const firstHitAdjustment = Number(node.floor >= 9) - (elite ? 3 : 0)
  const first = enemy.intents.find((intent) => intent.matches(1))!
  const intents = firstHitAdjustment && first.hits.length
    ? [{ ...first, matches: (turn: number) => turn === 1, hits: [Math.max(1, first.hits[0] + firstHitAdjustment), ...first.hits.slice(1)] }, ...enemy.intents]
    : enemy.intents
  return { ...enemy, hp, intents, attackPerUnlock: Number(elite) }
}
