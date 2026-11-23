import {
  allocationPower, allocationTotals, attackFor, COUNTER_REWARDS, DIE_COUNT, dieFaceForSlot, draw, enemyIntentAt, forecast, openTurn, PLAYER_HP,
  rerollChannels, roll, spinCounter,
  startBattle,
} from './combat.ts'
import type { Battle, Enemy, EnemyMechanic, Slot } from './combat.ts'
import { collectorBonus, START_PERKS } from './perks.ts'
import type { CollectedHand, PerkState } from './perks.ts'
import type { CombatRewards, Relic } from './rewards.ts'

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
  const face = roll(battle.seed, battle.turn, FOURTH_DIE_CHANNEL)
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
  return next.fourthDieUnlocked ? addFourthDie(next) : next
}

export function startYachtBattle(
  seed: number, playerHp: number, fourthDie: boolean, extraReroll: boolean, perk?: PerkState,
  enemy?: Enemy, enemyAttackBuff = 0,
): YachtBattle {
  const battle: YachtBattle = {
    ...startBattle(seed, enemy?.intents),
    playerHp,
    ...(enemy && { enemyHp: enemy.hp, enemyAttackGrowth: enemy.attackGrowth }),
    enemyAttackBuff,
    extraRerollAvailable: extraReroll,
    ...(perk && { perk }),
    ...(fourthDie && { fourthDieUnlocked: true }),
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
    battle.fixedDie?.index !== index
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
    return roll(battle.seed, battle.turn, channels[drawIndex++])
  })
  return {
    ...battle, dice, playerHp: battle.playerHp - cost, rerolled: true,
    ...(cost > 0 && { paidRerollSpent: true }),
  }
}

export function yachtRerollCost(battle: YachtBattle): number | null {
  if (battle.phase !== 'assign') return null
  if (!battle.rerolled) return 0
  return battle.perk?.kind === 'reroll' && !battle.paidRerollSpent ? START_PERKS.reroll.cost : null
}

export function spendExtraReroll(battle: YachtBattle, index: number): YachtBattle {
  if (!battle.extraRerollAvailable || !battle.rerolled || !canReroll(battle, index)) return battle
  const dice = [...battle.dice]
  dice[index] = roll(battle.seed, battle.turn, EXTRA_REROLL_CHANNEL)
  return { ...battle, dice, extraRerollAvailable: false, extraRerollSpent: true }
}

export function tuneYachtDie(battle: YachtBattle, change: -1 | 1): YachtBattle {
  const { rewards, dice, phase, fixedDie } = battle
  if (phase !== 'assign' || rewards?.tuning !== 'ready' || fixedDie?.index === 0) return battle
  const next = dice[0] + change
  const mechanic = enemyIntentAt(battle).mechanic
  if (next < 1 || next > 6 || (mechanic?.kind === 'seal' && (dice[0] === mechanic.value || next === mechanic.value))) return battle
  return { ...battle, dice: [next, ...dice.slice(1)], rewards: { ...rewards, tuning: 'spent' } }
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
  } else if (perk?.kind === 'blade' && perk.charge >= START_PERKS.blade.threshold) {
    return allocationPower(battle, totals, START_PERKS.blade.multiplier)
  }
  return allocationPower(battle, totals)
}

export function forecastYacht(battle: YachtBattle, slots = battle.slots, dice = battle.dice) {
  const totals = yachtAllocationTotals(battle, slots, dice)
  const base = forecast(battle, slots, dice, totals)
  const usedRelics: Relic[] = []
  const { rewards } = battle
  if (!rewards?.relics.length || base.dealt === battle.enemyHp) return { ...base, usedRelics }
  const ready = (relic: Relic) => rewards.relics.includes(relic) && !rewards.spent.includes(relic)

  let { hits, damage, dealt } = base
  if (ready('buckle') && slots.filter((slot) => slot === 'guard').length >= 2) {
    const incoming = attackFor(battle, base.intent, Boolean(battle.escort && base.escortDealt < battle.escort.hp))
    if (totals.guard === incoming.totalDamage - 1) {
      const residual = hits.findIndex((hit) => hit > 0)
      hits = hits.map((hit, index) => index === residual ? hit - 1 : hit)
      damage--
      usedRelics.push('buckle')
    }
  }
  if (damage < battle.playerHp) {
    const faces = facesInSlot(dice, slots, 'attack', base.intent.mechanic)
    const addDamage = (relic: Relic, bonus: number) => {
      if (!ready(relic) || dealt === battle.enemyHp) return
      dealt = Math.min(battle.enemyHp, dealt + bonus)
      usedRelics.push(relic)
    }
    if (faces.length === 2 && faces.every((face) => face > 0) && faces[0] % 2 !== faces[1] % 2) addDamage('weight', 2)
    if (battle.rerolled && faces.length === 1 && faces[0] >= 4) addDamage('rewind', 2)
    if (base.chargeBroken) addDamage('wedge', 3)
  }
  return { ...base, dealt, hits, damage, usedRelics }
}

function turnHand(battle: YachtBattle, dice: readonly number[], counter: boolean): UsedHand | null {
  return usedHand(battle, dice, 'attack') ?? (counter ? usedHand(battle, dice, 'guard') : null)
}

export function previewYachtHand(battle: YachtBattle): UsedHand | null {
  return battle.phase === 'assign' ? turnHand(battle, battle.dice, forecastYacht(battle).counter) : null
}

export function previewUnlockProgress(battle: YachtBattle): Record<Hand, UnlockHint> {
  const hints: Record<Hand, UnlockHint> = { triple: { progress: 0 }, straight: { progress: 0 } }
  if (battle.phase !== 'assign') return hints
  const mechanic = enemyIntentAt(battle).mechanic
  for (const slot of ['attack', 'guard'] as const) {
    const placed = facesInSlot(battle.dice, battle.slots, slot)
    const faces = unsealedFaces(placed, mechanic)
    const complete = includedHand(faces)
    if (complete) {
      hints[complete] = slot === 'attack' || forecastYacht(battle).counter
        ? { progress: 3 }
        : { progress: 0, blocked: 'guard' }
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
  if (perk?.kind === 'shield' && planned.intent.hits.length > 0 && enemyHp > 0) {
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
  if (battle.phase !== 'assign' || battle.slots.length !== battle.dice.length || battle.slots.includes(null)) {
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
  const hand = turnHand(battle, dice, result.counter)
  const playerHp = Math.max(0, battle.playerHp - result.damage)
  const enemyHp = battle.enemyHp - result.dealt
  const effect = enemyHp > 0 && playerHp > 0 ? result.intent.mechanic : undefined
  const escortHp = (battle.escort?.hp ?? 0) - result.escortDealt
  const { stolenDie: previousTheft, escort: previousEscort, weakenedStrikeTurn: _weakenedStrikeTurn, ...rest } = battle
  const stolenDie = effect?.kind === 'steal' && !previousTheft
    ? { remaining: effect.value } : damageToStolenDie(battle, result.dealt)
  const escort = previousEscort && escortHp > 0 ? { ...previousEscort, hp: escortHp }
    : effect?.kind === 'escort' && !previousEscort ? { hp: effect.hp, bonus: effect.bonus } : undefined
  const perk = resolvePerk(battle, planned, dice, enemyHp)
  const resolved: YachtBattle = {
    ...rest,
    dice,
    playerHp,
    enemyHp,
    ...(perk && { perk }),
    ...(battle.rewards && result.usedRelics.length && { rewards: { ...battle.rewards, spent: [...battle.rewards.spent, ...result.usedRelics] } }),
    ...((effect?.kind === 'lock' || effect?.kind === 'freeze') && { nextInterference: effect.kind }),
    ...(stolenDie && { stolenDie }),
    ...(escort && { escort }),
    ...(result.chargeBroken && enemyHp > 0 && playerHp > 0 && { weakenedStrikeTurn: battle.turn + 1 }),
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

  if (playerHp === 0) return { battle: { ...resolved, phase: 'lost' }, hand }
  if (enemyHp === 0) return { battle: { ...resolved, phase: 'won' }, hand }
  if (planned.counter) return { battle: { ...resolved, phase: 'counter' }, hand }
  const next = { ...resolved, ...openTurn(battle.seed, battle.turn + 1) }
  return { battle: openYachtDice(next), hand }
}

export function spinYachtCounter(battle: YachtBattle): YachtBattle {
  if (battle.phase !== 'counter') return battle
  const rewards = yachtCounterRewards(battle)
  const spun = spinCounter(battle, rewards)
  if (spun === battle) return battle
  const { stolenDie: _stolenDie, ...rest } = { ...battle, ...spun }
  const stolenDie = damageToStolenDie(battle, battle.enemyHp - spun.enemyHp)
  const perk = battle.perk
  const next = {
    ...rest,
    ...(stolenDie && { stolenDie }),
    ...(perk?.kind === 'counter' && { perk: { ...perk, rewards, growth: perk.growth + START_PERKS.counter.step } }),
  }
  return next.turn > battle.turn ? openYachtDice(next) : next
}
