import {
  allocationPower, allocationTotals, applyCounterResult, attackFor, COUNTER_REWARDS, DIE_COUNT, dieFaceForSlot, draw, enemyIntentAt, forecast, openTurn, PLAYER_HP,
  rerollChannels, roll, spinCounter,
  startBattle,
} from './combat.ts'
import type { Battle, Enemy, EnemyMechanic, Slot } from './combat.ts'
import { collectorBonus, START_PERKS } from './perks.ts'
import type { CollectedHand, PerkState } from './perks.ts'
import { BUCKLE_MAX_SHORTFALL, BUCKLE_REDUCTION, relicReady, WEDGE_BONUS, WEIGHT_BONUS } from './rewards.ts'
import type { CombatRewards, Relic } from './rewards.ts'
import { itemUses } from './treasure.ts'
import type { CounterChoice, TreasureState } from './treasure.ts'
import { availableCounterChoices, companionFace, expireBattleTreasure, forecastTreasure, openTreasureTurn, settleTreasureCounter, useTuningShard } from './treasure-combat.ts'

export type Hand = 'triple' | 'straight'

export interface UsedHand {
  readonly hand: Hand
  readonly slot: Slot
}

export interface UnlockHint {
  readonly progress: 0 | 2 | 3
  readonly blocked?: 'guard' | 'seal'
}

export interface YachtBattle extends Battle {
  readonly extraRerollAvailable: boolean
  readonly extraRerollSpent?: true
  readonly perk?: PerkState
  readonly paidRerollSpent?: true
  readonly fourthDieUnlocked?: true
  readonly rewards?: CombatRewards
  readonly wedgeArmed?: true
  readonly loot?: TreasureState
}

const FOURTH_DIE_CHANNEL = 8
const basicRerollChannels = [...rerollChannels, 9]
const EXTRA_REROLL_CHANNEL = 10
const paidRerollChannels = [11, 12, 13, 14]
const combatSlots = ['attack', 'guard', 'escort'] as const
const dieFaces = [1, 2, 3, 4, 5, 6] as const

export function classifyHand(faces: readonly number[]): Hand | null {
  if (faces.some((face) => !Number.isInteger(face) || face < 1 || face > 6)) return null
  return includedHand(faces)
}

function includedHand(faces: readonly number[], count = matchingCount(faces)): Hand | null {
  if (faces.length < DIE_COUNT) return null
  if (count >= DIE_COUNT) return 'triple'
  if (faces.some((face) => face >= 1 && face <= 4 && faces.includes(face + 1) && faces.includes(face + 2))) return 'straight'
  return null
}

function addFourthDie(battle: YachtBattle): YachtBattle {
  const face = companionFace(battle, roll(battle.seed, battle.turn, FOURTH_DIE_CHANNEL))
  const fixed = battle.fixedDie
  return {
    ...battle,
    dice: [...battle.dice, face],
    slots: [...battle.slots, null],
    ...(fixed?.kind === 'lock' && face < battle.dice[fixed.index] && {
      fixedDie: { kind: 'lock', index: battle.dice.length },
    }),
  }
}

function openYachtDice(battle: YachtBattle): YachtBattle {
  const { nextInterference: kind, fixedDie: _fixedDie, stolenDie, paidRerollSpent: _paidRerollSpent, ...rest } = battle
  const stillStolen = enemyIntentAt(battle).chargeThreshold === undefined ? stolenDie : undefined
  const dice = [...battle.dice]
  if (stillStolen) dice.splice(DIE_COUNT - 1, 1)
  const index = kind === 'lock' ? dice.indexOf(Math.min(...dice)) : 1
  if (kind === 'freeze') dice[index] = 1
  const next = {
    ...rest,
    dice,
    slots: battle.slots.slice(0, dice.length),
    ...(stillStolen && { stolenDie: stillStolen }),
    ...(kind && { fixedDie: { index, kind } }),
  }
  return openTreasureTurn(next.fourthDieUnlocked ? addFourthDie(next) : next)
}

export function startYachtBattle(
  seed: number, playerHp: number, fourthDie: boolean, extraReroll: boolean, perk?: PerkState,
  enemy?: Enemy, enemyAttackBuff = 0, loot?: TreasureState,
): YachtBattle {
  const battle: YachtBattle = {
    ...startBattle(seed, enemy?.intents),
    playerHp,
    ...(enemy && { enemyHp: enemy.hp, enemyAttackGrowth: enemy.attackGrowth }),
    enemyAttackBuff,
    extraRerollAvailable: extraReroll,
    ...(perk && { perk }),
    ...(fourthDie && { fourthDieUnlocked: true }),
    ...(loot && { loot }),
  }
  return openYachtDice(battle)
}

export function activateYachtHand(battle: YachtBattle, hand: Hand): YachtBattle {
  if (battle.phase === 'won' || battle.phase === 'lost') return battle
  if (hand === 'straight') return { ...battle, extraRerollAvailable: true }
  const unlocked = { ...battle, fourthDieUnlocked: true } as const
  return battle.phase === 'assign' ? addFourthDie(unlocked) : unlocked
}

export function canReroll(battle: YachtBattle, index: number): boolean {
  return battle.phase === 'assign' && Number.isInteger(index) && index >= 0 && index < battle.dice.length &&
    battle.fixedDie?.index !== index && !battle.loot?.sealDraft && !battle.loot?.hourglass
}

export function rerollYachtDice(battle: YachtBattle, indices: readonly number[]): YachtBattle {
  const cost = yachtRerollCost(battle)
  if (cost === null || cost >= battle.playerHp || !indices.length || !indices.every((index) => canReroll(battle, index))) {
    return battle
  }
  const chosen = new Set(indices)
  const channels = cost > 0 ? paidRerollChannels : basicRerollChannels
  let drawIndex = 0
  const dice = battle.dice.map((face, index) => {
    if (!chosen.has(index)) return face
    const next = roll(battle.seed, battle.turn, channels[drawIndex++])
    return battle.fourthDieUnlocked && index === battle.dice.length - 1 ? companionFace(battle, next) : next
  })
  return {
    ...battle, dice, playerHp: battle.playerHp - cost, rerolled: true,
    ...(cost > 0 && { paidRerollSpent: true }),
  }
}

export function yachtRerollCost(battle: YachtBattle): number | null {
  if (battle.phase !== 'assign' || battle.loot?.sealDraft || battle.loot?.hourglass) return null
  if (!battle.rerolled) return 0
  return battle.perk?.kind === 'reroll' && !battle.paidRerollSpent ? START_PERKS.reroll.cost : null
}

export function spendExtraReroll(battle: YachtBattle, index: number): YachtBattle {
  if (!battle.extraRerollAvailable || !battle.rerolled || !canReroll(battle, index)) return battle
  const dice = [...battle.dice]
  dice[index] = roll(battle.seed, battle.turn, EXTRA_REROLL_CHANNEL)
  if (battle.fourthDieUnlocked && index === dice.length - 1) dice[index] = companionFace(battle, dice[index])
  return { ...battle, dice, extraRerollAvailable: false, extraRerollSpent: true }
}

export function tuneYachtDie(battle: YachtBattle, change: -1 | 1): YachtBattle {
  if (battle.loot) return useTuningShard(battle, change)
  const { rewards, dice, phase, fixedDie } = battle
  if (phase !== 'assign' || rewards?.tuning !== 'ready' || fixedDie?.index === 0) return battle
  const next = dice[0] + change
  const mechanic = enemyIntentAt(battle).mechanic
  if (next < 1 || next > 6 || (mechanic?.kind === 'seal' && (dice[0] === mechanic.value || next === mechanic.value))) return battle
  return { ...battle, dice: [next, ...dice.slice(1)], rewards: { ...rewards, tuning: 'spent' } }
}

export function toggleYachtWedge(battle: YachtBattle): YachtBattle {
  const ready = battle.loot ? itemUses(battle.loot, 'wedge') > 0 && !battle.loot.hourglass : relicReady(battle.rewards, 'wedge')
  if (battle.phase !== 'assign' || !ready) return battle
  const { wedgeArmed, ...rest } = battle
  return wedgeArmed ? rest : { ...rest, wedgeArmed: true }
}

function usedHand(battle: YachtBattle, dice: readonly number[], slot: Slot): UsedHand | null {
  const unchanged = dice.flatMap((face, index) => battle.slots[index] === slot && face === battle.dice[index] ? [face] : [])
  const hand = classifyYachtHand(battle, unchanged)
  return hand && { hand, slot }
}

function unsealedFaces(faces: readonly number[], mechanic?: EnemyMechanic) {
  return mechanic?.kind === 'seal' ? faces.filter((face) => face !== mechanic.value) : faces
}

export function classifyYachtHand(battle: YachtBattle, faces: readonly number[]): Hand | null {
  return classifyHand(unsealedFaces(faces, enemyIntentAt(battle).mechanic))
}

function matchingCount(faces: readonly number[]): number {
  let count = 0
  for (const [index, face] of faces.entries()) {
    if (face === 0) continue
    let matches = 1
    for (let other = index + 1; other < faces.length; other++) {
      if (faces[other] === face) matches++
    }
    count = Math.max(count, matches)
  }
  return count
}

function facesInSlot(dice: readonly number[], slots: YachtBattle['slots'], slot: Slot, mechanic?: EnemyMechanic) {
  return dice.flatMap((face, index) => slots[index] === slot ? [dieFaceForSlot(face, slot, mechanic)] : [])
}

export function yachtAllocationTotals(battle: YachtBattle, slots = battle.slots, dice = battle.dice) {
  const totals = allocationTotals(battle, slots, dice)
  const { perk } = battle
  if (perk?.kind === 'collector') {
    const mechanic = enemyIntentAt(battle).mechanic
    const bonus = collectorBonus(perk.hands)
    for (const slot of combatSlots) {
      if (matchingCount(facesInSlot(dice, slots, slot, mechanic)) >= 2) totals[slot] += bonus
    }
  } else if (perk?.kind === 'oath') {
    const mechanic = enemyIntentAt(battle).mechanic
    const parity = perk.parity === 'odd' ? 1 : 0
    for (const [index, face] of dice.entries()) {
      if (slots[index] === 'attack' && face % 2 === parity && dieFaceForSlot(face, 'attack', mechanic) > 0) {
        totals.attack += START_PERKS.oath.bonus
      }
    }
  } else if (perk?.kind === 'shield' && totals.attack > 0) {
    totals.attack += perk.bonus
  }
  const bladeMultiplier = perk?.kind === 'blade' && perk.charge >= START_PERKS.blade.threshold
    ? START_PERKS.blade.multiplier : undefined
  const powered = allocationPower(battle, totals, bladeMultiplier)
  return battle.wedgeArmed ? { ...powered, attack: powered.attack + WEDGE_BONUS } : powered
}

type YachtForecast = ReturnType<typeof forecast> & { usedRelics: Relic[]; loot?: TreasureState; theftThreshold?: number; eraseCritical?: boolean }

export function forecastYacht(battle: YachtBattle, slots = battle.slots, dice = battle.dice): YachtForecast {
  const totals = yachtAllocationTotals(battle, slots, dice)
  const base = forecast(battle, slots, dice, totals)
  if (battle.loot) return { ...forecastTreasure(battle, battle.loot, base, totals, slots, dice), usedRelics: [] }
  const usedRelics: Relic[] = battle.wedgeArmed ? ['wedge'] : []
  const { rewards } = battle
  if (!rewards?.relics.length || base.dealt === battle.enemyHp) return { ...base, usedRelics }

  let { hits, damage, dealt } = base
  if (relicReady(rewards, 'buckle')) {
    const incoming = attackFor(battle, base.intent, Boolean(battle.escort && base.escortDealt < battle.escort.hp))
    const shortfall = incoming.totalDamage - totals.guard
    if (shortfall >= 1 && shortfall <= BUCKLE_MAX_SHORTFALL) {
      let reduction = Math.min(shortfall, BUCKLE_REDUCTION)
      damage -= reduction
      hits = hits.map((hit, index) => {
        if (index >= incoming.hits.length) return hit
        const blocked = Math.min(hit, reduction)
        reduction -= blocked
        return hit - blocked
      })
      usedRelics.push('buckle')
    }
  }
  if (damage < battle.playerHp) {
    const faces = facesInSlot(dice, slots, 'attack', base.intent.mechanic)
    const addDamage = (relic: Relic, bonus: number) => {
      if (!relicReady(rewards, relic) || dealt === battle.enemyHp) return
      dealt = Math.min(battle.enemyHp, dealt + bonus)
      usedRelics.push(relic)
    }
    const mixedParity = faces.some((face) => face % 2 === 1) && faces.some((face) => face > 0 && face % 2 === 0)
    if (mixedParity) addDamage('weight', WEIGHT_BONUS)
    if (battle.rerolled && faces.length === 1 && faces[0] >= 4) addDamage('rewind', 2)
  }
  return { ...base, dealt, hits, damage, usedRelics }
}

function turnHand(battle: YachtBattle, dice: readonly number[], counter: boolean): UsedHand | null {
  const matching = usedHand(battle, dice, 'attack') ?? (counter ? usedHand(battle, dice, 'guard') : null)
  if (matching?.hand === 'triple') return matching

  // 연속 눈은 플레이어가 턴을 끝낼 때 놓아 둔 눈으로 검사한다.
  for (const slot of combatSlots) {
    if (slot === 'escort' && !battle.escort) continue
    const hand = usedHand(battle, battle.dice, slot)
    if (hand?.hand === 'straight') return hand
  }
  return null
}

function draftHand(battle: YachtBattle, dice: readonly number[], counter: boolean): UsedHand | null {
  const draft = battle.loot?.sealDraft
  const hand = battle.loot?.sealHand
  if (!draft || !hand) return null
  const slot = battle.slots[draft.index]
  if (!slot || (slot === 'escort' && !battle.escort)) return null
  if (hand === 'triple' && slot !== 'attack' && !(slot === 'guard' && counter)) return null
  if (usedHand(battle, hand === 'straight' ? battle.dice : dice, slot)?.hand !== hand) return null
  const original = [...dice]
  original[draft.index] = draft.before
  const raw = { ...battle, dice: original }
  return usedHand(raw, original, slot)?.hand !== hand ? { hand, slot } : null
}

export function canResolveYachtTurn(battle: YachtBattle): boolean {
  if (battle.phase !== 'assign' || battle.slots.length !== battle.dice.length || battle.slots.includes(null) || battle.loot?.hourglass) return false
  return !battle.loot?.sealDraft || Boolean(draftHand(battle, battle.dice, forecastYacht(battle).counter))
}

export function previewYachtHand(battle: YachtBattle): UsedHand | null {
  if (battle.phase !== 'assign') return null
  const { counter } = forecastYacht(battle)
  return battle.loot?.sealDraft ? draftHand(battle, battle.dice, counter) : turnHand(battle, battle.dice, counter)
}

export function previewUnlockProgress(battle: YachtBattle): Record<Hand, UnlockHint> {
  const hints: Record<Hand, UnlockHint> = { triple: { progress: 0 }, straight: { progress: 0 } }
  if (battle.phase !== 'assign') return hints
  const mechanic = enemyIntentAt(battle).mechanic
  for (const slot of combatSlots) {
    if (slot === 'escort' && !battle.escort) continue
    const placed = facesInSlot(battle.dice, battle.slots, slot)
    const faces = unsealedFaces(placed, mechanic)
    const complete = includedHand(faces)
    if (complete) {
      if (complete === 'straight' || slot === 'attack' || (slot === 'guard' && forecastYacht(battle).counter)) {
        hints[complete] = { progress: 3 }
      } else if (slot === 'guard') {
        hints[complete] = { progress: 0, blocked: 'guard' }
      }
      continue
    }
    const sealed = mechanic?.kind === 'seal' ? includedHand(placed) : null
    if (sealed && (slot !== 'escort' || sealed === 'straight')) hints[sealed] = { progress: 0, blocked: 'seal' }
    if (faces.length < 2) continue
    for (const face of unsealedFaces(dieFaces, mechanic)) {
      const hand = includedHand([...faces, face])
      if (hand && (slot !== 'escort' || hand === 'straight') && hints[hand].progress === 0 && !hints[hand].blocked) hints[hand] = { progress: 2 }
    }
  }
  return hints
}

export function bladeChargePreview(battle: YachtBattle, dice = battle.dice) {
  if (battle.perk?.kind !== 'blade') return null
  const { charge } = battle.perk
  const { threshold } = START_PERKS.blade
  const { attack } = allocationTotals(battle, battle.slots, dice)
  const ready = charge >= threshold
  const pipsAdded = ready ? 0 : attack
  const nextCharge = ready && attack > 0 ? 0 : charge + pipsAdded
  return { charge, ready, nextCharge, pipsAdded }
}

export function yachtCounterRewards(battle: YachtBattle) {
  const { perk } = battle
  if (perk?.kind !== 'counter') return COUNTER_REWARDS
  const { rewards } = perk
  let lowest = rewards.findIndex((reward) => !reward.joint)
  for (const [index, reward] of rewards.entries()) {
    if (!reward.joint && reward.damage < rewards[lowest].damage) lowest = index
  }
  return rewards.map((reward, index) => index === lowest
    ? { ...reward, damage: reward.damage + START_PERKS.counter.step }
    : reward)
}

function resolvePerk(battle: YachtBattle, planned: ReturnType<typeof forecastYacht>, dice: readonly number[], enemyHp: number) {
  const { perk, slots } = battle
  if (perk?.kind === 'shield' && planned.intent.hits.length > 0 && enemyHp > 0 && !(planned.intent.id === 'critical' && battle.erasedStrikeTurn === battle.turn)) {
    return { ...perk, bonus: planned.counter ? perk.bonus + START_PERKS.shield.step : 0 }
  }
  const blade = bladeChargePreview(battle, dice)
  if (blade) return { kind: 'blade' as const, charge: blade.nextCharge }
  if (perk?.kind === 'collector') {
    const hands = new Set(perk.hands)
    const mechanic = enemyIntentAt(battle).mechanic
    for (const slot of combatSlots) {
      const faces = facesInSlot(dice, slots, slot, mechanic)
      const count = matchingCount(faces)
      const hand: CollectedHand | null = count === 4 ? 'four' : includedHand(faces, count) ?? (count === 2 ? 'pair' : null)
      if (hand) hands.add(hand)
    }
    return { ...perk, hands: [...hands] }
  }
  return perk
}

function damageToStolenDie(battle: YachtBattle, dealt: number) {
  if (!battle.stolenDie || dealt >= battle.stolenDie.remaining) return undefined
  return { remaining: battle.stolenDie.remaining - dealt }
}

export function resolveYachtTurn(battle: YachtBattle): { battle: YachtBattle; hand: UsedHand | null } {
  if (!canResolveYachtTurn(battle)) {
    return { battle, hand: null }
  }

  const planned = forecastYacht(battle)
  const inCrisis = planned.damage >= battle.playerHp || battle.playerHp * 10 <= PLAYER_HP * 3
  const awakened = !battle.awakened && inCrisis && draw(battle.seed, battle.turn, 5) / 0x100000000 < 0.1
  const mechanic = enemyIntentAt(battle).mechanic
  const awakenedDice = awakened ? battle.dice.map((face, index) =>
    battle.fixedDie?.index === index || (mechanic?.kind === 'seal' && face === mechanic.value) ? face : 6,
  ) : undefined
  const dice = awakenedDice ?? battle.dice
  const result = awakenedDice ? forecastYacht(battle, battle.slots, awakenedDice) : planned
  const hand = battle.loot?.sealDraft ? draftHand(battle, battle.dice, planned.counter) : turnHand(battle, dice, result.counter)
  const playerHp = Math.max(0, battle.playerHp - result.damage)
  const enemyHp = battle.enemyHp - result.dealt
  const effect = enemyHp > 0 && playerHp > 0 ? result.intent.mechanic : undefined
  const escortHp = (battle.escort?.hp ?? 0) - result.escortDealt
  const { stolenDie: previousTheft, escort: previousEscort, weakenedStrikeTurn: _weakenedStrikeTurn, erasedStrikeTurn: _erased, wedgeArmed: _wedgeArmed, ...rest } = battle
  const stolenDie = effect?.kind === 'steal' && !previousTheft
    ? { remaining: result.theftThreshold ?? effect.value } : damageToStolenDie(battle, result.dealt)
  const escort = previousEscort && escortHp > 0 ? { ...previousEscort, hp: escortHp }
    : effect?.kind === 'escort' && !previousEscort ? { hp: effect.hp, bonus: effect.bonus } : undefined
  const perk = resolvePerk(battle, planned, dice, enemyHp)
  let loot = result.loot
  if (loot?.sealDraft) {
    const { sealDraft: _draft, ...inventory } = loot
    loot = hand ? { ...inventory, sealUsed: true, triggered: [...(inventory.triggered ?? []), 'incomplete'] } : inventory
  }
  const resolved: YachtBattle = {
    ...rest,
    dice,
    playerHp,
    enemyHp,
    ...(perk && { perk }),
    ...(loot && { loot }),
    ...(battle.rewards && result.usedRelics.length && { rewards: { ...battle.rewards, spent: [...battle.rewards.spent, ...result.usedRelics] } }),
    ...((effect?.kind === 'lock' || effect?.kind === 'freeze') && { nextInterference: effect.kind }),
    ...(stolenDie && { stolenDie }),
    ...(escort && { escort }),
    ...(result.chargeBroken && enemyHp > 0 && playerHp > 0 && { weakenedStrikeTurn: battle.turn + 1 }),
    ...(result.eraseCritical && enemyHp > 0 && playerHp > 0 && { erasedStrikeTurn: battle.turn + 1 }),
    awakened: battle.awakened || awakened,
    lastExchange: {
      turn: battle.turn,
      dealt: result.dealt,
      hitsTaken: result.hits,
      counter: null,
      awakened,
      ...(awakenedDice && { awakenedDice }),
      ...(result.escortDealt > 0 && { escortDealt: result.escortDealt }),
      ...(result.chargeBroken && { chargeBroken: true }),
    },
  }

  if (playerHp === 0) return { battle: expireBattleTreasure({ ...resolved, phase: 'lost' }), hand }
  if (enemyHp === 0) return { battle: expireBattleTreasure({ ...resolved, phase: 'won' }), hand }
  if (planned.counter) return { battle: { ...resolved, phase: 'counter' }, hand }
  const next = { ...resolved, ...openTurn(battle.seed, battle.turn + 1) }
  return { battle: openYachtDice(next), hand }
}

export function spinYachtCounter(battle: YachtBattle, choice?: CounterChoice): YachtBattle {
  if (battle.phase !== 'counter' || !battle.lastExchange) return battle
  const rewards = yachtCounterRewards(battle)
  let loot = battle.loot
  let spun: Battle
  if (loot) {
    const slot = draw(battle.seed, battle.turn, 4) % rewards.length
    const rolled = loot.counter ?? { slot, ...rewards[slot] }
    const choices = availableCounterChoices(battle, rolled)
    if (!choice && choices.length > 1) return loot.counter ? battle : { ...battle, loot: { ...loot, counter: rolled } }
    if (choice && (!loot.counter || !choices.includes(choice))) return battle
    const result = settleTreasureCounter(battle, rolled, choice ?? 'now')
    loot = result.loot
    spun = applyCounterResult(battle, { ...result.counter, damage: result.damage })
    spun = { ...spun, lastExchange: { ...spun.lastExchange!, counter: result.counter } }
  } else spun = spinCounter(battle, rewards)
  if (spun === battle) return battle
  const { stolenDie: _stolenDie, ...rest } = { ...battle, ...spun }
  const stolenDie = damageToStolenDie(battle, battle.enemyHp - spun.enemyHp)
  const perk = battle.perk
  const next = {
    ...rest,
    ...(loot && { loot }),
    ...(stolenDie && { stolenDie }),
    ...(perk?.kind === 'counter' && { perk: { ...perk, rewards, growth: perk.growth + START_PERKS.counter.step } }),
  }
  return next.turn > battle.turn ? openYachtDice(next) : expireBattleTreasure(next)
}
