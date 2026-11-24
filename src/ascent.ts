import { enemyForMapNode, generateAscentMap, MAP_FLOORS, MAP_REWARD_CHANNEL, MAP_START, nextMapNodes } from './ascent-map.ts'
import type { AscentMap, MapNode } from './ascent-map.ts'
import { draw, PLAYER_HP } from './combat.ts'
import { ASCENT_ENEMIES, enemyForFight } from './enemy-roster.ts'
import { startPerk } from './perks.ts'
import type { Parity, StartPerk } from './perks.ts'
import { BANDAGE_HEAL, BANDAGE_THRESHOLD, RELICS, isRelic } from './rewards.ts'
import type { Reward, RewardChoice } from './rewards.ts'
import { activateYachtHand, resolveYachtTurn, spinYachtCounter, startYachtBattle } from './yacht-combat.ts'
import type { Hand, YachtBattle } from './yacht-combat.ts'

export const FIGHT_COUNT = ASCENT_ENEMIES.length
const REWARD_ORDER_CHANNEL = 30

export interface MapProgress {
  readonly map: AscentMap
  readonly completed: readonly number[]
  readonly node: number | null
  readonly screen: 'map' | 'battle' | 'reward' | 'return' | 'rest' | 'finished'
  readonly offers?: readonly Reward[]
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

export function beginMapAscent(seed: number, perk?: StartPerk, parity: Parity = 'odd'): Ascent {
  const map = generateAscentMap(seed)
  const first = map.nodes[0]
  const enemy = enemyForMapNode(first)!
  return {
    seed, fight: 0, enemy, maxHp: PLAYER_HP, unlocks: [], newUnlock: null,
    battle: startYachtBattle(first.battleSeed, PLAYER_HP, false, false, startPerk(perk, parity), enemy),
    route: { map, completed: [], node: null, screen: 'map' },
  }
}

export function availableMapNodes({ route }: Ascent): readonly MapNode[] {
  if (!route) return []
  return nextMapNodes(route.map, route.node ?? route.completed.at(-1) ?? MAP_START)
}

function enterBattle(ascent: Ascent, enemy: Ascent['enemy'], fightSeed: number): Ascent {
  const { unlocks, battle: previousBattle, rewardChoice: _choice, ...previous } = ascent
  const perk = previousBattle.perk?.kind === 'blade' ? startPerk('blade') : previousBattle.perk
  const battle = startYachtBattle(
    fightSeed, previousBattle.playerHp, unlocks.includes('triple'), unlocks.includes('straight'), perk,
    enemy, unlocks.length * enemy.attackPerUnlock,
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
  const enemy = enemyForMapNode(node)
  const next = enemy ? enterBattle(ascent, enemy, node.battleSeed) : { ...ascent, newUnlock: null }
  return { ...next, route: { ...route, node: id, screen: enemy ? 'battle' : 'rest' } }
}

function completeMapNode(route: MapProgress, screen: 'return' | 'map' | 'finished'): MapProgress {
  return { map: route.map, node: null, completed: [...route.completed, route.node!], screen }
}

export function returnToMap(ascent: Ascent): Ascent {
  const { route, rewardChoice: _choice, ...previous } = ascent
  if (route?.screen === 'rest') return { ...previous, route: completeMapNode(route, 'map') }
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
  const { route, battle } = ascent
  if (route?.screen !== 'battle' || route.node === null) return ascent
  if (battle.phase === 'lost') return { ...ascent, route: { ...route, screen: 'finished' } }
  if (battle.phase !== 'won') return ascent
  if (route.map.byId[route.node].floor === MAP_FLOORS) {
    return { ...ascent, route: completeMapNode(route, 'finished') }
  }
  return { ...ascent, route: { ...route, screen: 'reward', offers: mapRewardOffers(ascent.seed, route.node, battle) } }
}

export function resolveAscentTurn(ascent: Ascent): Ascent {
  if (ascent.route && ascent.route.screen !== 'battle') return ascent
  const { battle, hand } = resolveYachtTurn(ascent.battle)
  if (battle === ascent.battle) return ascent
  const newUnlock = hand && !ascent.unlocks.includes(hand.hand) ? hand.hand : null
  const unlocks = newUnlock ? [...ascent.unlocks, newUnlock] : ascent.unlocks
  // The new power applies to the next allocation, including in the current fight.
  return settleBattle({ ...ascent, battle: newUnlock ? activateYachtHand(battle, newUnlock) : battle, unlocks, newUnlock })
}

export function spinAscentCounter(ascent: Ascent): Ascent {
  if (ascent.route && ascent.route.screen !== 'battle') return ascent
  const battle = spinYachtCounter(ascent.battle)
  return battle === ascent.battle ? ascent : settleBattle({ ...ascent, battle })
}

export function rewardOffers(ascent: Ascent): readonly Reward[] {
  const { battle, fight, seed, rewardChoice, route } = ascent
  if (route) return route.screen === 'reward' ? route.offers ?? [] : []
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

export function takeAscentReward(ascent: Ascent, choice: RewardChoice): Ascent {
  const offers = rewardOffers(ascent)
  const { battle, route } = ascent
  const atReward = route ? route.screen === 'reward' : offers.length > 0
  if (!atReward || (choice !== 'skip' && !offers.includes(choice))) return ascent
  const grantedAscent = { ...ascent, rewardChoice: choice, ...(route && { route: { ...completeMapNode(route, 'return'), offers } }) }
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
