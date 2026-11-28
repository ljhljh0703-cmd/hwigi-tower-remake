import assert from 'node:assert/strict'
import { test } from 'node:test'
import { availableMapNodes, beginMapAscent, enterMapNode, resolveAscentTurn } from '../src/ascent.ts'
import { roll } from '../src/combat.ts'
import { canSelectItemDie } from '../src/item-effects.ts'
import { chooseEgoSlot, diceUnlockSignals, resolveYachtTurn, spinYachtCounter, startYachtBattle, yachtCounterRewards, yachtCounterSlot } from '../src/yacht-combat.ts'
import { checkpoint } from '../smoke/rules-six-fixtures.mjs'

const attack = 'attack'
const guard = 'guard'
const intent = { id: 'impact', name: '시험', matches: () => true, hits: [9] }
const board = (dice, options = {}) => ({
  ...startYachtBattle(24, 22, true, false, undefined, undefined, 0, undefined, true, undefined, true),
  awakened: true, enemyHp: 40, enemyIntents: [intent],
  dice, slots: [guard, attack, attack], ...options,
})

test('ego makes an exact guard, finishes a kill, and prioritizes blocking at low health', () => {
  assert.equal(chooseEgoSlot(board([6, 1, 1]), 3), guard)
  assert.equal(chooseEgoSlot(board([6, 1, 1], { enemyHp: 4 }), 2), attack)
  assert.equal(chooseEgoSlot(board([6, 1, 1], { playerHp: 8 }), 5), guard)
})

test('ego can complete a new straight and breaks tied scores in attack, guard, rest order', () => {
  const straight = board([2, 3, 4], { slots: [attack, attack, guard], enemyIntents: [{ ...intent, hits: [12] }] })
  assert.equal(chooseEgoSlot(straight, 4, ['triple']), attack)
  const sealed = board([2, 4, 6], { enemyIntents: [{ ...intent, mechanic: { kind: 'seal', value: 5 } }] })
  assert.equal(chooseEgoSlot(sealed, 5, ['triple', 'straight']), attack)
})

test('same eyes unlock across two slots without an exact guard, excluding sealed eyes', () => {
  const start = beginMapAscent(12, 'shield', 'odd', 7)
  const fight = enterMapNode(start, availableMapNodes(start)[0].id)
  const battle = board([4, 4, 4], { ...fight.battle, enemyIntents: [intent], dice: [4, 4, 4], slots: [attack, attack, guard] })
  assert.equal(resolveAscentTurn({ ...fight, battle }).newUnlock, 'triple')
  assert.equal(diceUnlockSignals(battle).triple.progress, 3)
  const sealed = { ...battle, enemyIntents: [{ ...intent, mechanic: { kind: 'seal', value: 4 } }] }
  assert.equal(resolveYachtTurn(sealed).hand, null)
  assert.equal(diceUnlockSignals(sealed).triple.progress, 0)
  const gap = diceUnlockSignals({ ...battle, dice: [4, 6, 1] }).straight
  assert.deepEqual(gap.needed, [5])
  assert.equal(gap.matching.size, 0)
  assert.equal(gap.progress, 2)
})

test('automatic ego is absent from the hand and rolls the same heart parity after save or rearrangement', () => {
  const start = beginMapAscent(12, 'shield', 'odd', 7)
  const fight = enterMapNode(start, availableMapNodes(start)[0].id)
  const battle = { ...fight.battle, fourthDieUnlocked: true, dice: [1, 1, 2], slots: [attack, guard, attack],
    loot: { ...fight.battle.loot, acquired: ['heart-die'], equipped: ['heart-die'], heartParity: 'even' } }
  const run = { ...fight, battle, unlocks: ['triple'] }
  assert.equal(canSelectItemDie(battle, 2), true)
  assert.equal(canSelectItemDie(battle, 3), false)
  const legacy = { ...run, battle: { ...battle, dice: [1, 1, 2, 6], slots: [attack, guard, attack, guard], fixedDie: { kind: 'lock', index: 3 } } }
  const migrated = checkpoint(legacy, undefined, [2, 3]).restored
  assert.deepEqual(migrated.ascent.battle.dice, [1, 1, 2])
  assert.deepEqual(migrated.ascent.battle.slots, battle.slots)
  assert.deepEqual(migrated.ascent.battle.fixedDie, { kind: 'lock', index: 0 })
  assert.deepEqual(migrated.selected, [2])
  const restored = checkpoint(run).restored.ascent
  const after = resolveAscentTurn(run)
  const ego = after.battle.lastExchange.ego
  assert.equal(ego.face, Math.ceil(roll(battle.seed, battle.turn, 8) / 2) * 2)
  assert.deepEqual(resolveAscentTurn(restored).battle.lastExchange.ego, ego)
  assert.deepEqual(checkpoint(after).restored.ascent.battle.lastExchange.ego, ego)
  const rearranged = { ...restored, battle: { ...restored.battle, slots: [guard, attack, attack] } }
  assert.equal(resolveAscentTurn(rearranged).battle.lastExchange.ego.face, ego.face)
})

test('an automatic exact guard leaves joint roulette damage and keeps the next hand at three dice', () => {
  const seeds = Array.from({ length: 128 }, (_, seed) => board([6, 1, 1], { seed }))
  const opening = seeds.find(battle => roll(battle.seed, battle.turn, 8) === 3 && yachtCounterRewards(battle)[yachtCounterSlot(battle)].joint)
  assert.ok(opening)
  const pending = resolveYachtTurn(opening).battle
  assert.equal(pending.phase, 'counter')
  assert.deepEqual(pending.lastExchange.ego, { face: 3, slot: guard })
  const after = spinYachtCounter(pending)
  assert.equal(after.lastExchange.counter.joint, true)
  assert.equal(after.enemyHp, pending.enemyHp - after.lastExchange.counter.damage)
  assert.equal(after.dice.length, 3)
})
