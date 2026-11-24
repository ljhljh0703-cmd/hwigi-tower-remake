import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  availableMapNodes, beginMapAscent, enterMapNode, resolveAscentTurn, returnToMap,
  rewardOffers, takeAscentReward,
} from '../src/ascent.ts'
import { ASCENT_SAVE_KEY, loadAscentSave, writeAscentSave } from '../src/ascent-save.ts'
import { attackFor, chargedStrikePreview, draw, enemyIntentAt, roll } from '../src/combat.ts'
import { ASCENT_ENEMIES } from '../src/enemy-roster.ts'
import { artifactChoices, treasureEnabled } from '../src/map-treasure.ts'
import { ARTIFACTS, ITEMS, emptyTreasure, equipArtifact, itemUses, nextTreasureBattle } from '../src/treasure.ts'
import { availableCounterChoices, cancelSeal, chooseHourglass, companionFace, draftSeal, startHourglass, toggleArtifact, toggleShard } from '../src/treasure-combat.ts'
import {
  canResolveYachtTurn, forecastYacht, rerollYachtDice, resolveYachtTurn, spinYachtCounter,
  spendExtraReroll, startYachtBattle, toggleYachtWedge, tuneYachtDie, yachtAllocationTotals,
} from '../src/yacht-combat.ts'

const none = { id: 'impact', name: '시험', hits: [], matches: () => true }
const attack = (hits, mechanic) => ({ ...none, hits, ...(mechanic && { mechanic }) })
const put = (dice, slots, state = {}, other = {}) => ({
  ...startYachtBattle(12, 22, false, false), enemyHp: 70, awakened: true, dice, slots,
  enemyIntents: [none], loot: { ...emptyTreasure, ...state }, ...other,
})
const equipped = (...ids) => ({ equipped: ids, acquired: ids })

function checkpoint(ascent, options = {}) {
  let raw
  const store = { setItem: (_, data) => { raw = data }, getItem: () => raw }
  writeAscentSave({ ascent, selected: [], ...options }, store)
  const loaded = loadAscentSave(store)
  assert.ok(loaded)
  return loaded
}

test('three wedges use three successive turns and reset with all nine item types on entering a battle', () => {
  const owned = Object.fromEntries(ITEMS.map((id) => [id, id === 'wedge' ? 3 : 10]))
  let battle = put([1, 1, 1], ['attack', 'attack', 'attack'], { items: owned })
  for (let uses = 2; uses >= 0; uses--) {
    battle = { ...battle, dice: [1, 1, 1], slots: ['attack', 'attack', 'attack'] }
    const armed = toggleYachtWedge(battle)
    assert.equal(yachtAllocationTotals(armed).attack, 6)
    assert.equal(toggleYachtWedge(armed).wedgeArmed, undefined)
    battle = resolveYachtTurn(armed).battle
    assert.equal(itemUses(battle.loot, 'wedge'), uses)
  }
  assert.equal(toggleYachtWedge(battle), battle)
  assert.deepEqual(nextTreasureBattle(battle.loot).items, owned)
  assert.equal(itemUses(nextTreasureBattle(battle.loot), 'wedge'), 3)
})

test('buckle, tongs, mantle and lining share a protection cap while banner only spends on additional blocked hits', () => {
  const loot = { ...equipped('banner'), armed: ['banner'], items: { buckle: 1, tongs: 1, mantle: 1 }, prepared: { lining: 1 } }
  const dense = put([4, 2, 3, 5], ['attack', 'guard', 'guard', 'guard'], loot,
    { enemyIntents: [attack([4, 4], { kind: 'seal', value: 5 })] })
  const result = forecastYacht(dense)
  assert.equal(result.damage, 0)
  assert.deepEqual(result.loot.spentItems, { buckle: 1, tongs: 1 })
  assert.deepEqual(result.loot.prepared, { lining: 1 })
  assert.deepEqual(result.loot.spent, [])
  assert.equal(result.counter, false)

  const thorns = put([4, 2, 3], ['attack', 'guard', 'guard'], loot,
    { enemyIntents: [attack([6, 5], { kind: 'thorns', value: 4 })] })
  const aftermath = forecastYacht(thorns)
  assert.deepEqual(aftermath.hits, [0, 0, 4])
  assert.deepEqual(aftermath.loot.spentItems, { mantle: 1 })
  assert.deepEqual(aftermath.loot.spent, ['banner'])
})

test('knot and hook affect only a new theft and a surviving escort, and finishing skips delayed consumables', () => {
  const gear = { items: { knot: 2, hook: 1 }, prepared: { whetstone: 1, lining: 1 } }
  const theft = put([2, 2, 2], ['escort', 'guard', 'guard'], gear, {
    escort: { hp: 5, bonus: 3 }, enemyIntents: [attack([3], { kind: 'steal', value: 10 })],
  })
  const after = resolveYachtTurn(theft).battle
  assert.deepEqual(after.stolenDie, { remaining: 8 })
  assert.equal(after.escort.hp, 1)
  assert.equal(itemUses(after.loot, 'knot'), 1)
  const repeat = forecastYacht({ ...theft, stolenDie: { remaining: 3 } })
  assert.equal(repeat.theftThreshold, undefined)
  const kill = resolveYachtTurn({ ...theft, dice: [3, 6, 6], slots: ['attack', 'attack', 'attack'], enemyHp: 3 }).battle
  assert.equal(kill.phase, 'won')
  assert.deepEqual(kill.loot.prepared, {})
  assert.deepEqual(kill.loot.spentItems, {})
})

function counterBoard(state, enemyHp = 30, slot = 1) {
  const seed = Array.from({ length: 100 }, (_, n) => n).find((n) => draw(n, 1, 4) % 6 === slot)
  return put([1, 2, 3, 4], ['guard', 'guard', 'guard', 'attack'], state, {
    seed, enemyHp, fourthDieUnlocked: true, phase: 'counter',
    lastExchange: { turn: 1, dealt: 4, hitsTaken: [0], counter: null, awakened: false },
  })
}

test('mirror and horn offer one saved result, grow a counter perk once and cannot both pay', () => {
  const state = { ...equipped('mirror', 'horn'), counterFlags: { horn: true, coin: false, assist: false } }
  const raw = counterBoard(state)
  const pending = spinYachtCounter(raw)
  assert.deepEqual(availableCounterChoices(pending), ['now', 'mirror', 'horn'])
  assert.equal(pending.enemyHp, raw.enemyHp)
  assert.equal(spinYachtCounter(pending), pending)
  const mirrored = spinYachtCounter(pending, 'mirror')
  assert.equal(mirrored.enemyHp, raw.enemyHp)
  assert.equal(mirrored.loot.mirrorDamage, 4)
  assert.deepEqual(mirrored.loot.spent, ['mirror'])
  assert.equal(spinYachtCounter(mirrored, 'horn'), mirrored)
  const horn = spinYachtCounter(pending, 'horn')
  assert.deepEqual(horn.lastExchange.counter, { slot: 1, damage: 8, joint: true })
  assert.equal(horn.enemyHp, raw.enemyHp - 8)
  assert.deepEqual(horn.loot.spent, ['horn'])

  const growth = beginMapAscent(12, 'counter').battle.perk
  const boss = counterBoard({ ...state, counterFlags: { ...state.counterFlags, horn: false } }, 30, 5)
  const charged = spinYachtCounter({ ...boss, perk: growth })
  const applied = spinYachtCounter(charged, 'mirror')
  assert.equal(applied.loot.mirrorDamage, 12)
  assert.equal(applied.perk.growth, 7)
  assert.equal(spinYachtCounter(counterBoard({ ...equipped('mirror') }, 2)).phase, 'won')
  assert.equal(spinYachtCounter(counterBoard({ ...equipped('horn'), counterFlags: state.counterFlags }, 30, 5)).loot.counter, undefined)
})

test('coin and assist pay in order after roulette and prevent a pointless mirror deferral', () => {
  const loot = { ...equipped('mirror'), items: { coin: 2 }, shards: { assist: 2 }, shardArmed: 'assist' }
  const seed = Array.from({ length: 100 }, (_, n) => n).find((n) => draw(n, 1, 4) % 6 === 1)
  const initial = put([3, 1, 2, 3], ['attack', 'guard', 'guard', 'guard'], loot,
    { seed, fourthDieUnlocked: true, enemyHp: 9, enemyIntents: [attack([6])] })
  const counter = resolveYachtTurn(initial).battle
  assert.equal(counter.phase, 'counter')
  assert.deepEqual(counter.loot.counterFlags, { coin: true, assist: true, horn: false })
  const won = spinYachtCounter(counter)
  assert.equal(won.phase, 'won')
  assert.deepEqual(won.loot.spent, [])
  assert.equal(itemUses(won.loot, 'coin'), 1)
  assert.equal(won.loot.shards.assist, 1)

  const weaker = resolveYachtTurn({ ...initial, enemyHp: 7 }).battle
  const afterCoin = spinYachtCounter(weaker)
  assert.equal(afterCoin.phase, 'won')
  assert.equal(afterCoin.loot.shards.assist, 2)
})

test('overflow uses actual overguard and delayed hits take the larger bonus and then expire', () => {
  const board = put([6, 5, 3], ['guard', 'guard', 'attack'], equipped('overflow'), { enemyIntents: [attack([5])] })
  const saved = resolveYachtTurn(board).battle
  assert.equal(saved.phase, 'assign')
  assert.equal(saved.loot.overflowDamage, 6)
  const withMirror = { ...saved, dice: [2, 4, 4], slots: ['attack', 'guard', 'guard'], loot: { ...saved.loot, mirrorDamage: 8 } }
  const used = resolveYachtTurn(withMirror).battle
  assert.equal(used.lastExchange.dealt, 10)
  assert.equal(used.loot.mirrorDamage, undefined)
  assert.equal(used.loot.overflowDamage, undefined)
  const missed = resolveYachtTurn({ ...withMirror, slots: ['guard', 'guard', 'guard'] }).battle
  assert.equal(missed.lastExchange.dealt, 0)
  assert.equal(missed.loot.overflowDamage, undefined)
  assert.equal(missed.loot.mirrorDamage, undefined)
  const wedge = toggleYachtWedge({ ...withMirror, slots: ['guard', 'guard', 'guard'], loot: { ...withMirror.loot, items: { wedge: 1 } } })
  assert.equal(resolveYachtTurn(wedge).battle.lastExchange.dealt, 11)
  const exact = resolveYachtTurn({ ...board, dice: [2, 3, 4] }).battle
  assert.equal(exact.phase, 'counter')
  assert.equal(exact.loot.overflowDamage, undefined)
})

test('hammer fails at twelve, can erase the next critical at fifteen and does not skip knockdown', () => {
  const boss = ASCENT_ENEMIES[2][0]
  const initial = put([4, 4, 4], ['attack', 'attack', 'attack'], equipped('hammer'), { turn: 2, enemyIntents: boss.intents })
  const failed = resolveYachtTurn(toggleArtifact(initial, 'hammer')).battle
  assert.equal(failed.weakenedStrikeTurn, 3)
  assert.equal(failed.erasedStrikeTurn, undefined)
  assert.deepEqual(failed.loot.spent, ['hammer'])
  assert.ok(attackFor(failed, enemyIntentAt(failed)).totalDamage > 0)

  const armed = toggleArtifact({ ...initial, dice: [5, 5, 5] }, 'hammer')
  assert.equal(chargedStrikePreview(armed, yachtAllocationTotals(armed), true).totalDamage, 0)
  const success = resolveYachtTurn(armed).battle
  assert.equal(success.erasedStrikeTurn, 3)
  const next = resolveYachtTurn({ ...success, slots: ['guard', 'guard', 'guard'] }).battle
  assert.equal(next.turn, 4)
  assert.equal(enemyIntentAt(next).id, 'knockdown')
  assert.deepEqual(next.lastExchange.hitsTaken, [])
})

test('the incomplete seal cannot mix with rerolls and confirms only a newly valid chosen hand', () => {
  const start = beginMapAscent(54, 'collector', 'odd', 2)
  const run = enterMapNode(start, availableMapNodes(start)[0].id)
  const initial = { ...run.battle, dice: [3, 2, 3], slots: ['attack', 'attack', 'attack'], loot: { ...emptyTreasure, ...equipped('incomplete'), sealHand: 'triple' } }
  const bad = draftSeal(initial, 1, -1)
  assert.equal(canResolveYachtTurn(bad), false)
  assert.equal(resolveYachtTurn(bad).battle, bad)
  assert.equal(rerollYachtDice(bad, [0]), bad)
  const valid = draftSeal(initial, 1, 1)
  assert.deepEqual(cancelSeal(valid).dice, initial.dice)
  const after = resolveAscentTurn({ ...run, battle: valid })
  assert.deepEqual(after.unlocks, ['triple'])
  assert.equal(after.battle.loot.sealUsed, true)
  assert.equal(after.battle.dice.length, 4)
  assert.equal(draftSeal(after.battle, 0, 1), after.battle)
})

test('the heart changes only companion rolls, while an odd five still contributes zero when sealed', () => {
  const loot = { ...emptyTreasure, ...equipped('heart-die'), heartParity: 'odd' }
  const enemy = { hp: 45, intents: [attack([], { kind: 'seal', value: 5 })] }
  const seed = Array.from({ length: 100 }, (_, n) => n).find((n) => roll(n, 1, 8) >= 5)
  const battle = startYachtBattle(seed, 22, true, true, undefined, enemy, 0, loot)
  assert.equal(battle.dice.at(-1), 5)
  assert.deepEqual(battle.dice.slice(0, 3), startYachtBattle(seed, 22, true, true, undefined, enemy).dice.slice(0, 3))
  assert.equal(yachtAllocationTotals({ ...battle, slots: ['guard', 'guard', 'guard', 'attack'] }).attack, 0)
  assert.equal(rerollYachtDice(battle, [3]).dice[3] % 2, 1)
  assert.equal(spendExtraReroll({ ...battle, rerolled: true }, 3).dice[3] % 2, 1)
  assert.equal(companionFace({ ...battle, loot: { ...loot, equipped: [] } }, 6), 6)
})

test('hourglass debits two HP before revealing fixed channels and saves the two pending choices', () => {
  const map = beginMapAscent(89, 'reroll', 'odd', 2)
  const start = enterMapNode(map, availableMapNodes(map)[0].id)
  const prepared = { ...start.battle, playerHp: 4, rerolled: true, loot: { ...emptyTreasure, ...equipped('hourglass') } }
  const tooLow = { ...prepared, playerHp: 3 }
  assert.equal(startHourglass(tooLow, [0, 2]), tooLow)
  const locked = { ...prepared, fixedDie: { index: 0, kind: 'lock' } }
  assert.equal(startHourglass(locked, [0, 2]), locked)
  const pending = startHourglass(prepared, [2, 0])
  assert.equal(pending.playerHp, 2)
  assert.deepEqual(pending.loot.hourglass.map((die) => [die.index, die.rolled]), [[0, roll(prepared.seed, 1, 90)], [2, roll(prepared.seed, 1, 91)]])
  const restored = checkpoint({ ...start, battle: pending }).ascent.battle
  assert.deepEqual(restored.loot.hourglass, pending.loot.hourglass)
  assert.equal(rerollYachtDice(restored, [1]), restored)
  const picked = chooseHourglass(restored, 0, true)
  const savedAgain = checkpoint({ ...start, battle: picked }).ascent.battle
  assert.equal(savedAgain.dice[0], pending.loot.hourglass[0].rolled)
  const done = chooseHourglass(savedAgain, 2, false)
  assert.equal(done.loot.hourglass, undefined)
  assert.equal(done.playerHp, 2)
  assert.equal(startHourglass(done, [0, 2]), done)
})

test('consumable shards spend at most one per turn and emergency preparations expire', () => {
  const initial = put([4, 4, 4], ['attack', 'attack', 'attack'], { shards: { tuning: 2, smash: 2 } })
  const changed = tuneYachtDie(initial, 1)
  assert.equal(tuneYachtDie(changed, 1), changed)
  assert.equal(toggleShard(changed, 'smash'), changed)
  const hit = resolveYachtTurn(toggleShard(initial, 'smash')).battle
  assert.equal(hit.lastExchange.dealt, 15)
  assert.equal(hit.loot.shards.smash, 1)
  const wrapped = { ...emptyTreasure, prepared: { emergency: 2, lining: 1 } }
  const low = startYachtBattle(2, 8, false, false, undefined, undefined, 0, wrapped)
  assert.equal(low.playerHp, 10)
  assert.equal(low.loot.prepared.emergency, 1)
  const win = resolveYachtTurn({ ...low, enemyHp: 1, slots: ['attack', 'attack', 'attack'] }).battle
  assert.deepEqual(win.loot.prepared, {})
})

function roomBefore(seed, target, rules = 2) {
  const begin = beginMapAscent(seed, 'shield', 'odd', rules)
  const canReach = ({ id, floor }) => id === target.id || floor < target.floor && begin.route.map.byId[id].next.some((next) => canReach(begin.route.map.byId[next]))
  let run = begin
  while (run.route.completed.length < target.floor - 1) {
    const node = availableMapNodes(run).find(canReach)
    run = enterMapNode(run, node.id)
    if (run.route.screen === 'battle') run = resolveAscentTurn({ ...run, battle: { ...run.battle, enemyHp: 1, slots: run.battle.dice.map(() => 'attack') } })
    run = returnToMap(takeAscentReward(run, 'skip'))
  }
  return run
}

function stageTwoNode(find) {
  for (let seed = 0; seed < 100; seed++) {
    const run = beginMapAscent(seed, 'shield', 'odd', 2)
    const node = run.route.map.nodes.find(find)
    if (node) return [seed, node]
  }
  throw new Error('Could not find stage two room')
}

test('rule two pickups and rooms preserve HP limits, stable offers, and one map completion', () => {
  for (const [hp, hasBandage] of [[1, true], [14, true], [15, false], [22, false]]) {
    const map = beginMapAscent(27, 'shield', 'odd', 2)
    const first = enterMapNode(map, availableMapNodes(map)[0].id)
    const win = resolveAscentTurn({ ...first, battle: { ...first.battle, playerHp: hp, enemyHp: 1, awakened: true, slots: ['attack', 'attack', 'attack'] } })
    assert.equal(rewardOffers(win).length, 3)
    assert.equal(rewardOffers(win).includes('bandage'), hasBandage)
  }
  for (const event of ['medicine', 'pulley', 'flag']) {
    const [seed, node] = stageTwoNode((node) => node.event === event)
    const ready = roomBefore(seed, node)
    const at = (hp) => enterMapNode({ ...ready, battle: { ...ready.battle, playerHp: hp } }, node.id)
    const poor = at(1)
    const rich = at(event === 'medicine' ? 22 : event === 'pulley' ? 3 : 4)
    const initial = rewardOffers(poor)[0]
    assert.ok(initial)
    assert.equal(treasureEnabled(poor, initial), event === 'medicine')
    assert.equal(treasureEnabled(rich, initial), event !== 'medicine')
    const option = event === 'flag' && initial === 'incomplete' ? { hand: rich.unlocks.includes('triple') ? 'straight' : 'triple' } : { parity: 'odd' }
    const choice = event === 'medicine' ? poor : rich
    const spent = takeAscentReward(choice, initial, option)
    assert.notEqual(spent, choice)
    assert.equal(spent.battle.playerHp, event === 'medicine' ? 4 : 1)
    assert.deepEqual(checkpoint(spent).ascent.route.completed, spent.route.completed)
    assert.equal(takeAscentReward(spent, initial, option), spent)
  }
  const [seed, restNode] = stageTwoNode((node) => node.kind === 'rest')
  const ready = roomBefore(seed, restNode)
  const rest = enterMapNode({ ...ready, battle: { ...ready.battle, playerHp: 20 } }, restNode.id)
  assert.deepEqual(rewardOffers(rest), ['kit', 'whetstone'])
  assert.equal(takeAscentReward(rest, 'kit').battle.playerHp, 22)
  assert.equal(takeAscentReward({ ...rest, battle: { ...rest.battle, playerHp: 14 } }, 'kit').battle.playerHp, 19)
  const prepared = returnToMap(takeAscentReward(rest, 'whetstone'))
  const boss = enterMapNode(prepared, availableMapNodes(prepared)[0].id)
  assert.deepEqual(boss.battle.loot.prepared, { whetstone: 1 })
  assert.deepEqual(boss.battle.loot.prep, {})
})

test('rules-two bosses start at 84 HP and active 88 HP saves keep their exact turn', () => {
  const [seed, bossNode] = stageTwoNode((node) => node.kind === 'boss')
  const ready = roomBefore(seed, bossNode)
  const boss = enterMapNode(ready, bossNode.id)
  assert.equal(boss.battle.enemyHp, 84)
  assert.deepEqual(checkpoint(boss).ascent, boss)

  let raw
  const store = { setItem: (_, data) => { raw = data }, getItem: () => raw }
  writeAscentSave({ ascent: boss, selected: [0] }, store)
  const old = JSON.parse(raw)
  assert.equal(old.ascent.route.bossMaxHp, 84)
  delete old.ascent.route.bossMaxHp
  old.ascent.battle.enemyHp = 86
  store.setItem(ASCENT_SAVE_KEY, JSON.stringify(old))

  const restored = loadAscentSave(store)
  assert.equal(restored.ascent.enemy.hp, 88)
  assert.equal(restored.ascent.battle.enemyHp, 86)
  assert.deepEqual(restored.selected, [0])
  const afterDamage = { ...restored.ascent, battle: { ...restored.ascent.battle, enemyHp: 79 } }
  assert.deepEqual(checkpoint(afterDamage).ascent, afterDamage)

  old.ascent.route.bossMaxHp = 83
  store.setItem(ASCENT_SAVE_KEY, JSON.stringify(old))
  assert.equal(loadAscentSave(store), null)
})

test('an elite offers an eligible relic first, equips three and requires confirmed replacement for a fourth', () => {
  const [seed, node] = stageTwoNode((node) => node.kind === 'elite')
  const start = roomBefore(seed, node)
  const three = ARTIFACTS.filter((id) => id !== 'heart-die' && id !== 'incomplete').slice(0, 3)
  const loot = { ...emptyTreasure, ...equipped(...three) }
  const battle = enterMapNode({ ...start, battle: { ...start.battle, loot } }, node.id)
  const won = resolveAscentTurn({ ...battle, battle: { ...battle.battle, enemyHp: 1, slots: battle.battle.dice.map(() => 'attack') } })
  const chosen = rewardOffers(won)[0]
  assert.ok(ARTIFACTS.includes(chosen))
  assert.equal(chosen, artifactChoices(won, node)[0])
  assert.equal(takeAscentReward(won, chosen), won)
  assert.deepEqual(won.battle.loot.equipped, three)
  const selected = checkpoint(won, { rewardPreview: chosen, artifactOptions: { replace: three[0] } })
  const resume = takeAscentReward(selected.ascent, chosen, { ...selected.artifactOptions, parity: 'odd', hand: won.unlocks.includes('triple') ? 'straight' : 'triple' })
  assert.equal(resume.battle.loot.equipped.length, 3)
  assert.ok(resume.battle.loot.equipped.includes(chosen))
  assert.ok(resume.battle.loot.acquired.includes(three[0]))
  assert.equal(equipArtifact(resume.battle.loot, three[0], { replace: chosen }), null)
  assert.deepEqual(checkpoint(resume).ascent.battle.loot.equipped, resume.battle.loot.equipped)
})
