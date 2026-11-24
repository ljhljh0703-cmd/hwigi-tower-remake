import { MAP_REWARD_CHANNEL, nextMapNodes } from './ascent-map.ts'
import type { MapNode, MapRules } from './ascent-map.ts'
import type { Ascent } from './ascent.ts'
import { draw } from './combat.ts'
import { BANDAGE_THRESHOLD, BANDAGE_HEAL } from './rewards.ts'
import { ARTIFACTS, ITEMS, PREPARATIONS, REST_HEAL, SHARDS, changeCount, equipArtifact, isArtifact, isItem, isPreparation, isShard } from './treasure.ts'
import type { ArtifactOptions, Treasure } from './treasure.ts'
import type { YachtBattle } from './yacht-combat.ts'

export const SHOP_PRICES = { kit: 2, artifact: 4 }
export const SHOP_HEAL = 4
const MAP_THREE_BANDAGE_HEAL = 5

export function shopPrice(choice: Treasure): number {
  return choice === 'kit' ? SHOP_PRICES.kit : isArtifact(choice) ? SHOP_PRICES.artifact : 0
}

export function currentTreasureRoom({ route }: Ascent): MapNode | undefined {
  return route?.node === null ? undefined : route?.map.byId[route.node]
}

function rotate<T>(values: readonly T[], order: number): readonly T[] {
  const index = order % values.length
  return [...values.slice(index), ...values.slice(0, index)]
}

export function artifactChoices(run: Ascent, node: MapNode) {
  const loot = run.battle.loot!
  return rotate(ARTIFACTS, draw(run.seed, node.id, 89)).filter((id) =>
    !loot.acquired.includes(id) && (id !== 'incomplete' || run.unlocks.length < 2) &&
    (id !== 'heart-die' && id !== 'horn' || run.unlocks.includes('triple')),
  )
}

function hasEscortAhead(run: Ascent, node: MapNode) {
  const map = run.route!.map
  const visited = new Set<number>()
  const remaining = [...nextMapNodes(map, node.id)]
  while (remaining.length) {
    const next = remaining.pop()!
    if (next.enemyId === 'escort') return true
    if (visited.has(next.id)) continue
    visited.add(next.id)
    remaining.push(...nextMapNodes(map, next.id))
  }
  return false
}

export function treasureOffers(run: Ascent, node: MapNode): readonly Treasure[] {
  if (node.kind === 'rest') return ['kit', 'whetstone']
  if (node.event === 'medicine') return ['medicine', 'lining']
  if (node.event === 'pulley') return ['whetstone']
  if (node.event === 'flag') return artifactChoices(run, node).slice(0, 1)
  if (node.kind === 'shop') {
    if (!run.route || run.route.map.rules < 3) return []
    const stock = artifactChoices(run, node)
    return stock.length ? ['kit', stock[draw(run.seed, node.id, 85) % stock.length]] : ['kit']
  }

  const { battle } = run
  const preferred = battle.perk?.kind === 'shield' || battle.perk?.kind === 'counter' ? 'buckle' : 'weight'
  const order = draw(run.seed, node.id, MAP_REWARD_CHANNEL)
  const shard = rotate(SHARDS, order)[0]
  const artifact = node.kind === 'elite' ? artifactChoices(run, node)[0] : undefined
  const seats: (Treasure | undefined)[] = [artifact ?? preferred, battle.playerHp <= BANDAGE_THRESHOLD ? 'bandage' : undefined, shard]
  const escortAhead = hasEscortAhead(run, node)
  const fillers: Treasure[] = rotate(ITEMS, order).filter((id) => !seats.includes(id) && ((id !== 'knot' && id !== 'hook') || escortAhead))
  fillers.push(...PREPARATIONS)
  return seats.map((id) => id ?? fillers.shift()!)
}

export function treasureCost(node: MapNode | undefined, choice: Treasure): number {
  if (node?.event === 'pulley' && choice === 'whetstone') return 2
  return node?.event === 'flag' && isArtifact(choice) ? 3 : 0
}

export function healingFor(choice: Treasure, node?: MapNode, rules?: MapRules): number {
  return choice === 'bandage' ? ((rules === 3 || rules === 4) ? MAP_THREE_BANDAGE_HEAL : BANDAGE_HEAL)
    : choice === 'medicine' ? 3 : choice === 'kit' ? (node?.kind === 'shop' ? SHOP_HEAL : REST_HEAL) : 0
}

export function treasureEnabled(run: Ascent, choice: Treasure): boolean {
  const hp = run.battle.playerHp
  const room = currentTreasureRoom(run)
  const cost = treasureCost(room, choice)
  if (cost && hp <= cost) return false
  if (room?.kind === 'shop' && (run.route?.coins ?? 0) < shopPrice(choice)) return false
  if (healingFor(choice, room, run.route?.map.rules) && hp >= run.maxHp) return false
  return (run.route?.offers ?? []).includes(choice)
}

export function grantTreasure(run: Ascent, choice: Treasure, options: ArtifactOptions): YachtBattle | null {
  const { battle } = run
  let loot = battle.loot!
  if (!treasureEnabled(run, choice)) return null
  if (isArtifact(choice)) {
    if (choice === 'incomplete' && options.hand && run.unlocks.includes(options.hand)) return null
    const equipped = equipArtifact(loot, choice, options)
    if (!equipped) return null
    loot = equipped
  } else if (isItem(choice)) loot = { ...loot, items: changeCount(loot.items, choice, 1) }
  else if (isPreparation(choice)) loot = { ...loot, prep: changeCount(loot.prep, choice, 1) }
  else if (isShard(choice)) loot = { ...loot, shards: changeCount(loot.shards, choice, 1) }
  const room = currentTreasureRoom(run)
  const playerHp = Math.min(run.maxHp, battle.playerHp - treasureCost(room, choice) + healingFor(choice, room, run.route?.map.rules))
  return { ...battle, playerHp, loot }
}
