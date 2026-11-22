import assert from 'node:assert/strict'
import { test } from 'node:test'
import { beginAscent, nextAscentFight } from '../src/ascent.ts'
import { assignDie, draw, enemyIntentAt, incomingAttack, PLAYER_HP, roll } from '../src/combat.ts'
import { ASCENT_ENEMIES, enemyForFight } from '../src/enemy-roster.ts'
import {
  forecastYacht, rerollYachtDice, resolveYachtTurn, spendExtraReroll, spinYachtCounter, startYachtBattle,
} from '../src/yacht-combat.ts'

const attack = ['attack', 'attack', 'attack']
const guard = ['guard', 'guard', 'guard']
const seed = 42

function start(id, changes = {}) {
  const enemy = ASCENT_ENEMIES.flat().find((candidate) => candidate.id === id)
  return { ...startYachtBattle(seed, PLAYER_HP, false, false, undefined, enemy), awakened: true, ...changes }
}

function resolve(battle, dice, slots) {
  return resolveYachtTurn({ ...battle, dice, slots }).battle
}

test('a seed fixes all three encounters independently of the perk and reaches all twelve roster pairs', () => {
  const pairs = new Set()
  for (let seed = 0; seed < 512; seed++) {
    const first = beginAscent(seed, 'attack')
    const second = beginAscent(seed, 'health')
    const advance = (run) => nextAscentFight({ ...run, battle: { ...run.battle, phase: 'won' } })
    assert.equal(first.enemy, second.enemy)
    assert.equal(advance(first).enemy, advance(second).enemy)
    assert.equal(advance(advance(first)).enemy.id, 'boss')
    pairs.add([first.enemy.id, enemyForFight(seed, 2).id].join('/'))
  }
  assert.equal(pairs.size, 12)
})

test('thorns ignore guard and count attack dice even on a finishing blow', () => {
  const battle = start('thorns', { turn: 2, playerHp: 4, enemyHp: 6 })
  const result = forecastYacht(battle, ['attack', 'attack', 'guard'], [2, 4, 6])
  assert.equal(result.dealt, 6)
  assert.deepEqual(result.hits, [4])
  assert.equal(resolve(battle, [2, 4, 6], ['attack', 'attack', 'guard']).phase, 'lost')
  assert.equal(forecastYacht(battle, guard, [2, 4, 6]).damage, 0)
})

test('lock marks precisely the lowest opening die after counter and lasts one turn', () => {
  const lockedMove = start('lock', { turn: 2 })
  const counter = resolve(lockedMove, [3, 3, 3], guard)
  assert.equal(counter.phase, 'counter')
  const locked = spinYachtCounter(counter)
  assert.deepEqual(locked.fixedDie, { kind: 'lock', index: locked.dice.indexOf(Math.min(...locked.dice)) })
  assert.equal(rerollYachtDice(locked, [locked.fixedDie.index]), locked)
  const moved = assignDie(locked, locked.fixedDie.index, 'guard')
  assert.equal(moved.slots[locked.fixedDie.index], 'guard')
  const next = resolve(locked, [3, 3, 3], guard)
  assert.equal(next.fixedDie, undefined)
})

test('freeze fixes a 1 even with the face perk and blocks free, paid and unlocked rerolls', () => {
  const battle = start('freeze', { turn: 2, perk: 'face', extraRerollAvailable: true })
  const frozen = resolve(battle, [4, 4, 4], attack)
  const { index } = frozen.fixedDie
  assert.equal(frozen.dice[index], 1)
  assert.equal(rerollYachtDice(frozen, [index]), frozen)
  const rerolled = rerollYachtDice(frozen, [0])
  assert.equal(spendExtraReroll(rerolled, index), rerolled)
  const paid = { ...rerolled, perk: 'reroll' }
  assert.equal(rerollYachtDice(paid, [index]), paid)
  assert.equal(forecastYacht(frozen, frozen.dice.map((_, die) => die === index ? 'attack' : 'guard')).dealt, 1)
})

test('rage adds two to the attack as a whole on any reroll and resets next turn', () => {
  const battle = start('rage', { turn: 2, perk: 'reroll' })
  const first = rerollYachtDice(battle, [0])
  const paid = rerollYachtDice(first, [0])
  assert.equal(incomingAttack(first).totalDamage, incomingAttack(battle).totalDamage + 2)
  assert.equal(incomingAttack(paid).totalDamage, incomingAttack(first).totalDamage)
  assert.equal(incomingAttack(resolve(first, [5, 6, 6], guard)).totalDamage, 13)
})

test('reaction swaps the attack at the visible sum, using the new hits for exact guard', () => {
  const battle = start('reaction', { turn: 2, dice: [4, 4, 6] })
  const below = { ...battle, slots: ['attack', 'guard', 'guard'] }
  const atThreshold = { ...battle, slots: ['attack', 'attack', 'guard'] }
  assert.equal(incomingAttack(below).totalDamage, 13)
  assert.deepEqual(incomingAttack(atThreshold).hits, [3, 3])
  assert.equal(resolveYachtTurn(atThreshold).battle.phase, 'counter')
})

test('vitality starts from current player health and rounds down without unlock scaling', () => {
  const battle = start('vitality', { turn: 2, playerHp: 19, enemyAttackBuff: 4 })
  assert.equal(incomingAttack(battle).totalDamage, 3)
  assert.equal(incomingAttack({ ...battle, playerHp: 20 }).totalDamage, 4)
  assert.equal(incomingAttack({ ...battle, playerHp: 4 }).totalDamage, 0)
})

test('seal applies only on the boss turn after knockdown and blocks sums and sealed hands', () => {
  const battle = start('boss', { turn: 4 })
  assert.equal(enemyIntentAt(battle).id, 'knockdown')
  const sealed = resolve(battle, [1, 1, 1], attack)
  assert.equal(sealed.turn, 5)
  assert.equal(forecastYacht(sealed, attack, [5, 2, 3]).dealt, 5)
  assert.equal(forecastYacht(sealed, guard, [5, 6, 6]).counter, true)
  assert.equal(resolveYachtTurn({ ...sealed, dice: [5, 5, 5], slots: attack }).hand, null)
  assert.equal(rerollYachtDice({ ...sealed, dice: [5, 5, 5] }, [0]).rerolled, true)
  assert.equal(enemyIntentAt(resolve(sealed, [4, 3, 4], guard)).mechanic, undefined)
})

test('theft takes a base die and returns it after cumulative attack and counter damage', () => {
  const counterSeed = Array.from({ length: 20 }, (_, seed) => seed).find((seed) => draw(seed, 3, 4) % 6 === 5)
  const battle = start('escort', { seed: counterSeed, turn: 2, fourthDieUnlocked: true })
  const stolen = resolve(battle, [1, 1, 1], attack)
  assert.equal(stolen.stolenDie.remaining, 10)
  assert.deepEqual(stolen.dice, [roll(counterSeed, 3, 0), roll(counterSeed, 3, 1), roll(counterSeed, 3, 8)])
  const counter = resolve(stolen, [3, 3, 2], ['guard', 'guard', 'attack'])
  assert.equal(counter.phase, 'counter')
  assert.equal(counter.stolenDie.remaining, 8)
  const returned = spinYachtCounter(counter)
  assert.equal(returned.stolenDie, undefined)
  assert.deepEqual(returned.dice, [0, 1, 2, 8].map((channel) => roll(counterSeed, 4, channel)))
  assert.equal(resolve(battle, [6, 6, 6], attack).stolenDie.remaining, 10)
})

test('escort damage is independent of main damage and removing it cancels its attack bonus immediately', () => {
  const battle = start('escort')
  assert.equal(assignDie(battle, 0, 'escort'), battle)
  const escorted = resolve(battle, [1, 1, 1], attack)
  assert.equal(escorted.escort.hp, 5)
  assert.equal(incomingAttack(escorted).totalDamage, incomingAttack({ ...escorted, escort: undefined }).totalDamage + 3)
  const split = resolve(escorted, [5, 3, 6], ['escort', 'attack', 'guard'])
  assert.equal(split.escort, undefined)
  assert.equal(split.lastExchange.escortDealt, 5)
  assert.equal(split.lastExchange.dealt, 3)
  assert.equal(split.lastExchange.hitsTaken[0], incomingAttack({ ...escorted, escort: undefined }).totalDamage - 6)
})
