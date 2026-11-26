import { enemyForMapNode, generateAscentMap, MAP_FLOORS, MAP_REWARD_CHANNEL, MAP_START, nextMapNodes, victoryCoins } from './ascent-map.ts'
import type { AscentMap, MapNode, MapRules } from './ascent-map.ts'
import { BOSS_RELICS, isBossRelic, SEVEN_SCEPTER_HEAL } from './boss-relic.ts'
import { draw, PLAYER_HP } from './combat.ts'
import { ASCENT_ENEMIES, enemyForFight } from './enemy-roster.ts'
import { startPerk } from './perks.ts'
import type { Parity, StartPerk } from './perks.ts'
import { BANDAGE_HEAL, BANDAGE_THRESHOLD, ELITE_KEEP_COINS, RELICS, isLegacyReward, isRelic } from './rewards.ts'
import type { Reward, RewardChoice } from './rewards.ts'
import { grantTreasure, shopPrice, treasureOffers } from './map-treasure.ts'
import { ARTIFACT_SLOTS, emptyTreasure, isArtifact, nextTreasureBattle } from './treasure.ts'
import type { ArtifactOptions, CounterChoice, Treasure } from './treasure.ts'
import { activateYachtHand, resolveYachtTurn, spinYachtCounter, startYachtBattle } from './yacht-combat.ts'
import type { Hand, YachtBattle } from './yacht-combat.ts'

export const FIGHT_COUNT = ASCENT_ENEMIES.length
const REWARD_ORDER_CHANNEL = 30

export interface MapProgress {
  readonly map: AscentMap
  readonly completed: readonly number[]
  readonly node: number | null
  readonly screen: 'map' | 'battle' | 'reward' | 'return' | 'rest' | 'event' | 'shop' | 'finished'
  readonly offers?: readonly Reward[]
  readonly coins?: number
  readonly shopPurchase?: Treasure
  readonly declinedEliteRewards?: readonly number[]
}

export interface Ascent {
  readonly seed: number
  readonly fight: number
  readonly enemy: ReturnType<typeof enemyForFight>
  readonly maxHp: number
  readonly unlocks: readonly Hand[]
  readonly newUnlock: Hand | null
  readonly rewardChoice?: RewardChoice
  readonly battle: YachtBattle
  readonly route?: MapProgress
}

export function ascentFinished({ battle, fight, route }: Ascent) {
  if (route) return route.screen === 'finished'
  return battle.phase === 'lost' || (battle.phase === 'won' && fight === FIGHT_COUNT)
}

export function ascentBattleSeed(seed: number, fight: number) {
  return (seed ^ Math.imul(fight - 1, 0x9e3779b9)) >>> 0
}

export function beginAscent(seed: number, perk?: StartPerk, parity: Parity = 'odd'): Ascent {
  const enemy = enemyForFight(seed, 1)
  return {
    seed,
    fight: 1,
    enemy,
    maxHp: PLAYER_HP,
    unlocks: [],
    newUnlock: null,
    battle: startYachtBattle(seed, PLAYER_HP, false, false, startPerk(perk, parity), enemy),
  }
}

export function beginMapAscent(seed: number, perk?: StartPerk, parity: Parity = 'odd', rules: MapRules = 1): Ascent {
  const map = generateAscentMap(seed, rules)
  const first = map.nodes[0]
  const enemy = enemyForMapNode(first, rules)!
  return {
    seed, fight: 0, enemy, maxHp: PLAYER_HP, unlocks: [], newUnlock: null,
    battle: startYachtBattle(first.battleSeed, PLAYER_HP, false, false, startPerk(perk, parity), enemy, 0,
      rules === 7 ? { ...emptyTreasure, consumables: {} } : rules >= 2 ? emptyTreasure : undefined,
      rules >= 6 ? true : undefined, undefined, rules === 7 ? true : undefined),
    route: { map, completed: [], node: null, screen: 'map', ...(rules >= 3 && { coins: 0 }) },
  }
}

export function availableMapNodes({ route }: Ascent): readonly MapNode[] {
  if (!route) return []
  return nextMapNodes(route.map, route.node ?? route.completed.at(-1) ?? MAP_START)
}

function enterBattle(ascent: Ascent, enemy: Ascent['enemy'], fightSeed: number): Ascent {
  const { unlocks, battle: previousBattle, rewardChoice: _choice, ...previous } = ascent
  const kind = previousBattle.perk?.kind
  const perk = kind === 'blade' || kind === 'shield' && previousBattle.itemsSeven ? startPerk(kind) : previousBattle.perk
  const battle = startYachtBattle(
    fightSeed, previousBattle.playerHp, unlocks.includes('triple'), unlocks.includes('straight'), perk,
    enemy, unlocks.length * enemy.attackPerUnlock, previousBattle.loot && nextTreasureBattle(previousBattle.loot),
    previousBattle.rulesSix, previousBattle.bossRelic, previousBattle.itemsSeven,
  )
  const { rewards } = previousBattle
  return {
    ...previous, unlocks, fight: ascent.fight + 1, enemy, newUnlock: null,
    battle: rewards ? { ...battle, rewards: { ...rewards, spent: [] } } : battle,
  }
}

export function enterMapNode(ascent: Ascent, id: number): Ascent {
  const { route } = ascent
  if (route?.screen !== 'map') return ascent
  const node = availableMapNodes(ascent).find((candidate) => candidate.id === id)
  if (!node) return ascent
  const enemy = enemyForMapNode(node, route.map.rules)
  const next = enemy ? enterBattle(ascent, enemy, node.battleSeed) : { ...ascent, newUnlock: null }
  if (enemy) return { ...next, route: { ...route, node: id, screen: 'battle' } }
  const screen = node.kind === 'event' || node.kind === 'shop' ? node.kind : 'rest'
  return { ...next, route: { ...route, node: id, screen, ...(route.map.rules >= 2 && { offers: treasureOffers(ascent, node) }) } }
}

function completeMapNode(route: MapProgress, screen: 'return' | 'map' | 'finished'): MapProgress {
  const { offers: _offers, ...progress } = route
  return { ...progress, node: null, completed: [...route.completed, route.node!], screen }
}

export function returnToMap(ascent: Ascent): Ascent {
  const { route, rewardChoice: _choice, ...previous } = ascent
  if (route?.screen === 'rest' && route.map.rules === 1) return { ...previous, route: completeMapNode(route, 'map') }
  if (route?.screen === 'return') {
    const { offers: _offers, ...visited } = route
    return { ...previous, newUnlock: null, route: { ...visited, screen: 'map' } }
  }
  return ascent
}

export function mapRewardOffers(seed: number, id: number, battle: YachtBattle): readonly Reward[] {
  return rewardCandidates(battle, draw(seed, id, MAP_REWARD_CHANNEL))
}

function settleBattle(ascent: Ascent): Ascent {
  const { route } = ascent
  let { battle } = ascent
  if (route?.screen !== 'battle' || route.node === null) return ascent
  const wallet = route.map.rules >= 3 ? { coins: 0 } : {}
  if (battle.phase === 'lost') return { ...ascent, route: { ...route, screen: 'finished', ...wallet } }
  if (battle.phase !== 'won') return ascent
  const node = route.map.byId[route.node]
  if (node.floor === MAP_FLOORS) {
    return { ...ascent, route: { ...completeMapNode(route, 'finished'), ...wallet } }
  }
  const refill = battle.bossRelic?.id === 'healing-scepter' && (node.kind === 'fight' || node.kind === 'elite')
  if (refill) {
    battle = { ...battle, playerHp: scepterHealing(ascent, battle) }
  }
  const offers = node.enemyId === 'chain-warden' ? BOSS_RELICS
    : route.map.rules >= 2 ? treasureOffers({ ...ascent, battle }, node) : mapRewardOffers(ascent.seed, route.node, battle)
  const coins = route.map.rules >= 3 ? { coins: (route.coins ?? 0) + victoryCoins(node.kind) } : {}
  return { ...ascent, battle, route: { ...route, screen: 'reward', offers, ...coins } }
}

function scepterHealing(ascent: Ascent, battle: YachtBattle) {
  return battle.itemsSeven ? Math.min(ascent.maxHp, battle.playerHp + SEVEN_SCEPTER_HEAL) : ascent.maxHp
}

export function resolveAscentTurn(ascent: Ascent): Ascent {
  if (ascent.route && ascent.route.screen !== 'battle') return ascent
  let { battle, hand } = resolveYachtTurn(ascent.battle)
  if (battle === ascent.battle) return ascent
  const newUnlock = hand && !ascent.unlocks.includes(hand.hand) ? hand.hand : null
  const unlocks = newUnlock ? [...ascent.unlocks, newUnlock] : ascent.unlocks
  if (newUnlock && battle.itemsSeven && battle.perk?.kind === 'collector') {
    battle = { ...battle, perk: { kind: 'collector', hands: unlocks } }
  }
  // The new power applies to the next allocation, including in the current fight.
  return settleBattle({ ...ascent, battle: newUnlock ? activateYachtHand(battle, newUnlock) : battle, unlocks, newUnlock })
}

export function spinAscentCounter(ascent: Ascent, choice?: CounterChoice): Ascent {
  if (ascent.route && ascent.route.screen !== 'battle') return ascent
  const battle = spinYachtCounter(ascent.battle, choice)
  return battle === ascent.battle ? ascent : settleBattle({ ...ascent, battle })
}

export function rewardOffers(ascent: Ascent): readonly Reward[] {
  const { battle, fight, seed, rewardChoice, route } = ascent
  if (route) return route.screen !== 'return' ? route.offers ?? [] : []
  if (battle.phase !== 'won' || fight === FIGHT_COUNT || rewardChoice) return []
  return rewardCandidates(battle, draw(seed, fight, REWARD_ORDER_CHANNEL))
}

function rewardCandidates(battle: YachtBattle, order: number): readonly Reward[] {
  const available = RELICS.filter((relic) => !battle.rewards?.relics.includes(relic))
  const kind = battle.perk?.kind
  const preferred = kind === 'shield' || kind === 'counter' ? 'buckle' : 'weight'
  const seats: (Reward | undefined)[] = [
    available.includes(preferred) ? preferred : undefined,
    battle.rewards?.tuning ? undefined : 'tuning',
    battle.playerHp <= BANDAGE_THRESHOLD ? 'bandage' : undefined,
  ]
  const firstFiller = order % RELICS.length
  const fillers = [...RELICS.slice(firstFiller), ...RELICS.slice(0, firstFiller)]
    .filter((relic) => available.includes(relic) && !seats.includes(relic))
  return seats.flatMap((card) => card ?? fillers.shift() ?? [])
}

export function rewardHealth(ascent: Ascent) {
  return Math.min(ascent.maxHp, ascent.battle.playerHp + BANDAGE_HEAL)
}

export function canKeepEliteArtifacts({ route, battle }: Ascent) {
  return route?.map.rules === 7 && route.screen === 'reward' && route.node !== null &&
    route.map.byId[route.node]?.kind === 'elite' && battle.loot?.equipped.length === ARTIFACT_SLOTS &&
    Boolean(route.offers?.some(isArtifact))
}

export function takeAscentReward(ascent: Ascent, choice: RewardChoice, options: ArtifactOptions = {}): Ascent {
  const offers = rewardOffers(ascent)
  const { battle, route } = ascent
  if (choice === 'keep-artifacts') {
    if (!route || !canKeepEliteArtifacts(ascent)) return ascent
    return { ...ascent, rewardChoice: choice, route: {
      ...completeMapNode(route, 'return'), offers, coins: (route.coins ?? 0) + ELITE_KEEP_COINS,
      declinedEliteRewards: [...(route.declinedEliteRewards ?? []), route.node!],
    } }
  }
  const atRoom = route && route.map.rules >= 2 && (route.screen === 'rest' || route.screen === 'event' || route.screen === 'shop')
  const atReward = route ? route.screen === 'reward' || atRoom : offers.length > 0
  if (!atReward || (choice !== 'skip' && !offers.includes(choice))) return ascent
  const node = route?.node != null ? route.map.byId[route.node] : undefined
  if (route && node?.enemyId === 'chain-warden') {
    if (!isBossRelic(choice) || battle.bossRelic) return ascent
    const playerHp = choice === 'healing-scepter' ? scepterHealing(ascent, battle) : battle.playerHp
    return { ...ascent, rewardChoice: choice, battle: { ...battle, playerHp, bossRelic: { id: choice } },
      route: { ...completeMapNode(route, 'return'), offers } }
  }
  if (isBossRelic(choice) || choice === 'skip' && (route?.map.rules ?? 0) >= 6 && node?.kind === 'elite' && offers.length) return ascent
  const purchase = route && route.map.rules >= 3 && route.screen === 'shop' && choice !== 'skip'
    ? { coins: (route.coins ?? 0) - shopPrice(choice, route.map.rules), shopPurchase: choice } : {}
  const grantedAscent = { ...ascent, rewardChoice: choice, ...(route && { route: { ...completeMapNode(route, 'return'), offers, ...purchase } }) }
  if (route && route.map.rules >= 2) {
    const next = choice === 'skip' ? battle : grantTreasure(ascent, choice, options)
    return next ? { ...grantedAscent, battle: next } : ascent
  }
  if (choice !== 'skip' && !isLegacyReward(choice)) return ascent
  if (choice === 'bandage') return { ...grantedAscent, battle: { ...battle, playerHp: rewardHealth(ascent) } }
  if (choice === 'skip') return grantedAscent
  const rewards = battle.rewards ?? { relics: [], spent: [] }
  const granted = isRelic(choice) ? { ...rewards, relics: [...rewards.relics, choice] } : { ...rewards, tuning: 'ready' as const }
  return { ...grantedAscent, battle: { ...battle, rewards: granted } }
}

export function nextAscentFight(ascent: Ascent): Ascent {
  if (ascent.route || ascent.battle.phase !== 'won' || ascent.fight === FIGHT_COUNT) return ascent
  const { seed } = ascent
  const fight = ascent.fight + 1
  return enterBattle(ascent, enemyForFight(seed, fight), ascentBattleSeed(seed, fight))
}
