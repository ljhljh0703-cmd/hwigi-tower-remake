import { PLAYER_HP } from './combat.ts'
import { ASCENT_ENEMIES, enemyForFight } from './enemy-roster.ts'
import { startPerk } from './perks.ts'
import type { Parity, StartPerk } from './perks.ts'
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
  readonly battle: YachtBattle
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

export function nextAscentFight(ascent: Ascent): Ascent {
  if (ascent.battle.phase !== 'won' || ascent.fight === FIGHT_COUNT) return ascent
  const { seed, unlocks } = ascent
  const fight = ascent.fight + 1
  const fightSeed = (seed ^ Math.imul(fight - 1, 0x9e3779b9)) >>> 0
  const enemy = enemyForFight(seed, fight)
  const perk = ascent.battle.perk?.kind === 'blade' ? startPerk('blade') : ascent.battle.perk
  const battle = startYachtBattle(
    fightSeed, ascent.battle.playerHp, unlocks.includes('triple'), unlocks.includes('straight'), perk,
    enemy, unlocks.length * enemy.attackPerUnlock,
  )
  return { ...ascent, fight, enemy, battle, newUnlock: null }
}
