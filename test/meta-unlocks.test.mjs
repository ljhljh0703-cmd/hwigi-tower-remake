import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { availableMapNodes, beginMapAscent, enterMapNode, resolveAscentTurn, takeAscentReward } from '../src/ascent.ts'
import { draftMetaDie, transferMetaPip } from '../src/meta-combat.ts'
import { ALL_META_FLOORS, loadMetaProgress, markMetaOffers, META_SAVE_KEY, openMetaStage, resetMetaProgress, resumeMetaRun, snapshotMeta, writeMetaProgress } from '../src/meta-progress.ts'
import { META_ARTIFACTS, META_PERKS, META_VALUES } from '../src/meta-unlocks.ts'
import { offerPerks, startPerk } from '../src/perks.ts'
import { emptyTreasure, nextTreasureBattle } from '../src/treasure.ts'
import { availableCounterChoices } from '../src/treasure-combat.ts'
import { treasureOffers } from '../src/map-treasure.ts'
import { canResolveYachtTurn, forecastYacht, previewUnlockProgress, previewYachtHand, rerollYachtDice, resolveYachtTurn, spendExtraReroll, spinYachtCounter, startYachtBattle, yachtCounterRewards } from '../src/yacht-combat.ts'
import { checkpoint, mapBefore } from '../smoke/rules-six-fixtures.mjs'

const a = 'attack', g = 'guard'
const storageFor = () => {
  const data = new Map()
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
}
const board = (dice, slots, hits, perk, equipped = [], options = {}) => ({
  ...startYachtBattle(24, 22, false, false, startPerk(perk), undefined, 0, undefined, true, undefined, true),
  loot: { ...emptyTreasure, consumables: {}, equipped, acquired: equipped },
  awakened: true, enemyHp: 60, dice, slots,
  enemyIntents: [{ id: 'impact', name: '시험 공격', matches: () => true, hits }], ...options,
})

test('first entries record once in a separate key and publish every new pair after saving and resuming', () => {
  const storage = storageFor()
  let progress = loadMetaProgress(storage)
  const original = snapshotMeta(progress)
  let run
  for (const floor of [3, 5, 7, 9]) {
    const base = { ...mapBefore(14, floor, 7), meta: run?.meta ?? original }
    run = enterMapNode(base, availableMapNodes(base)[0].id)
    assert.equal(openMetaStage(run, progress, 12, true).progress, progress)
    const unlocked = openMetaStage(run, progress, floor)
    run = unlocked.run
    writeMetaProgress(unlocked.progress, storage)
    progress = loadMetaProgress(storage)
    assert.ok(JSON.parse(storage.getItem(META_SAVE_KEY)).unlocked.includes(floor))
    assert.equal(storage.getItem('hwigi-tower.ascent'), null)
    const restored = checkpoint(run).restored.ascent
    const again = openMetaStage(restored, progress, floor)
    assert.equal(again.progress, progress)
    assert.deepEqual(again.run.meta, run.meta)
  }
  assert.deepEqual(run.meta.opened, [3, 5, 7, 9])
  assert.deepEqual(run.meta.pool, [])
  const beforeLast = { ...mapBefore(14, 12, 7), meta: run.meta }
  const last = enterMapNode(beforeLast, availableMapNodes(beforeLast)[0].id)
  const won = resolveAscentTurn({ ...last, battle: { ...last.battle, enemyHp: 1, awakened: true,
    dice: last.battle.dice.map(() => 6), slots: last.battle.slots.map(() => a) } })
  assert.deepEqual(openMetaStage(won, progress, 12, true).run.meta.opened, ALL_META_FLOORS)
  const reset = resetMetaProgress(progress)
  assert.deepEqual(resumeMetaRun(run, reset).run.meta.opened, [])
  assert.deepEqual(reset.unlocked, [])
  assert.deepEqual(resumeMetaRun(run, loadMetaProgress(storageFor())).progress.unlocked, [3, 5, 7, 9])
})

test('only the next run samples unlocked candidates and the first actual offer marks a perk once', () => {
  const all = { ...loadMetaProgress(storageFor()), unlocked: ALL_META_FLOORS }
  const seed = Array.from({ length: 100 }, (_, index) => index).find(index => offerPerks(index, all.unlocked).includes('reverse-guard'))
  const offers = offerPerks(seed, all.unlocked)
  assert.equal(new Set(offers).size, 4)
  assert.deepEqual(offers.slice(0, 3), offerPerks(seed))
  assert.deepEqual(offerPerks(seed, [7]), [...offerPerks(seed), 'charge-roll'])
  const marked = markMetaOffers(all, offers)
  assert.ok(marked.fresh.includes('reverse-guard'))
  assert.deepEqual(markMetaOffers(marked.progress, offers).fresh, [])
  assert.equal(beginMapAscent(seed, 'reverse-guard', 'odd', 7).battle.perk, undefined)
  const full = beginMapAscent(seed, 'reverse-guard', 'odd', 7, snapshotMeta(all))
  assert.ok(checkpoint(full).restored)
  const found = new Set()
  for (let index=0; index<128; index++) {
    const run = beginMapAscent(index, undefined, 'odd', 7, snapshotMeta(all))
    for (const room of run.route.map.nodes.filter(node => node.kind === 'elite' || node.kind === 'shop' || node.event === 'flag')) {
      const ids = treasureOffers(run, room)
      const regular = treasureOffers({ ...run, meta: undefined }, room)
      assert.equal(new Set(ids).size, ids.length)
      assert.deepEqual(ids.slice(0, regular.length), regular)
      assert.ok(ids.length <= regular.length + 1)
      if (room.kind === 'elite') assert.ok(!ids.includes('linked-cup'))
      ids.forEach(id => found.add(id))
    }
  }
  for (const id of Object.keys(META_ARTIFACTS)) assert.ok(found.has(id), id)
  for (const { icon } of [...Object.values(META_PERKS), ...Object.values(META_ARTIFACTS)]) {
    const png = readFileSync(new URL('../public/art/ui/icons/icon-' + icon + '.png', import.meta.url))
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [24, 24])
  }
})

test('regular and unlocked shop options survive a checkpoint, including older pending offers', () => {
  for (let seed = 0; seed < 128; seed++) {
    const shop = beginMapAscent(seed, undefined, 'odd', 7).route.map.nodes.find(room => room.kind === 'shop')
    const before = mapBefore(seed, shop.floor, 7)
    if (!availableMapNodes(before).some(room => room.id === shop.id) || before.route.coins < 5) continue
    const original = enterMapNode(before, shop.id)
    const run = enterMapNode({ ...before, meta: { generation: 0, pool: ALL_META_FLOORS, opened: [] } }, shop.id)
    const bonus = run.route.offers.find(id => Object.hasOwn(META_ARTIFACTS, id))
    if (!bonus) continue
    const restored = checkpoint(run, bonus).restored
    assert.deepEqual(restored.ascent.route.offers, [...original.route.offers, bonus])
    assert.equal(restored.rewardPreview, bonus)
    const legacyOffers = treasureOffers(run, shop, true)
    const legacy = checkpoint({ ...run, route: { ...run.route, offers: legacyOffers } }, 'kit').restored
    assert.notDeepEqual(legacyOffers, run.route.offers)
    assert.deepEqual(legacy.ascent.route.offers, legacyOffers)
    assert.equal(legacy.rewardPreview, 'kit')
    const bought = takeAscentReward(restored.ascent, bonus)
    assert.ok(checkpoint(bought).restored.ascent.battle.loot.equipped.includes(bonus))
    return
  }
  assert.fail('상점에서 살 수 있는 해금 유물 시드가 없습니다.')
})

test('guard reversal, split straight, charge roll and early reroll change only their specified actions', () => {
  const reverse = board([2, 5, 6], [g, g, a], [10], 'reverse-guard')
  const draft = draftMetaDie(reverse, 'reverse-guard', 0)
  assert.equal(forecastYacht(reverse).counter, false)
  assert.equal(forecastYacht(draft).counter, true)
  const defended = resolveYachtTurn(draft).battle
  assert.equal(defended.perk.spent, true)
  assert.deepEqual(defended.dice, reverse.dice)
  const split = board([2, 3, 4], [a, g, a], [4], 'join-slots')
  assert.equal(previewUnlockProgress(split).straight.progress, 3)
  assert.equal(resolveYachtTurn(split).hand.hand, 'straight')
  assert.equal(forecastYacht(split).dealt, 6 + META_VALUES.joinAttack)
  assert.equal(forecastYacht({ ...split, slots: [a, a, a] }).dealt, 9)
  assert.equal(forecastYacht({ ...split, dice: [2, 3, 5] }).dealt, 7)
  assert.equal(previewYachtHand({ ...split, perk: undefined }), null)
  const charge = rerollYachtDice(board([2, 3, 4], [g, g, a], [9], 'charge-roll'), [0])
  assert.ok([5, 6].includes(charge.dice[0]))
  assert.equal(charge.slots[0], a)
  assert.equal(forecastYacht(charge).dealt, charge.dice[0] + charge.dice[2] + META_VALUES.chargeAttack)
  assert.equal(canResolveYachtTurn({ ...charge, slots: [g, g, a] }), false)
  const early = board([2, 3, 4], [a, g, a], [9], 'early-reroll')
  assert.equal(early.extraRerollAvailable, true)
  const spent = spendExtraReroll(early, 0)
  assert.equal(spent.extraRerollSpent, true)
  assert.equal(spent.rerolled, false)
  const normalRoll = spendExtraReroll({ ...early, perk: undefined, rerolled: true }, 0)
  assert.equal(spent.dice[0], Math.min(6, normalRoll.dice[0] + META_VALUES.earlyPips))
  assert.equal(rerollYachtDice(spent, [1]).rerolled, true)
})

test('adjacent needle and counter recovery settle one visible counter choice', () => {
  const guard = board([2, 3, 4], [g, g, g], [9], undefined, ['adjacent-needle'])
  const pending = spinYachtCounter(resolveYachtTurn(guard).battle)
  const slot = (pending.loot.counter.slot + 1) % 6
  const shifted = spinYachtCounter(pending, 'adjacent')
  assert.equal(shifted.lastExchange.counter.slot, slot)
  assert.equal(shifted.lastExchange.counter.damage, yachtCounterRewards(guard)[slot].damage)
  assert.deepEqual(shifted.loot.spent, ['adjacent-needle'])
  const recover = board([2, 3, 4], [g, g, g], [9], 'counter-recover')
  assert.equal(recover.extraRerollAvailable, true)
  const spentRecovery = { ...recover, extraRerollAvailable: false, extraRerollSpent: true }
  const pendingRecovery = spinYachtCounter(resolveYachtTurn(spentRecovery).battle)
  assert.ok(availableCounterChoices(pendingRecovery).includes('recover-reroll'))
  const restored = spinYachtCounter(pendingRecovery, 'recover-reroll')
  assert.equal(restored.extraRerollAvailable, true)
  assert.equal(restored.extraRerollSpent, undefined)
  assert.equal(restored.lastExchange.counter.damage, Math.max(0, pendingRecovery.loot.counter.damage - META_VALUES.recoveryCost))
})

test('scabbard carries only direct overkill and blood, linked dice and pip transfer spend once', () => {
  const attack = board([4, 4, 4], [a, a, a], [], undefined, ['scabbard'], { enemyHp: 7 })
  const gained = resolveYachtTurn(attack).battle
  assert.equal(gained.loot.scabbard, 5)
  const next = { ...attack, loot: nextTreasureBattle(gained.loot), enemyHp: 14 }
  assert.equal(forecastYacht(next).dealt, 14)
  assert.equal(resolveYachtTurn(next).battle.loot.scabbard, undefined)
  const blood = draftMetaDie(board([4, 4, 4], [a, a, a], [], undefined, ['blood-grip'], { playerHp: 8 }), 'blood-grip', 0)
  assert.equal(previewYachtHand(blood), null)
  const used = resolveYachtTurn(blood).battle
  assert.equal(used.playerHp, 12)
  assert.equal(used.lastExchange.dealt, 8)
  assert.deepEqual(used.loot.spent, ['blood-grip'])
  const lethal = resolveYachtTurn({ ...blood, enemyIntents: [{ id: 'impact', name: '시험', matches: () => true, hits: [12] }] }).battle
  assert.equal(lethal.phase, 'lost')
  const ring = board([5, 3, 2], [a, a, a], [], undefined, ['pip-ring'])
  const moved = transferMetaPip(ring, 0, 1)
  assert.deepEqual(moved.dice, [4, 4, 2])
  assert.equal(transferMetaPip(moved, 0, 1), moved)
  const cup = board([5, 3, 2], [a, g, g], [], undefined, ['linked-cup'])
  const linked = rerollYachtDice(cup, [0, 1], true)
  assert.equal(Math.abs(linked.dice[0] - linked.dice[1]), 1)
  assert.deepEqual(linked.loot.spent, ['linked-cup'])
  assert.equal(rerollYachtDice(linked, [0, 1], true), linked)
})
