import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  assignDie, COUNTER_REWARDS, forecast, intentOf, PLAYER_HP, rerollDice, resolveTurn, spinCounter, startBattle,
} from '../src/combat.ts'
import { adaptAndReroll, simulate } from '../src/simulate.ts'

const filled = (dice, slots, extra = {}) => ({
  ...startBattle(42), dice, slots, ...extra,
})

test('a seed gives the same three opening dice and full battle twice', () => {
  for (let seed = 0; seed < 128; seed += 1) {
    assert.deepEqual(startBattle(seed), startBattle(seed))
    const battle = startBattle(seed)
    assert.equal(battle.dice.length, 3)
    assert.ok(battle.dice.every((value) => value >= 1 && value <= 6))
    assert.deepEqual(simulate(seed, adaptAndReroll), simulate(seed, adaptAndReroll))
  }
  const openingRolls = Array.from({ length: 128 }, (_, seed) => startBattle(seed).dice)
  for (let index = 0; index < 3; index += 1) {
    assert.deepEqual([...new Set(openingRolls.map((dice) => dice[index]))].sort(), [1, 2, 3, 4, 5, 6])
  }
})

test('a die belongs to only one slot and turn cannot end with dice left over', () => {
  const start = startBattle(42)
  assert.equal(resolveTurn(start), start)
  const attack = assignDie(start, 0, 'attack')
  const moved = assignDie(attack, 0, 'guard')
  assert.deepEqual(moved.slots, ['guard', null, null])
  assert.equal(resolveTurn(moved), moved)
  assert.equal(assignDie(start, -1, 'guard'), start)
  assert.deepEqual(assignDie(moved, 0, null).slots, [null, null, null])
})

test('a once-per-turn reroll keeps the new die even when it is worse', () => {
  const originals = Array.from({ length: 128 }, (_, seed) => startBattle(seed))
  const start = originals.find((battle) => rerollDice(battle, [0]).dice[0] < battle.dice[0])
  assert.ok(start)
  const assigned = assignDie(start, 0, 'attack')
  const changed = rerollDice(assigned, [0])
  assert.ok(changed.dice[0] < assigned.dice[0])
  assert.deepEqual(changed.dice.slice(1), assigned.dice.slice(1))
  assert.deepEqual(changed.slots, assigned.slots)
  assert.equal(rerollDice(changed, [1]), changed)
})

test('a batch reroll changes only selected dice and consumes one chance', () => {
  const seed = Array.from({ length: 128 }, (_, value) => value).find((value) => {
    const before = startBattle(value)
    const after = rerollDice(before, [0, 2])
    return before.dice[0] !== after.dice[0] && before.dice[2] !== after.dice[2]
  })
  assert.notEqual(seed, undefined)
  const before = assignDie(startBattle(seed), 2, 'guard')
  const result = rerollDice(before, [0, 2])
  assert.deepEqual(result, rerollDice(before, [2, 0, 2]))
  assert.notEqual(result.dice[0], before.dice[0])
  assert.equal(result.dice[1], before.dice[1])
  assert.notEqual(result.dice[2], before.dice[2])
  assert.deepEqual(result.slots, before.slots)
  assert.equal(result.rerolled, true)
  assert.equal(rerollDice(result, [1]), result)
  assert.equal(rerollDice(before, []), before)
  assert.equal(rerollDice(before, [1, 3]), before)
  assert.equal(rerollDice(before, [0, 1, 2]).rerolled, true)
})

test('a heavy blow deals only the unguarded amount', () => {
  const battle = filled([6, 5, 4], ['guard', 'guard', 'attack'])
  const after = resolveTurn(battle)
  assert.equal(after.playerHp, PLAYER_HP - 1)
  assert.equal(after.enemyHp, 26)
  assert.equal(after.turn, 2)
  assert.equal(intentOf(after.turn), 'combo')
  assert.deepEqual(after.lastExchange.hitsTaken, [1])
})

test('an exact single block enables precisely one roulette reward', () => {
  const battle = filled([6, 6, 2], ['guard', 'guard', 'attack'])
  const pending = resolveTurn(battle)
  assert.equal(pending.enemyHp, 28)
  assert.equal(pending.playerHp, PLAYER_HP)
  assert.equal(pending.phase, 'counter')
  assert.equal(pending.lastExchange.counter, null)
  const after = spinCounter(pending)
  const reward = after.lastExchange.counter
  assert.deepEqual(reward, { slot: reward.slot, ...COUNTER_REWARDS[reward.slot] })
  assert.equal(after.enemyHp, 28 - reward.damage)
  assert.equal(after.turn, 2)
  assert.equal(spinCounter(after), after)
})

test('excess guard blocks the hit without bonus damage or roulette', () => {
  const battle = filled([6, 6, 2], ['guard', 'guard', 'guard'])
  const after = resolveTurn(battle)
  assert.equal(after.playerHp, PLAYER_HP)
  assert.equal(after.enemyHp, 30)
  assert.equal(after.phase, 'assign')
  assert.equal(after.turn, 2)
  assert.deepEqual(after.lastExchange.hitsTaken, [0])
  assert.equal(spinCounter(after), after)
})

test('combo shares a shield across all hits and rewards only an exact total', () => {
  const battle = filled([5, 4, 4], ['guard', 'guard', 'attack'], { turn: 2 })
  const after = resolveTurn(battle)
  assert.deepEqual(after.lastExchange.hitsTaken, [0, 0, 3])
  assert.equal(after.playerHp, PLAYER_HP - 3)
  assert.equal(after.phase, 'assign')
  const exact = resolveTurn(filled([6, 6, 2], ['guard', 'guard', 'attack'], { turn: 2 }))
  assert.deepEqual(exact.lastExchange.hitsTaken, [0, 0, 0])
  assert.equal(exact.phase, 'counter')
  assert.equal(exact.enemyHp, 28)
  const afterSpin = spinCounter(exact)
  assert.equal(afterSpin.enemyHp, 28 - afterSpin.lastExchange.counter.damage)
  assert.equal(afterSpin.turn, 3)

  const excess = resolveTurn(filled([6, 6, 2], ['guard', 'guard', 'guard'], { turn: 2 }))
  assert.deepEqual(excess.lastExchange.hitsTaken, [0, 0, 0])
  assert.equal(excess.phase, 'assign')
  assert.equal(excess.enemyHp, 30)
  assert.equal(spinCounter(excess), excess)
})

test('only the top two roulette slots award a joint attack with Mataios', () => {
  const outcomes = new Map()
  for (let seed = 0; seed < 96; seed += 1) {
    const pending = resolveTurn(filled([6, 6, 2], ['guard', 'guard', 'attack'], { seed }))
    const resolved = spinCounter(pending)
    const reward = resolved.lastExchange.counter
    assert.deepEqual(resolved, spinCounter(pending))
    assert.equal(resolved.enemyHp, 28 - reward.damage)
    outcomes.set(reward.slot, { damage: reward.damage, joint: reward.joint })
  }
  assert.deepEqual([...outcomes].sort(([a], [b]) => a - b).map(([, reward]) => reward), [
    { damage: 1, joint: false },
    { damage: 2, joint: false },
    { damage: 3, joint: false },
    { damage: 4, joint: false },
    { damage: 6, joint: true },
    { damage: 8, joint: true },
  ])
})

test('a finishing attack ends the turn before the enemy hits', () => {
  const battle = filled([4, 4, 4], ['attack', 'attack', 'attack'], { enemyHp: 12 })
  const after = resolveTurn(battle)
  assert.equal(after.phase, 'won')
  assert.equal(after.playerHp, PLAYER_HP)
  assert.equal(resolveTurn(after), after)
})

test('awakening checks crisis, replaces each die with 6, and can happen once per battle', () => {
  const form = ([seed, extra]) => filled([1, 1, 1], ['guard', 'guard', 'attack'], { seed, ...extra })
  const seeds = Array.from({ length: 256 }, (_, seed) => seed)
  const seed = seeds.find((seed) => resolveTurn(form([seed, { playerHp: 10 }])).lastExchange.awakened)
  assert.notEqual(seed, undefined)
  const saved = resolveTurn(form([seed, { playerHp: 10 }]))
  assert.equal(saved.phase, 'counter')
  assert.deepEqual(saved.dice, [6, 6, 6])
  assert.equal(saved.playerHp, 10)
  assert.equal(resolveTurn(form([seed, { playerHp: 10, awakened: true }])).lastExchange.awakened, false)
  assert.equal(resolveTurn(form([seed, { playerHp: PLAYER_HP }])).lastExchange.awakened, false)
  const low = form([seed, { playerHp: 6 }])
  const safeThisTurn = { ...low, dice: [6, 6, 1] }
  assert.equal(forecast(safeThisTurn).damage, 0)
  assert.equal(resolveTurn(safeThisTurn).lastExchange.awakened, true)
})
