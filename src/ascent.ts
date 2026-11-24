import { PLAYER_HP } from './combat.ts'
import { ASCENT_ENEMIES, enemyForFight } from './enemy-roster.ts'
import { startPerk } from './perks.ts'
import type { Parity, StartPerk } from './perks.ts'
import { BANDAGE_HEAL, BANDAGE_THRESHOLD, RELICS, isRelic } from './rewards.ts'
import type { Reward, RewardChoice } from './rewards.ts'
import { activateYachtHand, resolveYachtTurn, startYachtBattle } from './yacht-combat.ts'
import type { Hand, YachtBattle } from './yacht-combat.ts'

export const FIGHT_COUNT = ASCENT_ENEMIES.length

export interface Ascent {
  readonly seed: number
  readonly fight: number
  readonly enemy: ReturnType<typeof enemyForFight>
  readonly maxHp: number
  readonly unlocks: readonly Hand[]
  readonly newUnlock: Hand | null
  readonly rewardChoice?: RewardChoice
  readonly battle: YachtBattle
}

export function ascentFinished({ battle, fight }: Ascent) {
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

export function resolveAscentTurn(ascent: Ascent): Ascent {
  const { battle, hand } = resolveYachtTurn(ascent.battle)
  if (battle === ascent.battle) return ascent
  const newUnlock = hand && !ascent.unlocks.includes(hand.hand) ? hand.hand : null
  const unlocks = newUnlock ? [...ascent.unlocks, newUnlock] : ascent.unlocks
  // The new power applies to the next allocation, including in the current fight.
  return { ...ascent, battle: newUnlock ? activateYachtHand(battle, newUnlock) : battle, unlocks, newUnlock }
}

export function rewardOffers(ascent: Ascent): readonly Reward[] {
  const { battle, fight, seed, rewardChoice } = ascent
  if (battle.phase !== 'won' || fight === FIGHT_COUNT || rewardChoice) return []
  const next = enemyForFight(seed, fight + 1)
  const available = RELICS.filter((relic) => !battle.rewards?.relics.includes(relic) &&
    (relic !== 'wedge' || next.intents.some((intent) => intent.chargeThreshold !== undefined)))
  const kind = battle.perk?.kind
  const preferred = kind === 'shield' || kind === 'counter' ? 'buckle' : 'weight'
  const seats: (Reward | undefined)[] = [
    available.includes(preferred) ? preferred : undefined,
    battle.rewards?.tuning ? undefined : 'tuning',
    battle.playerHp <= BANDAGE_THRESHOLD ? 'bandage' : undefined,
  ]
  const fillers: Reward[] = available.filter((relic) => relic !== 'wedge' && !seats.includes(relic))
  if (available.includes('wedge')) fillers.unshift('wedge')
  return seats.flatMap((card) => card ?? fillers.shift() ?? [])
}

export function rewardHealth(ascent: Ascent) {
  return Math.min(ascent.maxHp, ascent.battle.playerHp + BANDAGE_HEAL)
}

export function takeAscentReward(ascent: Ascent, choice: RewardChoice): Ascent {
  const offers = rewardOffers(ascent)
  if (!offers.length || (choice !== 'skip' && !offers.includes(choice))) return ascent
  const { battle } = ascent
  if (choice === 'bandage') return { ...ascent, rewardChoice: choice, battle: { ...battle, playerHp: rewardHealth(ascent) } }
  if (choice === 'skip') return { ...ascent, rewardChoice: choice }
  const rewards = battle.rewards ?? { relics: [], spent: [] }
  const granted = isRelic(choice) ? { ...rewards, relics: [...rewards.relics, choice] } : { ...rewards, tuning: 'ready' as const }
  return { ...ascent, rewardChoice: choice, battle: { ...battle, rewards: granted } }
}

export function nextAscentFight(ascent: Ascent): Ascent {
  if (ascent.battle.phase !== 'won' || ascent.fight === FIGHT_COUNT) return ascent
  const { seed, unlocks } = ascent
  const fight = ascent.fight + 1
  const fightSeed = ascentBattleSeed(seed, fight)
  const enemy = enemyForFight(seed, fight)
  const perk = ascent.battle.perk?.kind === 'blade' ? startPerk('blade') : ascent.battle.perk
  const battle = startYachtBattle(
    fightSeed, ascent.battle.playerHp, unlocks.includes('triple'), unlocks.includes('straight'), perk,
    enemy, unlocks.length * enemy.attackPerUnlock,
  )
  const { rewards } = ascent.battle
  const { rewardChoice: _choice, ...previous } = ascent
  return { ...previous, fight, enemy, battle: rewards ? { ...battle, rewards: { ...rewards, spent: [] } } : battle, newUnlock: null }
}
