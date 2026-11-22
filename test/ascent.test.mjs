import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ASCENT_ENEMIES, beginAscent, FIGHT_COUNT, nextAscentFight, resolveAscentTurn } from '../src/ascent.ts'
import { assignDie, COUNTER_REWARDS, draw, incomingAttack, intentOf, PLAYER_HP, roll } from '../src/combat.ts'
import { offerPerks, START_PERKS } from '../src/perks.ts'
import {
  forecastYacht, rerollYachtDice, resolveYachtTurn, spendExtraReroll, spinYachtCounter,
  startYachtBattle, yachtCounterRewards, yachtRerollCost,
} from '../src/yacht-combat.ts'
import { playAscent } from '../exp/level.mjs'

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

test('devil rolls repeat each cost three times, boost paid batches, and reset each turn', () => {
  let battle = startYachtBattle(42, PLAYER_HP, true, true, 'reroll')
  assert.equal(yachtRerollCost(battle), 0)
  battle = rerollYachtDice(battle, [0, 1, 2, 3])
  assert.deepEqual(battle.dice, [3, 6, 7, 9].map((channel) => roll(42, 1, channel)))
  assert.deepEqual(battle.devilBoostedDice, [])
  assert.equal(battle.playerHp, PLAYER_HP)
  const partial = rerollYachtDice(rerollYachtDice(battle, [0, 1]), [1])
  assert.deepEqual(partial.devilBoostedDice, [0, 1])
  assert.deepEqual(spendExtraReroll(partial, 0).devilBoostedDice, [1])
  for (const [paidIndex, cost] of [1, 1, 1, 2, 2, 2].entries()) {
    const hp = battle.playerHp
    assert.equal(yachtRerollCost(battle), cost)
    battle = rerollYachtDice(battle, [0, 1, 2, 3])
    const firstChannel = 11 + 4 * paidIndex
    const rolls = [0, 1, 2, 3].map((index) => roll(42, 1, firstChannel + index))
    assert.deepEqual(battle.dice, rolls.map((face) => Math.min(6, face + 1)))
    assert.deepEqual([...battle.devilBoostedDice].sort(), rolls.flatMap((face, index) => face < 6 ? [index] : []))
    assert.equal(battle.playerHp, hp - cost)
  }
  battle = spendExtraReroll(battle, 3)
  assert.equal(battle.dice[3], roll(42, 1, 10))
  assert.equal(battle.playerHp, PLAYER_HP - 9)
  assert.equal(yachtRerollCost(battle), 3)
  const next = resolveYachtTurn({ ...battle, dice: [1, 1, 1, 1], slots: [...allAttack, 'attack'] }).battle
  assert.equal(next.turn, 2)
  assert.deepEqual(next.devilBoostedDice, [])
  assert.equal(yachtRerollCost(next), 0)
  assert.equal(yachtRerollCost(rerollYachtDice(next, [0])), 1)
  assert.equal(next.extraRerollAvailable, false)
  const guarding = resolveYachtTurn({ ...battle, dice: [6, 6, 1, 1], slots: ['guard', 'guard', 'attack', 'attack'] }).battle
  assert.equal(guarding.phase, 'counter')
  const afterCounter = spinYachtCounter(guarding)
  assert.equal(yachtRerollCost(afterCounter), 0)
  assert.deepEqual(afterCounter.devilBoostedDice, [])
})

test('a paid reroll requires more HP than its cost and the other perks have one free batch', () => {
  const start = startYachtBattle(42, 6, false, false, 'reroll')
  const basic = rerollYachtDice(start, [0])
  let paid = basic
  for (let roll = 0; roll < 3; roll++) paid = rerollYachtDice(paid, [0])
  for (const hp of [1, 2]) {
    const low = { ...paid, playerHp: hp }
    assert.equal(yachtRerollCost(low), 2)
    assert.equal(rerollYachtDice(low, [0]), low)
  }
  assert.equal(rerollYachtDice(paid, [0]).playerHp, 1)
  for (const indices of [[], [-1], [3], [0.5]]) assert.equal(rerollYachtDice(paid, indices), paid)
  const ordinary = rerollYachtDice(startYachtBattle(42, 1, false, false, 'face'), [0])
  assert.equal(ordinary.playerHp, 1)
  assert.equal(yachtRerollCost(ordinary), null)
  assert.equal(rerollYachtDice(ordinary, [0]), ordinary)
})

test('a no-perk ascent starts at base health and carries no perk into the next fight', () => {
  const ascent = beginAscent(42)
  assert.equal(ascent.maxHp, PLAYER_HP)
  assert.equal(ascent.battle.playerHp, PLAYER_HP)
  const won = play(ascent, [1, 2, 2], allAttack, { enemyHp: 5, playerHp: PLAYER_HP - 3 })
  const next = nextAscentFight(won)
  assert.equal(next.fight, 2)
  assert.equal(next.battle.playerHp, PLAYER_HP - 3)
  assert.equal(next.battle.perk, undefined)
  assert.equal(yachtRerollCost(rerollYachtDice(next.battle, [0])), null)
})

test('the face perk replaces rolled ones only on the first die', () => {
  const seed = 1042
  const normal = startYachtBattle(seed, PLAYER_HP, false, false)
  const marked = startYachtBattle(seed, PLAYER_HP, false, false, 'face')
  assert.deepEqual(normal.dice.slice(0, 2), [1, 1])
  assert.deepEqual(marked.dice, [5, 1, normal.dice[2]])
  assert.deepEqual(rerollYachtDice(marked, [0, 1]).dice, [5, 1, normal.dice[2]])
})

test('the exact pair guard perk adds four roulette segments worth 23 each', () => {
  const seed = seeds.find((value) => draw(value, 1, 4) % 10 === 7)
  const start = startYachtBattle(seed, PLAYER_HP, false, false, 'pair')
  const paired = resolveYachtTurn({ ...start, dice: [6, 6, 1], slots: ['guard', 'guard', 'attack'] }).battle
  assert.equal(paired.phase, 'counter')
  assert.deepEqual(yachtCounterRewards(paired).map(({ damage }) => damage), [1, 2, 3, 4, 23, 23, 23, 23, 6, 8])
  assert.deepEqual(spinYachtCounter(paired).lastExchange.counter, { slot: 7, damage: 23, joint: false })
  const tripleGuard = resolveYachtTurn({ ...start, dice: [4, 4, 4], slots: allGuard }).battle
  assert.equal(tripleGuard.phase, 'counter')
  assert.equal(yachtCounterRewards(tripleGuard), COUNTER_REWARDS)
  const undershot = resolveYachtTurn({ ...start, dice: [5, 5, 1], slots: ['guard', 'guard', 'attack'] }).battle
  assert.equal(undershot.phase, 'assign')
  assert.equal(yachtCounterRewards(undershot), COUNTER_REWARDS)
})

test('the attack perk adds two only to an attack on the first turn of each fight', () => {
  const ascent = beginAscent(42, 'attack')
  assert.equal(forecastYacht(ascent.battle, allGuard).dealt, 0)
  const first = play(ascent, [1, 2, 3], ['attack', 'guard', 'guard'])
  assert.equal(first.battle.lastExchange.dealt, 3)
  const secondTurn = play(first, [1, 2, 3], ['attack', 'guard', 'guard'])
  assert.equal(secondTurn.battle.lastExchange.dealt, 1)
  const next = nextAscentFight(play(ascent, [1, 2, 3], allAttack, { enemyHp: 7 }))
  assert.equal(next.fight, 2)
  assert.equal(play(next, [1, 2, 3], ['attack', 'guard', 'guard']).battle.lastExchange.dealt, 3)
})

test('the wheel perk replaces the one-damage regular segment with nine', () => {
  const seed = seeds.find((value) => draw(value, 1, 4) % 6 === 0)
  const start = startYachtBattle(seed, PLAYER_HP, false, false, 'wheel')
  const counter = resolveYachtTurn({ ...start, dice: [4, 4, 4], slots: allGuard }).battle
  assert.deepEqual(yachtCounterRewards(counter), [{ damage: 9, joint: false }, ...COUNTER_REWARDS.slice(1)])
  assert.deepEqual(spinYachtCounter(counter).lastExchange.counter, { slot: 0, damage: 9, joint: false })
})

test('the health perk adds two once and the next fight starts with the carried health', () => {
  const start = beginAscent(42, 'health')
  assert.equal(start.maxHp, PLAYER_HP + 2)
  assert.equal(start.battle.playerHp, start.maxHp)
  const damaged = play(start, [1, 4, 5], ['attack', 'guard', 'guard'])
  const won = play(damaged, [1, 1, 1], allAttack, { enemyHp: 3 })
  const next = nextAscentFight(won)
  assert.equal(next.battle.playerHp, start.maxHp - Math.max(0, incomingAttack(start.battle).totalDamage - 9))
  assert.equal(next.maxHp, start.maxHp)
  assert.equal(next.perk, 'health')
})

test('three fights use their own enemy table and carry health without recovery', () => {
  let ascent = beginAscent(42, 'wheel')
  for (let fight = 1; fight <= FIGHT_COUNT; fight++) {
    assert.equal(ascent.fight, fight)
    assert.equal(ascent.battle.playerHp, PLAYER_HP - (fight - 1) * 3)
    assert.equal(ascent.battle.enemyHp, ASCENT_ENEMIES[fight - 1].hp)
    assert.equal(ascent.battle.enemyIntents, ASCENT_ENEMIES[fight - 1].intents)
    assert.equal(ascent.battle.enemyAttackBuff, 0)
    assert.equal(nextAscentFight(ascent), ascent)
    const won = play(ascent, [1, 2, 2], allAttack, { enemyHp: 5, playerHp: ascent.battle.playerHp - 3 })
    assert.equal(won.battle.phase, 'won')
    assert.equal(won.battle.playerHp, PLAYER_HP - fight * 3)
    ascent = nextAscentFight(won)
    if (fight === FIGHT_COUNT) assert.equal(ascent, won)
  }
})

test('exact-defense hands take effect on the next planning turn without buffing the current enemy', () => {
  const start = beginAscent(42, 'wheel')
  const comboTurn = play(start, [5, 6, 6], allGuard)
  const triple = play(comboTurn, [4, 4, 4], allGuard)
  assert.equal(triple.newUnlock, 'triple')
  assert.equal(triple.battle.phase, 'counter')
  assert.equal(triple.battle.dice.length, 3)
  assert.equal(triple.battle.enemyAttackBuff, 0)
  const fourth = spin(triple)
  assert.equal(fourth.battle.dice.length, 4)
  assert.equal(fourth.battle.dice[3], roll(42, 3, 8))
  assert.equal(fourth.battle.slots[3], null)
  const nextComboTurn = play(fourth, [4, 5, 5, 6], [...allGuard, 'guard'])
  const straight = play(nextComboTurn, [3, 4, 5, 1], [...allGuard, 'attack'])
  assert.equal(straight.newUnlock, 'straight')
  assert.equal(straight.battle.extraRerollAvailable, true)
  assert.deepEqual(incomingAttack(straight.battle).hits, [4, 4, 4])
  const planning = spin(straight)
  const spent = spendExtraReroll(rerollYachtDice(planning.battle, [0]), 0)
  const won = play({ ...planning, battle: spent }, [4, 4, 4, 1], [...allAttack, 'guard'], { enemyHp: 12 })
  assert.equal(won.newUnlock, null)
  assert.equal(won.battle.extraRerollAvailable, false)
  const next = nextAscentFight(won)
  assert.deepEqual(next.unlocks, ['triple', 'straight'])
  assert.equal(next.battle.dice.length, 4)
  assert.equal(next.battle.extraRerollAvailable, true)
  assert.equal(next.battle.enemyAttackBuff, 2)
  assert.equal(assignDie(next.battle, 3, 'guard').slots[3], 'guard')
  const used = spendExtraReroll(rerollYachtDice(next.battle, [3]), 3)
  const final = nextAscentFight(play({ ...next, battle: used }, [6, 6, 6, 6], [...allAttack, 'attack'], { enemyHp: 24 }))
  assert.equal(final.fight, 3)
  assert.equal(final.battle.dice.length, 4)
  assert.equal(final.battle.extraRerollAvailable, true)
  assert.equal(final.battle.enemyAttackBuff, 2)
})

test('an attack hand can add a die during battle and only the next enemy gains the unlock buff', () => {
  const start = beginAscent(42, 'wheel')
  const unlocked = play(start, [4, 4, 4], allAttack)
  assert.equal(unlocked.battle.dice.length, 4)
  assert.equal(unlocked.battle.enemyAttackBuff, 0)
  assert.deepEqual(incomingAttack(unlocked.battle).hits, [4, 4, 4])
  const second = nextAscentFight(play(unlocked, [4, 4, 4, 4], [...allAttack, 'attack'], { enemyHp: 1 }))
  assert.equal(second.battle.enemyAttackBuff, 1)
  const fourthTurn = { ...second.battle, turn: 4 }
  const critical = ASCENT_ENEMIES[1].intents.find((row) => row.id === 'critical')
  assert.equal(intentOf(fourthTurn), critical.id)
  assert.deepEqual(incomingAttack(fourthTurn).hits, critical.hits.map((hit) => hit + 1))
  const won = play(second, [1, 2, 3, 4], [...allAttack, 'guard'], { enemyHp: 1 })
  assert.equal(won.newUnlock, 'straight')
  assert.equal(won.battle.enemyAttackBuff, 1)
  const boss = nextAscentFight(won).battle
  assert.equal(boss.enemyAttackBuff, 2)
  const { intents, attackGrowth } = ASCENT_ENEMIES[2]
  for (const turn of [1, 2, 3, 4, 5, 6]) {
    const battle = { ...boss, turn }
    const row = intents.find((entry) => entry.matches(turn))
    assert.equal(intentOf(battle), row.id)
    assert.deepEqual(incomingAttack(battle).hits, row.hits.map((hit) => hit + 2 + (turn - 1) * attackGrowth))
  }
})

test('the same seed and perk produce the same ascent and reroll costs', () => {
  for (const seed of [0, 42, 511]) {
    for (const variant of ['devil', 'free-per-fight']) {
      assert.deepEqual(playAscent(seed, 'reroll', variant), playAscent(seed, 'reroll', variant))
    }
  }
})

test('replaying the same seed reproduces the entire three-fight ascent through boss knockdown', () => {
  function replay() {
    const turns = []
    const result = playAscent(249, 'health', 'devil', (fight, planning, resolved) => {
      turns.push({ fight, planning, resolved })
    })
    return { result, turns }
  }

  const first = replay()
  assert.equal(first.result.wins, FIGHT_COUNT)
  assert.deepEqual(first.result.fightTurns, [2, 4, 4])
  const bossTurns = first.turns.filter(({ fight }) => fight === 3)
  assert.deepEqual(bossTurns.map(({ planning }) => intentOf(planning)), ['combo', 'charge', 'critical', 'knockdown'])
  assert.ok(bossTurns[2].resolved.battle.lastExchange.counter)
  assert.equal(first.turns.at(-1).resolved.battle.phase, 'won')
  assert.deepEqual(replay(), first)
})

test('each charged strike is at least three damage above any other intent after unlock scaling', () => {
  for (const [enemy, period] of [[ASCENT_ENEMIES[1], 4], [ASCENT_ENEMIES[2], 5]]) {
    for (const unlocks of [0, 1, 2]) {
      const start = startYachtBattle(42, PLAYER_HP, false, false, undefined, enemy, unlocks)
      const turns = Array.from({ length: period }, (_, index) => ({ ...start, turn: index + 1 }))
      const critical = turns.find((battle) => intentOf(battle) === 'critical')
      const otherDamage = turns.filter((battle) => battle !== critical).map((battle) => incomingAttack(battle).totalDamage)
      assert.ok(incomingAttack(critical).totalDamage >= Math.max(...otherDamage) + 3)
    }
  }
})

test('both charged strikes remain exactly guardable with three dice at every unlock count', () => {
  const faces = [1, 2, 3, 4, 5, 6]
  const rolls = faces.flatMap((first) => faces.flatMap((second) => faces.map((third) => [first, second, third])))
  for (const [enemy, turn] of [[ASCENT_ENEMIES[1], 4], [ASCENT_ENEMIES[2], 3]]) {
    for (const unlocks of [0, 1, 2]) {
      const start = startYachtBattle(42, PLAYER_HP, false, false, undefined, enemy, unlocks)
      const critical = { ...start, turn }
      assert.equal(intentOf(critical), 'critical')
      const { totalDamage } = incomingAttack(critical)
      assert.ok(totalDamage <= 24 && totalDamage < PLAYER_HP)
      const dice = rolls.find((roll) => roll[0] + roll[1] + roll[2] === totalDamage)
      assert.ok(dice, `No three-die exact guard for ${totalDamage} damage with ${unlocks} unlocks`)
      const { battle } = resolveYachtTurn({ ...critical, dice, slots: allGuard })
      assert.equal(battle.phase, 'counter')
      assert.equal(battle.playerHp, PLAYER_HP)
    }
  }
})

test('the second enemy and boss charge without dealing damage or opening a roulette', () => {
  for (const [enemy, turn] of [[ASCENT_ENEMIES[1], 3], [ASCENT_ENEMIES[2], 2]]) {
    const start = startYachtBattle(42, PLAYER_HP, false, false, undefined, enemy, 1)
    const charge = { ...start, turn, dice: [2, 3, 4], slots: allAttack }
    assert.equal(intentOf(charge), 'charge')
    assert.deepEqual(incomingAttack(charge).hits, [])
    assert.equal(intentOf({ ...charge, turn: turn + 1 }), 'critical')
    const { battle } = resolveYachtTurn(charge)
    assert.equal(battle.phase, 'assign')
    assert.equal(battle.turn, turn + 1)
    assert.equal(battle.playerHp, PLAYER_HP)
    assert.equal(battle.lastExchange.dealt, 9)
    assert.deepEqual(battle.lastExchange.hitsTaken, [])
  }
})

test('the boss takes multiplied attack damage during knockdown and skips its attack', () => {
  const enemy = ASCENT_ENEMIES[2]
  const start = startYachtBattle(42, PLAYER_HP, false, false, undefined, enemy, 1)
  const knockdown = { ...start, turn: 4, dice: [2, 3, 4], slots: allAttack }
  assert.equal(intentOf(knockdown), 'knockdown')
  assert.equal(forecastYacht(knockdown, allGuard).dealt, 0)
  const { battle } = resolveYachtTurn(knockdown)
  assert.equal(battle.phase, 'assign')
  assert.equal(battle.enemyHp, start.enemyHp - Math.floor(9 * enemy.intents[3].damageTakenMultiplier))
  assert.equal(battle.playerHp, PLAYER_HP)
  assert.deepEqual(battle.lastExchange.hitsTaken, [])
})

test('exact guard on a boss critical opens the seeded roulette before knockdown', () => {
  const enemy = ASCENT_ENEMIES[2]
  const start = startYachtBattle(42, PLAYER_HP, true, false, undefined, enemy, 1)
  const critical = { ...start, turn: 3 }
  const { totalDamage } = incomingAttack(critical)
  const guard = [6, 6, 6, 6].map((face, index) => Math.max(0, Math.min(face, totalDamage - 6 * index)))
  const slots = guard.map((face) => face ? 'guard' : 'attack')
  const dice = guard.map((face) => face || 1)
  const { battle } = resolveYachtTurn({ ...critical, dice, slots })
  assert.equal(intentOf(critical), 'critical')
  assert.equal(battle.phase, 'counter')
  assert.equal(battle.playerHp, PLAYER_HP)
  const next = spinYachtCounter(battle)
  const slot = draw(42, 3, 4) % COUNTER_REWARDS.length
  assert.deepEqual(next.lastExchange.counter, { slot, ...COUNTER_REWARDS[slot] })
  assert.equal(intentOf(next), 'knockdown')
  assert.deepEqual(spinYachtCounter(battle), next)
})

test('a fresh ascent after victory or defeat starts with only the new perk', () => {
  const start = beginAscent(42, 'health')
  const unlocked = play(start, [4, 4, 4], allAttack)
  const lost = play(unlocked, [1, 1, 2, 1], [...allAttack, 'attack'], { playerHp: 1, awakened: true })
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
