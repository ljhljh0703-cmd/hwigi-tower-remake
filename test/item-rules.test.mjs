import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { availableMapNodes, beginMapAscent, canKeepEliteArtifacts, enterMapNode, resolveAscentTurn, returnToMap, rewardOffers, spinAscentCounter, takeAscentReward } from '../src/ascent.ts'
import { CURRENT_MAP_RULES, generateAscentMap } from '../src/ascent-map.ts'
import { loadAscentSave } from '../src/ascent-save.ts'
import { adjustItemDie, chooseReserveRoll, selectLatchDie, toggleConsumable } from '../src/item-effects.ts'
import { shopPrice, treasureOffers } from '../src/map-treasure.ts'
import { startPerk } from '../src/perks.ts'
import { COMMON_ARTIFACTS, COMMON_CONSUMABLES, emptyTreasure, isSevenTreasure, NEW_TREASURES, RARE_ARTIFACTS, RARE_CONSUMABLES } from '../src/treasure.ts'
import { availableCounterChoices, toggleArtifact } from '../src/treasure-combat.ts'
import { canResolveYachtTurn, forecastYacht, rerollYachtDice, resolveYachtTurn, spendExtraReroll, spinYachtCounter, startYachtBattle, yachtAllocationTotals, yachtCounterRewards, yachtCounterSlot, yachtRerollCost } from '../src/yacht-combat.ts'
import { checkpoint, eliteWithThreeArtifacts, encounter, mapBefore, playWith } from '../smoke/rules-six-fixtures.mjs'

const a = 'attack', g = 'guard'
const gear = (...equipped) => ({ equipped, acquired: equipped })
const active = (id) => ({ consumables: { [id]: 1 }, consumableArmed: id })
const board = (dice, slots, hits = [9], loot = {}, battle = {}) => ({
  ...startYachtBattle(24, 22, dice.length === 4, false, undefined, undefined, 0, undefined, true, undefined, true),
  loot: { ...emptyTreasure, consumables: {}, ...loot },
  awakened: true, enemyHp: 60, dice, slots,
  enemyIntents: [{ id: 'impact', name: '시험 공격', matches: () => true, hits }], ...battle,
})

test('rules seven uses the rules-six map and draws only the appropriate item grades', () => {
  assert.equal(CURRENT_MAP_RULES, 7)
  const offered = new Set()
  for (let seed = 0; seed < 256; seed++) {
    const run = beginMapAscent(seed, undefined, 'odd', 7)
    assert.deepEqual(generateAscentMap(seed, 6).nodes, run.route.map.nodes)
    const fight = run.route.map.nodes[0]
    const offers = treasureOffers(run, fight)
    assert.deepEqual(treasureOffers(run, fight), offers)
    assert.equal(new Set(offers).size, 3)
    assert.ok(offers.slice(0, 2).every((id) => COMMON_CONSUMABLES.includes(id)))
    assert.ok([...COMMON_CONSUMABLES, ...RARE_CONSUMABLES].includes(offers[2]))
    offers.forEach((id) => offered.add(id))
    assert.equal(treasureOffers({ ...run, battle: { ...run.battle, playerHp: 14 } }, fight)[2], 'bandage')
    for (const elite of run.route.map.nodes.filter((node) => node.kind === 'elite')) {
      const cards = treasureOffers(run, elite)
      assert.equal(cards.length, 2)
      assert.ok(cards.every((id) => COMMON_ARTIFACTS.includes(id) && id !== 'horn'))
      const spent = { ...run, unlocks: ['triple'], battle: { ...run.battle, loot: { ...run.battle.loot, acquired: COMMON_ARTIFACTS, equipped: ['mirror', 'banner', 'overflow'] } } }
      assert.deepEqual(new Set(treasureOffers(spent, elite)), new Set(['horn', 'die-latch']))
    }
    for (const shop of run.route.map.nodes.filter((node) => node.kind === 'shop')) {
      assert.equal(treasureOffers(run, shop)[0], 'kit')
      assert.ok(treasureOffers(run, shop).every(isSevenTreasure))
    }
  }
  assert.deepEqual(offered, new Set([...COMMON_CONSUMABLES, ...RARE_CONSUMABLES]))
  for (const id of NEW_TREASURES) {
    const png = readFileSync(new URL(`../public/art/ui/icons/icon-treasure-${id}.png`, import.meta.url))
    assert.equal(png.toString('ascii', 12, 16), 'IHDR')
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [24, 24])
  }
})

test('attack items add before the highest multiplier, commit once and have no escort dependency', () => {
  const weight = board([5, 4, 2], [a, a, g], [2], active('weight'))
  assert.equal(yachtAllocationTotals(weight).attack, 14)
  const spent = resolveYachtTurn(weight).battle
  assert.equal(spent.lastExchange.dealt, 14)
  assert.deepEqual(spent.loot.consumables, {})
  const advance = board([4, 3, 2], [a, a, a], [4], active('advance-knot'))
  assert.equal(forecastYacht(advance).dealt, 15)
  assert.equal(forecastYacht({ ...advance, slots: [a, a, g] }).loot.consumables['advance-knot'], 1)
  const wedge = board([4, 3, 2], [g, g, g], [2], active('wedge'))
  assert.equal(forecastYacht(wedge).dealt, 0)
  assert.equal(forecastYacht(wedge).loot.consumables.wedge, 1)
  assert.equal(forecastYacht({ ...wedge, slots: [a, g, g] }).dealt, 7)
  const clash = board([4, 4, 2], [a, a, g], [], active('clash-seal'), { perk: { kind: 'blade', charge: 12 } })
  assert.equal(forecastYacht(clash).dealt, 16)
  assert.equal(forecastYacht({ ...clash, perk: undefined, slots: [a, g, a] }).dealt, 6)
  const prepared = board([4, 4, 2], [a, a, g], [], { prepared: { whetstone: 1 } })
  assert.equal(forecastYacht(prepared).dealt, 32)
  assert.equal(resolveYachtTurn({ ...prepared, slots: [g, g, g] }).battle.loot.prepared.whetstone, undefined)
  assert.equal(forecastYacht({ ...prepared, turn: 2 }).dealt, 8)

  const escort = encounter('escort', undefined, 7).battle
  const after = resolveYachtTurn({ ...escort, turn: 4, awakened: true, escort: { hp: 5, bonus: 3 }, dice: [2, 4, 5], slots: [a, g, g],
    loot: { ...escort.loot, ...active('weight') } }).battle
  assert.equal(after.lastExchange.gimmick, 'retreat')
  assert.equal(after.lastExchange.dealt, 4)
  assert.deepEqual(after.loot.consumables, {})
})

test('spacer and banner change exact defense while damage protection follows guard without blocking thorns', () => {
  const spacer = board([4, 6, 2], [g, g, a], [4, 5], active('spacer'))
  assert.equal(yachtAllocationTotals(spacer).guard, 9)
  assert.equal(resolveYachtTurn(spacer).battle.phase, 'counter')
  const over = { ...spacer, dice: [5, 6, 2] }
  assert.equal(forecastYacht(over).counter, false)
  assert.equal(resolveYachtTurn(over).battle.loot.consumables.spacer, 1)
  const resting = { ...spacer, enemyIntents: [{ ...spacer.enemyIntents[0], hits: [] }] }
  assert.equal(forecastYacht(resting).counter, false)
  assert.equal(forecastYacht(resting).loot.consumables.spacer, 1)
  const banner = toggleArtifact(board([4, 5, 1], [a, g, a], [12], gear('banner')), 'banner')
  assert.equal(yachtAllocationTotals(banner).guard, 12)
  assert.equal(resolveYachtTurn(banner).battle.phase, 'counter')
  assert.deepEqual(resolveYachtTurn(banner).battle.loot.spent, ['banner'])
  const buckle = board([5, 6, 1], [a, a, g], [4, 4], { ...active('buckle'), prepared: { lining: 1 } })
  assert.equal(forecastYacht(buckle).damage, 0)
  assert.equal(forecastYacht(buckle).counter, false)
  assert.deepEqual(forecastYacht(buckle).loot.triggered, ['lining', 'buckle'])
  const thorns = { ...buckle, enemyHp: 1, enemyIntents: [{ ...buckle.enemyIntents[0], mechanic: { kind: 'thorns', value: 2 } }] }
  assert.equal(forecastYacht(thorns).damage, 4)
  assert.equal(forecastYacht(thorns).loot.consumables.buckle, 1)
})

test('die adjustment, reserve choices and the latch are single-use and resume the exact pending dice', () => {
  const tunable = board([1, 3, 6, 4], [a, a, g, g], [], { ...gear('hourglass'), consumables: { tuning: 2, 'twin-mold': 1 } })
  assert.equal(adjustItemDie(tunable, 3, 'tuning', 1), tunable)
  assert.equal(adjustItemDie({ ...tunable, fixedDie: { kind: 'lock', index: 1 } }, 1, 'tuning', 1).dice[1], 3)
  const tuned = adjustItemDie(tunable, 1, 'tuning', 1)
  assert.deepEqual(tuned.dice, [1, 4, 6, 4])
  assert.equal(adjustItemDie(tuned, 2, 'twin-mold', 1), tuned)
  assert.deepEqual(adjustItemDie(tunable, 0, 'twin-mold', 2).dice, [6, 3, 6, 4])
  const adjusted = adjustItemDie(tuned, 0, 'hourglass', 6)
  assert.equal(adjusted.playerHp, 20)
  assert.deepEqual(adjusted.loot.spent, ['hourglass'])
  const dying = { ...tunable, playerHp: 2 }
  assert.equal(adjustItemDie(dying, 0, 'hourglass', 6), dying)

  const run = encounter('chain-warden', 6, 7)
  const reserve = { ...run.battle, loot: { ...run.battle.loot, consumables: { 'reserve-gauge': 1 } } }
  const armed = toggleConsumable(reserve, 'reserve-gauge')
  const rolled = rerollYachtDice(armed, [0, 1, 2])
  assert.equal(canResolveYachtTurn(rolled), false)
  assert.deepEqual(rolled.dice, reserve.dice)
  const restored = checkpoint({ ...run, battle: rolled }).restored.ascent.battle
  assert.deepEqual(restored.loot.reserveRoll, rolled.loot.reserveRoll)
  assert.deepEqual(chooseReserveRoll(restored, 1, true).dice, [reserve.dice[0], rolled.loot.reserveRoll[1].rolled, reserve.dice[2], ...reserve.dice.slice(3)])

  const latched = selectLatchDie(board([4, 5, 4], [g, g, a], [9], gear('die-latch')), 2)
  const exact = resolveYachtTurn(latched).battle
  assert.equal(exact.phase, 'counter')
  assert.deepEqual(exact.loot.latched, { index: 2, face: 4 })
  const next = spinYachtCounter(exact)
  assert.equal(next.dice[2], 4)
  assert.equal(next.loot.latched, undefined)
  assert.equal(selectLatchDie(next, 2), next)
})

test('the seal respects natural triples and the collector and shield track only the new bonuses', () => {
  const base = beginMapAscent(4, 'collector', 'odd', 7)
  const run = enterMapNode(base, availableMapNodes(base)[0].id)
  const equipped = { ...run, battle: { ...run.battle, loot: { ...run.battle.loot, ...gear('incomplete') } } }
  const pair = playWith(equipped, [3, 3, 2], [a, a, g], { awakened: true })
  assert.deepEqual(pair.unlocks, ['triple'])
  assert.deepEqual(pair.battle.perk.hands, ['triple'])
  assert.equal(pair.battle.loot.sealUsed, true)
  assert.ok(checkpoint(pair).restored)
  const natural = playWith(equipped, [3, 3, 3], [a, a, a], { awakened: true })
  assert.deepEqual(natural.unlocks, ['triple'])
  assert.equal(natural.battle.loot.sealUsed, undefined)
  assert.equal(playWith(equipped, [3, 3, 2], [g, g, a], { awakened: true }).battle.loot.sealUsed, undefined)

  const save = resolveYachtTurn(board([4, 5, 2], [g, g, a], [9], {}, { perk: startPerk('shield') })).battle
  assert.equal(save.perk.bonus, 9)
  const miss = resolveYachtTurn(board([4, 5, 2], [g, g, g], [9], {}, { perk: save.perk })).battle
  assert.equal(miss.perk.bonus, 9)
  const attack = resolveYachtTurn(board([4, 5, 2], [a, g, g], [9], {}, { perk: save.perk })).battle
  assert.equal(attack.lastExchange.dealt, 13)
  assert.equal(attack.perk.bonus, 0)
})

test('coin saves its second slot, emperor leaves matching defense and crown trades the first hit for knockdown', () => {
  const run = encounter('freeze', 2, 7)
  const plan = { ...run.battle, awakened: true, turn: 2, dice: [1, 3, 3, 6], slots: [a, g, g, a], loot: { ...run.battle.loot, consumables: { coin: 1 } } }
  const exact = resolveAscentTurn({ ...run, battle: plan })
  assert.equal(exact.battle.phase, 'counter')
  const first = spinAscentCounter(exact)
  assert.ok(availableCounterChoices(first.battle).includes('coin'))
  const second = spinAscentCounter(first, 'coin')
  const loaded = checkpoint(second).restored.ascent
  assert.equal(loaded.battle.loot.counter.slot, yachtCounterSlot(second.battle, true))
  assert.equal(loaded.battle.loot.counterRecast, true)
  assert.equal(loaded.battle.loot.consumables.coin, undefined)
  assert.ok(!availableCounterChoices(loaded.battle).includes('coin'))
  assert.equal(spinAscentCounter(loaded, 'now').battle.lastExchange.counter.damage, second.battle.loot.counter.damage)

  const emperor = { id: 'emperor-shield' }
  const guard = board([3, 3, 3], [g, g, g], [4, 5], {}, { bossRelic: emperor, perk: startPerk('counter') })
  const half = resolveYachtTurn(guard)
  assert.deepEqual(half.hand, { hand: 'triple', slot: g })
  assert.equal(half.battle.phase, 'counter')
  const expected = yachtCounterRewards(half.battle)[yachtCounterSlot(half.battle)]
  const hit = spinYachtCounter(half.battle)
  assert.equal(hit.lastExchange.counter.damage, Math.floor(expected.damage / 2))
  assert.equal(hit.perk.growth, 2)
  assert.equal(forecastYacht({ ...guard, slots: [a, g, g] }).damage, 0)
  const chain = encounter('chain-warden', 6, 7).battle
  const reflection = forecastYacht({ ...chain, turn: 2, dice: [5, 4, 3, 6], slots: [g, a, g, a], bossRelic: emperor })
  assert.equal(reflection.counter, false)
  assert.equal(reflection.incoming.totalDamage, 0)
  const guardOnly = { ...chain, turn: 2, dice: [5, 4, 3, 6], slots: [g, g, g, g] }
  const delayed = forecastYacht({ ...guardOnly, loot: { ...guardOnly.loot, mirrorDamage: 6 } })
  assert.equal(delayed.dealt, forecastYacht(guardOnly).dealt)
  assert.equal(delayed.loot.mirrorDamage, undefined)

  const crown = board([3, 3, 3], [g, g, g], [9], { ...gear('mirror'), consumables: { coin: 1 } }, { bossRelic: { id: 'brake-crown' }, enemyHp: 1 })
  const yielded = spinYachtCounter(resolveYachtTurn(crown).battle)
  assert.equal(yielded.enemyHp, 1)
  assert.deepEqual(yielded.interrupted, { turn: 2, kind: 'topple' })
  assert.equal(yielded.lastExchange.counter.damage, 0)
  assert.equal(yielded.loot.consumables.coin, 1)
  assert.equal(yachtAllocationTotals({ ...yielded, dice: [4, 5, 2], slots: [a, a, g] }).attack, 15)
  assert.equal(yachtAllocationTotals({ ...yielded, itemsSeven: undefined, dice: [4, 5, 2], slots: [a, a, g] }).attack, 18)
  const later = spinYachtCounter(resolveYachtTurn({ ...crown, turn: 3, crownUsed: true, loot: { ...emptyTreasure, consumables: {} } }).battle)
  assert.equal(later.phase, 'won')
  assert.ok(later.lastExchange.counter.damage > 0)
})

test('healing scepter subtracts only the basic use and a revived heart halves room healing', () => {
  const scepter = board([1, 2, 3], [g, g, g], [], {}, { bossRelic: { id: 'healing-scepter' }, extraRerollAvailable: true })
  assert.equal(yachtRerollCost(scepter), null)
  assert.equal(rerollYachtDice(scepter, [0]), scepter)
  assert.equal(spendExtraReroll(scepter, 0).extraRerollAvailable, false)
  const devil = { ...scepter, perk: startPerk('reroll') }
  assert.equal(yachtRerollCost(devil), 1)
  assert.equal(rerollYachtDice(devil, [0]).playerHp, 21)
  const restMap = mapBefore(14, 11, 7, 'revived-heart')
  const rest = enterMapNode({ ...restMap, battle: { ...restMap.battle, playerHp: 11 } }, availableMapNodes(restMap)[0].id)
  const healed = takeAscentReward(rest, 'kit')
  assert.equal(healed.battle.playerHp, 13)
  const resumed = checkpoint(healed).restored.ascent
  assert.equal(takeAscentReward(resumed, 'kit'), resumed)
  assert.equal(returnToMap(resumed).battle.playerHp, 13)
  const lethal = board([1, 1, 1], [a, a, a], [15], {}, { playerHp: 5, bossRelic: { id: 'revived-heart' } })
  const revived = resolveYachtTurn(lethal).battle
  assert.equal(revived.playerHp, 12)
  assert.equal(revived.bossRelic.heartUsed, true)
  assert.equal(resolveYachtTurn({ ...lethal, bossRelic: revived.bossRelic }).battle.phase, 'lost')
  assert.equal(resolveYachtTurn({ ...lethal, itemsSeven: undefined }).battle.playerHp, 9)
})

test('tuned artifacts and the previously stored rules-seven values resume at their exact amount', () => {
  const current = beginMapAscent(10, 'shield', 'odd', 7)
  const run = enterMapNode(current, availableMapNodes(current)[0].id)
  const loot = { ...run.battle.loot, ...gear('overflow', 'mirror'), spent: ['overflow', 'mirror'] }
  for (const [bonus, overflowDamage, mirrorDamage] of [[4, 6, 12], [9, 12, 16]]) {
    const battle = { ...run.battle, perk: { kind: 'shield', bonus }, loot: { ...loot, overflowDamage, mirrorDamage } }
    const saved = checkpoint({ ...run, battle }).restored.ascent.battle
    assert.equal(saved.perk.bonus, bonus)
    assert.equal(saved.loot.overflowDamage, overflowDamage)
    assert.equal(saved.loot.mirrorDamage, mirrorDamage)
  }
  const invalid = { ...run.battle, loot: { ...loot, overflowDamage: 13 } }
  assert.equal(checkpoint({ ...run, battle: invalid }).restored, null)
  const counter = board([3, 3, 3, 3], [g, g, g, a], [9], gear('horn', 'mirror'))
  const offered = spinYachtCounter(resolveYachtTurn(counter).battle)
  assert.ok(availableCounterChoices({ ...offered, loot: { ...offered.loot, counter: { slot: 0, damage: 11, joint: false } } }).includes('horn'))
  assert.ok(!availableCounterChoices({ ...offered, loot: { ...offered.loot, counter: { slot: 0, damage: 12, joint: false } } }).includes('horn'))
})

test('the rules-seven bandage preview and claim survive reloading without a second heal', () => {
  const start = beginMapAscent(12, undefined, 'odd', 7)
  const run = enterMapNode(start, availableMapNodes(start)[0].id)
  const reward = playWith(run, [4, 2, 4], [a, a, a], { awakened: true, enemyHp: 1, playerHp: 10 })
  assert.ok(rewardOffers(reward).includes('bandage'))
  const preview = checkpoint(reward, 'bandage').restored
  assert.equal(preview.rewardPreview, 'bandage')
  const claimed = takeAscentReward(preview.ascent, 'bandage')
  assert.equal(claimed.battle.playerHp, reward.battle.playerHp + 5)
  const after = checkpoint(claimed).restored.ascent
  assert.equal(takeAscentReward(after, 'bandage'), after)
  assert.equal(returnToMap(after).battle.playerHp, claimed.battle.playerHp)
})

test('rare shop price persists after purchase and rules-six pending deleted loot survives', () => {
  let rareShop
  for (let seed = 0; seed < 64 && !rareShop; seed++) {
    const map = generateAscentMap(seed, 7)
    const shop = map.nodes.find(({ kind }) => kind === 'shop')
    const run = enterMapNode(mapBefore(seed, shop.floor, 7), shop.id)
    if (run.route.coins >= 5 && rewardOffers(run).some((id) => id === 'hourglass')) rareShop = run
  }
  assert.ok(rareShop)
  assert.equal(shopPrice('hourglass', 6), 4)
  assert.equal(shopPrice('hourglass', 7), 5)
  const before = checkpoint(rareShop, 'hourglass').restored.ascent
  const bought = takeAscentReward(before, 'hourglass')
  assert.equal(bought.route.coins, before.route.coins - 5)
  const restored = checkpoint(bought).restored.ascent
  assert.equal(restored.route.shopPurchase, 'hourglass')
  assert.equal(takeAscentReward(restored, 'hourglass'), restored)
  assert.ok(checkpoint(returnToMap(restored)).restored)

  const old = encounter('chain-warden', 6, 6)
  const legacy = { ...old, battle: { ...old.battle, loot: { ...old.battle.loot, ...gear('hammer'), items: { hook: 2, mantle: 1 }, armed: ['hammer'], shards: { assist: 1 } } } }
  assert.deepEqual(checkpoint(legacy).restored.ascent.battle.loot, legacy.battle.loot)
  const modern = encounter('chain-warden', 6, 7)
  const { json } = checkpoint(modern)
  const invalid = JSON.parse(json)
  invalid.ascent.battle.loot.items.hook = 1
  assert.equal(loadAscentSave({ getItem: () => JSON.stringify(invalid) }), null)
})

test('an elite victory can preserve all three artifacts and awards two extra coins only once', () => {
  const fight = eliteWithThreeArtifacts()
  const equipped = fight.battle.loot.equipped
  const dice = fight.battle.dice.map(() => 6)
  const reward = playWith(fight, dice, dice.map(() => a), { enemyHp: 1, awakened: true })
  assert.equal(reward.route.coins, fight.route.coins + 2)
  assert.ok(canKeepEliteArtifacts(reward))
  const preview = checkpoint(reward, rewardOffers(reward)[0]).restored.ascent
  const kept = takeAscentReward(preview, 'keep-artifacts')
  assert.equal(kept.route.coins, reward.route.coins + 2)
  assert.deepEqual(kept.battle.loot, reward.battle.loot)
  assert.deepEqual(kept.route.declinedEliteRewards, [reward.route.node])
  const { json, restored } = checkpoint(kept)
  assert.equal(restored.ascent.rewardChoice, 'keep-artifacts')
  assert.equal(takeAscentReward(restored.ascent, 'keep-artifacts'), restored.ascent)
  const map = returnToMap(restored.ascent)
  assert.equal(checkpoint(map).restored.ascent.route.coins, reward.route.coins + 2)
  const invalid = JSON.parse(json)
  invalid.ascent.route.declinedEliteRewards.push(reward.route.node)
  invalid.ascent.route.coins += 2
  assert.equal(loadAscentSave({ getItem: () => JSON.stringify(invalid) }), null)

  const swapped = takeAscentReward(preview, rewardOffers(preview)[0], { replace: equipped[0] })
  assert.equal(swapped.route.coins, preview.route.coins)
  assert.ok(!swapped.battle.loot.equipped.includes(equipped[0]))
  const withRoom = { ...reward, battle: { ...reward.battle, loot: { ...reward.battle.loot, equipped: equipped.slice(1) } } }
  assert.equal(takeAscentReward(withRoom, 'keep-artifacts'), withRoom)
})

test('a full artifact rack cannot skip the sixth-floor boss relic and the boss has its own slot', () => {
  const boss = encounter('chain-warden', 6, 7)
  const dice = boss.battle.dice.map(() => 6)
  const loot = { ...boss.battle.loot, ...gear('banner', 'mirror', 'overflow') }
  const reward = playWith(boss, dice, dice.map(() => a), { loot, enemyHp: 1, awakened: true })
  assert.equal(canKeepEliteArtifacts(reward), false)
  assert.equal(takeAscentReward(reward, 'keep-artifacts'), reward)
  assert.equal(takeAscentReward(reward, 'skip'), reward)
  const granted = takeAscentReward(reward, 'emperor-shield')
  assert.deepEqual(granted.battle.loot.equipped, loot.equipped)
  assert.equal(granted.battle.bossRelic.id, 'emperor-shield')
  assert.equal(checkpoint(granted).restored.ascent.battle.bossRelic.id, 'emperor-shield')
})
