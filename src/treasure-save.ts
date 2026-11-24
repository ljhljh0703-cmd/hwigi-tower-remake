import { ARTIFACT_SLOTS, isArtifact, isItem, isPreparation, isShard } from './treasure.ts'
import type { ArtifactOptions, TreasureState } from './treasure.ts'
import { isReward } from './rewards.ts'

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

export function artifactOptionsRecord(value: unknown): value is ArtifactOptions {
  return object(value) && Object.keys(value).every((field) => ['replace', 'parity', 'hand'].includes(field)) &&
    (value.replace === undefined || isArtifact(value.replace)) && (value.parity === undefined || parity(value.parity)) &&
    (value.hand === undefined || hand(value.hand))
}

export function treasureRecord(value: unknown, dice: readonly number[], companion: boolean, phase: unknown): value is TreasureState {
  if (!object(value)) return false
  const { items, spentItems, prep, prepared, shards, equipped, acquired, spent, heartParity, sealHand, sealUsed,
    armed, shardArmed, tuned, sealDraft, hourglass, mirrorDamage, overflowDamage, counter, counterFlags, triggered } = value
  if (!counts(items, isItem) || !counts(spentItems, isItem) || !counts(prep, isPreparation) || !counts(prepared, isPreparation) || !counts(shards, isShard)) return false
  if (!Object.entries(spentItems).every(([id, n]) => n <= (items[id] ?? 0))) return false
  if (!artifacts(equipped) || equipped.length > ARTIFACT_SLOTS || !artifacts(acquired) || !artifacts(spent)) return false
  if (![...equipped, ...spent].every((id) => acquired.includes(id))) return false
  if (acquired.includes('heart-die') ? !parity(heartParity) : heartParity !== undefined) return false
  if (acquired.includes('incomplete') ? !hand(sealHand) : sealHand !== undefined || sealUsed !== undefined) return false
  if (!trueFlag(sealUsed) || !trueFlag(tuned)) return false
  if (armed !== undefined && (!artifacts(armed) || !armed.every((id) => (id === 'banner' || id === 'hammer') && equipped.includes(id)))) return false
  if (shardArmed !== undefined && (shardArmed !== 'assist' && shardArmed !== 'smash')) return false
  if (mirrorDamage !== undefined && !integer(mirrorDamage, 1, 12) || overflowDamage !== undefined && !integer(overflowDamage, 1, 6)) return false
  if (counter !== undefined && (phase !== 'counter' || !object(counter) || !integer(counter.slot, 0, 5) || !integer(counter.damage, 1) || typeof counter.joint !== 'boolean')) return false
  if (counterFlags !== undefined && (phase !== 'counter' || !object(counterFlags) || !['coin', 'assist', 'horn'].every((field) => typeof counterFlags[field] === 'boolean'))) return false
  if (triggered !== undefined && (!Array.isArray(triggered) || !triggered.every(isReward))) return false
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
