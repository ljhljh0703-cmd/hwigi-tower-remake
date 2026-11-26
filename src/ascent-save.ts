import { ascentBattleSeed, ascentFinished, availableMapNodes, FIGHT_COUNT, mapRewardOffers, rewardOffers } from './ascent.ts'
import type { Ascent, MapProgress } from './ascent.ts'
import { CURRENT_MAP_RULES, enemyForMapNode, generateAscentMap, MAP_FIGHTS, MAP_FLOORS, mapPathIsValid, victoryCoins } from './ascent-map.ts'
import { COUNTER_REWARDS, DIE_COUNT, draw, PLAYER_HP } from './combat.ts'
import { enemyForFight } from './enemy-roster.ts'
import { BANDAGE_HEAL, isLegacyReward, isRelic, isReward, relicReady } from './rewards.ts'
import type { CombatRewards, Reward, RewardChoice } from './rewards.ts'
import { shopPrice, treasureOffers } from './map-treasure.ts'
import { isArtifact, isItem, isPreparation, isShard, itemUses } from './treasure.ts'
import type { ArtifactOptions } from './treasure.ts'
import { artifactOptionsRecord, treasureRecord } from './treasure-save.ts'
import { yachtCounterRewards } from './yacht-combat.ts'
import type { Hand, YachtBattle } from './yacht-combat.ts'

export const ASCENT_SAVE_KEY = 'hwigi-tower.ascent'
const LEGACY_VERSION = 1
const MAP_VERSION = 2

export interface AscentSave {
  readonly ascent: Ascent
  readonly selected: readonly number[]
  readonly rewardPreview?: Reward
  readonly nodePreview?: number
  readonly artifactOptions?: ArtifactOptions
}

type SaveStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type SavedBattle = Omit<YachtBattle, 'enemyIntents' | 'slots'> & {
  readonly slots: readonly (YachtBattle['slots'][number] | 'escort')[]
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
}

function hand(value: unknown): value is Hand {
  return value === 'triple' || value === 'straight'
}

function faces(value: unknown): value is number[] {
  return Array.isArray(value) && value.length >= 2 && value.length <= DIE_COUNT + 1 && value.every((face) => integer(face, 1, 6))
}

function reward(value: unknown) {
  return record(value) && integer(value.damage, 1) && typeof value.joint === 'boolean'
}

function perk(value: unknown) {
  if (value === undefined) return true
  if (!record(value)) return false
  switch (value.kind) {
    case 'shield': return integer(value.bonus)
    case 'blade': return integer(value.charge)
    case 'collector': return Array.isArray(value.hands) && value.hands.every((name) => hand(name) || name === 'pair' || name === 'four')
    case 'reroll': return true
    case 'oath': return value.parity === 'odd' || value.parity === 'even'
    case 'counter': return integer(value.growth) && Array.isArray(value.rewards) &&
      value.rewards.length === COUNTER_REWARDS.length && value.rewards.every(reward)
    default: return false
  }
}

function exchange(value: unknown, allowDeferred: boolean) {
  if (!record(value)) return false
  const { turn, dealt, hitsTaken, counter, awakened, awakenedDice, escortDealt, chargeBroken } = value
  return integer(turn, 1) && integer(dealt) && Array.isArray(hitsTaken) && hitsTaken.every((hit) => integer(hit)) &&
    (counter === null || (record(counter) && integer(counter.slot, 0, COUNTER_REWARDS.length - 1) && integer(counter.damage, allowDeferred ? 0 : 1) && typeof counter.joint === 'boolean')) &&
    typeof awakened === 'boolean' && (awakenedDice === undefined || faces(awakenedDice)) &&
    (escortDealt === undefined || integer(escortDealt, 1)) && (chargeBroken === undefined || chargeBroken === true)
}

function interference(value: unknown) { return value === 'lock' || value === 'freeze' }

function combatRewards(value: unknown): value is CombatRewards | undefined {
  if (value === undefined) return true
  if (!record(value)) return false
  const { relics, spent, tuning } = value
  if (!Array.isArray(relics) || !Array.isArray(spent)) return false
  return relics.every(isRelic) && new Set(relics).size === relics.length &&
    spent.every((relic) => isRelic(relic) && relics.includes(relic)) && new Set(spent).size === spent.length &&
    (tuning === undefined || tuning === 'ready' || tuning === 'spent')
}

function battleRecord(value: unknown, seed: number, enemy: Ascent['enemy'], rulesTwo: boolean): value is SavedBattle {
  if (!record(value)) return false
  const { phase, turn, dice, slots, playerHp, enemyHp, fixedDie, stolenDie, escort, lastExchange } = value
  if (value.seed !== seed || !integer(turn, 1) || !integer(playerHp, 1, PLAYER_HP) || !integer(enemyHp, 0, enemy.hp)) return false
  if (phase !== 'assign' && phase !== 'counter' && phase !== 'won') return false
  if ((phase === 'won') !== (enemyHp === 0) || !faces(dice) || !Array.isArray(slots) || slots.length !== dice.length) return false
  if (!slots.every((slot) => slot === 'attack' || slot === 'guard' || slot === 'escort' || (phase === 'assign' && slot === null))) return false
  if (lastExchange === null ? phase !== 'assign' : !exchange(lastExchange, rulesTwo)) return false
  if (!integer(value.enemyAttackBuff) || value.enemyAttackGrowth !== enemy.attackGrowth || !perk(value.perk) || !combatRewards(value.rewards)) return false
  if (rulesTwo ? value.rewards !== undefined || !treasureRecord(value.loot, dice, Boolean(value.fourthDieUnlocked), phase) : value.loot !== undefined) return false
  const wedgeReady = value.loot && treasureRecord(value.loot, dice, Boolean(value.fourthDieUnlocked), phase)
    ? itemUses(value.loot, 'wedge') > 0 : relicReady(value.rewards, 'wedge')
  if (value.wedgeArmed !== undefined && (value.wedgeArmed !== true || phase !== 'assign' || !wedgeReady)) return false
  if (![value.extraRerollAvailable, value.rerolled, value.awakened].every((flag) => typeof flag === 'boolean')) return false
  if (![value.extraRerollSpent, value.paidRerollSpent, value.fourthDieUnlocked].every((flag) => flag === undefined || flag === true)) return false
  if (value.nextInterference !== undefined && !interference(value.nextInterference)) return false
  if (value.weakenedStrikeTurn !== undefined && !integer(value.weakenedStrikeTurn, 1)) return false
  if (value.erasedStrikeTurn !== undefined && (!rulesTwo || !integer(value.erasedStrikeTurn, 1))) return false
  if (fixedDie !== undefined && !(record(fixedDie) && integer(fixedDie.index, 0, dice.length - 1) && interference(fixedDie.kind))) return false
  if (stolenDie !== undefined && !(record(stolenDie) && integer(stolenDie.remaining, 1))) return false
  return escort === undefined || (record(escort) && integer(escort.hp, 1) && integer(escort.bonus))
}

function sameList(value: unknown, expected: readonly unknown[]): boolean {
  return Array.isArray(value) && value.length === expected.length && value.every((item, index) => item === expected[index])
}

function acquiredRewards(rewards: CombatRewards | undefined): readonly Reward[] {
  return [...(rewards?.relics ?? []), ...(rewards?.tuning ? ['tuning' as const] : [])]
}

function mapCheckpoint(seed: number, fight: number, value: unknown) {
  if (!record(value) || (value.rules !== 1 && value.rules !== 2 && value.rules !== 3 && value.rules !== 4 && value.rules !== CURRENT_MAP_RULES) || !Array.isArray(value.completed)) return null
  const { completed, screen, node, offers, rules, bossMaxHp, coins, shopPurchase } = value
  if (completed.length >= MAP_FLOORS || !completed.every((id) => integer(id))) return null
  const room = screen === 'rest' || (rules >= 2 && (screen === 'event' || screen === 'shop'))
  if (screen !== 'map' && screen !== 'return' && screen !== 'battle' && screen !== 'reward' && !room) return null
  const onNode = screen === 'battle' || screen === 'reward' || room
  if (onNode ? !integer(node) : node !== null) return null
  const active = typeof node === 'number' ? node : null
  const map = generateAscentMap(seed, rules)
  const path = active === null ? completed : [...completed, active]
  if (!mapPathIsValid(map, path)) return null
  if (active !== null && (room ? map.byId[active].kind !== screen : !map.byId[active].enemyId)) return null
  if (screen === 'reward' && map.byId[active!].kind === 'boss') return null
  const lastCompleted = completed.at(-1)
  if (screen === 'return' && (lastCompleted === undefined || (rules === 1 && map.byId[lastCompleted].kind === 'rest'))) return null
  const hasOffers = screen === 'reward' || screen === 'return' || (rules >= 2 && room)
  if (hasOffers ? !Array.isArray(offers) || offers.length > 3 || new Set(offers).size !== offers.length || !offers.every(rules >= 2 ? isReward : isLegacyReward) : offers !== undefined) return null
  if (rules >= 3) {
    const price = shopPurchase === 'kit' || isArtifact(shopPurchase) ? shopPrice(shopPurchase) : 0
    if (shopPurchase !== undefined && (!price || !completed.some((id) => map.byId[id].kind === 'shop'))) return null
    const won = screen === 'reward' ? path : completed
    const earned = won.reduce((sum, id) => sum + victoryCoins(map.byId[id].kind), 0)
    if (!integer(coins) || coins !== earned - price) return null
  } else if (coins !== undefined || shopPurchase !== undefined) return null
  const fights = path.map((id) => map.byId[id]).filter((room) => room.enemyId)
  if (fight !== fights.length) return null
  const battleNode = fights.at(-1) ?? map.nodes[0]
  const enemy = enemyForMapNode(battleNode, rules)!
  const stageTwoBoss = rules === 2 && battleNode.kind === 'boss'
  const previousBoss = stageTwoBoss ? enemyForMapNode(battleNode, 1) : undefined
  if (bossMaxHp !== undefined && (!stageTwoBoss || bossMaxHp !== enemy.hp && bossMaxHp !== previousBoss?.hp)) return null
  // Saves made before the balance change omit the maximum for an already-entered boss.
  const restoredEnemy = previousBoss && (bossMaxHp === undefined || bossMaxHp === previousBoss.hp) ? previousBoss : enemy
  const route: MapProgress = {
    map, completed, screen, node: active, ...(Array.isArray(offers) && { offers }),
    ...(typeof coins === 'number' && { coins }),
    ...((shopPurchase === 'kit' || isArtifact(shopPurchase)) && { shopPurchase }),
  }
  return { route, enemy: restoredEnemy, fightSeed: battleNode.battleSeed, acquired: value.acquired }
}

function beforeClaim(battle: YachtBattle, choice: RewardChoice): YachtBattle {
  if (choice === 'bandage') return { ...battle, playerHp: battle.playerHp - BANDAGE_HEAL }
  if (!battle.rewards || choice === 'skip') return battle
  const rewards = choice === 'tuning' ? { ...battle.rewards, tuning: undefined }
    : { ...battle.rewards, relics: battle.rewards.relics.filter((relic) => relic !== choice) }
  return { ...battle, rewards }
}

function readCheckpoint(raw: unknown): AscentSave | null {
  if (!record(raw) || (raw.version !== LEGACY_VERSION && raw.version !== MAP_VERSION) || !record(raw.ascent)) return null
  const { seed, fight, unlocks, newUnlock, battle, rewardChoice } = raw.ascent
  const isMap = raw.version === MAP_VERSION
  if (!integer(seed, 0, 0xffffffff) || !integer(fight, isMap ? 0 : 1, isMap ? MAP_FIGHTS : FIGHT_COUNT) || !Array.isArray(unlocks) || !unlocks.every(hand)) return null
  if (new Set(unlocks).size !== unlocks.length || (newUnlock !== null && (!hand(newUnlock) || !unlocks.includes(newUnlock)))) return null
  const mapped = isMap ? mapCheckpoint(seed, fight, raw.ascent.route) : null
  if (isMap && !mapped) return null
  const enemy = mapped?.enemy ?? enemyForFight(seed, fight)
  const fightSeed = mapped?.fightSeed ?? ascentBattleSeed(seed, fight)
  const rulesTwo = !!mapped && mapped.route.map.rules >= 2
  if (!battleRecord(battle, fightSeed, enemy, rulesTwo)) return null
  if (rewardChoice !== undefined && rewardChoice !== 'skip' && !isReward(rewardChoice)) return null
  if (rewardChoice !== undefined && (battle.phase !== 'won' || (!rulesTwo && rewardChoice !== 'skip' && !isLegacyReward(rewardChoice)))) return null
  if (rulesTwo && battle.loot) {
    if (isItem(rewardChoice) && !battle.loot.items[rewardChoice] || isPreparation(rewardChoice) && !battle.loot.prep[rewardChoice] ||
      isShard(rewardChoice) && !battle.loot.shards[rewardChoice] || isArtifact(rewardChoice) && !battle.loot.equipped.includes(rewardChoice)) return null
  } else {
    if (isRelic(rewardChoice) && !battle.rewards?.relics.includes(rewardChoice)) return null
    if (rewardChoice === 'tuning' && battle.rewards?.tuning !== 'ready') return null
  }
  if (battle.phase !== 'won' && Boolean(battle.fourthDieUnlocked) !== unlocks.includes('triple')) return null
  if (battle.phase === 'assign' && battle.dice.length !== DIE_COUNT + Number(Boolean(battle.fourthDieUnlocked)) - Number(Boolean(battle.stolenDie))) return null
  const restoredBattle: YachtBattle = {
    ...battle,
    slots: battle.slots.map((slot) => slot === 'escort' ? 'attack' : slot),
    enemyIntents: enemy.intents,
    enemyAttackGrowth: enemy.attackGrowth,
  }
  if (mapped) {
    const { route, acquired } = mapped
    const expectsVictory = route.screen !== 'battle' && fight > 0
    if ((battle.phase === 'won') !== expectsVictory || (route.screen === 'return') !== (rewardChoice !== undefined)) return null
    if (isArtifact(route.shopPurchase) && !battle.loot?.acquired.includes(route.shopPurchase)) return null
    if (fight === 0 && (battle.phase !== 'assign' || battle.turn !== 1 || battle.playerHp !== PLAYER_HP || battle.lastExchange !== null || unlocks.length)) return null
    if (!sameList(acquired, rulesTwo ? battle.loot!.acquired : acquiredRewards(battle.rewards))) return null
    if ((battle.enemyAttackBuff ?? 0) > enemy.attackPerUnlock * unlocks.length) return null
    if (!rulesTwo && route.screen === 'reward' && !sameList(route.offers, mapRewardOffers(seed, route.node!, restoredBattle))) return null
    if (route.screen === 'return' && rewardChoice !== undefined) {
      if (rewardChoice !== 'skip' && !route.offers?.includes(rewardChoice)) return null
      if (route.map.rules >= 3 && route.map.byId[route.completed.at(-1)!].kind === 'shop' &&
        (rewardChoice === 'skip' ? route.shopPurchase !== undefined : route.shopPurchase !== rewardChoice)) return null
      if (!rulesTwo) {
        const prior = beforeClaim(restoredBattle, rewardChoice)
        if (prior.playerHp < 1 || !sameList(route.offers, mapRewardOffers(seed, route.completed.at(-1)!, prior))) return null
      }
    }
  }
  const { selected } = raw
  if (!Array.isArray(selected) || new Set(selected).size !== selected.length ||
      !selected.every((index) => battle.phase === 'assign' && (!mapped || mapped.route.screen === 'battle') && integer(index, 0, battle.dice.length - 1))) return null

  const ascent: Ascent = {
    seed, fight, enemy, maxHp: PLAYER_HP, unlocks, newUnlock,
    battle: restoredBattle,
    ...(mapped && { route: mapped.route }),
    ...(rewardChoice && { rewardChoice }),
  }
  if (rulesTwo && mapped?.route.offers && mapped.route.node !== null && !sameList(mapped.route.offers, treasureOffers(ascent, mapped.route.map.byId[mapped.route.node]))) return null
  const pending = restoredBattle.loot?.counter
  if (pending) {
    const table = yachtCounterRewards(restoredBattle)
    const slot = draw(battle.seed, battle.turn, 4) % table.length
    if (pending.slot !== slot || pending.damage !== table[slot].damage || pending.joint !== table[slot].joint) return null
  }
  const { rewardPreview } = raw
  if (rewardPreview !== undefined && !isReward(rewardPreview)) return null
  const previewAvailable = rewardPreview !== undefined && rewardOffers(ascent).includes(rewardPreview)
  const { nodePreview } = raw
  if (nodePreview !== undefined && !(mapped?.route.screen === 'map' && integer(nodePreview) && mapped.route.map.byId[nodePreview])) return null
  const { artifactOptions } = raw
  if (artifactOptions !== undefined && !(rulesTwo && previewAvailable && isArtifact(rewardPreview) && artifactOptionsRecord(artifactOptions))) return null
  return ascentFinished(ascent) ? null : { ascent, selected, ...(previewAvailable && { rewardPreview }), ...(typeof nodePreview === 'number' && { nodePreview }), ...(artifactOptions && { artifactOptions }) }
}

export function loadAscentSave(storage?: SaveStorage): AscentSave | null {
  return readAscentSave(storage).checkpoint
}

export function readAscentSave(storage?: SaveStorage): { checkpoint: AscentSave | null; invalidMap: boolean } {
  try {
    const data = (storage ?? globalThis.localStorage).getItem(ASCENT_SAVE_KEY)
    const raw: unknown = data === null ? null : JSON.parse(data)
    const checkpoint = readCheckpoint(raw)
    const invalidMap = !checkpoint && record(raw) && (raw.version === MAP_VERSION || (record(raw.ascent) && raw.ascent.route !== undefined))
    return { checkpoint, invalidMap }
  } catch {
    return { checkpoint: null, invalidMap: false }
  }
}

export function clearAscentSave(storage?: Pick<Storage, 'removeItem'>) {
  try {
    (storage ?? globalThis.localStorage).removeItem(ASCENT_SAVE_KEY)
  } catch {
    // The lobby can be opened even when browser storage is unavailable.
  }
}

export function writeAscentSave({ ascent, selected, rewardPreview, nodePreview, artifactOptions }: AscentSave, storage?: SaveStorage) {
  try {
    const store = storage ?? globalThis.localStorage
    if (ascentFinished(ascent)) {
      store.removeItem(ASCENT_SAVE_KEY)
      return
    }
    const { seed, fight, unlocks, newUnlock, battle, rewardChoice, route, enemy } = ascent
    const { enemyIntents: _enemyIntents, ...savedBattle } = battle
    const savedRoute = route && {
      rules: route.map.rules, completed: route.completed, node: route.node, screen: route.screen,
      offers: route.offers, acquired: battle.loot?.acquired ?? acquiredRewards(battle.rewards),
      coins: route.coins, shopPurchase: route.shopPurchase,
      ...(route.map.rules === 2 && enemy.id === 'boss' && { bossMaxHp: enemy.hp }),
    }
    store.setItem(ASCENT_SAVE_KEY, JSON.stringify({
      version: route ? MAP_VERSION : LEGACY_VERSION, selected, rewardPreview, nodePreview, artifactOptions,
      ascent: { seed, fight, unlocks, newUnlock, rewardChoice, battle: savedBattle, route: savedRoute },
    }))
  } catch {
    // The run can still be played when browser storage is unavailable.
  }
}
