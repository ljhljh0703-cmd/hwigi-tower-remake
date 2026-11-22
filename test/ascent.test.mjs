import assert from 'node:assert/strict'
import { test } from 'node:test'
import { beginAscent, FIGHT_COUNT, nextAscentFight, resolveAscentTurn } from '../src/ascent.ts'
import { ASCENT_ENEMIES, enemyForFight } from '../src/enemy-roster.ts'
import { assignDie, COUNTER_REWARDS, draw, ENEMY_INTENTS, incomingAttack, intentOf, PLAYER_HP, roll } from '../src/combat.ts'
import { collectorBonus, offerPerks, pickOfferedPerk, startPerk, START_PERKS } from '../src/perks.ts'
import {
  forecastYacht, rerollYachtDice, resolveYachtTurn, spendExtraReroll, spinYachtCounter,
  startYachtBattle, yachtCounterRewards, yachtRerollCost,
} from '../src/yacht-combat.ts'
import { playAscent } from '../exp/level.mjs'

const seeds = Array.from({ length: 512 }, (_, seed) => seed)
const allAttack = ['attack', 'attack', 'attack']
const allGuard = ['guard', 'guard', 'guard']
const [boss] = ASCENT_ENEMIES[2]

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

test('the weighted picker selects only offered perks and follows completion weights', () => {
  const counts = { shield: 0, blade: 0, collector: 0 }
  const weights = { shield: 1, blade: 2, collector: 4 }
  for (let seed = 0; seed < 16384; seed++) {
    const offers = offerPerks(seed)
    if (!offers.every((perk) => perk in weights)) continue
    const perk = pickOfferedPerk(seed, (candidate) => weights[candidate])
    assert.ok(offers.includes(perk))
    counts[perk]++
    assert.equal(pickOfferedPerk(seed, (candidate) => Number(candidate === 'blade')), 'blade')
  }
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
  for (const [perk, weight] of Object.entries(weights)) {
    assert.ok(Math.abs(counts[perk] / total - weight / 7) < 0.04)
  }
  assert.ok(offerPerks(42).includes(pickOfferedPerk(42, () => 0)))
})

test('the devil offers one unboosted paid batch per turn independent of the unlocked roll', () => {
  const perk = startPerk('reroll')
  let battle = startYachtBattle(42, PLAYER_HP, true, true, perk)
  assert.equal(yachtRerollCost(battle), 0)
  battle = rerollYachtDice(battle, [0, 1, 2, 3])
  assert.deepEqual(battle.dice, [3, 6, 7, 9].map((channel) => roll(42, 1, channel)))
  assert.equal(battle.playerHp, PLAYER_HP)
  assert.equal(yachtRerollCost(battle), 1)
  battle = rerollYachtDice(battle, [0, 1, 2, 3])
  assert.deepEqual(battle.dice, [11, 12, 13, 14].map((channel) => roll(42, 1, channel)))
  assert.equal(battle.playerHp, PLAYER_HP - 1)
  assert.equal(yachtRerollCost(battle), null)
  assert.equal(rerollYachtDice(battle, [0]), battle)
  battle = spendExtraReroll(battle, 3)
  assert.equal(battle.dice[3], roll(42, 1, 10))
  assert.equal(battle.playerHp, PLAYER_HP - 1)

  const next = resolveYachtTurn({ ...battle, dice: [1, 1, 1, 1], slots: [...allAttack, 'attack'] }).battle
  assert.equal(next.turn, 2)
  assert.equal(yachtRerollCost(next), 0)
  assert.equal(yachtRerollCost(rerollYachtDice(next, [0])), 1)
  assert.equal(next.extraRerollAvailable, false)
  const guarding = resolveYachtTurn({ ...battle, dice: [6, 6, 1, 1], slots: ['guard', 'guard', 'attack', 'attack'] }).battle
  assert.equal(guarding.phase, 'counter')
  const afterCounter = spinYachtCounter(guarding)
  assert.equal(yachtRerollCost(afterCounter), 0)
  assert.equal(afterCounter.paidRerollSpent, undefined)
})

test('the paid reroll cannot spend the last HP or an invalid or fixed die', () => {
  const start = beginAscent(42, 'reroll').battle
  const basic = rerollYachtDice(start, [0])
  const low = { ...basic, playerHp: 1 }
  assert.equal(yachtRerollCost(low), 1)
  assert.equal(rerollYachtDice(low, [0]), low)
  for (const indices of [[], [-1], [3], [0.5]]) assert.equal(rerollYachtDice(basic, indices), basic)
  const fixed = { ...basic, fixedDie: { index: 0, kind: 'freeze' } }
  assert.equal(rerollYachtDice(fixed, [0, 1]), fixed)
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

test('shield savings add attack after exact guards, persist between fights, and reset on a miss', () => {
  const step = START_PERKS.shield.step
  const start = beginAscent(42, 'shield')
  const first = play(start, [6, 6, 1], ['guard', 'guard', 'attack'], {
    enemyIntents: ENEMY_INTENTS, enemyAttackGrowth: 0, enemyHp: 60,
  })
  assert.equal(first.battle.phase, 'counter')
  assert.equal(first.battle.perk.bonus, step)
  assert.equal(first.battle.lastExchange.dealt, 1)
  const second = play(spin(first), [6, 6, 1], ['guard', 'guard', 'attack'])
  assert.equal(second.battle.perk.bonus, 2 * step)
  assert.equal(second.battle.lastExchange.dealt, 1 + step)
  const won = play(spin(second), [1, 1, 2], allAttack, { enemyHp: 4 })
  assert.equal(won.battle.phase, 'won')
  const next = nextAscentFight(won)
  assert.equal(next.battle.perk.bonus, 2 * step)
  const missed = play(next, [4, 4, 5], allGuard, { enemyIntents: ENEMY_INTENTS })
  assert.equal(missed.battle.perk.bonus, 0)
})

test('the blade banks attack pips, carries excess, and doubles only the next attack', () => {
  const { threshold, multiplier } = START_PERKS.blade
  const start = beginAscent(42, 'blade')
  const previouslyCharged = { ...start.battle.perk, charge: threshold - 2 }
  const won = play(start, [1, 1, 1], allAttack, { perk: previouslyCharged, enemyHp: 3 })
  assert.equal(won.battle.lastExchange.dealt, 3)
  const next = nextAscentFight(won)
  assert.equal(next.battle.perk.charge, threshold + 1)
  const guarded = play(next, [6, 6, 6], allGuard, { enemyIntents: ENEMY_INTENTS, enemyHp: 60 })
  assert.equal(guarded.battle.perk.charge, threshold + 1)
  const attacked = play(guarded, [3, 6, 6], ['attack', 'guard', 'guard'])
  assert.equal(attacked.battle.lastExchange.dealt, 3 * multiplier)
  assert.equal(attacked.battle.perk.charge, 4)
  assert.equal(beginAscent(42, 'blade').battle.perk.charge, 0)
})

test('the collector learns each hand once and applies its current bonus to matching slots', () => {
  const start = beginAscent(42, 'collector')
  const step = START_PERKS.collector.step
  const initial = collectorBonus([])
  const pair = play(start, [4, 4, 4], ['attack', 'attack', 'guard'], {
    enemyIntents: ENEMY_INTENTS, enemyAttackGrowth: 0, enemyHp: 100,
  })
  assert.equal(pair.battle.lastExchange.dealt, 8 + initial)
  assert.deepEqual(pair.battle.perk.hands, ['pair'])
  assert.equal(pair.newUnlock, null)
  const repeated = play(pair, [4, 4, 4], ['guard', 'guard', 'attack'])
  assert.equal(repeated.battle.lastExchange.hitsTaken.reduce((sum, hit) => sum + hit, 0), 12 - (8 + initial + step))
  assert.deepEqual(repeated.battle.perk.hands, ['pair'])
  const triple = play(repeated, [3, 3, 3], allAttack, { playerHp: PLAYER_HP })
  assert.deepEqual(triple.battle.perk.hands, ['pair', 'triple'])
  assert.equal(triple.newUnlock, 'triple')
  const won = play(triple, [1, 2, 3, 1], [...allAttack, 'guard'], { enemyHp: 6 })
  assert.equal(won.battle.phase, 'won')
  const next = nextAscentFight(won)
  assert.deepEqual(next.battle.perk.hands, ['pair', 'triple', 'straight'])
  assert.deepEqual(beginAscent(42, 'collector').battle.perk.hands, [])
})

test('the oath buffs only the chosen parity in the attack slot and carries that choice', () => {
  for (const parity of ['odd', 'even']) {
    const start = beginAscent(42, 'oath', parity)
    const boost = START_PERKS.oath.bonus
    const slots = ['attack', 'guard', 'attack']
    const normal = { ...start.battle, enemyIntents: ENEMY_INTENTS }
    const predicted = forecastYacht(normal, slots, [1, 2, 3])
    assert.equal(predicted.dealt, 4 + (parity === 'odd' ? 2 * boost : 0))
    assert.equal(predicted.damage, 10)
    const won = play(start, [1, 2, 3], allAttack, { enemyHp: 4 })
    assert.equal(nextAscentFight(won).battle.perk.parity, parity)
  }

  const start = startYachtBattle(42, PLAYER_HP, false, false, startPerk('oath'), boss)
  const charge = forecastYacht({ ...start, turn: 2 }, allAttack, [1, 3, 5])
  assert.equal(charge.dealt, 9 + 3 * START_PERKS.oath.bonus)
  assert.equal(charge.chargeBroken, false)
  const sealed = forecastYacht({ ...start, turn: 5 }, allAttack, [5, 2, 4])
  assert.equal(sealed.dealt, 6)
})

test('the counter mark boosts the lowest regular segment once per spin and carries it between fights', () => {
  const step = START_PERKS.counter.step
  const seed = seeds.find((value) => draw(value, 1, 4) % 6 === 0)
  const start = beginAscent(seed, 'counter')
  const guarding = play(start, [6, 6, 1], ['guard', 'guard', 'attack'], {
    enemyIntents: ENEMY_INTENTS, enemyAttackGrowth: 0, enemyHp: 2,
  })
  assert.equal(guarding.battle.phase, 'counter')
  assert.equal(guarding.battle.perk.growth, 0)
  assert.equal(yachtCounterRewards(guarding.battle)[0].damage, 1 + step)
  const won = spin(guarding)
  assert.equal(won.battle.lastExchange.counter.damage, 1 + step)
  assert.equal(won.battle.perk.growth, step)
  assert.equal(spinYachtCounter(won.battle), won.battle)
  const next = nextAscentFight(won)
  assert.equal(next.battle.perk.growth, step)
  const rewards = yachtCounterRewards(next.battle)
  const damages = won.battle.perk.rewards.map(({ damage }) => damage)
  const lowest = damages.indexOf(Math.min(...damages.slice(0, 4)))
  damages[lowest] += step
  assert.deepEqual(rewards.map(({ damage }) => damage), damages)
  assert.deepEqual(rewards.slice(4), COUNTER_REWARDS.slice(4))
  assert.equal(beginAscent(seed, 'counter').battle.perk.growth, 0)
})

test('three fights use their seeded enemy table and carry health without recovery', () => {
  let ascent = beginAscent(42)
  for (let fight = 1; fight <= FIGHT_COUNT; fight++) {
    assert.equal(ascent.fight, fight)
    assert.equal(ascent.battle.playerHp, PLAYER_HP - (fight - 1) * 3)
    const enemy = enemyForFight(ascent.seed, fight)
    assert.equal(ascent.battle.enemyHp, enemy.hp)
    assert.equal(ascent.battle.enemyIntents, enemy.intents)
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
  const start = beginAscent(42)
  const combo = ENEMY_INTENTS[1].hits
  const [face] = combo
  const comboTurn = play(start, [5, 6, 6], allGuard, { enemyIntents: ENEMY_INTENTS, enemyAttackGrowth: 0 })
  const triple = play(comboTurn, combo, allGuard)
  assert.equal(triple.newUnlock, 'triple')
  assert.equal(triple.battle.phase, 'counter')
  assert.equal(triple.battle.dice.length, 3)
  assert.equal(triple.battle.enemyAttackBuff, 0)
  const fourth = spin(triple)
  assert.equal(fourth.battle.dice.length, 4)
  assert.equal(fourth.battle.dice[3], roll(42, 3, 8))
  assert.equal(fourth.battle.slots[3], null)
  const nextComboTurn = play(fourth, [4, 5, 5, 6], [...allGuard, 'guard'])
  const straight = play(nextComboTurn, [face - 1, face, face + 1, 1], [...allGuard, 'attack'])
  assert.equal(straight.newUnlock, 'straight')
  assert.equal(straight.battle.extraRerollAvailable, true)
  assert.deepEqual(incomingAttack(straight.battle).hits, combo)
  const planning = spin(straight)
  const spent = spendExtraReroll(rerollYachtDice(planning.battle, [0]), 0)
  const won = play({ ...planning, battle: spent }, [4, 4, 4, 1], [...allAttack, 'guard'], { enemyHp: 12 })
  assert.equal(won.newUnlock, null)
  assert.equal(won.battle.extraRerollAvailable, false)
  const next = nextAscentFight(won)
  assert.deepEqual(next.unlocks, ['triple', 'straight'])
  assert.equal(next.battle.dice.length, 4)
  assert.equal(next.battle.extraRerollAvailable, true)
  assert.equal(next.battle.enemyAttackBuff, 2 * next.enemy.attackPerUnlock)
  assert.equal(assignDie(next.battle, 3, 'guard').slots[3], 'guard')
  const used = spendExtraReroll(rerollYachtDice(next.battle, [3]), 3)
  const final = nextAscentFight(play({ ...next, battle: used }, [6, 6, 6, 6], [...allAttack, 'attack'], { enemyHp: 24 }))
  assert.equal(final.fight, 3)
  assert.equal(final.battle.dice.length, 4)
  assert.equal(final.battle.extraRerollAvailable, true)
  assert.equal(final.battle.enemyAttackBuff, 2 * boss.attackPerUnlock)
})

test('an attack hand can add a die during battle and only the next enemy gains the unlock buff', () => {
  const start = beginAscent(42)
  const unlocked = play(start, [4, 4, 4], allAttack)
  assert.equal(unlocked.battle.dice.length, 4)
  assert.equal(unlocked.battle.enemyAttackBuff, 0)
  const nextIntent = start.enemy.intents.find((row) => row.matches(unlocked.battle.turn))
  const minionGrowth = (unlocked.battle.enemyAttackGrowth ?? 0) * (unlocked.battle.turn - 1)
  assert.deepEqual(incomingAttack(unlocked.battle).hits, nextIntent.hits.map((hit) => hit + minionGrowth))
  const second = nextAscentFight(play(unlocked, [4, 4, 4, 4], [...allAttack, 'attack'], { enemyHp: 1 }))
  const secondBuff = second.enemy.attackPerUnlock
  assert.equal(second.battle.enemyAttackBuff, secondBuff)
  const openingIntent = second.enemy.intents.find((row) => row.matches(1))
  assert.equal(intentOf(second.battle), openingIntent.id)
  assert.equal(incomingAttack(second.battle).totalDamage, Math.min(PLAYER_HP - 1,
    openingIntent.hits.reduce((total, hit) => total + hit + secondBuff, 0)))
  const won = play(second, [1, 2, 3, 4], [...allAttack, 'guard'], { enemyHp: 1 })
  assert.equal(won.newUnlock, 'straight')
  assert.equal(won.battle.enemyAttackBuff, secondBuff)
  const bossBattle = nextAscentFight(won).battle
  const bossBuff = 2 * boss.attackPerUnlock
  assert.equal(bossBattle.enemyAttackBuff, bossBuff)
  const { intents, attackGrowth } = boss
  for (const turn of [1, 2, 3, 4, 5, 6]) {
    const battle = { ...bossBattle, turn }
    const row = intents.find((entry) => entry.matches(turn))
    assert.equal(intentOf(battle), row.id)
    assert.deepEqual(incomingAttack(battle).hits, row.hits.map((hit) => hit + bossBuff + (turn - 1) * attackGrowth))
  }
})

test('the same seed and perk produce the same ascent and reroll costs', () => {
  for (const seed of [0, 42, 511]) {
    assert.deepEqual(playAscent(seed, 'reroll'), playAscent(seed, 'reroll'))
  }
})

test('replaying the same seed reproduces the entire three-fight ascent through boss knockdown', () => {
  function replay() {
    const turns = []
    const result = playAscent(1, undefined, (fight, planning, resolved) => {
      turns.push({ fight, planning, resolved })
    })
    return { result, turns }
  }

  const first = replay()
  assert.equal(first.result.wins, FIGHT_COUNT)
  assert.deepEqual(first.result.fightTurns, [4, 4, 5])
  const bossTurns = first.turns.filter(({ fight }) => fight === 3)
  assert.deepEqual(bossTurns.map(({ planning }) => intentOf(planning)), ['combo', 'charge', 'critical', 'knockdown', 'impact'])
  assert.equal(bossTurns[1].resolved.battle.lastExchange.chargeBroken, true)
  assert.ok(bossTurns[2].resolved.battle.lastExchange.counter)
  assert.equal(first.turns.at(-1).resolved.battle.phase, 'won')
  assert.deepEqual(replay(), first)
})

test('the boss keeps its rhythm with lower hit damage after the first cycle', () => {
  for (const unlocks of [0, 1, 2]) {
    const start = startYachtBattle(42, PLAYER_HP, false, false, undefined, boss, unlocks * boss.attackPerUnlock)
    for (const turn of [1, 3, 5]) {
      const first = { ...start, turn }
      const repeat = { ...start, turn: turn + 5 }
      assert.equal(intentOf(first), intentOf(repeat))
      assert.ok(incomingAttack(repeat).totalDamage < incomingAttack(first).totalDamage)
    }
  }
})

test('the boss charged strike remains exactly guardable with three dice at every unlock count', () => {
  const faces = [1, 2, 3, 4, 5, 6]
  const rolls = faces.flatMap((first) => faces.flatMap((second) => faces.map((third) => [first, second, third])))
  for (const unlocks of [0, 1, 2]) {
    const start = startYachtBattle(42, PLAYER_HP, false, false, undefined, boss, unlocks * boss.attackPerUnlock)
    const critical = { ...start, turn: 3 }
    assert.equal(intentOf(critical), 'critical')
    const { totalDamage } = incomingAttack(critical)
    assert.ok(totalDamage < PLAYER_HP)
    const dice = rolls.find((roll) => roll[0] + roll[1] + roll[2] === totalDamage)
    assert.ok(dice, `No three-die exact guard for ${totalDamage} damage with ${unlocks} unlocks`)
    const { battle } = resolveYachtTurn({ ...critical, dice, slots: allGuard })
    assert.equal(battle.phase, 'counter')
    assert.equal(battle.playerHp, PLAYER_HP)
  }
})

test('the boss charges without dealing damage or opening a roulette', () => {
  const start = startYachtBattle(42, PLAYER_HP, false, false, undefined, boss, 1)
  const charge = { ...start, turn: 2, dice: [2, 3, 4], slots: allAttack }
  assert.equal(intentOf(charge), 'charge')
  assert.deepEqual(incomingAttack(charge).hits, [])
  const { battle } = resolveYachtTurn(charge)
  assert.equal(battle.phase, 'assign')
  assert.equal(battle.turn, 3)
  assert.equal(intentOf(battle), 'critical')
  assert.equal(battle.playerHp, PLAYER_HP)
  assert.equal(battle.lastExchange.dealt, 9)
  assert.deepEqual(battle.lastExchange.hitsTaken, [])
})

test('the boss takes multiplied attack damage during knockdown and skips its attack', () => {
  const enemy = boss
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
  const enemy = boss
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
  const start = beginAscent(42, 'counter')
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
    const reset = beginAscent(finished.seed, 'shield')
    assert.equal(reset.fight, 1)
    assert.equal(reset.battle.perk.bonus, 0)
    assert.equal(reset.battle.perk.kind, 'shield')
    assert.equal(reset.battle.playerHp, PLAYER_HP)
    assert.deepEqual(reset.unlocks, [])
    assert.equal(reset.newUnlock, null)
    assert.equal(reset.battle.dice.length, 3)
    assert.equal(reset.battle.extraRerollAvailable, false)
  }
})
