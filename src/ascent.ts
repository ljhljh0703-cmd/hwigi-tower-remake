import { PLAYER_HP } from './combat.ts'
import type { StartPerk } from './perks.ts'
import { resolveYachtTurn, startYachtBattle } from './yacht-combat.ts'
import type { Hand, YachtBattle } from './yacht-combat.ts'

export const FIGHT_COUNT = 3

export interface Ascent {
  readonly seed: number
  readonly fight: number
  readonly perk: StartPerk
  readonly maxHp: number
  readonly unlocks: readonly Hand[]
  readonly newUnlock: Hand | null
  readonly battle: YachtBattle
}

export function beginAscent(seed: number, perk: StartPerk): Ascent {
  const maxHp = PLAYER_HP + (perk === 'health' ? 6 : 0)
  return {
    seed,
    fight: 1,
    perk,
    maxHp,
    unlocks: [],
    newUnlock: null,
    battle: startYachtBattle(seed, maxHp, false, false, perk),
  }
}

export function resolveAscentTurn(ascent: Ascent): Ascent {
  const { battle, hand } = resolveYachtTurn(ascent.battle)
  if (battle === ascent.battle) return ascent
  const newUnlock = hand && !ascent.unlocks.includes(hand.hand) ? hand.hand : null
  const unlocks = newUnlock ? [...ascent.unlocks, newUnlock] : ascent.unlocks
  return { ...ascent, battle, unlocks, newUnlock }
}

export function nextAscentFight(ascent: Ascent): Ascent {
  if (ascent.battle.phase !== 'won' || ascent.fight === FIGHT_COUNT) return ascent
  const { seed, perk, unlocks } = ascent
  const fight = ascent.fight + 1
  const fightSeed = (seed ^ Math.imul(fight - 1, 0x9e3779b9)) >>> 0
  const battle = startYachtBattle(fightSeed, ascent.battle.playerHp, unlocks.includes('triple'), unlocks.includes('straight'), perk)
  return { ...ascent, fight, battle, newUnlock: null }
}
