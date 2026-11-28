import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseUpperAscent, resolveAscentTurn, rewardOffers, spinAscentCounter, takeAscentReward } from '../src/ascent.ts'
import { loadAscentSave, writeAscentSave } from '../src/ascent-save.ts'
import { generateAscentMap } from '../src/ascent-map.ts'
import { openMetaStage } from '../src/meta-progress.ts'
import { damageFormation, forecastFormation, formationActions, openFormation } from '../src/upper-combat.ts'
import { chooseEgoSlot, forecastYacht, resolveYachtTurn, spinYachtCounter } from '../src/yacht-combat.ts'
import { atFloor, checkpointFor, withDice, withFormation } from '../smoke/stage-two-fixture.mjs'

const attacks = actions => actions.filter(action => 'hit' in action).map(({ hit }) => hit.amount)
const restore = run => loadAscentSave(checkpointFor(run).storage)?.ascent
const attackAll = ['attack', 'attack', 'attack']
const guardAll = ['guard', 'guard', 'guard']
const replace = (formation, changes) => ({ ...formation, enemies: formation.enemies.map((enemy, index) => ({ ...enemy, ...changes[index] })) })

test('direct attacks pierce in order and promote on the exact kill', () => {
  const { battle: { formation } } = withFormation(atFloor(17, 'elite'), [5, 4, 9])
  const cases = [[4, [4], [1, 4, 9], undefined], [5, [5], [0, 4, 9], 'dash'],
    [12, [5, 4, 3], [0, 0, 6], 'dash'], [18, [5, 4, 9], [0, 0, 0], 'dash']]
  for (const [power, hits, health, promotion] of cases) {
    const result = damageFormation(formation, power, true)
    assert.deepEqual(result.contacts.map(contact => contact.amount), hits)
    assert.deepEqual(result.formation.enemies.map(enemy => enemy.hp), health)
    assert.equal(result.contacts[0].advance, promotion)
  }
})

test('a direct kill drops the defeated source from the exact guard goal', () => {
  let run = withDice(withFormation(atFloor(13), [8, 12]), [4, 5, 3], ['attack', 'attack', 'guard'])
  const formation = replace(run.battle.formation, [{ action: { hits: [7] } }, { action: { hits: [3] } }])
  run = { ...run, battle: { ...run.battle, formation: { ...formation, cap: 10 } } }
  assert.equal(forecastYacht(run.battle).incoming.totalDamage, 3)
  const resolved = resolveAscentTurn(run)
  assert.equal(resolved.battle.phase, 'counter')
  assert.deepEqual(resolved.battle.formation.counterOrder, ['support'])
  assert.deepEqual(resolved.battle.lastExchange.hitsTaken, [0])
  assert.equal(forecastFormation(formation, { attack: 20, guard: 3 }).counter, false)
  assert.equal(forecastFormation(replace(formation, [{}, { action: { hits: [] } }]), { attack: 9, guard: 0 }).counter, false)
})

test('counter aims at a waiting front enemy and keeps its chosen order through coin, adjacent and save', () => {
  let run = withDice(withFormation(atFloor(13), [5, 9]), [1, 1, 2], guardAll)
  const opening = openFormation(run.battle.formation, 2)
  const loot = { ...run.battle.loot, acquired: ['adjacent-needle'], equipped: ['adjacent-needle'], consumables: { coin: 1 } }
  run = { ...run, meta: { ...run.meta, pool: [5] }, battle: { ...run.battle, turn: 2, formation: opening, loot } }
  const counter = resolveAscentTurn(run)
  assert.deepEqual(counter.battle.formation.counterOrder, ['dash', 'support'])
  const pending = spinAscentCounter(counter)
  const coin = spinAscentCounter(pending, 'coin')
  assert.notEqual(coin, pending)
  assert.deepEqual(restore(coin)?.battle.formation.counterOrder, ['dash', 'support'])
  const adjacent = spinAscentCounter(coin, 'adjacent')
  assert.equal(adjacent.battle.turn, 3)
  const dished = damageFormation(counter.battle.formation, 7, false, counter.battle.formation.counterOrder)
  assert.deepEqual(dished.contacts.map(hit => [hit.id, hit.amount]), [['dash', 5], ['support', 2]])
})

test('caps round cumulative hits and spacer alone turns an excess guard into exact', () => {
  const run = atFloor(17, 'elite')
  const formation = replace(run.battle.formation, [{ action: { hits: [8, 6] } }, { action: { hits: [5] } }, { action: { hits: [] } }])
  assert.deepEqual(attacks(formationActions(formation).actions), [6, 5, 4])
  assert.deepEqual(forecastFormation(formation, { attack: 0, guard: 11 }).hits, [0, 0, 4])
  assert.equal(forecastFormation(formation, { attack: 0, guard: 15 }).counter, true)
  const { battle } = withDice(run, [6, 5, 5], guardAll)
  const guarded = { ...battle, formation }
  assert.equal(forecastYacht(guarded).counter, false)
  assert.equal(forecastYacht({ ...guarded, loot: { ...battle.loot, consumables: { spacer: 1 }, consumableArmed: 'spacer' } }).counter, true)
})

test('the shield retreats once before the third allocation and only with a living rear', () => {
  const run = atFloor(14)
  const { formation } = run.battle
  const moved = openFormation(formation, 3)
  assert.equal(moved.retreated, true)
  assert.deepEqual(moved.enemies.map(enemy => [enemy.id, enemy.action.hits]), [['dash', [8]], ['shield', []]])
  const saved = restore({ ...run, battle: { ...run.battle, formation: moved, turn: 3 } })
  assert.equal(openFormation(saved.battle.formation, 6).movedBack, undefined)
  for (const changes of [[{}, { hp: 0 }], [{ hp: 0 }, {}], [{ toppled: true }, {}]]) {
    assert.equal(openFormation(replace(formation, changes), 3).retreated, undefined)
  }
})

test('support cancels before either endpoint dies and survives its sender after applying', () => {
  const { formation } = atFloor(17, 'elite').battle
  assert.deepEqual(attacks(formationActions(formation).actions), [6, 5])
  for (const changes of [[{ hp: 0 }], [{}, {}, { hp: 0 }]]) {
    assert.equal(formationActions(replace(formation, changes)).actions.some(action => 'from' in action), false)
  }
  const applied = formationActions(formation)
  const next = openFormation(replace(applied.formation, [{}, {}, { hp: 0 }]), 2)
  assert.deepEqual(attacks(formationActions(next).actions), [8, 4])
  assert.equal(formationActions(next).formation.enemies[0].boost, undefined)
})

test('the gatekeeper keeps the announced contact, then advances and can be weakened or interrupted', () => {
  const { formation } = withFormation(atFloor(19), [1, 64]).battle
  const announced = openFormation(formation, 2)
  const promoted = forecastFormation(announced, { attack: 1, guard: 0 })
  assert.deepEqual(attacks(promoted.enemy.actions), [12])
  const ready = openFormation(promoted.enemy.formation, 3)
  assert.equal(formationActions(ready).totalDamage, 0)
  const flurry = openFormation(ready, 4)
  assert.deepEqual(attacks(formationActions(flurry).actions), [5, 5])
  const prepared = openFormation(flurry, 5)
  for (const damage of [11, 12]) {
    const direct = damageFormation(prepared, damage, true)
    assert.equal(formationActions(openFormation(direct.formation, 6)).totalDamage, damage === 12 ? 9 : 18)
  }
  const cancelled = openFormation(replace(flurry, [{}, { toppled: true }]), 5)
  assert.equal(formationActions(openFormation(cancelled, 6)).totalDamage, 0)
})

test('ego first considers survival, then defeats, and ties keep attack first', () => {
  const run = atFloor(13)
  const front = replace(run.battle.formation, [{ hp: 4, action: { hits: [4] } }, { action: { hits: [] } }])
  const battle = { ...run.battle, bossRelic: undefined, enemyHp: 16, dice: [2], slots: ['attack'], formation: front }
  assert.equal(chooseEgoSlot(battle, 2), 'attack')
  const threat = replace(front, [{ hp: 2, action: { hits: [1] } }, { action: { hits: [5] } }])
  assert.equal(chooseEgoSlot({ ...battle, playerHp: 2, enemyHp: 14, formation: threat, dice: [3], slots: ['guard'] }, 2), 'guard')
  const tied = replace(front, [{ hp: 0, action: { hits: [] } }, { hp: 0, action: { hits: [] } }])
  assert.equal(chooseEgoSlot({ ...battle, enemyHp: 0, formation: tied }, 2), 'attack')
})

test('the crown knocks down only the locked target and uses ceiling half for piercing cost', () => {
  let run = withDice(withFormation(atFloor(13), [5, 9]), [1, 1, 2], guardAll)
  run = { ...run, battle: { ...run.battle, bossRelic: { id: 'brake-crown' } } }
  const resolved = spinYachtCounter(resolveYachtTurn(run.battle).battle)
  assert.equal(resolved.crownUsed, true)
  assert.equal(resolved.formation.enemies[0].toppled, true)
  assert.equal(resolved.formation.enemies[1].toppled, undefined)
  const follow = damageFormation(resolved.formation, 4, true)
  assert.deepEqual(follow.contacts.map(hit => hit.amount), [5, 1])
})

test('delayed damage uses surviving targets after enemy actions and death wins the tie unless revived', () => {
  const run = withDice(withFormation(atFloor(13), [4, 5]), [1, 1, 1], attackAll)
  const battle = { ...run.battle, bossRelic: undefined, playerHp: 2, loot: { ...run.battle.loot, overflowDamage: 8 } }
  const lost = resolveYachtTurn(battle).battle
  assert.equal(lost.enemyHp, 0)
  assert.equal(lost.phase, 'lost')
  assert.deepEqual(lost.formationExchange.delayed.map(hit => hit.amount), [1, 5])
  const revived = resolveYachtTurn({ ...battle, bossRelic: { id: 'revived-heart' } }).battle
  assert.equal(revived.phase, 'won')
  assert.equal(revived.bossRelic.heartUsed, true)
})

test('version, stage choice, entry grant, upper vendor receipt and end of climb round-trip', () => {
  const win12 = upper => resolveAscentTurn(withDice({ ...atFloor(12, 'boss', upper),
    battle: { ...atFloor(12, 'boss', upper).battle, enemyHp: 1, playerHp: 13 } }, [6, 5, 3], attackAll))
  const old = win12(false)
  assert.equal(old.route.screen, 'finished')
  assert.equal(restore(old), undefined)
  const choice = win12(true)
  assert.equal(restore(choice).route.screen, 'upper-choice')
  const meta = openMetaStage(choice, { version: 1, generation: 0, unlocked: [], seen: [] }, 12, true)
  assert.deepEqual(restore(meta.run).meta.opened, [12])
  assert.equal(chooseUpperAscent(choice, false).route.screen, 'finished')
  const entered = atFloor(13)
  assert.equal(entered.battle.loot.consumables.tuning, 1)
  assert.equal(restore(entered).battle.loot.consumables.tuning, 1)
  let shop = atFloor(16)
  shop = { ...shop, battle: { ...shop.battle, playerHp: 10 } }
  assert.equal(rewardOffers(shop).includes('kit'), true)
  const purchased = takeAscentReward(shop, 'kit')
  assert.equal(purchased.battle.playerHp, 14)
  assert.equal(purchased.route.coins, shop.route.coins - 2)
  const restored = restore(purchased)
  assert.deepEqual(restored.route.shopReceipts, purchased.route.shopReceipts)
  assert.deepEqual(rewardOffers(restored), [])
  assert.equal(takeAscentReward(restored, 'kit'), restored)
  let apex = withDice(withFormation(atFloor(19), [1, 1]), [6, 5, 3], attackAll)
  const { storage } = checkpointFor(apex)
  apex = resolveAscentTurn(apex)
  assert.equal(apex.route.completed.length, 19)
  writeAscentSave({ ascent: apex, selected: [] }, storage)
  assert.equal(loadAscentSave(storage), null)
  const lower = generateAscentMap(12, 7)
  const upper = generateAscentMap(12, 7, true)
  assert.deepEqual(upper.nodes.filter(node => node.floor < 12), lower.nodes.filter(node => node.floor < 12))
})
