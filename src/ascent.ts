import { ENEMY_INTENTS, PLAYER_HP } from './combat.ts'
import type { Enemy } from './combat.ts'
import { START_PERKS } from './perks.ts'
import type { StartPerk } from './perks.ts'
import { activateYachtHand, resolveYachtTurn, startYachtBattle } from './yacht-combat.ts'
import type { Hand, YachtBattle } from './yacht-combat.ts'

export const ASCENT_ENEMIES = [
  {
    hp: 30,
    attackPerUnlock: 0,
    intents: [
      { ...ENEMY_INTENTS[0], hits: [15] },
      { ...ENEMY_INTENTS[1], hits: [3, 3, 3] },
    ],
  },
  {
    hp: 45,
    attackPerUnlock: 2,
    intents: [
      { id: 'combo', name: '연타', hits: [1, 1, 2], matches: (turn) => turn % 4 === 1 },
      { id: 'impact', name: '한 방', hits: [12], matches: (turn) => turn % 4 === 2 },
      { id: 'charge', name: '힘 모으기', hits: [], previewNextAttack: true, matches: (turn) => turn % 4 === 3 },
      { id: 'critical', name: '치명 일격', hits: [14], matches: (turn) => turn % 4 === 0 },
    ],
  },
  {
    hp: 58,
    attackPerUnlock: 1,
    attackGrowth: 0,
    intents: [
      { id: 'combo', name: '연타', hits: [2, 2], matches: (turn) => turn % 5 === 1 },
      { id: 'charge', name: '힘 모으기', hits: [], previewNextAttack: true, matches: (turn) => turn % 5 === 2 },
      { id: 'critical', name: '치명 일격', hits: [16], matches: (turn) => turn % 5 === 3 },
      { id: 'knockdown', name: '넉다운', hits: [], damageTakenMultiplier: 3, matches: (turn) => turn % 5 === 4 },
      { id: 'impact', name: '한 방', hits: [12], matches: (turn) => turn % 5 === 0 },
    ],
  },
] as const satisfies readonly (Enemy & { readonly attackPerUnlock: number })[]

export const FIGHT_COUNT = ASCENT_ENEMIES.length

export interface Ascent {
  readonly seed: number
  readonly fight: number
  readonly perk: StartPerk | undefined
  readonly maxHp: number
  readonly unlocks: readonly Hand[]
  readonly newUnlock: Hand | null
  readonly battle: YachtBattle
}

export function beginAscent(seed: number, perk?: StartPerk): Ascent {
  const maxHp = PLAYER_HP + (perk === 'health' ? START_PERKS.health.bonus : 0)
  return {
    seed,
    fight: 1,
    perk,
    maxHp,
    unlocks: [],
    newUnlock: null,
    battle: startYachtBattle(seed, maxHp, false, false, perk, ASCENT_ENEMIES[0]),
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
  const { seed, perk, unlocks } = ascent
  const fight = ascent.fight + 1
  const fightSeed = (seed ^ Math.imul(fight - 1, 0x9e3779b9)) >>> 0
  const enemy = ASCENT_ENEMIES[fight - 1]
  const battle = startYachtBattle(
    fightSeed, ascent.battle.playerHp, unlocks.includes('triple'), unlocks.includes('straight'), perk,
    enemy, unlocks.length * enemy.attackPerUnlock,
  )
  return { ...ascent, fight, battle, newUnlock: null }
}
