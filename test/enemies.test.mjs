import assert from 'node:assert/strict'
import { test } from 'node:test'
import { beginAscent, nextAscentFight } from '../src/ascent.ts'
import { assignDie, chargedStrikePreview, draw, enemyIntentAt, incomingAttack, PLAYER_HP, roll } from '../src/combat.ts'
import { ASCENT_ENEMIES, enemyForFight } from '../src/enemy-roster.ts'
import {
  forecastYacht, rerollYachtDice, resolveYachtTurn, spendExtraReroll, spinYachtCounter, startYachtBattle,
} from '../src/yacht-combat.ts'
import { chooseAllocation } from '../src/yacht-policy.ts'

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
  const counter = resolve(lockedMove, [3, 3, 4], guard)
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

test('vitality has a minimum of four and still scales with current health', () => {
  const battle = start('vitality', { turn: 2, playerHp: 19, enemyAttackBuff: 4 })
  assert.equal(incomingAttack(battle).totalDamage, 4)
  assert.equal(incomingAttack({ ...battle, playerHp: 20 }).totalDamage, 5)
  assert.equal(incomingAttack({ ...battle, playerHp: 24 }).totalDamage, 6)
  assert.equal(incomingAttack({ ...battle, playerHp: 1 }).totalDamage, 4)
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
  const counterSeed = Array.from({ length: 20 }, (_, seed) => seed).find((seed) => draw(seed, 4, 4) % 6 === 5)
  const battle = start('escort', { seed: counterSeed, turn: 2, fourthDieUnlocked: true })
  const stolen = resolve(battle, [1, 1, 1], attack)
  assert.equal(stolen.stolenDie.remaining, 10)
  assert.deepEqual(stolen.dice, [roll(counterSeed, 3, 0), roll(counterSeed, 3, 1), roll(counterSeed, 3, 8)])
  const critical = resolve(stolen, [3, 3, 2], ['guard', 'guard', 'attack'])
  const counter = resolve(critical, [6, 5, 3], guard)
  assert.equal(counter.phase, 'counter')
  assert.equal(counter.stolenDie.remaining, 8)
  const returned = spinYachtCounter(counter)
  assert.equal(returned.stolenDie, undefined)
  assert.deepEqual(returned.dice, [0, 1, 2, 8].map((channel) => roll(counterSeed, 5, channel)))
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
  const damage = split.lastExchange.hitsTaken.reduce((sum, hit) => sum + hit, 0)
  assert.equal(damage, incomingAttack({ ...escorted, escort: undefined }).totalDamage - 6)
})

test('the charging elite and boss halve the next critical at exactly twelve attack', () => {
  for (const [id, turn, normal] of [['vitality', 3, 15], ['escort', 3, 15], ['boss', 2, 17]]) {
    const battle = start(id, { turn, enemyAttackBuff: 1, dice: [6, 5, 1] })
    const almost = assignDie(assignDie(battle, 0, 'attack'), 1, 'attack')
    assert.equal(chargedStrikePreview(almost).totalDamage, normal)
    const broken = assignDie(almost, 2, 'attack')
    assert.equal(chargedStrikePreview(broken).threshold, 12)
    assert.equal(chargedStrikePreview(broken).totalDamage, Math.floor(normal / 2))
    assert.equal(chargedStrikePreview(assignDie(broken, 2, null)).totalDamage, normal)
    const { battle: critical } = resolveYachtTurn(broken)
    assert.equal(critical.lastExchange.chargeBroken, true)
    assert.equal(incomingAttack(critical).totalDamage, Math.floor(normal / 2))
  }
})

test('an attack of eleven or damage aimed at the escort leaves the next critical at full strength', () => {
  const boss = start('boss', { turn: 2 })
  const full = resolve(boss, [5, 4, 2], attack)
  assert.equal(full.lastExchange.chargeBroken, undefined)
  assert.equal(incomingAttack(full).totalDamage, 16)
  const elite = start('escort', { turn: 3, escort: { hp: 5, bonus: 3 } })
  const split = resolve(elite, [6, 4, 2], ['escort', 'attack', 'attack'])
  assert.equal(split.lastExchange.chargeBroken, undefined)
  assert.equal(incomingAttack(split).totalDamage, 14)
})

test('matching the weakened critical exactly opens one roulette and the weakening then expires', () => {
  const boss = start('boss', { turn: 2, enemyAttackBuff: 1 })
  const critical = resolve(boss, [6, 5, 4], attack)
  const missed = resolve(critical, [6, 6, 5], guard)
  assert.equal(missed.phase, 'assign')
  const matched = resolve(critical, [3, 3, 2], guard)
  assert.equal(matched.playerHp, boss.playerHp)
  assert.equal(matched.phase, 'counter')
  assert.equal(matched.weakenedStrikeTurn, undefined)
  const next = spinYachtCounter(matched)
  assert.equal(enemyIntentAt(next).id, 'knockdown')
  assert.ok(next.lastExchange.counter)
  assert.equal(spinYachtCounter(next), next)
})

test('the reaction elite cycles through its alternative attack, then a combo and a full critical without charging', () => {
  const battle = start('reaction')
  const turns = Array.from({ length: 8 }, (_, index) => ({ ...battle, turn: index + 1 }))
  assert.ok(turns.every((turn) => chargedStrikePreview(turn) === null))
  assert.deepEqual(turns.slice(0, 4).map((turn) => enemyIntentAt(turn).id), ['impact', 'impact', 'combo', 'critical'])
  assert.equal(incomingAttack(turns[3]).totalDamage, 14)
})

test('guard-first takes the closest sufficient shield and sends only the remaining dice to attack', () => {
  const battle = start('lock', { dice: [2, 5, 6] })
  assert.deepEqual(chooseAllocation(battle, 'guardFirst'), ['guard', 'attack', 'guard'])
  assert.deepEqual(chooseAllocation({ ...battle, dice: [1, 1, 4] }, 'guardFirst'), guard)
})

test('escort dice do not grant a hand unlock', () => {
  const battle = start('escort', { turn: 3, escort: { hp: 5, bonus: 3 }, dice: [4, 4, 4], slots: ['escort', 'escort', 'escort'] })
  assert.equal(resolveYachtTurn(battle).hand, null)
})
