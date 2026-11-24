import assert from 'node:assert/strict'
import { test } from 'node:test'
import { beginAscent, resolveAscentTurn } from '../src/ascent.ts'
import { PLAYER_HP, roll } from '../src/combat.ts'
import { rerollSelectedDice } from '../src/dice-drag.ts'
import { adaptAndReroll, countTradeoffs, simulate } from '../src/simulate.ts'
import {
  classifyHand, previewUnlockProgress, previewYachtHand, rerollYachtDice, resolveYachtTurn, spendExtraReroll,
  spinYachtCounter, startYachtBattle,
} from '../src/yacht-combat.ts'
import { chooseAllocation, chooseReroll } from '../src/yacht-policy.ts'
import { simulateLegacyYacht, yachtVariants } from '../src/yacht-simulate.ts'

const filled = (dice, slots, extra = {}) => ({
  ...startYachtBattle(42, PLAYER_HP, dice.length === 4, false), dice, slots, ...extra,
})

test('unlock progress distinguishes partial, complete, and invalid hands', () => {
  assert.deepEqual(previewUnlockProgress(filled([4, 4, 4], ['guard', 'guard', null])), { triple: { progress: 2 }, straight: { progress: 0 } })
  assert.deepEqual(previewUnlockProgress(filled([4, 4, 4], ['guard', 'guard', 'guard'])).triple, { progress: 3 })
  assert.deepEqual(previewUnlockProgress(filled([3, 3, 3], ['guard', 'guard', 'guard'])).triple, { progress: 0, blocked: 'guard' })
  assert.deepEqual(previewUnlockProgress(filled([5, 3, 4], ['attack', 'attack', null])).straight, { progress: 2 })
  assert.deepEqual(previewUnlockProgress(filled([5, 3, 4], ['attack', 'attack', 'attack'])).straight, { progress: 3 })
  const noProgress = { triple: { progress: 0 }, straight: { progress: 0 } }
  assert.deepEqual(previewUnlockProgress(filled([6, 1, 2], ['attack', 'attack', null])), noProgress)
  assert.deepEqual(previewUnlockProgress(filled([2, 2, 3], ['escort', 'escort', null])), noProgress)
  const sealed = { id: 'seal', name: '봉인', hits: [7], mechanic: { kind: 'seal', value: 4 }, matches: () => true }
  assert.deepEqual(previewUnlockProgress(filled([5, 3, 1], ['attack', 'attack', null], { enemyIntents: [sealed] })), noProgress)
})

test('rerolling a batch clears selection so one die can use the unlocked reroll', () => {
  const start = startYachtBattle(42, PLAYER_HP, false, true)
  const selected = new Set([0, 1])
  const basic = rerollSelectedDice(start, selected, false)
  assert.equal(basic.battle.rerolled, true)
  assert.equal(basic.focusIndex, 0)
  assert.equal(selected.size, 0)
  selected.add(1).add(2)
  assert.equal(rerollSelectedDice(basic.battle, selected, true), null)
  assert.deepEqual([...selected], [1, 2])
  selected.delete(2)
  const extra = rerollSelectedDice(basic.battle, selected, true)
  assert.equal(extra.battle.extraRerollSpent, true)
  assert.equal(extra.battle.dice[1], roll(42, 1, 10))
  assert.equal(selected.size, 0)
})

test('unlock previews follow the same attack and exact guard conditions as turn resolution', () => {
  const attack = ['attack', 'attack', 'attack']
  const guard = ['guard', 'guard', 'guard']
  for (const [battle, hand] of [
    [filled([5, 3, 4], attack), { hand: 'straight', slot: 'attack' }],
    [filled([4, 4, 4], guard), { hand: 'triple', slot: 'guard' }],
    [filled([5, 5, 5], guard), null],
    [filled([3, 3, 3], guard), null],
    [filled([4, 4, 4, 6], [...guard, 'attack'], { enemyHp: 6 }), null],
    [filled([2, 2, 2], ['escort', 'escort', 'escort']), null],
  ]) {
    assert.deepEqual(previewYachtHand(battle), hand)
    assert.deepEqual(resolveYachtTurn(battle).hand, hand)
  }
  assert.deepEqual(previewYachtHand(filled([2, 2, 2, 5], [...attack, null])), { hand: 'triple', slot: 'attack' })
  assert.deepEqual(previewYachtHand(filled([2, 2, 2, 5], [...attack, 'attack'])), { hand: 'triple', slot: 'attack' })
  const sealed = { id: 'seal', name: '봉인', hits: [7], mechanic: { kind: 'seal', value: 2 }, matches: () => true }
  assert.equal(previewYachtHand(filled([2, 2, 2], attack, { enemyIntents: [sealed] })), null)
})

test('descending and rerolled straights unlock in any one available slot', () => {
  for (const slot of ['attack', 'guard', 'escort']) {
    const battle = filled([6, 5, 4, 1], [slot, slot, slot, 'attack'], { escort: { hp: 5, bonus: 2 } })
    assert.deepEqual(previewUnlockProgress(battle).straight, { progress: 3 })
    assert.deepEqual(resolveYachtTurn(battle).hand, { hand: 'straight', slot })
  }
  const start = startYachtBattle(286)
  const rerolled = rerollYachtDice(start, [0, 1, 2])
  const attack = ['attack', 'attack', 'attack']
  assert.equal(rerolled.rerolled, true)
  assert.deepEqual(rerolled.dice, [6, 5, 4])
  assert.deepEqual(resolveYachtTurn({ ...rerolled, slots: attack }).hand, { hand: 'straight', slot: 'attack' })
})

test('four dice qualify using any unchanged matching trio in the same slot', () => {
  const attack = ['attack', 'attack', 'attack', 'attack']
  for (const [dice, hand] of [[[2, 5, 2, 2], 'triple'], [[3, 3, 3, 3], 'triple'], [[2, 4, 2, 3], 'straight']]) {
    const battle = filled(dice, attack)
    const match = { hand, slot: 'attack' }
    assert.deepEqual(previewYachtHand(battle), match)
    assert.deepEqual(resolveYachtTurn(battle).hand, match)
    assert.deepEqual(previewUnlockProgress(battle)[hand], { progress: 3 })
  }
  assert.deepEqual(previewUnlockProgress(filled([1, 5, 2, 3], ['attack', 'attack', 'attack', null])).straight, { progress: 2 })
  const crisis = filled([6, 6, 1, 6], attack, { seed: 23, playerHp: 6 })
  const outcome = resolveYachtTurn(crisis)
  assert.deepEqual(outcome.battle.lastExchange.awakenedDice, [6, 6, 6, 6])
  assert.deepEqual(outcome.hand, { hand: 'triple', slot: 'attack' })
})

test('a four-die guard uses all eyes for the exact block while a straight still unlocks', () => {
  const slots = ['guard', 'guard', 'guard', 'guard']
  for (const [dice, hand, exact] of [
    [[3, 3, 3, 3], 'triple', true], [[3, 3, 3, 4], 'triple', false],
    [[3, 4, 2, 3], 'straight', true], [[3, 4, 2, 5], 'straight', false],
  ]) {
    const battle = filled(dice, slots)
    const earned = exact || hand === 'straight'
    const expected = earned ? { hand, slot: 'guard' } : null
    assert.deepEqual(previewYachtHand(battle), expected)
    assert.deepEqual(resolveYachtTurn(battle).hand, expected)
    assert.equal(resolveYachtTurn(battle).battle.phase === 'counter', exact)
    assert.deepEqual(previewUnlockProgress(battle)[hand], earned ? { progress: 3 } : { progress: 0, blocked: 'guard' })
  }
})

test('a sealed die explains a blocked trio and can be left out of another trio', () => {
  const seal = { id: 'seal', name: '봉인', hits: [9], mechanic: { kind: 'seal', value: 5 }, matches: () => true }
  const attack = ['attack', 'attack', 'attack', 'attack']
  const blocked = filled([6, 5, 4, 1], attack, { enemyIntents: [seal] })
  assert.equal(resolveYachtTurn(blocked).hand, null)
  assert.deepEqual(previewUnlockProgress(blocked).straight, { progress: 0, blocked: 'seal' })
  for (const [dice, slot, hand] of [
    [[5, 3, 4, 2], 'attack', 'straight'], [[5, 3, 3, 3], 'guard', 'triple'],
  ]) {
    const battle = filled(dice, Array(4).fill(slot), { enemyIntents: [seal] })
    assert.deepEqual(previewUnlockProgress(battle)[hand], { progress: 3 })
    assert.deepEqual(resolveYachtTurn(battle).hand, { hand, slot })
  }
})

test('an included straight unlocks the extra reroll after the companion awakens', () => {
  const ascent = beginAscent(42, 'collector')
  const outcome = resolveAscentTurn({
    ...ascent, unlocks: ['triple'],
    battle: { ...ascent.battle, fourthDieUnlocked: true, dice: [3, 4, 3, 5], slots: Array(4).fill('attack') },
  })
  assert.deepEqual(outcome.unlocks, ['triple', 'straight'])
  assert.deepEqual(outcome.battle.perk.hands, ['straight'])
  const rerolled = rerollYachtDice(outcome.battle, [0])
  assert.ok(spendExtraReroll(rerolled, 1).extraRerollSpent)
})

test('three guards unlock a triple only on an exact block', () => {
  const slots = ['guard', 'guard', 'guard']
  for (const turn of [1, 2]) {
    const exact = resolveYachtTurn(filled([4, 4, 4], slots, { turn }))
    assert.deepEqual(exact.hand, { hand: 'triple', slot: 'guard' })
    assert.equal(exact.battle.phase, 'counter')
    assert.ok(spinYachtCounter(exact.battle).lastExchange.counter)
    assert.equal(resolveYachtTurn(filled([5, 5, 5], slots, { turn })).hand, null)
    assert.equal(resolveYachtTurn(filled([3, 3, 3], slots, { turn })).hand, null)
  }
  assert.deepEqual(resolveYachtTurn(filled([5, 3, 4], slots)).hand, { hand: 'straight', slot: 'guard' })
})

test('a finishing attack skips the three guards and the roulette', () => {
  const slots = ['guard', 'guard', 'guard', 'attack']
  const result = resolveYachtTurn(filled([4, 4, 4, 6], slots, { enemyHp: 6 }))
  assert.equal(result.battle.phase, 'won')
  assert.deepEqual(result.battle.lastExchange.hitsTaken, [])
  assert.equal(result.hand, null)
  assert.equal(spinYachtCounter(result.battle), result.battle)
})

test('awakening cannot supply new hands and preserves a straight already placed', () => {
  const crisis = { seed: 23, playerHp: 6 }
  const attack = ['attack', 'attack', 'attack']
  const changed = resolveYachtTurn(filled([1, 2, 3], attack, crisis))
  assert.deepEqual(changed.battle.lastExchange.awakenedDice, [6, 6, 6])
  assert.deepEqual(changed.hand, { hand: 'straight', slot: 'attack' })
  assert.equal(resolveYachtTurn(filled([1, 2, 4], attack, crisis)).hand, null)
  assert.deepEqual(resolveYachtTurn(filled([6, 6, 6], attack, crisis)).hand, { hand: 'triple', slot: 'attack' })

  const guard = ['guard', 'guard', 'guard']
  const oldExact = resolveYachtTurn(filled([4, 4, 4], guard, crisis))
  assert.deepEqual(oldExact.battle.lastExchange.awakenedDice, [6, 6, 6])
  assert.equal(oldExact.battle.phase, 'counter')
  assert.equal(oldExact.hand, null)

  const fourth = resolveYachtTurn(filled([1, 2, 3, 1], [...attack, 'attack'], crisis))
  assert.deepEqual(fourth.battle.lastExchange.awakenedDice, [6, 6, 6, 6])
  assert.equal(fourth.battle.lastExchange.dealt, 24)
})

test('three-straight sorts faces, rejects duplicates and does not wrap around', () => {
  assert.equal(classifyHand([6, 4, 5]), 'straight')
  assert.equal(classifyHand([3, 3, 4]), null)
  assert.equal(classifyHand([5, 6, 1]), null)
  assert.equal(classifyHand([1, 2, 3, 4]), 'straight')
  const attack = ['attack', 'attack', 'attack']
  assert.deepEqual(resolveYachtTurn(filled([2, 3, 4, 5], [...attack, 'attack'])).hand, { hand: 'straight', slot: 'attack' })
  assert.deepEqual(resolveYachtTurn(filled([2, 3, 4, 5], [...attack, 'guard'])).hand, { hand: 'straight', slot: 'attack' })
})

test('the extra reroll requires a basic reroll that turn and is spent once per fight', () => {
  const start = startYachtBattle(42, PLAYER_HP, false, true)
  assert.equal(spendExtraReroll(start, 1), start)
  const basic = rerollYachtDice(start, [0, 2])
  assert.equal(spendExtraReroll(basic, 3), basic)
  const extra = spendExtraReroll(basic, 1)
  assert.deepEqual(extra.dice, [basic.dice[0], roll(42, 1, 10), basic.dice[2]])
  assert.notEqual(extra.dice[1], basic.dice[1])
  assert.equal(extra.extraRerollAvailable, false)
  assert.equal(spendExtraReroll(extra, 2), extra)
  const slots = ['attack', 'attack', 'attack']
  const next = resolveYachtTurn({ ...extra, slots }).battle
  assert.equal(next.turn, 2)
  const nextBasic = rerollYachtDice(next, [2])
  assert.equal(nextBasic.rerolled, true)
  assert.equal(spendExtraReroll(nextBasic, 2), nextBasic)
  assert.equal(startYachtBattle(23, next.playerHp, false, true).extraRerollAvailable, true)
})

test('a fourth die survives turn transitions and can use the base reroll', () => {
  const start = startYachtBattle(42, PLAYER_HP, true, false)
  assert.equal(start.dice.length, 4)
  assert.deepEqual(start.dice.slice(0, 3), startYachtBattle(42, PLAYER_HP, false, false).dice)
  assert.deepEqual(rerollYachtDice(start, [0, 1, 2, 3]).dice, [3, 6, 7, 9].map((channel) => roll(42, 1, channel)))
  const exact = resolveYachtTurn(filled([4, 4, 4, 1], ['guard', 'guard', 'guard', 'attack'])).battle
  const next = spinYachtCounter(exact)
  assert.equal(next.turn, 2)
  assert.equal(next.dice.length, 4)
  assert.deepEqual(next.slots, [null, null, null, null])
  const third = resolveYachtTurn({ ...next, slots: ['attack', 'attack', 'attack', 'attack'] }).battle
  assert.equal(third.turn, 3)
  assert.equal(third.dice.length, 4)
})

test('attack and guard bots keep matching pairs and guard falls back on an unreachable target', () => {
  const pair = filled([2, 6, 2, 1], [null, null, null, null])
  assert.deepEqual(chooseReroll(pair, 'attackHand', false), [1, 3])
  assert.deepEqual(chooseReroll(pair, 'guardHand', false), chooseReroll(pair, 'adaptive', false))
  assert.deepEqual(chooseAllocation(pair, 'guardHand'), chooseAllocation(pair, 'adaptive'))
  const guard = filled([4, 1, 4, 2], [null, null, null, null])
  assert.deepEqual(chooseReroll(guard, 'guardHand', false), [1, 3])
  const exact = { ...guard, dice: [5, 1, 4, 3] }
  assert.deepEqual(chooseReroll(exact, 'guardHand', false), [])
  assert.deepEqual(chooseAllocation(exact, 'guardHand'), ['guard', 'attack', 'guard', 'guard'])
})

test('the legacy adaptive first fight matches the original bot on seeds 0 through 511', () => {
  for (let seed = 0; seed < 512; seed += 1) {
    const original = simulate(seed, adaptAndReroll)
    const { first } = simulateLegacyYacht(seed, yachtVariants.baseline, 'adaptive')
    const { extraRerollAvailable, ...end } = first.end
    assert.equal(extraRerollAvailable, false)
    assert.deepEqual(end, original.at(-1), `seed ${seed}`)
    const plans = original.filter((battle) => battle.phase === 'assign' && !battle.slots.includes(null))
    assert.deepEqual(first.turns.map((turn) => turn.tradeoffs), plans.map(countTradeoffs), `seed ${seed}`)
  }
})

test('the legacy two-fight experiment activates each recorded unlock after fight one', () => {
  const seeds = Array.from({ length: 128 }, (_, seed) => seed)
  const runs = seeds.map((seed) => simulateLegacyYacht(seed, yachtVariants.both, 'attackHand'))
  const index = runs.findIndex(({ second }) => second?.start.dice.length === 4 && second.start.extraRerollAvailable)
  assert.notEqual(index, -1)
  const { first, second, unlocks } = runs[index]
  assert.equal(first.start.playerHp, PLAYER_HP)
  assert.ok(first.turns.every((turn) => turn.diceCount === 3))
  assert.ok(second.turns.every((turn) => turn.diceCount === 4))
  assert.equal(second.start.enemyHp, first.start.enemyHp)
  assert.equal(second.start.playerHp, first.end.playerHp)
  assert.equal(second.start.awakened, false)
  assert.deepEqual(unlocks.map(({ hand, fight }) => [hand, fight]).sort(), [['straight', 1], ['triple', 1]])
  for (const enabled of Object.values(yachtVariants)) {
    assert.deepEqual(simulateLegacyYacht(seeds[index], enabled, 'attackHand').first, first)
  }
})
