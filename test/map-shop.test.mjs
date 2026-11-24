import assert from 'node:assert/strict'
import { test } from 'node:test'
import { availableMapNodes, beginMapAscent, enterMapNode, resolveAscentTurn, returnToMap, rewardOffers, spinAscentCounter, takeAscentReward } from '../src/ascent.ts'
import { enemyForMapNode, generateAscentMap, mapPathIsValid } from '../src/ascent-map.ts'
import { loadAscentSave, writeAscentSave } from '../src/ascent-save.ts'
import { attackFor, chargedStrikePreview, draw, enemyIntentAt, incomingAttack } from '../src/combat.ts'
import { artifactChoices, SHOP_PRICES, treasureEnabled } from '../src/map-treasure.ts'
import { ARTIFACTS, isArtifact } from '../src/treasure.ts'
import { forecastYacht, resolveYachtTurn, yachtAllocationTotals } from '../src/yacht-combat.ts'

function storage() {
  let data
  return { setItem: (_, value) => { data = value }, getItem: () => data ?? null, removeItem: () => { data = null } }
}

function resume(run, extras = {}, store = storage()) {
  writeAscentSave({ ascent: run, selected: [], ...extras }, store)
  const loaded = loadAscentSave(store)
  assert.ok(loaded)
  return loaded
}

function win(run) {
  const { battle } = run
  return resolveAscentTurn({ ...run, battle: { ...battle, enemyHp: 1, slots: battle.dice.map(() => 'attack') } })
}

function frontOf(kind, rules = 3) {
  let run = beginMapAscent(88, 'shield', 'odd', rules)
  const { map } = run.route
  const target = map.nodes.find((node) => node.kind === kind)
  function leadsToTarget(node) {
    return node.id === target.id || node.floor < target.floor && node.next.some((id) => leadsToTarget(map.byId[id]))
  }
  while (run.route.completed.length < target.floor - 1) {
    const node = availableMapNodes(run).find(leadsToTarget)
    run = enterMapNode(run, node.id)
    if (run.route.screen === 'battle') run = win(run)
    run = returnToMap(takeAscentReward(run, 'skip'))
  }
  return [run, target]
}

test('ordinary and elite victories pay once on either finish path and the wallet resets at the result', () => {
  const [first, node] = frontOf('fight')
  assert.equal(first.route.coins, 0)
  const active = enterMapNode(first, node.id)
  const ordinary = win(active)
  assert.equal(ordinary.route.coins, 1)
  assert.equal(resolveAscentTurn(ordinary), ordinary)
  assert.equal(spinAscentCounter(ordinary), ordinary)
  assert.equal(resume(ordinary).ascent.route.coins, 1)
  const [preElite, eliteNode] = frontOf('elite')
  const elite = enterMapNode(preElite, eliteNode.id)
  const exact = attackFor(elite.battle, enemyIntentAt(elite.battle)).totalDamage
  let remaining = exact
  const dice = elite.battle.dice.map((_, index, all) => {
    const face = Math.ceil(remaining / (all.length - index))
    remaining -= face
    return face
  })
  assert.ok(dice.every((face) => face >= 1 && face <= 6))
  const counter = resolveAscentTurn({ ...elite, battle: { ...elite.battle, awakened: true, enemyHp: 1, dice, slots: dice.map(() => 'guard') } })
  assert.equal(counter.battle.phase, 'counter')
  assert.equal(counter.route.coins, elite.route.coins)
  const paid = spinAscentCounter(counter)
  assert.equal(paid.route.coins, elite.route.coins + 2)
  assert.equal(resume(paid).ascent.route.coins, paid.route.coins)
  assert.equal(spinAscentCounter(paid), paid)

  const [ready, bossNode] = frontOf('boss')
  const boss = enterMapNode(ready, bossNode.id)
  assert.ok(boss.route.coins > 0)
  const cleared = win(boss)
  const defeat = resolveAscentTurn({ ...boss, battle: { ...boss.battle, awakened: true, playerHp: 1, slots: boss.battle.dice.map(() => 'attack') } })
  const store = storage()
  for (const ended of [cleared, defeat]) {
    assert.equal(ended.route.screen, 'finished')
    assert.equal(ended.route.coins, 0)
    resume(boss, {}, store)
    writeAscentSave({ ascent: ended, selected: [] }, store)
    assert.equal(loadAscentSave(store), null)
  }
})

test('merchant healing is +4, payment is atomic and unaffordable and full-health purchases are blocked', () => {
  const [before, node] = frontOf('shop')
  const full = enterMapNode(before, node.id)
  const [kit, artifact] = rewardOffers(full)
  assert.equal(kit, 'kit')
  const stock = artifactChoices(before, node)
  assert.equal(artifact, stock[draw(before.seed, node.id, 85) % stock.length])
  assert.equal(treasureEnabled(full, kit), false)
  assert.equal(treasureEnabled(full, artifact), true)
  assert.equal(takeAscentReward(full, kit), full)
  const shop = { ...full, battle: { ...full.battle, playerHp: 14 } }
  const poor = { ...shop, route: { ...shop.route, coins: 1 } }
  assert.equal(takeAscentReward(poor, kit), poor)
  assert.equal(takeAscentReward(poor, artifact), poor)
  const enoughForKit = { ...shop, route: { ...shop.route, coins: 2 } }
  assert.equal(treasureEnabled(enoughForKit, kit), true)
  assert.equal(treasureEnabled(enoughForKit, artifact), false)
  const gone = takeAscentReward(shop, 'skip')
  assert.equal(gone.route.coins, shop.route.coins)
  assert.equal(gone.route.shopPurchase, undefined)
  assert.equal(resume(gone).ascent.route.screen, 'return')

  const preview = resume(shop, { rewardPreview: kit })
  assert.equal(preview.rewardPreview, kit)
  const bought = takeAscentReward(preview.ascent, kit)
  assert.equal(bought.battle.playerHp, 18)
  assert.equal(bought.route.coins, shop.route.coins - SHOP_PRICES.kit)
  assert.equal(bought.route.shopPurchase, kit)
  assert.equal(takeAscentReward(bought, kit), bought)
  const reopened = resume(bought).ascent
  assert.deepEqual(reopened, bought)
  assert.equal(takeAscentReward(reopened, artifact), reopened)
  const progressed = returnToMap(reopened)
  assert.equal(enterMapNode(progressed, node.id), progressed)
  assert.equal(resume(progressed).ascent.route.coins, bought.route.coins)
})

test('rule-three low-health battle rewards heal 5 without changing rule-two bandages', () => {
  for (const rules of [2, 3]) {
    const [first, node] = frontOf('fight', rules)
    const active = enterMapNode(first, node.id)
    const won = win({ ...active, battle: { ...active.battle, playerHp: 14 } })
    assert.equal(takeAscentReward(won, 'bandage').battle.playerHp, rules === 3 ? 19 : 16)
  }
})

test('shop fixes eligible stock, preserves cancelled replacement and sells once after restoring the choice', () => {
  const [before, node] = frontOf('shop')
  const full = ['mirror', 'banner', 'hammer']
  const withLoot = (equipped, acquired) => ({ ...before, battle: { ...before.battle, loot: { ...before.battle.loot, equipped, acquired } } })
  const out = enterMapNode(withLoot(full, ARTIFACTS), node.id)
  assert.deepEqual(rewardOffers(out), ['kit'])
  assert.equal(takeAscentReward(out, 'mirror'), out)
  const shop = enterMapNode(withLoot(full, full), node.id)
  const artifact = rewardOffers(shop).find(isArtifact)
  assert.ok(artifact && !full.includes(artifact))
  const options = { replace: 'mirror', ...(artifact === 'incomplete' && { hand: shop.unlocks.includes('triple') ? 'straight' : 'triple' }), ...(artifact === 'heart-die' && { parity: 'odd' }) }
  assert.equal(takeAscentReward(shop, artifact), shop)
  const pending = resume(shop, { rewardPreview: artifact, artifactOptions: options })
  const cancelled = resume(pending.ascent)
  assert.equal(cancelled.rewardPreview, undefined)
  assert.equal(cancelled.ascent.route.coins, shop.route.coins)
  assert.deepEqual(cancelled.ascent.battle.loot.equipped, full)
  const bought = takeAscentReward(pending.ascent, pending.rewardPreview, pending.artifactOptions)
  assert.equal(bought.route.coins, shop.route.coins - SHOP_PRICES.artifact)
  assert.equal(bought.route.shopPurchase, artifact)
  assert.deepEqual(bought.battle.loot.equipped, [artifact, 'banner', 'hammer'])
  assert.deepEqual(bought.battle.loot.acquired, [...full, artifact])
  assert.deepEqual(resume(bought).ascent, bought)

  const [old, oldShop] = frontOf('shop', 2)
  const legacyVisit = enterMapNode(old, oldShop.id)
  assert.deepEqual(rewardOffers(resume(legacyVisit).ascent), [])
  assert.equal(takeAscentReward(legacyVisit, 'kit'), legacyVisit)
})

test('the new roster deterministically changes only its designated seats and obeys combat preview and cap', () => {
  for (let seed = 0; seed < 4096; seed++) {
    const old = generateAscentMap(seed, 2)
    const next = generateAscentMap(seed, 3)
    assert.deepEqual(generateAscentMap(seed, 3), next)
    for (const node of next.nodes) {
      const { enemyId, ...physical } = node
      const { enemyId: oldId, ...previous } = old.byId[node.id]
      assert.deepEqual(physical, previous)
      const channel = draw(seed, node.floor, 88) % 2
      const leftFight = next.nodes.find((other) => other.floor === node.floor && other.kind === 'fight')
      const expected = node === leftFight && channel === 0 && node.floor === 6 ? 'shield-soldier'
        : node === leftFight && channel === 0 && node.floor === 9 ? 'seal-sentinel'
          : node.kind === 'elite' && node.floor === 10 && channel === 1 ? 'iron-knight' : oldId
      assert.equal(enemyId, expected)
    }
    assert.ok(mapPathIsValid(next, next.nodes.filter(({ lane }) => lane !== 1).map(({ id }) => id)))
  }
  const enemyAt = (id, floor) => {
    for (let seed = 0; seed < 32; seed++) {
      const node = generateAscentMap(seed, 3).nodes.find(({ enemyId }) => enemyId === id)
      if (node) return enemyForMapNode(node, 3)
    }
    throw new Error(`Missing enemy at floor ${floor}`)
  }
  const shield = enemyAt('shield-soldier', 6)
  const seal = enemyAt('seal-sentinel', 9)
  const iron = enemyAt('iron-knight', 10)
  assert.deepEqual([shield.hp, seal.hp, iron.hp], [27, 33, 34])
  assert.deepEqual(shield.intents.map(({ hits }) => hits), [[4], [9], [3, 3]])
  assert.deepEqual(seal.intents.map(({ hits }) => hits), [[6, 4], [5, 4], [12], [9]])
  assert.deepEqual(iron.intents.map(({ hits }) => hits), [[4, 5], [6, 5], [], [15], []])
  assert.equal(iron.intents.find((row) => row.matches(5)).hits[0], 6)
  assert.equal(seal.intents.find((row) => row.matches(4)).hits[0], 5)
  assert.equal(seal.intents.find((row) => row.matches(2)).mechanic.value, 5)
  assert.equal(iron.intents.find((row) => row.matches(2)).chargeThreshold, 12)
  assert.equal(iron.intents.find((row) => row.matches(4)).damageTakenMultiplier, 2)
  const start = beginMapAscent(88, undefined, 'odd', 3).battle
  const reactive = { ...start, enemyHp: 27, turn: 2, enemyIntents: shield.intents, enemyAttackGrowth: 1, dice: [5, 3, 2], slots: ['attack', 'attack', 'guard'] }
  assert.deepEqual(incomingAttack({ ...reactive, turn: 1 }).hits, [4])
  assert.deepEqual(incomingAttack({ ...reactive, turn: 3 }).hits, [5, 5])
  assert.deepEqual(incomingAttack({ ...reactive, turn: 4 }).hits, [7])
  assert.deepEqual(incomingAttack(reactive, yachtAllocationTotals(reactive)).hits, [4, 4])
  assert.deepEqual(incomingAttack(reactive, { attack: 7 }).hits, [10])
  assert.deepEqual(forecastYacht(reactive).hits, [2, 4])
  const sealed = { ...reactive, enemyHp: 33, enemyIntents: seal.intents }
  assert.equal(yachtAllocationTotals(sealed).attack, 3)
  assert.equal(forecastYacht(sealed).hits.reduce((sum, hit) => sum + hit, 0), 11)
  const preparing = { ...reactive, enemyHp: 34, enemyIntents: iron.intents, enemyAttackGrowth: 0, enemyAttackBuff: 2,
    dice: [6, 6, 2], slots: ['attack', 'attack', 'guard'] }
  const preview = chargedStrikePreview(preparing)
  assert.equal(preview.totalDamage, 8)
  const { battle: blow } = resolveYachtTurn(preparing)
  assert.equal(blow.weakenedStrikeTurn, 3)
  assert.equal(attackFor(blow, enemyIntentAt(blow)).totalDamage, preview.totalDamage)
  for (const enemy of [shield, seal, iron]) for (let turn = 1; turn <= 40; turn++) {
    const battle = { ...start, turn, enemyIntents: enemy.intents, enemyAttackGrowth: enemy.attackGrowth, enemyAttackBuff: 2 * enemy.attackPerUnlock }
    const { hits, totalDamage } = attackFor(battle, enemyIntentAt(battle))
    assert.ok(totalDamage <= 21)
    assert.equal(hits.reduce((sum, hit) => sum + hit, 0), totalDamage)
  }
})
