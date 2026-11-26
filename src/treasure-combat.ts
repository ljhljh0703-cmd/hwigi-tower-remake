import { dieFaceForSlot, enemyIntentAt, PLAYER_HP, roll, splitEnemyDamage } from './combat.ts'
import type { CounterResult, Slot, SlotTotals } from './combat.ts'
import { BUCKLE_MAX_SHORTFALL, BUCKLE_REDUCTION, WEIGHT_BONUS } from './rewards.ts'
import { artifactReady, changeCount, itemUses } from './treasure.ts'
import type { Artifact, CounterChoice, Item, Preparation, Shard, Treasure, TreasureState } from './treasure.ts'
import type { YachtBattle } from './yacht-combat.ts'
import type { forecast } from './combat.ts'
import { consumableReady } from './item-effects.ts'
import { SEVEN_EMPEROR_COUNTER_RATIO } from './boss-relic.ts'
import { SEVEN_ITEM_VALUES } from './item-values.ts'

export function spendItem(state: TreasureState, item: Item): TreasureState {
  return { ...state, spentItems: changeCount(state.spentItems, item, 1), triggered: [...(state.triggered ?? []), item] }
}

function spendArtifact(state: TreasureState, id: Artifact): TreasureState {
  return { ...state, spent: [...state.spent, id], triggered: [...(state.triggered ?? []), id] }
}

function spendPrep(state: TreasureState, id: Preparation): TreasureState {
  return { ...state, prepared: changeCount(state.prepared, id, -1), triggered: [...(state.triggered ?? []), id] }
}

function spendShard(state: TreasureState, id: Shard): TreasureState {
  return { ...state, shards: changeCount(state.shards, id, -1), triggered: [...(state.triggered ?? []), id] }
}

export function openTreasureTurn(battle: YachtBattle): YachtBattle {
  if (!battle.loot) return battle
  const { armed: _armed, shardArmed: _shard, tuned: _tuned, counter: _counter, counterFlags: _flags,
    consumableArmed: _item, consumableUsed: _used, reserveRoll: _reserve, latchDraft: _latch, counterRecast: _recast, ...loot } = battle.loot
  if (!loot.prepared.emergency || battle.playerHp > 8) return { ...battle, loot }
  return { ...battle, playerHp: Math.min(PLAYER_HP, battle.playerHp + 2), loot: spendPrep(loot, 'emergency') }
}

export function expireBattleTreasure(battle: YachtBattle): YachtBattle {
  if (!battle.loot) return battle
  const { mirrorDamage: _mirror, overflowDamage: _overflow, counterFlags: _flags, armed: _armed, shardArmed: _shard, tuned: _tuned,
    consumableArmed: _item, latchDraft: _latch, latched: _latched, ...loot } = battle.loot
  return { ...battle, loot: { ...loot, prepared: {} } }
}

export function companionFace(battle: YachtBattle, face: number): number {
  const { loot } = battle
  if (!loot?.heartParity || !loot.equipped.includes('heart-die')) return face
  return Math.floor((face - 1) / 2) * 2 + (loot.heartParity === 'odd' ? 1 : 2)
}

function changeable(battle: YachtBattle, index: number) {
  const mechanic = enemyIntentAt(battle).mechanic
  const face = battle.dice[index]
  return battle.phase === 'assign' && Number.isInteger(index) && index >= 0 && index < battle.dice.length - Number(Boolean(battle.fourthDieUnlocked)) &&
    battle.fixedDie?.index !== index && !(mechanic?.kind === 'seal' && face === mechanic.value)
}

export function toggleArtifact(battle: YachtBattle, id: 'banner' | 'hammer'): YachtBattle {
  const { loot } = battle
  if (battle.phase !== 'assign' || !loot || loot.hourglass || loot.reserveRoll || !artifactReady(loot, id)) return battle
  if (id === 'hammer' && (battle.itemsSeven || enemyIntentAt(battle).chargeThreshold === undefined)) return battle
  const armed = loot.armed ?? []
  return { ...battle, loot: { ...loot, armed: armed.includes(id) ? armed.filter((choice) => choice !== id) : [...armed, id] } }
}

export function toggleShard(battle: YachtBattle, id: 'assist' | 'smash'): YachtBattle {
  const { loot } = battle
  if (battle.phase !== 'assign' || !loot?.shards[id] || loot.tuned || loot.sealDraft || loot.hourglass) return battle
  return { ...battle, loot: { ...loot, shardArmed: loot.shardArmed === id ? undefined : id } }
}

export function useTuningShard(battle: YachtBattle, change: -1 | 1): YachtBattle {
  const { loot } = battle
  if (!loot?.shards.tuning || loot.tuned || loot.shardArmed || loot.hourglass || loot.sealDraft || !changeable(battle, 0)) return battle
  const next = battle.dice[0] + change
  const mechanic = enemyIntentAt(battle).mechanic
  if (next < 1 || next > 6 || (mechanic?.kind === 'seal' && next === mechanic.value)) return battle
  return { ...battle, dice: [next, ...battle.dice.slice(1)], loot: { ...spendShard(loot, 'tuning'), tuned: true } }
}

export function draftSeal(battle: YachtBattle, index: number, change: -2 | -1 | 1 | 2): YachtBattle {
  const { loot } = battle
  if (battle.itemsSeven || !loot || !loot.equipped.includes('incomplete') || !loot.sealHand || loot.sealUsed || loot.sealDraft || loot.hourglass || loot.tuned || loot.shardArmed || !changeable(battle, index)) return battle
  if (loot.sealHand === 'triple' ? battle.fourthDieUnlocked : battle.extraRerollAvailable || battle.extraRerollSpent) return battle
  const face = battle.dice[index] + change
  const mechanic = enemyIntentAt(battle).mechanic
  if (![-2, -1, 1, 2].includes(change) || face < 1 || face > 6 || (mechanic?.kind === 'seal' && face === mechanic.value)) return battle
  const dice = [...battle.dice]
  dice[index] = face
  return { ...battle, dice, loot: { ...loot, sealDraft: { index, before: battle.dice[index] } } }
}

export function cancelSeal(battle: YachtBattle): YachtBattle {
  const { loot } = battle
  if (battle.phase !== 'assign' || !loot?.sealDraft) return battle
  const { sealDraft, ...rest } = loot
  const dice = [...battle.dice]
  dice[sealDraft.index] = sealDraft.before
  return { ...battle, dice, loot: rest }
}

export function startHourglass(battle: YachtBattle, indices: readonly number[]): YachtBattle {
  const { loot } = battle
  if (battle.itemsSeven || !loot || !artifactReady(loot, 'hourglass') || loot.hourglass || loot.sealDraft || !battle.rerolled || battle.playerHp < 4) return battle
  if (indices.length !== 2 || new Set(indices).size !== 2 || !indices.every((index) => changeable(battle, index))) return battle
  const hourglass = [...indices].sort((a, b) => a - b).map((index, rank) => ({
    index, original: battle.dice[index], rolled: roll(battle.seed, battle.turn, 90 + rank),
  }))
  return { ...battle, playerHp: battle.playerHp - 2, loot: { ...spendArtifact(loot, 'hourglass'), hourglass } }
}

export function chooseHourglass(battle: YachtBattle, index: number, useNew: boolean): YachtBattle {
  const { loot } = battle
  const entry = loot?.hourglass?.find((die) => die.index === index)
  if (battle.phase !== 'assign' || !loot || !entry) return battle
  const hourglass = loot.hourglass!.filter((die) => die !== entry)
  const dice = [...battle.dice]
  dice[index] = useNew ? entry.rolled : entry.original
  return { ...battle, dice, loot: { ...loot, hourglass: hourglass.length ? hourglass : undefined } }
}

export function forecastTreasure(battle: YachtBattle, state: TreasureState, base: ReturnType<typeof forecast>, totals: SlotTotals, slots: YachtBattle['slots'], dice: readonly number[]) {
  const { triggered: _last, mirrorDamage, overflowDamage, ...inventory } = state
  let loot: TreasureState = inventory
  let { hits, damage } = base
  let inflicted = { dealt: base.dealt, escortDealt: base.escortDealt }
  const { incoming } = base
  const mechanic = base.intent.mechanic
  const faces = (slot: Slot) => dice.flatMap((face, index) => slots[index] === slot ? [dieFaceForSlot(face, slot, mechanic)] : [])
  const attack = faces('attack')
  const guard = faces('guard')
  const eligibleAttack = attack.filter((face) => face > 0)
  const firstAttack = slots[0] === 'attack' ? dieFaceForSlot(dice[0], 'attack', mechanic) : 0
  const ready = (id: Item) => itemUses(loot, id) > 0
  const returnsAttack = base.dealt < battle.enemyHp && incoming.totalDamage > 0
  let protection = 0
  const shield = (limit: number, applies: boolean, itemCap = true): boolean => {
    if (!returnsAttack || !applies) return false
    let left = itemCap ? Math.min(limit, 3 - protection) : limit
    const before = damage
    hits = hits.map((hit, index) => {
      if (index >= incoming.hits.length) return hit
      const saved = Math.min(hit, left)
      left -= saved
      damage -= saved
      return hit - saved
    })
    if (itemCap) protection += before - damage
    return damage < before
  }
  if (battle.wedgeArmed) loot = spendItem(loot, 'wedge')
  const hammer = loot.armed?.includes('hammer') && base.intent.chargeThreshold !== undefined
  const eraseCritical = Boolean(hammer && totals.attack - base.escortDealt >= base.intent.chargeThreshold! + 3)
  if (hammer) loot = spendArtifact(loot, 'hammer')
  const shortfall = incoming.totalDamage - totals.guard
  if (shield(BUCKLE_REDUCTION, ready('buckle') && shortfall >= 1 && shortfall <= BUCKLE_MAX_SHORTFALL)) loot = spendItem(loot, 'buckle')
  if (shield(2, ready('tongs') && mechanic?.kind === 'seal' && guard.filter(Boolean).length >= 2)) loot = spendItem(loot, 'tongs')
  if (shield(2, ready('mantle') && incoming.hits.length > 1 && attack.length === 1 && guard.length >= 2)) loot = spendItem(loot, 'mantle')
  if (shield(2, Boolean(loot.prepared.lining))) loot = spendPrep(loot, 'lining')
  if (shield(Math.min(4, ...eligibleAttack), Boolean(loot.armed?.includes('banner') && eligibleAttack.length), false)) loot = spendArtifact(loot, 'banner')

  let theftThreshold: number | undefined
  const addDamage = (amount: number) => {
    if (!amount || inflicted.dealt >= battle.enemyHp) return false
    inflicted = splitEnemyDamage(battle, amount, inflicted)
    return true
  }
  if (damage < battle.playerHp) {
    if (ready('weight') && eligibleAttack.some((face) => face % 2 === 1) && eligibleAttack.some((face) => face % 2 === 0) && addDamage(WEIGHT_BONUS)) loot = spendItem(loot, 'weight')
    if (ready('rewind') && battle.rerolled && attack.length === 1 && attack[0] >= 4 && addDamage(2)) loot = spendItem(loot, 'rewind')
    const landedAttack = totals.attack > 0 && (base.dealt > 0 || base.escortDealt > 0)
    if (loot.prepared.whetstone && landedAttack && addDamage(2)) loot = spendPrep(loot, 'whetstone')
    if (loot.shardArmed === 'smash' && addDamage(Math.min(3, firstAttack))) loot = spendShard(loot, 'smash')
    const delayed = Math.max(mirrorDamage ?? 0, overflowDamage ?? 0)
    if (landedAttack && addDamage(delayed)) {
      loot = { ...loot, triggered: [...(loot.triggered ?? []), delayed === mirrorDamage ? 'mirror' : 'overflow'] }
    }
    if (ready('hook') && base.escortDealt > 0 && inflicted.escortDealt < (battle.escort?.hp ?? 0) && attack.length === 1 && addDamage(2)) {
      loot = spendItem(loot, 'hook')
    }
    if (inflicted.dealt < battle.enemyHp && returnsAttack && shortfall < 0 && artifactReady(loot, 'overflow')) {
      loot = { ...spendArtifact(loot, 'overflow'), overflowDamage: Math.min(6, -shortfall) }
    }
    if (inflicted.dealt < battle.enemyHp && mechanic?.kind === 'steal' && !battle.stolenDie && ready('knot')) {
      theftThreshold = Math.max(1, mechanic.value - 2)
      loot = spendItem(loot, 'knot')
    }
  }
  if (base.counter && inflicted.dealt < battle.enemyHp) {
    const companionIndex = dice.length - 1
    loot = { ...loot, counterFlags: {
      coin: ready('coin') && guard.length === 3 && guard.every(Boolean) && new Set(guard).size === 3,
      assist: Boolean(battle.fourthDieUnlocked && firstAttack && loot.shardArmed === 'assist'),
      horn: Boolean(battle.fourthDieUnlocked && slots[companionIndex] === 'attack' && dieFaceForSlot(dice[companionIndex], 'attack', mechanic)),
    } }
  }
  return { ...base, ...inflicted, hits, damage, loot, theftThreshold, eraseCritical }
}

export function availableCounterChoices(battle: YachtBattle, result = battle.loot?.counter): readonly CounterChoice[] {
  const { loot } = battle
  if (!loot || !result) return ['now']
  const choices: CounterChoice[] = ['now']
  if (battle.itemsSeven) {
    if (battle.bossRelic?.id === 'brake-crown' && !battle.crownUsed) return choices
    if (!loot.counterRecast && consumableReady(loot, 'coin')) choices.push('coin')
    const damage = counterDamage(battle, result.damage)
    if (artifactReady(loot, 'mirror') && damage < battle.enemyHp + (battle.escort?.hp ?? 0) && mirrorCounterDamage(battle, damage) > damage) choices.push('mirror')
    if (artifactReady(loot, 'horn') && battle.fourthDieUnlocked && !result.joint && result.damage < hornCounterDamage(battle)) choices.push('horn')
    if (artifactReady(loot, 'adjacent-needle')) choices.push('adjacent')
    if (battle.perk?.kind === 'counter-recover' && battle.extraRerollSpent) choices.push('recover-reroll')
    return choices
  }
  const followups = Number(Boolean(loot.counterFlags?.coin)) + Number(Boolean(loot.counterFlags?.assist))
  const remainingHp = battle.enemyHp + (battle.escort?.hp ?? 0)
  if (artifactReady(loot, 'mirror') && result.damage + 2 * followups < remainingHp && Math.min(12, result.damage * 2) > result.damage) choices.push('mirror')
  if (artifactReady(loot, 'horn') && loot.counterFlags?.horn && !result.joint && result.damage < 8) choices.push('horn')
  return choices
}

export function counterDamage(battle: YachtBattle, damage: number) {
  return battle.itemsSeven && battle.bossRelic?.id === 'emperor-shield' ? Math.floor(damage * SEVEN_EMPEROR_COUNTER_RATIO) : damage
}

export function mirrorCounterDamage(battle: YachtBattle, damage: number) {
  return battle.itemsSeven ? Math.min(SEVEN_ITEM_VALUES.mirrorCap, damage * SEVEN_ITEM_VALUES.mirrorMultiplier) : Math.min(12, damage * 2)
}

export function hornCounterDamage(battle: YachtBattle) {
  return battle.itemsSeven ? SEVEN_ITEM_VALUES.hornDamage : 8
}

export function settleTreasureCounter(battle: YachtBattle, result: CounterResult, choice: CounterChoice) {
  const { counter: _counter, counterFlags, ...state } = battle.loot!
  let loot: TreasureState = state
  let counter = result
  if (choice === 'mirror') {
    loot = { ...spendArtifact(loot, 'mirror'), mirrorDamage: mirrorCounterDamage(battle, result.damage) }
    counter = { ...result, damage: 0, joint: false }
  } else if (choice === 'horn') {
    loot = spendArtifact(loot, 'horn')
    counter = { ...result, damage: 8, joint: true }
  }
  const remainingHp = battle.enemyHp + (battle.escort?.hp ?? 0)
  let damage = counter.damage
  if (counterFlags?.coin && damage < remainingHp) {
    damage += 2
    loot = spendItem(loot, 'coin')
  }
  if (counterFlags?.assist && damage < remainingHp) {
    damage += 2
    loot = spendShard(loot, 'assist')
  }
  return { loot, counter, damage }
}
