import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  availableMapNodes, beginAscent, enterMapNode, FIGHT_COUNT, nextAscentFight, resolveAscentTurn,
  returnToMap, spinAscentCounter, takeAscentReward,
} from '../src/ascent.ts'
import { ASCENT_SAVE_KEY, loadAscentSave, readAscentSave, writeAscentSave } from '../src/ascent-save.ts'
import { assignDie, attackFor, enemyIntentAt } from '../src/combat.ts'
import { rerollYachtDice, spinYachtCounter } from '../src/yacht-combat.ts'

function memoryStorage() {
  const data = new Map()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  }
}

test('a rules-4 elite checkpoint keeps its attack bonus through a resave and the final boss', () => {
  const storage = memoryStorage()
  const fixture = readFileSync(new URL('./fixtures/ascent-rules-4-elite.json', import.meta.url), 'utf8')
  storage.setItem(ASCENT_SAVE_KEY, fixture)
  const { checkpoint, invalidMap } = readAscentSave(storage)
  assert.equal(invalidMap, false)
  assert.ok(checkpoint)
  assert.deepEqual(checkpoint.selected, [0])
  let { ascent: run } = checkpoint
  assert.deepEqual(run.unlocks, ['straight', 'triple'])
  assert.equal(run.route.map.rules, 4)
  assert.equal(run.enemy.id, 'iron-knight')
  assert.equal(run.battle.enemyHp, 34)
  assert.deepEqual(attackFor(run.battle, enemyIntentAt(run.battle)).hits, [6, 7])

  const reload = () => {
    writeAscentSave({ ascent: run, selected: [] }, storage)
    const saved = loadAscentSave(storage)
    assert.equal(saved?.ascent.route.map.rules, 4)
    return saved.ascent
  }
  const play = (slots) => {
    run = resolveAscentTurn({ ...run, battle: { ...run.battle, slots } })
    if (run.battle.phase === 'counter') run = spinAscentCounter(spinAscentCounter(run), 'now')
  }
  const allAttack = Array(4).fill('attack')
  const allGuard = Array(4).fill('guard')
  play(['guard', 'guard', 'guard', 'attack'])
  play(allAttack)
  assert.equal(run.route.screen, 'reward')
  run = reload()
  run = returnToMap(takeAscentReward(run, 'skip'))
  run = enterMapNode(run, availableMapNodes(run)[0].id)
  assert.equal(run.route.screen, 'rest')
  run = returnToMap(takeAscentReward(run, 'kit'))
  run = enterMapNode(run, availableMapNodes(run)[0].id)
  run = reload()
  assert.equal(run.enemy.id, 'boss')
  assert.equal(run.battle.enemyHp, 84)
  assert.deepEqual(attackFor(run.battle, enemyIntentAt(run.battle)).hits, [11, 10])
  for (const slots of [allGuard, allAttack, allGuard, allAttack]) play(slots)
  assert.deepEqual([run.route.screen, run.route.completed.length, run.battle.phase], ['finished', 12, 'won'])
  writeAscentSave({ ascent: run, selected: [] }, storage)
  assert.equal(storage.getItem(ASCENT_SAVE_KEY), null)
})

test('a pre-update escort slot resumes in attack with its die and selection intact', () => {
  const storage = memoryStorage()
  const seed = Array.from({ length: 30 }, (_, index) => index)
    .find((index) => nextAscentFight({ ...beginAscent(index), battle: { ...beginAscent(index).battle, phase: 'won' } }).enemy.id === 'escort')
  const first = beginAscent(seed)
  const escortFight = nextAscentFight({ ...first, battle: { ...first.battle, phase: 'won' } })
  const battle = { ...escortFight.battle, escort: { hp: 5, bonus: 3 }, slots: ['attack', 'guard', null] }
  writeAscentSave({ ascent: { ...escortFight, battle }, selected: [0, 2] }, storage)
  const raw = JSON.parse(storage.getItem(ASCENT_SAVE_KEY))
  raw.ascent.battle.slots[0] = 'escort'
  storage.setItem(ASCENT_SAVE_KEY, JSON.stringify(raw))
  const restored = loadAscentSave(storage)
  assert.deepEqual(restored?.ascent.battle, battle)
  assert.deepEqual(restored?.selected, [0, 2])
})

test('a deterministic save round-trips the pending counter and an in-progress turn with its companion', () => {
  const storage = memoryStorage()
  const first = beginAscent(3, 'reroll')
  const awaitingCounter = resolveAscentTurn({ ...first, battle: { ...first.battle, slots: ['guard', 'guard', 'guard'] } })
  assert.equal(awaitingCounter.battle.phase, 'counter')
  assert.deepEqual(awaitingCounter.unlocks, ['triple'])
  writeAscentSave({ ascent: awaitingCounter, selected: [] }, storage)
  const restoredCounter = loadAscentSave(storage)
  assert.deepEqual(restoredCounter, { ascent: awaitingCounter, selected: [] })

  const opened = spinYachtCounter(restoredCounter.ascent.battle)
  assert.deepEqual(opened, spinYachtCounter(awaitingCounter.battle))
  const rolled = rerollYachtDice(rerollYachtDice(opened, [0]), [3])
  const battle = assignDie(rolled, 3, 'attack')
  assert.deepEqual([battle.turn, battle.playerHp, battle.rerolled, battle.paidRerollSpent], [2, 21, true, true])
  const checkpoint = { ascent: { ...awaitingCounter, battle }, selected: [1, 3] }
  writeAscentSave(checkpoint, storage)
  const restored = loadAscentSave(storage)
  assert.deepEqual(restored, checkpoint)
  assert.equal(enemyIntentAt(restored.ascent.battle).id, 'combo')
  assert.equal(typeof restored.ascent.battle.enemyIntents[0].matches, 'function')
})

test('the floor transition checkpoint resumes at the same between-fights screen and next seeded encounter', () => {
  const storage = memoryStorage()
  const first = beginAscent(0, 'shield')
  const intermission = resolveAscentTurn({ ...first, battle: { ...first.battle, enemyHp: 5, slots: ['attack', 'attack', 'attack'] } })
  assert.equal(intermission.battle.phase, 'won')
  writeAscentSave({ ascent: intermission, selected: [] }, storage)
  assert.deepEqual(loadAscentSave(storage).ascent, intermission)
  const resumed = nextAscentFight(loadAscentSave(storage).ascent)
  assert.deepEqual(resumed, nextAscentFight(intermission))
  assert.equal(resumed.fight, 2)
  writeAscentSave({ ascent: resumed, selected: [] }, storage)
  assert.deepEqual(loadAscentSave(storage).ascent, resumed)
})

test('defeat and final victory both remove the checkpoint', () => {
  const storage = memoryStorage()
  const first = beginAscent(3)
  const failed = { ...first, battle: { ...first.battle, phase: 'lost', playerHp: 0 } }
  const finished = { ...first, fight: FIGHT_COUNT, battle: { ...first.battle, phase: 'won', enemyHp: 0 } }
  for (const terminal of [failed, finished]) {
    writeAscentSave({ ascent: first, selected: [] }, storage)
    assert.ok(storage.getItem(ASCENT_SAVE_KEY))
    writeAscentSave({ ascent: terminal, selected: [] }, storage)
    assert.equal(storage.getItem(ASCENT_SAVE_KEY), null)
    assert.equal(loadAscentSave(storage), null)
  }
})

test('broken, old-version, and inaccessible saves are ignored', () => {
  const storage = memoryStorage()
  const ascent = beginAscent(3, 'counter')
  writeAscentSave({ ascent, selected: [] }, storage)
  const valid = JSON.parse(storage.getItem(ASCENT_SAVE_KEY))
  for (const data of [
    '{broken', 'null',
    JSON.stringify({ ...valid, version: 0 }),
    JSON.stringify({ ...valid, selected: [4] }),
    JSON.stringify({ ...valid, ascent: { ...valid.ascent, battle: { ...valid.ascent.battle, slots: ['invalid', null, null] } } }),
    JSON.stringify({ ...valid, ascent: { ...valid.ascent, battle: { ...valid.ascent.battle, perk: { kind: 'counter', rewards: [] } } } }),
  ]) {
    storage.setItem(ASCENT_SAVE_KEY, data)
    assert.equal(loadAscentSave(storage), null)
  }
  const unavailable = new Proxy({}, { get() { throw new Error('no storage access') } })
  assert.equal(loadAscentSave(unavailable), null)
  assert.doesNotThrow(() => writeAscentSave({ ascent, selected: [] }, unavailable))
})
