import { ascentBattleSeed, ascentFinished, FIGHT_COUNT, rewardOffers } from './ascent.ts'
import type { Ascent } from './ascent.ts'
import { COUNTER_REWARDS, DIE_COUNT, PLAYER_HP } from './combat.ts'
import { enemyForFight } from './enemy-roster.ts'
import { isRelic, isReward, relicReady } from './rewards.ts'
import type { CombatRewards, Reward } from './rewards.ts'
import type { Hand, YachtBattle } from './yacht-combat.ts'

export const ASCENT_SAVE_KEY = 'hwigi-tower.ascent'
const version = 1

export interface AscentSave {
  readonly ascent: Ascent
  readonly selected: readonly number[]
  readonly rewardPreview?: Reward
}

type SaveStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type SavedBattle = Omit<YachtBattle, 'enemyIntents'>

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

function exchange(value: unknown) {
  if (!record(value)) return false
  const { turn, dealt, hitsTaken, counter, awakened, awakenedDice, escortDealt, chargeBroken } = value
  return integer(turn, 1) && integer(dealt) && Array.isArray(hitsTaken) && hitsTaken.every((hit) => integer(hit)) &&
    (counter === null || (record(counter) && integer(counter.slot, 0, COUNTER_REWARDS.length - 1) && reward(counter))) &&
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

function battleRecord(value: unknown, seed: number, enemy: Ascent['enemy']): value is SavedBattle {
  if (!record(value)) return false
  const { phase, turn, dice, slots, playerHp, enemyHp, fixedDie, stolenDie, escort, lastExchange } = value
  if (value.seed !== seed || !integer(turn, 1) || !integer(playerHp, 1, PLAYER_HP) || !integer(enemyHp, 0, enemy.hp)) return false
  if (phase !== 'assign' && phase !== 'counter' && phase !== 'won') return false
  if ((phase === 'won') !== (enemyHp === 0) || !faces(dice) || !Array.isArray(slots) || slots.length !== dice.length) return false
  if (!slots.every((slot) => slot === 'attack' || slot === 'guard' || slot === 'escort' || (phase === 'assign' && slot === null))) return false
  if (lastExchange === null ? phase !== 'assign' : !exchange(lastExchange)) return false
  if (!integer(value.enemyAttackBuff) || value.enemyAttackGrowth !== enemy.attackGrowth || !perk(value.perk) || !combatRewards(value.rewards)) return false
  if (value.wedgeArmed !== undefined && (value.wedgeArmed !== true || phase !== 'assign' || !relicReady(value.rewards, 'wedge'))) return false
  if (![value.extraRerollAvailable, value.rerolled, value.awakened].every((flag) => typeof flag === 'boolean')) return false
  if (![value.extraRerollSpent, value.paidRerollSpent, value.fourthDieUnlocked].every((flag) => flag === undefined || flag === true)) return false
  if (value.nextInterference !== undefined && !interference(value.nextInterference)) return false
  if (value.weakenedStrikeTurn !== undefined && !integer(value.weakenedStrikeTurn, 1)) return false
  if (fixedDie !== undefined && !(record(fixedDie) && integer(fixedDie.index, 0, dice.length - 1) && interference(fixedDie.kind))) return false
  if (stolenDie !== undefined && !(record(stolenDie) && integer(stolenDie.remaining, 1))) return false
  return escort === undefined || (record(escort) && integer(escort.hp, 1) && integer(escort.bonus))
}

function readCheckpoint(raw: unknown): AscentSave | null {
  if (!record(raw) || raw.version !== version || !record(raw.ascent)) return null
  const { seed, fight, unlocks, newUnlock, battle, rewardChoice } = raw.ascent
  if (!integer(seed, 0, 0xffffffff) || !integer(fight, 1, FIGHT_COUNT) || !Array.isArray(unlocks) || !unlocks.every(hand)) return null
  if (new Set(unlocks).size !== unlocks.length || (newUnlock !== null && (!hand(newUnlock) || !unlocks.includes(newUnlock)))) return null
  const enemy = enemyForFight(seed, fight)
  const fightSeed = ascentBattleSeed(seed, fight)
  if (!battleRecord(battle, fightSeed, enemy)) return null
  if (rewardChoice !== undefined && (battle.phase !== 'won' || (rewardChoice !== 'skip' && !isReward(rewardChoice)))) return null
  if (isRelic(rewardChoice) && !battle.rewards?.relics.includes(rewardChoice)) return null
  if (rewardChoice === 'tuning' && battle.rewards?.tuning !== 'ready') return null
  if (battle.phase !== 'won' && Boolean(battle.fourthDieUnlocked) !== unlocks.includes('triple')) return null
  if (battle.phase === 'assign' && battle.dice.length !== DIE_COUNT + Number(Boolean(battle.fourthDieUnlocked)) - Number(Boolean(battle.stolenDie))) return null
  const { selected } = raw
  if (!Array.isArray(selected) || new Set(selected).size !== selected.length ||
      !selected.every((index) => battle.phase === 'assign' && integer(index, 0, battle.dice.length - 1))) return null

  const ascent: Ascent = {
    seed, fight, enemy, maxHp: PLAYER_HP, unlocks, newUnlock,
    battle: { ...battle, enemyIntents: enemy.intents, enemyAttackGrowth: enemy.attackGrowth },
    ...(rewardChoice && { rewardChoice }),
  }
  const { rewardPreview } = raw
  if (rewardPreview !== undefined && !isReward(rewardPreview)) return null
  const previewAvailable = rewardPreview !== undefined && rewardOffers(ascent).includes(rewardPreview)
  return ascentFinished(ascent) ? null : { ascent, selected, ...(previewAvailable && { rewardPreview }) }
}

export function loadAscentSave(storage?: SaveStorage): AscentSave | null {
  try {
    const data = (storage ?? globalThis.localStorage).getItem(ASCENT_SAVE_KEY)
    return data === null ? null : readCheckpoint(JSON.parse(data))
  } catch {
    return null
  }
}

export function writeAscentSave({ ascent, selected, rewardPreview }: AscentSave, storage?: SaveStorage) {
  try {
    const store = storage ?? globalThis.localStorage
    if (ascentFinished(ascent)) {
      store.removeItem(ASCENT_SAVE_KEY)
      return
    }
    const { seed, fight, unlocks, newUnlock, battle, rewardChoice } = ascent
    const { enemyIntents: _enemyIntents, ...savedBattle } = battle
    store.setItem(ASCENT_SAVE_KEY, JSON.stringify({
      version, selected, rewardPreview, ascent: { seed, fight, unlocks, newUnlock, rewardChoice, battle: savedBattle },
    }))
  } catch {
    // The run can still be played when browser storage is unavailable.
  }
}
