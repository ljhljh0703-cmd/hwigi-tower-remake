import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ascentFinished, availableMapNodes, beginAscent, beginMapAscent, enterMapNode, resolveAscentTurn,
  returnToMap, rewardOffers, spinAscentCounter, takeAscentReward,
} from '../src/ascent.ts'
import { enemyForMapNode, generateAscentMap, MAP_FLOORS, MAP_START, mapPathIsValid, nextMapNodes } from '../src/ascent-map.ts'
import { ASCENT_SAVE_KEY, loadAscentSave, readAscentSave, writeAscentSave } from '../src/ascent-save.ts'
import { assignDie, attackFor, draw, enemyIntentAt } from '../src/combat.ts'
import { ASCENT_ENEMIES } from '../src/enemy-roster.ts'
import { RELICS } from '../src/rewards.ts'
import { rerollYachtDice, startYachtBattle } from '../src/yacht-combat.ts'

test('4,096 seeds produce the same 21 nodes, connections and enemy rolls with no isolated rooms', () => {
  const counts = [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1]
  for (let seed = 0; seed < 4096; seed++) {
    const map = generateAscentMap(seed)
    const regenerated = generateAscentMap(seed)
    assert.deepEqual(regenerated.nodes, map.nodes)
    assert.equal(map.nodes.length, 21)
    const toBoss = new Set()
    for (const node of [...map.nodes].reverse()) {
      if (node.floor === MAP_FLOORS || node.next.some((id) => toBoss.has(id))) toBoss.add(node.id)
    }
    assert.equal(toBoss.size, 21)
    let reachable = new Set([MAP_START])
    for (const [index, size] of counts.entries()) {
      const floor = index + 1
      const rooms = map.nodes.filter((room) => room.floor === floor)
      const incoming = [...reachable].flatMap((id) => nextMapNodes(map, id).map((node) => node.id))
      reachable = new Set(incoming)
      assert.deepEqual([...reachable].sort(), rooms.map(({ id }) => id).sort())
      assert.equal(rooms.length, size)
      if ([4, 7, 9].includes(floor)) assert.ok(rooms.every(({ kind }) => kind === 'fight'))
      if (floor === 11) assert.deepEqual(rooms.map(({ kind }) => kind), ['rest'])
      for (const room of rooms) {
        assert.equal(room.id, floor * 4 + room.lane)
        assert.equal(room.battleSeed, draw(seed, room.id, 83))
        if (room.kind === 'fight') assert.ok((floor % 2 ? ['thorns', 'rage'] : ['lock', 'freeze']).includes(room.enemyId))
        if (floor >= 2 && floor <= 9) assert.equal(room.next.length, room.lane === (floor + draw(seed, 0, 80) % 2) % 2 ? 2 : 1)
        const enemy = enemyForMapNode(room)
        if (!enemy) continue
        const restored = regenerated.byId[room.id]
        const first = startYachtBattle(room.battleSeed, 22, false, false, undefined, enemy)
        const replay = startYachtBattle(restored.battleSeed, 22, false, false, undefined, enemyForMapNode(restored))
        assert.deepEqual(first.dice, replay.dice)
      }
      if (rooms.every(({ kind }) => kind === 'fight') && size === 2) assert.notEqual(rooms[0].enemyId, rooms[1].enemyId)
    }
    assert.deepEqual(map.nodes.filter(({ kind }) => kind === 'elite').map(({ enemyId }) => enemyId).sort(), ['escort', 'reaction', 'vitality'])
  }
})

test('floor scaling applies to the first hit only and fixes each room’s unlock attack bonus at entry', () => {
  const base = ASCENT_ENEMIES.flat()
  const kinds = new Set()
  for (let seed = 0; seed < 12; seed++) {
    for (const room of generateAscentMap(seed).nodes) {
      const enemy = enemyForMapNode(room)
      if (!enemy) continue
      const original = base.find(({ id }) => id === room.enemyId)
      const elite = room.kind === 'elite'
      const boss = room.kind === 'boss'
      const start = startYachtBattle(room.battleSeed, 22, false, true, undefined, enemy, 2 * enemy.attackPerUnlock)
      const hitChange = boss ? 0 : Number(room.floor >= 9) - (elite ? 3 : 0)
      const first = enemyIntentAt(start)
      const opening = enemyIntentAt({ turn: 1, enemyIntents: original.intents })
      assert.deepEqual(first.hits, [Math.max(1, opening.hits[0] + hitChange), ...opening.hits.slice(1)])
      assert.equal(enemy.attackPerUnlock, Number(elite || boss))
      assert.equal(enemy.hp, boss ? 88 : original.hp + 2 * Math.floor((room.floor - (elite ? 5 : 1)) / 2))
      for (let turn = 2; turn <= 15; turn++) {
        const battle = { ...start, turn }
        const intent = enemyIntentAt(battle)
        assert.equal(intent, enemyIntentAt({ ...battle, enemyIntents: original.intents }))
        assert.ok(attackFor(battle, intent).totalDamage <= 21)
      }
      kinds.add(enemy.id)
    }
  }
  assert.equal(kinds.size, 8)
})

function storage() {
  let raw = null
  return {
    getItem: (key) => key === ASCENT_SAVE_KEY ? raw : null,
    setItem: (_, value) => { raw = value },
    removeItem: () => { raw = null },
  }
}

function win(run, extra = {}) {
  const { battle } = run
  return resolveAscentTurn({ ...run, battle: { ...battle, enemyHp: 1, slots: battle.dice.map(() => 'attack'), ...extra } })
}

test('a 1 HP counter victory freezes three cards, restores a preview and awards once', () => {
  const store = storage()
  let run = beginMapAscent(12, 'shield')
  const [first] = availableMapNodes(run)
  assert.equal(enterMapNode(run, 8), run)
  run = enterMapNode(run, first.id)
  assert.equal(enterMapNode(run, first.id), run)
  const counter = resolveAscentTurn({ ...run, battle: { ...run.battle, playerHp: 1, enemyHp: 1, dice: [3, 3, 3], slots: ['guard', 'guard', 'guard'], awakened: true } })
  assert.equal(counter.battle.phase, 'counter')
  writeAscentSave({ ascent: counter, selected: [] }, store)
  const won = spinAscentCounter(loadAscentSave(store).ascent)
  assert.equal(won.route.screen, 'reward')
  assert.equal(won.battle.playerHp, 1)
  assert.deepEqual(won.route.completed, [])
  assert.equal(rewardOffers(won).length, 3)
  assert.equal(spinAscentCounter(won), won)
  writeAscentSave({ ascent: won, selected: [], rewardPreview: 'bandage' }, store)
  const restored = loadAscentSave(store)
  assert.equal(restored.rewardPreview, 'bandage')
  assert.deepEqual(rewardOffers(restored.ascent), rewardOffers(won))
  const claimed = takeAscentReward(restored.ascent, 'bandage')
  assert.equal(claimed.battle.playerHp, 3)
  assert.deepEqual(claimed.route.completed, [first.id])
  assert.equal(takeAscentReward(claimed, 'bandage'), claimed)
  writeAscentSave({ ascent: claimed, selected: [] }, store)
  const restoredClaim = loadAscentSave(store).ascent
  assert.deepEqual(restoredClaim.route.offers, won.route.offers)
  assert.equal(restoredClaim.rewardChoice, 'bandage')
  const map = returnToMap(restoredClaim)
  assert.equal(returnToMap(map), map)
  const [left, right] = availableMapNodes(map)
  assert.notEqual(enterMapNode(map, left.id).enemy.id, enterMapNode(map, right.id).enemy.id)
  assert.equal(enterMapNode(map, first.id), map)
  assert.equal(enterMapNode(map, 14), map)
})

test('map combat restores the current turn, rolled faces, allocations and selection', () => {
  const store = storage()
  const map = beginMapAscent(405, 'reroll')
  const run = enterMapNode(map, availableMapNodes(map)[0].id)
  const placed = assignDie(run.battle, 0, 'guard')
  const board = rerollYachtDice(placed, [1, 2])
  const checkpoint = { ascent: { ...run, battle: board }, selected: [2] }
  writeAscentSave(checkpoint, store)
  const restored = loadAscentSave(store)
  assert.deepEqual(restored, checkpoint)
  assert.equal(restored.ascent.battle.rerolled, true)
  const finish = ({ ascent }) => resolveAscentTurn({ ...ascent, battle: { ...ascent.battle, slots: ['guard', 'attack', 'attack'] } })
  assert.deepEqual(finish(restored), finish(checkpoint))
})

test('11th-floor rest preserves spent relics, health and charge until the new fight', () => {
  const store = storage()
  let run = beginMapAscent(17, 'blade')
  for (let floor = 1; floor <= 10; floor++) {
    const node = availableMapNodes(run)[0]
    run = enterMapNode(run, node.id)
    assert.equal(run.fight, floor)
    run = returnToMap(takeAscentReward(win(run), 'skip'))
  }
  run = { ...run, battle: { ...run.battle, playerHp: 5, perk: { kind: 'blade', charge: 11 }, rewards: { relics: ['wedge'], spent: ['wedge'], tuning: 'spent' } } }
  const [rest] = availableMapNodes(run)
  const visit = enterMapNode(run, rest.id)
  assert.equal(visit.route.screen, 'rest')
  assert.equal(visit.battle, run.battle)
  assert.equal(takeAscentReward(visit, 'bandage'), visit)
  writeAscentSave({ ascent: visit, selected: [] }, store)
  const after = returnToMap(loadAscentSave(store).ascent)
  assert.equal(after.route.completed.length, 11)
  assert.equal(after.fight, 10)
  assert.equal(after.battle.playerHp, 5)
  assert.deepEqual(after.battle.rewards.spent, ['wedge'])
  const [boss] = availableMapNodes(after)
  const finale = enterMapNode(after, boss.id)
  assert.deepEqual([finale.fight, finale.battle.enemyHp, finale.battle.playerHp], [11, 88, 5])
  assert.deepEqual(finale.battle.perk, { kind: 'blade', charge: 0 })
  assert.deepEqual(finale.battle.rewards, { relics: ['wedge'], spent: [], tuning: 'spent' })
  const finished = win(finale)
  assert.equal(ascentFinished(finished), true)
  assert.equal(finished.route.completed.length, 12)
  assert.deepEqual(rewardOffers(finished), [])
  writeAscentSave({ ascent: finished, selected: [] }, store)
  assert.equal(loadAscentSave(store), null)
})

test('exhausted reward pools allow a single skip, and defeat preserves the failing floor in the result', () => {
  const store = storage()
  const map = beginMapAscent(44)
  const started = enterMapNode(map, availableMapNodes(map)[0].id)
  const noOffers = win(started, { rewards: { relics: RELICS, spent: [], tuning: 'spent' } })
  assert.equal(noOffers.route.screen, 'reward')
  assert.deepEqual(rewardOffers(noOffers), [])
  const claimed = takeAscentReward(noOffers, 'skip')
  assert.equal(takeAscentReward(claimed, 'skip'), claimed)
  const before = returnToMap(claimed)
  const next = enterMapNode(before, availableMapNodes(before)[0].id)
  const lost = resolveAscentTurn({ ...next, battle: { ...next.battle, playerHp: 1, awakened: true, slots: next.battle.dice.map(() => 'attack') } })
  assert.equal(ascentFinished(lost), true)
  assert.equal(lost.route.completed.length, 1)
  assert.equal(lost.route.map.byId[lost.route.node].floor, 2)
  writeAscentSave({ ascent: lost, selected: [] }, store)
  assert.equal(loadAscentSave(store), null)
})

test('map saves validate the rules and path, preserve a locked preview and coexist with version 1', () => {
  const store = storage()
  const legacy = beginAscent(12, 'shield')
  writeAscentSave({ ascent: legacy, selected: [0] }, store)
  assert.equal(JSON.parse(store.getItem(ASCENT_SAVE_KEY)).version, 1)
  assert.equal(loadAscentSave(store).ascent.route, undefined)
  const map = beginMapAscent(12, 'shield')
  const locked = map.route.map.nodes.find(({ floor }) => floor === 10)
  assert.equal(mapPathIsValid(map.route.map, [locked.id]), false)
  writeAscentSave({ ascent: map, selected: [], nodePreview: locked.id }, store)
  const checkpoint = loadAscentSave(store)
  assert.equal(checkpoint.nodePreview, locked.id)
  assert.equal(enterMapNode(checkpoint.ascent, locked.id), checkpoint.ascent)
  const raw = JSON.parse(store.getItem(ASCENT_SAVE_KEY))
  assert.equal(raw.version, 2)
  assert.equal(raw.ascent.route.rules, 1)
  assert.equal(raw.ascent.battle.enemyIntents, undefined)
  for (const change of [{ rules: 2 }, { completed: [locked.id] }, { acquired: ['weight'] }, { offers: ['bandage'] }]) {
    store.setItem(ASCENT_SAVE_KEY, JSON.stringify({ ...raw, ascent: { ...raw.ascent, route: { ...raw.ascent.route, ...change } } }))
    assert.deepEqual(readAscentSave(store), { checkpoint: null, invalidMap: true })
  }
})
