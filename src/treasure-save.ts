import { ARTIFACT_SLOTS, isArmedConsumable, isArtifact, isConsumable, isItem, isNewTreasureId, isPreparation, isSevenTreasure, isShard } from './treasure.ts'
import type { ArtifactOptions, TreasureState } from './treasure.ts'
import { isReward } from './rewards.ts'
import { SEVEN_ITEM_VALUES } from './item-values.ts'

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function integer(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
}

const parity = (value: unknown) => value === 'odd' || value === 'even'
const hand = (value: unknown) => value === 'triple' || value === 'straight'
const trueFlag = (value: unknown) => value === undefined || value === true
const artifacts = (value: unknown): value is TreasureState['equipped'] => Array.isArray(value) && value.every(isArtifact) && new Set(value).size === value.length
const counts = (value: unknown, isId: (name: unknown) => boolean): value is Record<string, number> => object(value) && Object.entries(value).every(([id, n]) => isId(id) && integer(n, 1))

export function artifactOptionsRecord(value: unknown, seven = false): value is ArtifactOptions {
  return object(value) && Object.keys(value).every((field) => ['replace', 'parity', 'hand'].includes(field)) &&
    (value.replace === undefined || isArtifact(value.replace) && (seven ? isSevenTreasure(value.replace) : value.replace !== 'die-latch')) &&
    (value.parity === undefined || parity(value.parity)) && (value.hand === undefined || !seven && hand(value.hand))
}

export function treasureRecord(value: unknown, dice: readonly number[], companion: boolean, phase: unknown, seven = false): value is TreasureState {
  if (!object(value)) return false
  const { items, spentItems, prep, prepared, shards, equipped, acquired, spent, heartParity, sealHand, sealUsed,
    armed, shardArmed, tuned, sealDraft, hourglass, mirrorDamage, overflowDamage, counter, counterFlags, triggered } = value
  if (!counts(items, isItem) || !counts(spentItems, isItem) || !counts(prep, isPreparation) || !counts(prepared, isPreparation) || !counts(shards, isShard)) return false
  if (!Object.entries(spentItems).every(([id, n]) => n <= (items[id] ?? 0))) return false
  if (!artifacts(equipped) || equipped.length > ARTIFACT_SLOTS || !artifacts(acquired) || !artifacts(spent)) return false
  if (![...equipped, ...spent].every((id) => acquired.includes(id))) return false
  if ([...acquired, ...Object.keys(prep), ...Object.keys(prepared)].some((id) => seven ? !isSevenTreasure(id) : id === 'die-latch')) return false
  if (acquired.includes('heart-die') ? !parity(heartParity) : heartParity !== undefined) return false
  if (!seven && acquired.includes('incomplete') ? !hand(sealHand) : sealHand !== undefined || sealUsed !== undefined && !acquired.includes('incomplete')) return false
  if (!trueFlag(sealUsed) || !trueFlag(tuned)) return false
  if (armed !== undefined && (!artifacts(armed) || !armed.every((id) => (id === 'banner' || id === 'hammer') && equipped.includes(id)))) return false
  if (shardArmed !== undefined && (shardArmed !== 'assist' && shardArmed !== 'smash')) return false
  const mirrorCap = seven ? SEVEN_ITEM_VALUES.mirrorCap : 12
  const overflowCap = seven ? Math.max(12, SEVEN_ITEM_VALUES.overflowCap) : 6
  if (mirrorDamage !== undefined && !integer(mirrorDamage, 1, mirrorCap) || overflowDamage !== undefined && !integer(overflowDamage, 1, overflowCap)) return false
  if (counter !== undefined && (phase !== 'counter' || !object(counter) || !integer(counter.slot, 0, 5) || !integer(counter.damage, 1) || typeof counter.joint !== 'boolean')) return false
  if (counterFlags !== undefined && (phase !== 'counter' || !object(counterFlags) || !['coin', 'assist', 'horn'].every((field) => typeof counterFlags[field] === 'boolean'))) return false
  if (triggered !== undefined && (!Array.isArray(triggered) || !triggered.every(seven ? isSevenTreasure : (id) => isReward(id) && !isNewTreasureId(id)))) return false
  if (!itemTurnRecord(value, dice, phase, seven, equipped, spent)) return false
  const lastNormal = dice.length - 1 - Number(companion)
  if (sealDraft !== undefined && (phase !== 'assign' || sealUsed || !equipped.includes('incomplete') || hourglass !== undefined ||
    !object(sealDraft) || !integer(sealDraft.index, 0, lastNormal) || !integer(sealDraft.before, 1, 6) ||
    Math.abs(dice[sealDraft.index] - sealDraft.before) < 1 || Math.abs(dice[sealDraft.index] - sealDraft.before) > 2)) return false
  if (hourglass !== undefined) {
    if (phase !== 'assign' || !spent.includes('hourglass') || !Array.isArray(hourglass) || !integer(hourglass.length, 1, 2)) return false
    if (!hourglass.every((die) => object(die) && integer(die.index, 0, lastNormal) && integer(die.rolled, 1, 6) && die.original === dice[die.index])) return false
    if (new Set(hourglass.map((die) => die.index)).size !== hourglass.length) return false
  }
  return true
}

function itemTurnRecord(value: Record<string, unknown>, dice: readonly number[], phase: unknown, seven: boolean,
  equipped: TreasureState['equipped'], spent: TreasureState['spent']) {
  const { consumables, consumableArmed, consumableUsed, reserveRoll, latchDraft, latched, counterRecast, counter } = value
  if (!seven) return [consumables, consumableArmed, consumableUsed, reserveRoll, latchDraft, latched, counterRecast].every((field) => field === undefined)
  if (![value.items, value.spentItems, value.shards].every((field) => object(field) && !Object.keys(field).length)) return false
  if ([value.shardArmed, value.tuned, value.sealDraft, value.hourglass, value.counterFlags].some((field) => field !== undefined)) return false
  if (!counts(consumables, isConsumable) || !trueFlag(consumableUsed) || !trueFlag(counterRecast)) return false
  if (consumableArmed !== undefined && (phase !== 'assign' || !isArmedConsumable(consumableArmed) || !consumables[consumableArmed] || consumableUsed)) return false
  if (counterRecast && (phase !== 'counter' || !counter || !consumableUsed)) return false
  const normalIndex = (index: unknown): index is number => integer(index, 0, Math.min(2, dice.length - 1))
  if (latchDraft !== undefined && (phase !== 'assign' || !normalIndex(latchDraft) || !equipped.includes('die-latch') || spent.includes('die-latch'))) return false
  if (latched !== undefined && (phase !== 'counter' || !object(latched) || !normalIndex(latched.index) || !integer(latched.face, 1, 6) || !spent.includes('die-latch'))) return false
  if (reserveRoll === undefined) return true
  if (phase !== 'assign' || !consumableUsed || !Array.isArray(reserveRoll) || !integer(reserveRoll.length, 1, 3)) return false
  return reserveRoll.every((die) => object(die) && normalIndex(die.index) && die.original === dice[die.index] && integer(die.rolled, 1, 6)) &&
    new Set(reserveRoll.map((die) => die.index)).size === reserveRoll.length
}
