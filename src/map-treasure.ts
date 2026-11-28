import { MAP_REWARD_CHANNEL, nextMapNodes } from './ascent-map.ts'
import type { MapNode, MapRules } from './ascent-map.ts'
import type { Ascent } from './ascent.ts'
import { draw } from './combat.ts'
import { BANDAGE_THRESHOLD, BANDAGE_HEAL } from './rewards.ts'
import { ARTIFACTS, COMMON_ARTIFACTS, COMMON_CONSUMABLES, ITEMS, PREPARATIONS, RARE_ARTIFACTS, RARE_CONSUMABLES, REST_HEAL, SHARDS, changeCount, equipArtifact, isArtifact, isConsumable, isItem, isPreparation, isShard, treasureRarity } from './treasure.ts'
import type { Artifact, ArtifactOptions, Treasure } from './treasure.ts'
import type { YachtBattle } from './yacht-combat.ts'
import { META_STAGES } from './meta-unlocks.ts'

export const SHOP_PRICES = { kit: 2, consumable: 2, artifact: 4, rare: 5 }
export const SHOP_HEAL = 4
const MAP_THREE_BANDAGE_HEAL = 5

export function shopPrice(choice: Treasure, rules?: MapRules): number {
  if (choice === 'kit') return SHOP_PRICES.kit
  if (rules === 7 && isConsumable(choice)) return SHOP_PRICES.consumable
  if (!isArtifact(choice)) return 0
  return rules === 7 && treasureRarity(choice) === 'rare' ? SHOP_PRICES.rare : SHOP_PRICES.artifact
}

export function currentTreasureRoom({ route }: Ascent): MapNode | undefined {
  return route?.node === null ? undefined : route?.map.byId[route.node]
}

function rotate<T>(values: readonly T[], order: number): readonly T[] {
  const index = order % values.length
  return [...values.slice(index), ...values.slice(0, index)]
}

export function artifactChoices(run: Ascent, node: MapNode, previouslyAcquired = false) {
  const loot = run.battle.loot!
  return rotate(ARTIFACTS, draw(run.seed, node.id, 89)).filter((id) =>
    (previouslyAcquired ? loot.acquired.includes(id) && !loot.equipped.includes(id) : !loot.acquired.includes(id)) &&
    (id !== 'incomplete' || run.unlocks.length < 2 && (run.route?.map.rules !== 6 || !loot.sealUsed)) &&
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

function sevenArtifactOffers(run: Ascent, node: MapNode, legacyMixedPool: boolean, previouslyAcquired = false) {
  const loot = run.battle.loot!
  const ego = run.unlocks.includes('triple')
  const eligible = (id: Artifact) =>
    (previouslyAcquired ? loot.acquired.includes(id) && !loot.equipped.includes(id) : !loot.acquired.includes(id)) &&
    (id !== 'incomplete' || !ego && !loot.sealUsed) && (id !== 'heart-die' && id !== 'horn' || ego)
  const unlocked = META_STAGES.filter(({ floor }) => run.meta?.pool.includes(floor)).map(({ artifact }) => artifact)
  const commonPool = legacyMixedPool ? [...COMMON_ARTIFACTS, ...unlocked.filter((id) => treasureRarity(id) === 'common')] : COMMON_ARTIFACTS
  const rarePool = legacyMixedPool ? [...RARE_ARTIFACTS, ...unlocked.filter((id) => treasureRarity(id) === 'rare')] : RARE_ARTIFACTS
  const common = rotate(commonPool, draw(run.seed, node.id, 89)).filter(eligible)
  const rare = rotate(rarePool, draw(run.seed, node.id, 96)).filter(eligible)
  const bonus = !legacyMixedPool && !previouslyAcquired && unlocked.length ? rotate(unlocked, draw(run.seed, node.id, 107)).filter(eligible) : []
  return { common, rare, bonus }
}

function sevenTreasureOffers(run: Ascent, node: MapNode, legacyMixedPool: boolean): readonly Treasure[] {
  if (node.kind === 'elite') {
    const { common, bonus } = sevenArtifactOffers(run, node, legacyMixedPool)
    const regular = (common.length ? common : sevenArtifactOffers(run, node, legacyMixedPool, true).common).slice(0, 2)
    const extra = bonus.find((id) => treasureRarity(id) === 'common')
    return extra ? [...regular, extra] : regular
  }
  const rareSlot = draw(run.seed, node.id, 95) % 4 === 0
  if (node.kind === 'shop' || node.event === 'flag') {
    const { common, rare, bonus } = sevenArtifactOffers(run, node, legacyMixedPool)
    const artifact = rareSlot ? rare[0] ?? common[0] : common[0] ?? rare[0]
    const extra = bonus.find((id) => treasureRarity(id) === (rareSlot ? 'rare' : 'common'))
    const stock: Treasure[] = node.kind === 'shop' ? ['kit', COMMON_CONSUMABLES[draw(run.seed, node.id, 108) % COMMON_CONSUMABLES.length]] : []
    return [...stock, ...(artifact ? [artifact] : []), ...(extra ? [extra] : [])]
  }
  const common = [...COMMON_CONSUMABLES]
  const offers: Treasure[] = [0, 1, 2].map((index) => common.splice(draw(run.seed, node.id, 100 + index) % common.length, 1)[0])
  if (run.battle.playerHp <= BANDAGE_THRESHOLD) offers[2] = 'bandage'
  else if (rareSlot) offers[2] = RARE_CONSUMABLES[draw(run.seed, node.id, 103) % RARE_CONSUMABLES.length]
  return offers
}

export function treasureOffers(run: Ascent, node: MapNode, legacyMixedPool = false): readonly Treasure[] {
  if (node.kind === 'rest') return ['kit', 'whetstone']
  if (node.event === 'medicine') return ['medicine', 'lining']
  if (node.event === 'pulley') return ['whetstone']
  if (run.route?.map.rules === 7) return sevenTreasureOffers(run, node, legacyMixedPool)
  if (node.event === 'flag') return artifactChoices(run, node).slice(0, 1)
  if (node.kind === 'shop') {
    if (!run.route || run.route.map.rules < 3) return []
    const stock = artifactChoices(run, node)
    return stock.length ? ['kit', stock[draw(run.seed, node.id, 85) % stock.length]] : ['kit']
  }
  if (node.kind === 'elite' && run.route?.map.rules === 6) {
    const fresh = artifactChoices(run, node)
    return (fresh.length ? fresh : artifactChoices(run, node, true)).slice(0, 2)
  }

  const { battle } = run
  const preferred = battle.perk?.kind === 'shield' || battle.perk?.kind === 'counter' ? 'buckle' : 'weight'
  const order = draw(run.seed, node.id, MAP_REWARD_CHANNEL)
  const shard = rotate(SHARDS, order)[0]
  const artifact = node.kind === 'elite' ? artifactChoices(run, node)[0] : undefined
  const seats: (Treasure | undefined)[] = [artifact ?? preferred, battle.playerHp <= BANDAGE_THRESHOLD ? 'bandage' : undefined, shard]
  const escortAhead = hasEscortAhead(run, node)
  const fillers: Treasure[] = rotate(ITEMS, order).filter((id) => !seats.includes(id) &&
    (run.route?.map.rules !== 6 || id !== 'tongs' && id !== 'knot') && ((id !== 'knot' && id !== 'hook') || escortAhead))
  fillers.push(...PREPARATIONS)
  return seats.map((id) => id ?? fillers.shift()!)
}

export function treasureCost(node: MapNode | undefined, choice: Treasure): number {
  if (node?.event === 'pulley' && choice === 'whetstone') return 2
  return node?.event === 'flag' && isArtifact(choice) ? 3 : 0
}

export function healingFor(choice: Treasure, node?: MapNode, rules?: MapRules): number {
  return choice === 'bandage' ? (rules !== undefined && rules >= 3 ? MAP_THREE_BANDAGE_HEAL : BANDAGE_HEAL)
    : choice === 'medicine' ? 3 : choice === 'kit' ? (node?.kind === 'shop' ? SHOP_HEAL : REST_HEAL) : 0
}

export function healingForRun(run: Ascent, choice: Treasure, node = currentTreasureRoom(run)): number {
  const amount = healingFor(choice, node, run.route?.map.rules)
  return run.battle.itemsSeven && run.battle.bossRelic?.id === 'revived-heart' ? Math.floor(amount / 2) : amount
}

export function treasureEnabled(run: Ascent, choice: Treasure): boolean {
  const hp = run.battle.playerHp
  const room = currentTreasureRoom(run)
  const cost = treasureCost(room, choice)
  if (cost && hp <= cost) return false
  if (room?.kind === 'shop' && ((run.route?.coins ?? 0) < shopPrice(choice, run.route?.map.rules) ||
    run.route?.shopReceipts?.some(receipt => receipt.node === room.id && receipt.item === choice))) return false
  if (healingForRun(run, choice, room) && hp >= run.maxHp) return false
  return (run.route?.offers ?? []).includes(choice)
}

export function grantTreasure(run: Ascent, choice: Treasure, options: ArtifactOptions): YachtBattle | null {
  const { battle } = run
  let loot = battle.loot!
  if (!treasureEnabled(run, choice)) return null
  if (isArtifact(choice)) {
    if (choice === 'incomplete' && options.hand && run.unlocks.includes(options.hand)) return null
    const equipped = equipArtifact(loot, choice, options, (run.route?.map.rules ?? 0) >= 6 && currentTreasureRoom(run)?.kind === 'elite')
    if (!equipped) return null
    loot = equipped
  } else if (battle.itemsSeven && isConsumable(choice)) loot = { ...loot, consumables: changeCount(loot.consumables!, choice, 1) }
  else if (isItem(choice)) loot = { ...loot, items: changeCount(loot.items, choice, 1) }
  else if (isPreparation(choice)) loot = { ...loot, prep: changeCount(loot.prep, choice, 1) }
  else if (isShard(choice)) loot = { ...loot, shards: changeCount(loot.shards, choice, 1) }
  const room = currentTreasureRoom(run)
  const playerHp = Math.min(run.maxHp, battle.playerHp - treasureCost(room, choice) + healingForRun(run, choice, room))
  return { ...battle, playerHp, loot }
}
