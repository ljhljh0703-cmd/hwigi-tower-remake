import {
  DIE_COUNT, draw, forecast, openTurn, PLAYER_HP, rerollChannels, roll, spinCounter, startBattle,
} from './combat.ts'
import type { Battle, Slot } from './combat.ts'

export type Hand = 'triple' | 'straight'

export interface UsedHand {
  readonly hand: Hand
  readonly slot: Slot
}

export interface YachtBattle extends Battle {
  readonly extraRerollAvailable: boolean
}

const FOURTH_DIE_CHANNEL = 8
const basicRerollChannels = [...rerollChannels, 9]
const EXTRA_REROLL_CHANNEL = 10

export function classifyHand(faces: readonly number[]): Hand | null {
  if (faces.length !== DIE_COUNT || faces.some((face) => !Number.isInteger(face) || face < 1 || face > 6)) return null
  const [first, second, third] = [...faces].sort((a, b) => a - b)
  if (first === third) return 'triple'
  if (second - first === 1 && third - second === 1) return 'straight'
  return null
}

function appendFourthDie(battle: YachtBattle): YachtBattle {
  return {
    ...battle,
    dice: [...battle.dice, roll(battle.seed, battle.turn, FOURTH_DIE_CHANNEL)],
    slots: [...battle.slots, null],
  }
}

export function startYachtBattle(seed: number, playerHp: number, fourthDie: boolean, extraReroll: boolean): YachtBattle {
  const battle = { ...startBattle(seed), playerHp, extraRerollAvailable: extraReroll }
  return fourthDie ? appendFourthDie(battle) : battle
}

function canReroll(battle: YachtBattle, index: number): boolean {
  return battle.phase === 'assign' && Number.isInteger(index) && index >= 0 && index < battle.dice.length
}

export function rerollYachtDice(battle: YachtBattle, indices: readonly number[]): YachtBattle {
  if (battle.rerolled || !indices.length || !indices.every((index) => canReroll(battle, index))) return battle
  const chosen = new Set(indices)
  let drawIndex = 0
  const dice = battle.dice.map((face, index) => chosen.has(index)
    ? roll(battle.seed, battle.turn, basicRerollChannels[drawIndex++])
    : face)
  return { ...battle, dice, rerolled: true }
}

export function spendExtraReroll(battle: YachtBattle, index: number): YachtBattle {
  if (!battle.extraRerollAvailable || !battle.rerolled || !canReroll(battle, index)) return battle
  const dice = [...battle.dice]
  dice[index] = roll(battle.seed, battle.turn, EXTRA_REROLL_CHANNEL)
  return { ...battle, dice, extraRerollAvailable: false }
}

function usedHand(battle: YachtBattle, dice: readonly number[], slot: Slot): UsedHand | null {
  const indices = battle.slots.flatMap((assigned, index) => assigned === slot ? [index] : [])
  if (indices.length !== DIE_COUNT || indices.some((index) => dice[index] !== battle.dice[index])) return null
  const hand = classifyHand(indices.map((index) => dice[index]))
  return hand && { hand, slot }
}

function preserveDiceCount(before: YachtBattle, next: YachtBattle): YachtBattle {
  return before.dice.length > DIE_COUNT && next.turn > before.turn ? appendFourthDie(next) : next
}

export function resolveYachtTurn(battle: YachtBattle): { battle: YachtBattle; hand: UsedHand | null } {
  if (battle.phase !== 'assign' || battle.slots.length !== battle.dice.length || battle.slots.includes(null)) {
    return { battle, hand: null }
  }

  const planned = forecast(battle)
  const inCrisis = planned.damage >= battle.playerHp || battle.playerHp * 10 <= PLAYER_HP * 3
  const awakened = !battle.awakened && inCrisis && draw(battle.seed, battle.turn, 5) / 0x100000000 < 0.1
  // Higher faces can only improve the fixed allocation. The original awakening breaks ties toward six.
  const awakenedDice = awakened ? battle.dice.map(() => 6) : undefined
  const dice = awakenedDice ?? battle.dice
  const result = awakenedDice ? forecast(battle, battle.slots, awakenedDice) : planned
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
    },
  }

  if (enemyHp === 0) return { battle: { ...resolved, phase: 'won' }, hand }
  if (playerHp === 0) return { battle: { ...resolved, phase: 'lost' }, hand }
  if (planned.counter) return { battle: { ...resolved, phase: 'counter' }, hand }
  return { battle: preserveDiceCount(battle, { ...resolved, ...openTurn(battle.seed, battle.turn + 1) }), hand }
}

export function spinYachtCounter(battle: YachtBattle): YachtBattle {
  const spun = spinCounter(battle)
  if (spun === battle) return battle
  return preserveDiceCount(battle, { ...spun, extraRerollAvailable: battle.extraRerollAvailable })
}
