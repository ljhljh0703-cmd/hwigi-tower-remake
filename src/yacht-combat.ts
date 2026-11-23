import {
  allocationPower, allocationTotals, COUNTER_REWARDS, DIE_COUNT, dieFaceForSlot, draw, enemyIntentAt, forecast, openTurn, PLAYER_HP,
  rerollChannels, roll, spinCounter,
  startBattle,
} from './combat.ts'
import type { Battle, Enemy, EnemyMechanic, Slot } from './combat.ts'
import { collectorBonus, START_PERKS } from './perks.ts'
import type { CollectedHand, PerkState } from './perks.ts'

export type Hand = 'triple' | 'straight'

export interface UsedHand {
  readonly hand: Hand
  readonly slot: Slot
}

export interface YachtBattle extends Battle {
  readonly extraRerollAvailable: boolean
  readonly extraRerollSpent?: true
  readonly perk?: PerkState
  readonly paidRerollSpent?: true
  readonly fourthDieUnlocked?: true
}

const FOURTH_DIE_CHANNEL = 8
const basicRerollChannels = [...rerollChannels, 9]
const EXTRA_REROLL_CHANNEL = 10
const paidRerollChannels = [11, 12, 13, 14]
const combatSlots = ['attack', 'guard', 'escort'] as const

export function classifyHand(faces: readonly number[]): Hand | null {
  if (faces.length !== DIE_COUNT || faces.some((face) => !Number.isInteger(face) || face < 1 || face > 6)) return null
  const [first, second, third] = [...faces].sort((a, b) => a - b)
  if (first === third) return 'triple'
  if (second - first === 1 && third - second === 1) return 'straight'
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

function usedHand(battle: YachtBattle, dice: readonly number[], slot: Slot): UsedHand | null {
  const indices = battle.slots.flatMap((assigned, index) => assigned === slot ? [index] : [])
  if (indices.length !== DIE_COUNT || indices.some((index) => dice[index] !== battle.dice[index])) return null
  const hand = classifyYachtHand(battle, indices.map((index) => dice[index]))
  return hand && { hand, slot }
}

export function classifyYachtHand(battle: YachtBattle, faces: readonly number[]): Hand | null {
  const mechanic = enemyIntentAt(battle).mechanic
  return mechanic?.kind === 'seal' && faces.includes(mechanic.value) ? null : classifyHand(faces)
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
  return forecast(battle, slots, dice, yachtAllocationTotals(battle, slots, dice))
}

function turnHand(battle: YachtBattle, dice: readonly number[], counter: boolean): UsedHand | null {
  return usedHand(battle, dice, 'attack') ?? (counter ? usedHand(battle, dice, 'guard') : null)
}

export function previewYachtHand(battle: YachtBattle): UsedHand | null {
  return battle.phase === 'assign' ? turnHand(battle, battle.dice, forecastYacht(battle).counter) : null
}

export function previewUnlockProgress(battle: YachtBattle): Record<Hand, 0 | 2 | 3> {
  const progress: Record<Hand, 0 | 2 | 3> = { triple: 0, straight: 0 }
  if (battle.phase !== 'assign') return progress
  const mechanic = enemyIntentAt(battle).mechanic
  for (const slot of ['attack', 'guard'] as const) {
    const faces = facesInSlot(battle.dice, battle.slots, slot, mechanic)
    if (faces.length !== 2) continue
    for (const face of [1, 2, 3, 4, 5, 6]) {
      const hand = classifyYachtHand(battle, [...faces, face])
      if (hand) progress[hand] = 2
    }
  }
  const complete = previewYachtHand(battle)
  if (complete) progress[complete.hand] = 3
  return progress
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
      const hand: CollectedHand | null = count === 4 ? 'four' : count === 3 ? 'triple' : count === 2 ? 'pair'
        : classifyHand(faces) === 'straight' ? 'straight' : null
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
