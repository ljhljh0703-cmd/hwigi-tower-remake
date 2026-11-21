import assert from 'node:assert/strict'
import { test } from 'node:test'
import { beginAscent, FIGHT_COUNT, nextAscentFight, resolveAscentTurn } from '../src/ascent.ts'
import { assignDie, COUNTER_REWARDS, draw, ENEMY_HP, PLAYER_HP, roll } from '../src/combat.ts'
import { offerPerks, START_PERKS } from '../src/perks.ts'
import {
  forecastYacht, remainingYachtRerolls, rerollYachtDice, resolveYachtTurn,
  spendExtraReroll, spinYachtCounter, startYachtBattle, yachtCounterRewards,
} from '../src/yacht-combat.ts'

const seeds = Array.from({ length: 512 }, (_, seed) => seed)
const allAttack = ['attack', 'attack', 'attack']
const allGuard = ['guard', 'guard', 'guard']

function play(ascent, dice, slots, changes = {}) {
  return resolveAscentTurn({ ...ascent, battle: { ...ascent.battle, dice, slots, ...changes } })
}

function spin(ascent) {
  return { ...ascent, battle: spinYachtCounter(ascent.battle) }
}

test('a seed offers three distinct perks and all six appear across the sample', () => {
  const seen = new Set()
  for (const seed of seeds) {
    const offers = offerPerks(seed)
    assert.deepEqual(offers, offerPerks(seed))
    assert.equal(new Set(offers).size, 3)
    offers.forEach((perk) => seen.add(perk))
  }
  assert.deepEqual([...seen].sort(), Object.keys(START_PERKS).sort())
})

test('the reroll perk grants two regular batches each turn, independently of the unlocked reroll', () => {
  let battle = startYachtBattle(42, PLAYER_HP, true, true, 'reroll')
  assert.equal(remainingYachtRerolls(battle), 2)
  battle = rerollYachtDice(battle, [0, 1, 2, 3])
  assert.deepEqual(battle.dice, [3, 6, 7, 9].map((channel) => roll(42, 1, channel)))
  assert.equal(remainingYachtRerolls(battle), 1)
  battle = rerollYachtDice(battle, [0, 1, 2, 3])
  assert.deepEqual(battle.dice, [11, 12, 13, 14].map((channel) => roll(42, 1, channel)))
  assert.equal(remainingYachtRerolls(battle), 0)
  assert.equal(rerollYachtDice(battle, [0]), battle)
  battle = spendExtraReroll(battle, 3)
  assert.equal(battle.dice[3], roll(42, 1, 10))
  assert.equal(battle.extraRerollAvailable, false)
  const next = resolveYachtTurn({ ...battle, slots: [...allAttack, 'attack'] }).battle
  assert.equal(remainingYachtRerolls(next), 2)
  assert.equal(next.extraRerollAvailable, false)
})

test('the face perk replaces rolled ones only on the first die', () => {
  const seed = 1042
  const normal = startYachtBattle(seed, PLAYER_HP, false, false)
  const marked = startYachtBattle(seed, PLAYER_HP, false, false, 'face')
  assert.deepEqual(normal.dice.slice(0, 2), [1, 1])
  assert.deepEqual(marked.dice, [4, 1, normal.dice[2]])
  assert.deepEqual(rerollYachtDice(marked, [0, 1]).dice, [4, 1, normal.dice[2]])
})

test('the exact pair guard perk adds a seventh roulette segment worth five', () => {
  const seed = seeds.find((value) => draw(value, 1, 4) % 7 === 4)
  const start = startYachtBattle(seed, PLAYER_HP, false, false, 'pair')
  const paired = resolveYachtTurn({ ...start, dice: [6, 6, 1], slots: ['guard', 'guard', 'attack'] }).battle
  assert.equal(paired.phase, 'counter')
  assert.deepEqual(yachtCounterRewards(paired).map(({ damage }) => damage), [1, 2, 3, 4, 5, 6, 8])
  assert.deepEqual(spinYachtCounter(paired).lastExchange.counter, { slot: 4, damage: 5, joint: false })
  const tripleGuard = resolveYachtTurn({ ...start, dice: [4, 4, 4], slots: allGuard }).battle
  assert.equal(tripleGuard.phase, 'counter')
  assert.equal(yachtCounterRewards(tripleGuard), COUNTER_REWARDS)
  const undershot = resolveYachtTurn({ ...start, dice: [5, 5, 1], slots: ['guard', 'guard', 'attack'] }).battle
  assert.equal(undershot.phase, 'assign')
  assert.equal(yachtCounterRewards(undershot), COUNTER_REWARDS)
})

test('the attack perk adds four only to an attack on the first turn of each fight', () => {
  const ascent = beginAscent(42, 'attack')
  assert.equal(forecastYacht(ascent.battle, allGuard).dealt, 0)
  const first = play(ascent, [1, 2, 3], ['attack', 'guard', 'guard'])
  assert.equal(first.battle.lastExchange.dealt, 5)
  const secondTurn = play(first, [1, 2, 3], ['attack', 'guard', 'guard'])
  assert.equal(secondTurn.battle.lastExchange.dealt, 1)
  const next = nextAscentFight(play(ascent, [1, 2, 3], allAttack, { enemyHp: 10 }))
  assert.equal(next.fight, 2)
  assert.equal(play(next, [1, 2, 3], ['attack', 'guard', 'guard']).battle.lastExchange.dealt, 5)
})

test('the wheel perk replaces the one-damage regular segment with five', () => {
  const seed = seeds.find((value) => draw(value, 1, 4) % 6 === 0)
  const start = startYachtBattle(seed, PLAYER_HP, false, false, 'wheel')
  const counter = resolveYachtTurn({ ...start, dice: [4, 4, 4], slots: allGuard }).battle
  assert.deepEqual(yachtCounterRewards(counter), [{ damage: 5, joint: false }, ...COUNTER_REWARDS.slice(1)])
  assert.deepEqual(spinYachtCounter(counter).lastExchange.counter, { slot: 0, damage: 5, joint: false })
})

test('the health perk adds six once and the next fight starts with the carried health', () => {
  const start = beginAscent(42, 'health')
  assert.equal(start.maxHp, PLAYER_HP + 6)
  assert.equal(start.battle.playerHp, start.maxHp)
  const damaged = play(start, [1, 4, 5], ['attack', 'guard', 'guard'])
  const won = play(damaged, [1, 1, 1], allAttack, { enemyHp: 3 })
  const next = nextAscentFight(won)
  assert.equal(next.battle.playerHp, PLAYER_HP + 3)
  assert.equal(next.maxHp, start.maxHp)
  assert.equal(next.perk, 'health')
})

test('three fights use the same enemy and carry health without recovery', () => {
  let ascent = beginAscent(42, 'wheel')
  for (let fight = 1; fight <= FIGHT_COUNT; fight++) {
    assert.equal(ascent.fight, fight)
    assert.equal(ascent.battle.playerHp, PLAYER_HP - (fight - 1) * 3)
    assert.equal(ascent.battle.enemyHp, ENEMY_HP)
    assert.equal(ascent.battle.enemyIntents, beginAscent(42, 'wheel').battle.enemyIntents)
    assert.equal(nextAscentFight(ascent), ascent)
    const damaged = play(ascent, [1, 4, 5], ['attack', 'guard', 'guard'])
    const won = play(damaged, [1, 2, 2], allAttack, { enemyHp: 5 })
    assert.equal(won.battle.phase, 'won')
    assert.equal(won.battle.playerHp, PLAYER_HP - fight * 3)
    ascent = nextAscentFight(won)
    if (fight === FIGHT_COUNT) assert.equal(ascent, won)
  }
})

test('exact-defense hands unlock once and activate only from the next fight', () => {
  const start = beginAscent(42, 'wheel')
  const triple = play(start, [4, 4, 4], allGuard)
  assert.equal(triple.newUnlock, 'triple')
  assert.equal(triple.battle.phase, 'counter')
  const straight = play(spin(triple), [3, 4, 5], allGuard)
  assert.equal(straight.newUnlock, 'straight')
  assert.equal(straight.battle.dice.length, 3)
  assert.equal(straight.battle.extraRerollAvailable, false)
  const won = play(spin(straight), [4, 4, 4], allAttack, { enemyHp: 12 })
  assert.equal(won.newUnlock, null)
  const next = nextAscentFight(won)
  assert.deepEqual(next.unlocks, ['triple', 'straight'])
  assert.equal(next.battle.dice.length, 4)
  assert.equal(next.battle.extraRerollAvailable, true)
  assert.equal(assignDie(next.battle, 3, 'guard').slots[3], 'guard')
  const used = spendExtraReroll(rerollYachtDice(next.battle, [3]), 3)
  const final = nextAscentFight(play({ ...next, battle: used }, [6, 6, 6, 6], [...allAttack, 'attack'], { enemyHp: 24 }))
  assert.equal(final.fight, 3)
  assert.equal(final.battle.dice.length, 4)
  assert.equal(final.battle.extraRerollAvailable, true)
})

test('a fresh ascent after victory or defeat starts with only the new perk', () => {
  const start = beginAscent(42, 'health')
  const unlocked = play(start, [4, 4, 4], allAttack)
  const lost = play(unlocked, [1, 1, 2], allAttack, { playerHp: 1, awakened: true })
  assert.equal(lost.battle.phase, 'lost')
  assert.equal(nextAscentFight(lost), lost)
  assert.deepEqual(lost.unlocks, ['triple'])
  let won = start
  for (let fight = 1; fight <= FIGHT_COUNT; fight++) {
    const dice = won.battle.dice.map(() => 4)
    won = nextAscentFight(play(won, dice, dice.map(() => 'attack'), { enemyHp: 1 }))
  }
  assert.equal(won.fight, 3)
  assert.equal(won.battle.phase, 'won')
  assert.deepEqual(won.unlocks, ['triple'])
  for (const finished of [lost, won]) {
    const reset = beginAscent(finished.seed, 'face')
    assert.equal(reset.fight, 1)
    assert.equal(reset.perk, 'face')
    assert.equal(reset.battle.perk, 'face')
    assert.equal(reset.battle.playerHp, PLAYER_HP)
    assert.deepEqual(reset.unlocks, [])
    assert.equal(reset.newUnlock, null)
    assert.equal(reset.battle.dice.length, 3)
    assert.equal(reset.battle.extraRerollAvailable, false)
  }
})
