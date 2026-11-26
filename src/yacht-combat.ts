import {
  allocationPower, allocationTotals, applyCounterResult, combatSlots, COUNTER_REWARDS, DIE_COUNT, dieFaceForSlot, draw,
  enemyIntentAt, escortAfterDamage, forecast, openTurn, PLAYER_HP, rerollChannels, roll, spinCounter, splitEnemyDamage,
  startBattle,
} from './combat.ts'
import type { Battle, CounterResult, Enemy, EnemyMechanic, Slot } from './combat.ts'
import type { Gimmick } from './combat.ts'
import { EMPEROR_SHIELD_CAP, HEART_REVIVAL_HP, SEVEN_HEART_REVIVAL_HP, SEVEN_SCEPTER_REROLL_COST } from './boss-relic.ts'
import type { BossRelicState } from './boss-relic.ts'
import { collectorBonus, START_PERKS } from './perks.ts'
import type { CollectedHand, PerkState } from './perks.ts'
import { BUCKLE_MAX_SHORTFALL, BUCKLE_REDUCTION, relicReady, WEDGE_BONUS, WEIGHT_BONUS } from './rewards.ts'
import type { CombatRewards, Relic } from './rewards.ts'
import { artifactReady, itemUses } from './treasure.ts'
import type { CounterChoice, TreasureState } from './treasure.ts'
import { availableCounterChoices, companionFace, counterDamage, expireBattleTreasure, forecastTreasure, hornCounterDamage, mirrorCounterDamage, openTreasureTurn, settleTreasureCounter, useTuningShard } from './treasure-combat.ts'
import { adjustItemDie, boostSevenAllocation, forecastSevenTreasure, hasIncompletePair, spendConsumable, spendSevenArtifact, startReserveRoll } from './item-effects.ts'
import { SEVEN_ITEM_VALUES } from './item-values.ts'
import { bloodDieFor, bloodHealing, canPlaceMetaDie, linkedFaces, metaAllocationSlots } from './meta-combat.ts'
import type { MetaTurn } from './meta-combat.ts'
import { canSelectItemDie } from './item-effects.ts'

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
  readonly rulesSix?: true
  readonly itemsSeven?: true
  readonly bossRelic?: BossRelicState
  readonly crownUsed?: true
  readonly metaTurn?: MetaTurn
}

const FOURTH_DIE_CHANNEL = 8
const basicRerollChannels = [...rerollChannels, 9]
const EXTRA_REROLL_CHANNEL = 10
const paidRerollChannels = [11, 12, 13, 14]
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
  const { nextInterference: kind, fixedDie: _fixedDie, stolenDie, paidRerollSpent: _paidRerollSpent, metaTurn: _metaTurn, ...rest } = battle
  const stillStolen = enemyIntentAt(battle).chargeThreshold === undefined ? stolenDie : undefined
  const dice = [...battle.dice]
  const { latched } = battle.loot ?? {}
  if (latched) dice[latched.index] = latched.face
  if (stillStolen) dice.splice(DIE_COUNT - 1, 1)
  const index = kind === 'lock' ? dice.indexOf(Math.min(...dice)) : 1
  if (kind === 'freeze') dice[index] = 1
  const next = {
    ...rest,
    dice,
    slots: battle.slots.slice(0, dice.length),
    ...(latched && { loot: { ...battle.loot!, latched: undefined } }),
    ...(stillStolen && { stolenDie: stillStolen }),
    ...(kind && { fixedDie: { index, kind } }),
  }
  return openTreasureTurn(next.fourthDieUnlocked ? addFourthDie(next) : next)
}

export function startYachtBattle(
  seed: number, playerHp: number, fourthDie: boolean, extraReroll: boolean, perk?: PerkState,
  enemy?: Enemy, enemyAttackBuff = 0, loot?: TreasureState, rulesSix?: true, bossRelic?: BossRelicState, itemsSeven?: true,
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
    ...(rulesSix && { rulesSix }),
    ...(itemsSeven && { itemsSeven }),
    ...(bossRelic && { bossRelic }),
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
    battle.fixedDie?.index !== index && !battle.loot?.sealDraft && !battle.loot?.hourglass && !battle.loot?.reserveRoll
}

export function rerollYachtDice(battle: YachtBattle, indices: readonly number[], linked = false): YachtBattle {
  const reroll = nextYachtReroll(battle)
  if (!reroll || reroll.cost >= battle.playerHp || !indices.length || !indices.every((index) => canReroll(battle, index))) {
    return battle
  }
  const basic = reroll.kind === 'basic'
  const chosen = new Set(indices)
  if (linked && (!basic || chosen.size !== 2 || !battle.loot || !artifactReady(battle.loot, 'linked-cup') ||
    !indices.every((index) => canSelectItemDie(battle, index)))) return battle
  const charge = basic && chosen.size === 1 && battle.perk?.kind === 'charge-roll'
  const chargeDie = charge ? indices[0] : undefined
  const pair = linked ? linkedFaces(battle) : undefined
  const channels = basic ? basicRerollChannels : paidRerollChannels
  let drawIndex = 0
  const dice = battle.dice.map((face, index) => {
    if (!chosen.has(index)) return face
    const channel = channels[drawIndex]
    if (charge) {
      const value = draw(battle.seed, battle.turn, channel)
      const parity = index === battle.dice.length - 1 && battle.fourthDieUnlocked && battle.loot?.equipped.includes('heart-die')
        ? battle.loot.heartParity : undefined
      return parity === 'odd' ? 5 : parity === 'even' ? 4 + 2 * (value % 2) : 4 + value % 3
    }
    const next = pair ? pair[drawIndex++] : roll(battle.seed, battle.turn, channels[drawIndex++])
    return battle.fourthDieUnlocked && index === battle.dice.length - 1 ? companionFace(battle, next) : next
  })
  const rolled: YachtBattle = {
    ...battle, dice, playerHp: battle.playerHp - reroll.cost, rerolled: true,
    ...(!basic && { paidRerollSpent: true }),
    ...(chargeDie !== undefined && { metaTurn: { ...battle.metaTurn, chargeDie },
      slots: battle.slots.map((slot, index) => index === chargeDie ? 'attack' as const : slot) }),
  }
  const resolved = battle.itemsSeven && basic ? startReserveRoll(battle, rolled, chosen) : rolled
  return linked ? { ...resolved, loot: spendSevenArtifact(resolved.loot!, 'linked-cup') } : resolved
}

export function nextYachtReroll(battle: YachtBattle): { kind: 'basic' | 'perk'; cost: number } | null {
  if (battle.phase !== 'assign' || battle.loot?.sealDraft || battle.loot?.hourglass || battle.loot?.reserveRoll) return null
  if (!battle.rerolled) return { kind: 'basic', cost: basicRerollCost(battle) }
  return battle.perk?.kind === 'reroll' && !battle.paidRerollSpent ? { kind: 'perk', cost: START_PERKS.reroll.cost } : null
}

export function yachtRerollCost(battle: YachtBattle) {
  return nextYachtReroll(battle)?.cost ?? null
}

function basicRerollCost(battle: YachtBattle) {
  return battle.itemsSeven && battle.bossRelic?.id === 'healing-scepter' && battle.turn === 1 ? SEVEN_SCEPTER_REROLL_COST : 0
}

export function canUseExtraReroll(battle: YachtBattle) {
  return battle.extraRerollAvailable && (battle.rerolled || battle.perk?.kind === 'early-reroll' || basicRerollCost(battle) >= battle.playerHp)
}

export function spendExtraReroll(battle: YachtBattle, index: number): YachtBattle {
  if (!canUseExtraReroll(battle) || !canReroll(battle, index)) return battle
  const dice = [...battle.dice]
  dice[index] = roll(battle.seed, battle.turn, EXTRA_REROLL_CHANNEL)
  if (battle.fourthDieUnlocked && index === dice.length - 1) dice[index] = companionFace(battle, dice[index])
  return { ...battle, dice, extraRerollAvailable: false, extraRerollSpent: true }
}

export function tuneYachtDie(battle: YachtBattle, change: -1 | 1): YachtBattle {
  if (battle.itemsSeven) return adjustItemDie(battle, 0, 'tuning', change)
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

function plannedAllocation(battle: YachtBattle, slots = battle.slots, dice = battle.dice, gimmick?: ReturnType<typeof yachtGimmick>) {
  slots = metaAllocationSlots(battle, slots)
  const totals = allocationTotals(battle, slots, dice)
  const reverse = battle.metaTurn?.reverseDie
  if (battle.perk?.kind === 'reverse-guard' && reverse !== undefined && slots[reverse] === 'guard') totals.guard += 7 - 2 * dice[reverse]
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
  if (battle.itemsSeven) {
    const boost = boostSevenAllocation(battle, totals, slots, dice)
    const powered = allocationPower(battle, boost.totals, boost.item === 'clash-seal' ? 2 : bladeMultiplier)
    if (boost.item === 'wedge') powered.attack += WEDGE_BONUS
    const scabbard = powered.attack > 0 ? battle.loot?.scabbard ?? 0 : 0
    powered.attack += scabbard
    if (battle.loot?.consumableArmed === 'spacer') {
      const active = gimmick === undefined ? yachtGimmick(battle, slots, dice) : gimmick
      const board = active?.kind === 'retreat' && active.ready ? { ...battle, escort: undefined } : battle
      const { dealt, incoming } = forecast(board, slots, dice, powered, active?.kind === 'reflect' && active.ready ? 'reflect' : undefined)
      if (dealt < battle.enemyHp && incoming.totalDamage > 0 && powered.guard === incoming.totalDamage + 1) {
        return { ...boost, totals: { ...powered, guard: powered.guard - 1 }, scabbard, item: 'spacer' as const }
      }
    }
    return { ...boost, totals: powered, scabbard }
  }
  const powered = allocationPower(battle, totals, bladeMultiplier)
  return { totals: battle.wedgeArmed ? { ...powered, attack: powered.attack + WEDGE_BONUS } : powered }
}

export function yachtAllocationTotals(battle: YachtBattle, slots = battle.slots, dice = battle.dice) {
  return plannedAllocation(battle, slots, dice).totals
}

type YachtForecast = ReturnType<typeof forecast> & { usedRelics: Relic[]; loot?: TreasureState; theftThreshold?: number; eraseCritical?: boolean }

export const GIMMICK_REQUIREMENTS = {
  trip: { slot: 'attack', face: 1, name: '발목 걸기' },
  armor: { slot: 'attack', face: null, name: '갑옷 벗기기' },
  reflect: { slot: 'guard', face: 5, name: '되돌아온 철추' },
  topple: { slot: 'attack', face: 3, name: '넘어뜨리기' },
  retreat: { slot: 'attack', face: 2, name: '호위 퇴각' },
} as const satisfies Record<Gimmick, { slot: Slot; face: number | null; name: string }>

export function yachtGimmick(battle: YachtBattle, slots = battle.slots, dice = battle.dice) {
  slots = metaAllocationSlots(battle, slots)
  const intent = enemyIntentAt(battle)
  const kind = intent.gimmick ?? (battle.rulesSix && battle.escort && intent.id !== 'knockdown' ? 'retreat' : undefined)
  if (!kind || (kind === 'armor' && battle.armorBroken)) return null
  const requirement = GIMMICK_REQUIREMENTS[kind]
  const faces = facesInSlot(dice, slots, requirement.slot)
  const ready = requirement.face === null ? new Set(faces).size < faces.length : faces.includes(requirement.face)
  return { kind, ...requirement, ready }
}

export function emperorShieldActive(battle: YachtBattle) {
  return battle.bossRelic?.id === 'emperor-shield' && battle.turn === 1
}

export function forecastYacht(battle: YachtBattle, slots = battle.slots, dice = battle.dice,
  gimmick: ReturnType<typeof yachtGimmick> = yachtGimmick(battle, slots, dice)): YachtForecast {
  slots = metaAllocationSlots(battle, slots)
  if (gimmick?.ready && gimmick.kind === 'retreat') battle = { ...battle, escort: undefined }
  const allocation = plannedAllocation(battle, slots, dice, gimmick)
  const { totals } = allocation
  const emperor = emperorShieldActive(battle)
  const suppress = gimmick?.ready && gimmick.kind === 'reflect' ? 'reflect' : emperor && !battle.itemsSeven ? EMPEROR_SHIELD_CAP : undefined
  const base = forecast(battle, slots, dice, totals, suppress)
  if (battle.itemsSeven && battle.loot) return { ...forecastSevenTreasure(battle, base, allocation, emperor), usedRelics: [] }
  if (battle.loot) return { ...forecastTreasure(battle, battle.loot, base, totals, slots, dice), usedRelics: [] }
  const usedRelics: Relic[] = battle.wedgeArmed ? ['wedge'] : []
  const { rewards } = battle
  if (!rewards?.relics.length || base.dealt === battle.enemyHp) return { ...base, usedRelics }

  let { hits, damage } = base
  let inflicted = { dealt: base.dealt, escortDealt: base.escortDealt }
  if (relicReady(rewards, 'buckle')) {
    const { incoming } = base
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
      if (!relicReady(rewards, relic) || inflicted.dealt === battle.enemyHp) return
      inflicted = splitEnemyDamage(battle, bonus, inflicted)
      usedRelics.push(relic)
    }
    const mixedParity = faces.some((face) => face % 2 === 1) && faces.some((face) => face > 0 && face % 2 === 0)
    if (mixedParity) addDamage('weight', WEIGHT_BONUS)
    if (battle.rerolled && faces.length === 1 && faces[0] >= 4) addDamage('rewind', 2)
  }
  return { ...base, ...inflicted, hits, damage, usedRelics }
}

function turnHand(battle: YachtBattle, dice: readonly number[], counter: boolean): UsedHand | null {
  const slots = metaAllocationSlots(battle)
  if (slots !== battle.slots) battle = { ...battle, slots }
  const matching = usedHand(battle, dice, 'attack') ?? (counter ? usedHand(battle, dice, 'guard') : null)
  if (matching?.hand === 'triple') return matching

  // 연속 눈은 플레이어가 턴을 끝낼 때 놓아 둔 눈으로 검사한다.
  for (const slot of combatSlots) {
    const hand = usedHand(battle, battle.dice, slot)
    if (hand?.hand === 'straight') return hand
  }
  return splitStraight(battle) ? { hand: 'straight', slot: 'attack' } : null
}

function splitStraight(battle: YachtBattle) {
  if (battle.perk?.kind !== 'join-slots' || !battle.slots.includes('attack') || !battle.slots.includes('guard')) return false
  return classifyYachtHand(battle, battle.dice.filter((_, index) => battle.slots[index] !== null)) === 'straight'
}

function draftHand(battle: YachtBattle, dice: readonly number[], counter: boolean): UsedHand | null {
  const draft = battle.loot?.sealDraft
  const hand = battle.loot?.sealHand
  if (!draft || !hand) return null
  const slot = battle.slots[draft.index]
  if (!slot) return null
  if (hand === 'triple' && slot !== 'attack' && !(slot === 'guard' && counter)) return null
  if (usedHand(battle, hand === 'straight' ? battle.dice : dice, slot)?.hand !== hand) return null
  const original = [...dice]
  original[draft.index] = draft.before
  const raw = { ...battle, dice: original }
  return usedHand(raw, original, slot)?.hand !== hand ? { hand, slot } : null
}

export function canResolveYachtTurn(battle: YachtBattle): boolean {
  if (battle.phase !== 'assign' || battle.slots.length !== battle.dice.length || battle.slots.includes(null) || battle.loot?.hourglass || battle.loot?.reserveRoll) return false
  if (battle.slots.some((slot, index) => !canPlaceMetaDie(battle, index, slot))) return false
  return !battle.loot?.sealDraft || Boolean(draftHand(battle, battle.dice, forecastYacht(battle).counter))
}

export function previewYachtHand(battle: YachtBattle): UsedHand | null {
  if (battle.phase !== 'assign') return null
  const { counter } = forecastYacht(battle)
  return battle.loot?.sealDraft ? draftHand(battle, battle.dice, counter)
    : turnHand(battle, battle.dice, counter) ?? (hasIncompletePair({ ...battle, slots: metaAllocationSlots(battle) }) ? { hand: 'triple', slot: 'attack' } : null)
}

export function previewUnlockProgress(battle: YachtBattle): Record<Hand, UnlockHint> {
  const hints: Record<Hand, UnlockHint> = { triple: { progress: 0 }, straight: { progress: 0 } }
  if (battle.phase !== 'assign') return hints
  battle = { ...battle, slots: metaAllocationSlots(battle) }
  const mechanic = enemyIntentAt(battle).mechanic
  for (const slot of combatSlots) {
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
    if (sealed) hints[sealed] = { progress: 0, blocked: 'seal' }
    if (faces.length < 2) continue
    for (const face of unsealedFaces(dieFaces, mechanic)) {
      const hand = includedHand([...faces, face])
      if (hand && hints[hand].progress === 0 && !hints[hand].blocked) hints[hand] = { progress: 2 }
    }
  }
  if (splitStraight(battle)) hints.straight = { progress: 3 }
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
  if (battle.itemsSeven) return COUNTER_REWARDS.map((reward) => reward.joint ? reward : { ...reward, damage: reward.damage + perk.growth })
  const { rewards } = perk
  let lowest = rewards.findIndex((reward) => !reward.joint)
  for (const [index, reward] of rewards.entries()) {
    if (!reward.joint && reward.damage < rewards[lowest].damage) lowest = index
  }
  return rewards.map((reward, index) => index === lowest
    ? { ...reward, damage: reward.damage + START_PERKS.counter.step }
    : reward)
}

export function displayedCounterRewards(battle: YachtBattle) {
  const rewards = yachtCounterRewards(battle)
  if (battle.itemsSeven && battle.bossRelic?.id === 'brake-crown' && !battle.crownUsed) {
    return rewards.map(() => ({ damage: 0, joint: false }))
  }
  return rewards.map((reward) => ({ ...reward, damage: counterDamage(battle, reward.damage) }))
}

export function yachtCounterSlot(battle: YachtBattle, replay = false) {
  return draw(battle.seed, battle.turn, replay ? 104 : 4) % COUNTER_REWARDS.length
}

function resolvePerk(battle: YachtBattle, planned: ReturnType<typeof forecastYacht>, dice: readonly number[], enemyHp: number) {
  const { perk, slots } = battle
  if (perk?.kind === 'reverse-guard' && battle.metaTurn?.reverseDie !== undefined && slots[battle.metaTurn.reverseDie] === 'guard') {
    return { ...perk, spent: true as const }
  }
  if (perk?.kind === 'shield' && battle.itemsSeven) {
    const attacked = allocationTotals(battle, slots, dice).attack > 0
    return { ...perk, bonus: planned.counter && enemyHp > 0 ? SEVEN_ITEM_VALUES.shieldStock : attacked ? 0 : perk.bonus }
  }
  if (perk?.kind === 'shield' && planned.incoming.totalDamage > 0 && enemyHp > 0) {
    return { ...perk, bonus: planned.counter ? perk.bonus + START_PERKS.shield.step : 0 }
  }
  const blade = bladeChargePreview(battle, dice)
  if (blade) return { kind: 'blade' as const, charge: blade.nextCharge }
  if (perk?.kind === 'collector' && !battle.itemsSeven) {
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
  const gimmick = yachtGimmick(battle)
  const activated = gimmick?.ready ? gimmick.kind : undefined
  const inCrisis = planned.damage >= battle.playerHp || battle.playerHp * 10 <= PLAYER_HP * 3
  const awakened = !battle.awakened && inCrisis && draw(battle.seed, battle.turn, 5) / 0x100000000 < 0.1
  const mechanic = enemyIntentAt(battle).mechanic
  const sacrificed = bloodDieFor(battle)
  const awakenedDice = awakened ? battle.dice.map((face, index) =>
    index === sacrificed || battle.fixedDie?.index === index || (mechanic?.kind === 'seal' && face === mechanic.value) ? face : 6,
  ) : undefined
  const dice = awakenedDice ?? battle.dice
  const result = awakenedDice ? forecastYacht(battle, battle.slots, awakenedDice, gimmick) : planned
  const naturalHand = battle.loot?.sealDraft ? draftHand(battle, battle.dice, planned.counter) : turnHand(battle, dice, result.counter)
  const useIncomplete = !naturalHand && hasIncompletePair({ ...battle, slots: metaAllocationSlots(battle) }, dice)
  const hand = naturalHand ?? (useIncomplete ? { hand: 'triple', slot: 'attack' } as const : null)
  const heartRevived = result.damage >= battle.playerHp && battle.bossRelic?.id === 'revived-heart' && !battle.bossRelic.heartUsed
  const revivalHp = battle.itemsSeven ? SEVEN_HEART_REVIVAL_HP : HEART_REVIVAL_HP
  const remainingHp = heartRevived ? revivalHp : Math.max(0, battle.playerHp - result.damage)
  const healing = bloodHealing(battle, dice)
  const playerHp = remainingHp > 0 && healing > 0 ? Math.min(PLAYER_HP, remainingHp + healing) : remainingHp
  const enemyHp = battle.enemyHp - result.dealt
  const effect = enemyHp > 0 && playerHp > 0 ? result.intent.mechanic : undefined
  const { stolenDie: previousTheft, escort: previousEscort, weakenedStrikeTurn: _weakenedStrikeTurn,
    erasedStrikeTurn: _erased, wedgeArmed: _wedgeArmed, interrupted: interruptedBefore, metaTurn: _metaTurn, ...rest } = battle
  const stolenDie = effect?.kind === 'steal' && !previousTheft
    ? { remaining: result.theftThreshold ?? effect.value } : damageToStolenDie(battle, result.dealt)
  const escort = previousEscort ? activated === 'retreat' ? undefined : escortAfterDamage(previousEscort, result.escortDealt)
    : effect?.kind === 'escort' ? { hp: effect.hp, bonus: effect.bonus } : undefined
  const perk = resolvePerk(battle, planned, dice, enemyHp)
  let loot = result.loot
  if (battle.itemsSeven && loot) {
    if (sacrificed !== undefined) loot = spendSevenArtifact(loot, 'blood-grip')
    loot = {
      ...loot, consumableArmed: undefined, latchDraft: undefined,
      ...(useIncomplete && { sealUsed: true as const, triggered: [...(loot.triggered ?? []), 'incomplete' as const] }),
    }
  }
  if (loot?.sealDraft) {
    const { sealDraft: _draft, ...inventory } = loot
    loot = hand ? { ...inventory, sealUsed: true, triggered: [...(inventory.triggered ?? []), 'incomplete'] } : inventory
  }
  const resolved: YachtBattle = {
    ...rest,
    dice,
    playerHp,
    enemyHp,
    ...(heartRevived && { bossRelic: { id: 'revived-heart', heartUsed: true } }),
    ...(activated === 'armor' && enemyHp > 0 && { armorBroken: true }),
    ...(interruptedBefore && activated === undefined && interruptedBefore.kind === 'trip' &&
      enemyIntentAt({ ...battle, interrupted: undefined }).hits.length === 0 &&
      { interrupted: { ...interruptedBefore, turn: battle.turn + 1 } }),
    ...((activated === 'trip' || activated === 'topple') && enemyHp > 0 &&
      { interrupted: { kind: activated, turn: battle.turn + 1 } }),
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
      ...(activated && { gimmick: activated }),
      ...(heartRevived && { heartRevived: true }),
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
    const slot = yachtCounterSlot(battle)
    const rolled = loot.counter ?? { slot, ...rewards[slot] }
    const choices = availableCounterChoices(battle, rolled)
    if (!choice && choices.length > 1) return loot.counter ? battle : { ...battle, loot: { ...loot, counter: rolled } }
    if (choice && (!loot.counter || !choices.includes(choice))) return battle
    if (choice === 'coin') {
      const second = yachtCounterSlot(battle, true)
      return { ...battle, loot: { ...spendConsumable(loot, 'coin'), counter: { slot: second, ...rewards[second] }, counterRecast: true } }
    }
    const result = battle.itemsSeven ? settleSevenCounter(battle, loot, rolled, choice) : settleTreasureCounter(battle, rolled, choice ?? 'now')
    loot = result.loot
    spun = applyCounterResult(battle, { ...result.counter, damage: result.damage })
    spun = { ...spun, lastExchange: { ...spun.lastExchange!, counter: result.counter } }
  } else spun = spinCounter(battle, rewards)
  if (spun === battle) return battle
  const { escort: _escort, ...beforeSpin } = battle
  const { stolenDie: _stolenDie, ...rest } = { ...beforeSpin, ...spun }
  const stolenDie = damageToStolenDie(battle, battle.enemyHp - spun.enemyHp)
  const perk = battle.perk
  const crownTriggered = battle.bossRelic?.id === 'brake-crown' && !battle.crownUsed && spun.turn > battle.turn
  const next = {
    ...rest,
    ...(loot && { loot }),
    ...(choice === 'recover-reroll' && { extraRerollAvailable: true, extraRerollSpent: undefined }),
    ...(stolenDie && { stolenDie }),
    ...(crownTriggered && {
      crownUsed: true as const,
      interrupted: { turn: spun.turn, kind: 'topple' as const },
      lastExchange: { ...spun.lastExchange!, crownTriggered: true as const },
    }),
    ...(perk?.kind === 'counter' && { perk: battle.itemsSeven ? { ...perk, growth: Math.min(SEVEN_ITEM_VALUES.counterLimit, perk.growth + SEVEN_ITEM_VALUES.counterStep) }
      : { ...perk, rewards, growth: perk.growth + START_PERKS.counter.step } }),
  }
  return next.turn > battle.turn ? openYachtDice(next) : expireBattleTreasure(next)
}

function settleSevenCounter(battle: YachtBattle, state: TreasureState, rolled: CounterResult, choice?: Exclude<CounterChoice, 'coin'>) {
  const { counter: _pending, counterRecast: _recast, ...inventory } = state
  let loot: TreasureState = inventory
  if (choice === 'adjacent') {
    const slot = (rolled.slot + 1) % COUNTER_REWARDS.length
    rolled = { slot, ...yachtCounterRewards(battle)[slot] }
    loot = spendSevenArtifact(loot, 'adjacent-needle')
  }
  const crown = battle.bossRelic?.id === 'brake-crown' && !battle.crownUsed
  const forfeit = crown || choice === 'recover-reroll'
  let counter = { ...rolled, damage: forfeit ? 0 : counterDamage(battle, choice === 'horn' ? hornCounterDamage(battle) : rolled.damage),
    joint: !forfeit && (choice === 'horn' || rolled.joint) }
  if (choice === 'mirror') {
    loot = { ...spendSevenArtifact(loot, 'mirror'), mirrorDamage: mirrorCounterDamage(battle, counter.damage) }
    counter = { ...counter, damage: 0, joint: false }
  } else if (choice === 'horn') loot = spendSevenArtifact(loot, 'horn')
  return { loot, counter, damage: counter.damage }
}
