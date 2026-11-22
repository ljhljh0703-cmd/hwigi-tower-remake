import {
  COUNTER_REWARDS, DIE_COUNT, draw, forecast, openTurn, PLAYER_HP, rerollChannels, roll, spinCounter, startBattle,
} from './combat.ts'
import type { Battle, Enemy, Slot } from './combat.ts'
import { START_PERKS } from './perks.ts'
import type { StartPerk } from './perks.ts'

export type Hand = 'triple' | 'straight'

export interface UsedHand {
  readonly hand: Hand
  readonly slot: Slot
}

export interface YachtBattle extends Battle {
  readonly extraRerollAvailable: boolean
  readonly extraRerollSpent?: true
  readonly perk?: StartPerk
  readonly devilRerolls?: number
  readonly devilBoostedDice?: readonly number[]
  readonly fourthDieUnlocked?: true
}

const FOURTH_DIE_CHANNEL = 8
const basicRerollChannels = [...rerollChannels, 9]
const EXTRA_REROLL_CHANNEL = 10
const FIRST_DEVIL_CHANNEL = 11
const pairRewards = [
  ...COUNTER_REWARDS.slice(0, 4),
  ...Array.from({ length: START_PERKS.pair.slots }, () => START_PERKS.pair.reward),
  ...COUNTER_REWARDS.slice(4),
]
const upgradedRewards = [START_PERKS.wheel.reward, ...COUNTER_REWARDS.slice(1)]

export function classifyHand(faces: readonly number[]): Hand | null {
  if (faces.length !== DIE_COUNT || faces.some((face) => !Number.isInteger(face) || face < 1 || face > 6)) return null
  const [first, second, third] = [...faces].sort((a, b) => a - b)
  if (first === third) return 'triple'
  if (second - first === 1 && third - second === 1) return 'straight'
  return null
}

function rollYachtDie(battle: YachtBattle, index: number, channel: number): number {
  const face = roll(battle.seed, battle.turn, channel)
  return battle.perk === 'face' && index === 0 && face === 1 ? START_PERKS.face.replacement : face
}

function addFourthDie(battle: YachtBattle): YachtBattle {
  return {
    ...battle,
    dice: [...battle.dice, rollYachtDie(battle, DIE_COUNT, FOURTH_DIE_CHANNEL)],
    slots: [...battle.slots, null],
  }
}

function openYachtDice(battle: YachtBattle): YachtBattle {
  const dice = [...battle.dice]
  if (battle.perk === 'face' && dice[0] === 1) dice[0] = START_PERKS.face.replacement
  const next = {
    ...battle,
    dice,
    ...(battle.perk === 'reroll' && { devilRerolls: 0, devilBoostedDice: [] }),
  }
  return next.fourthDieUnlocked ? addFourthDie(next) : next
}

export function startYachtBattle(
  seed: number, playerHp: number, fourthDie: boolean, extraReroll: boolean, perk?: StartPerk,
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

function canReroll(battle: YachtBattle, index: number): boolean {
  return battle.phase === 'assign' && Number.isInteger(index) && index >= 0 && index < battle.dice.length
}

export function rerollYachtDice(battle: YachtBattle, indices: readonly number[]): YachtBattle {
  const cost = yachtRerollCost(battle)
  if (cost === null || cost >= battle.playerHp || !indices.length || !indices.every((index) => canReroll(battle, index))) {
    return battle
  }
  const chosen = new Set(indices)
  const paidRolls = battle.devilRerolls ?? 0
  const boostedDice = cost > 0 ? new Set(battle.devilBoostedDice) : null
  const { faceBonus, faceCap } = START_PERKS.reroll
  let drawIndex = 0
  const dice = battle.dice.map((face, index) => {
    if (!chosen.has(index)) return face
    const channel = cost === 0
      ? basicRerollChannels[drawIndex]
      : FIRST_DEVIL_CHANNEL + paidRolls * basicRerollChannels.length + drawIndex
    drawIndex++
    const rolled = rollYachtDie(battle, index, channel)
    if (!boostedDice) return rolled
    const value = Math.min(faceCap, rolled + faceBonus)
    if (value > rolled) boostedDice.add(index)
    else boostedDice.delete(index)
    return value
  })
  return {
    ...battle, dice, playerHp: battle.playerHp - cost, rerolled: true,
    ...(boostedDice && { devilRerolls: paidRolls + 1, devilBoostedDice: [...boostedDice] }),
  }
}

export function yachtRerollCost(battle: YachtBattle): number | null {
  if (battle.phase !== 'assign') return null
  if (!battle.rerolled) return 0
  return battle.perk === 'reroll'
    ? Math.floor((battle.devilRerolls ?? 0) / START_PERKS.reroll.rollsPerCost) + 1
    : null
}

export function spendExtraReroll(battle: YachtBattle, index: number): YachtBattle {
  if (!battle.extraRerollAvailable || !battle.rerolled || !canReroll(battle, index)) return battle
  const dice = [...battle.dice]
  dice[index] = rollYachtDie(battle, index, EXTRA_REROLL_CHANNEL)
  return {
    ...battle, dice, extraRerollAvailable: false, extraRerollSpent: true,
    ...(battle.devilBoostedDice && { devilBoostedDice: battle.devilBoostedDice.filter((die) => die !== index) }),
  }
}

function usedHand(battle: YachtBattle, dice: readonly number[], slot: Slot): UsedHand | null {
  const indices = battle.slots.flatMap((assigned, index) => assigned === slot ? [index] : [])
  if (indices.length !== DIE_COUNT || indices.some((index) => dice[index] !== battle.dice[index])) return null
  const hand = classifyHand(indices.map((index) => dice[index]))
  return hand && { hand, slot }
}

export function yachtAttackBonus(battle: YachtBattle, slots = battle.slots): number {
  return battle.perk === 'attack' && battle.turn === 1 && slots.includes('attack') ? START_PERKS.attack.damage : 0
}

export function forecastYacht(battle: YachtBattle, slots = battle.slots, dice = battle.dice) {
  return forecast(battle, slots, dice, yachtAttackBonus(battle, slots))
}

function hasGuardPair(battle: YachtBattle, slots: readonly (Slot | null)[]): boolean {
  const guardDice = battle.dice.filter((_, index) => slots[index] === 'guard')
  return guardDice.length === 2 && guardDice[0] === guardDice[1]
}

// For an allocation preview, callers ask only when the plan earns a counter.
export function yachtCounterRewards(battle: YachtBattle, slots = battle.slots) {
  if (battle.perk === 'wheel') return upgradedRewards
  if (battle.perk === 'pair') {
    const pair = battle.phase === 'counter' ? battle.lastExchange?.pairGuardBonus : hasGuardPair(battle, slots)
    if (pair) return pairRewards
  }
  return COUNTER_REWARDS
}

export function resolveYachtTurn(battle: YachtBattle): { battle: YachtBattle; hand: UsedHand | null } {
  if (battle.phase !== 'assign' || battle.slots.length !== battle.dice.length || battle.slots.includes(null)) {
    return { battle, hand: null }
  }

  const planned = forecastYacht(battle)
  const inCrisis = planned.damage >= battle.playerHp || battle.playerHp * 10 <= PLAYER_HP * 3
  const awakened = !battle.awakened && inCrisis && draw(battle.seed, battle.turn, 5) / 0x100000000 < 0.1
  // Higher faces can only improve the fixed allocation. The original awakening breaks ties toward six.
  const awakenedDice = awakened ? battle.dice.map(() => 6) : undefined
  const dice = awakenedDice ?? battle.dice
  const result = awakenedDice ? forecastYacht(battle, battle.slots, awakenedDice) : planned
  const hand = usedHand(battle, dice, 'attack') ?? (result.counter ? usedHand(battle, dice, 'guard') : null)
  const playerHp = Math.max(0, battle.playerHp - result.damage)
  const enemyHp = battle.enemyHp - result.dealt
  const resolved: YachtBattle = {
    ...battle,
    dice,
    playerHp,
    enemyHp,
    awakened: battle.awakened || awakened,
    lastExchange: {
      turn: battle.turn,
      dealt: result.dealt,
      hitsTaken: result.hits,
      counter: null,
      awakened,
      ...(awakenedDice && { awakenedDice }),
      ...(battle.perk === 'pair' && planned.counter && hasGuardPair(battle, battle.slots) && { pairGuardBonus: true }),
    },
  }

  if (enemyHp === 0) return { battle: { ...resolved, phase: 'won' }, hand }
  if (playerHp === 0) return { battle: { ...resolved, phase: 'lost' }, hand }
  if (planned.counter) return { battle: { ...resolved, phase: 'counter' }, hand }
  const next = { ...resolved, ...openTurn(battle.seed, battle.turn + 1) }
  return { battle: openYachtDice(next), hand }
}

export function spinYachtCounter(battle: YachtBattle): YachtBattle {
  const spun = spinCounter(battle, yachtCounterRewards(battle))
  if (spun === battle) return battle
  const next = { ...battle, ...spun }
  return next.turn > battle.turn ? openYachtDice(next) : next
}
