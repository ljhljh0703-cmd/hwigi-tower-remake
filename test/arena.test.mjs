import assert from 'node:assert/strict'
import { test } from 'node:test'
import { heroExchangePoses } from '../src/arena.ts'
import { beginAscent } from '../src/ascent.ts'
import { resolveYachtTurn } from '../src/yacht-combat.ts'

function poses(before) {
  const { battle } = resolveYachtTurn(before)
  return heroExchangePoses(before, battle.lastExchange).map(({ pose }) => pose)
}

test('the hero swings, guards and reels in the order a mixed turn resolves', () => {
  const { battle } = beginAscent(91)
  const before = { ...battle, dice: [4, 5, 3], slots: ['guard', 'guard', 'attack'] }
  assert.deepEqual(poses(before), ['attack', 'guard'])
  assert.deepEqual(poses({ ...before, dice: [2, 5, 3] }), ['attack', 'guard', 'hit'])
  assert.deepEqual(poses({ ...before, slots: ['attack', 'attack', 'attack'] }), ['attack', 'hit'])
})

test('the hero guards only when the enemy actually attacks', () => {
  const { battle } = beginAscent(91)
  const before = { ...battle, dice: [4, 5, 3], slots: ['guard', 'guard', 'attack'] }
  assert.deepEqual(poses({ ...before, enemyHp: 3 }), ['attack'])
  const charge = { id: 'charge', name: '힘 모으기', hits: [], matches: () => true }
  assert.deepEqual(poses({ ...before, enemyIntents: [charge] }), ['attack'])
})

test('the hero recoils from thorns after a finishing blow without showing a guard', () => {
  const { battle } = beginAscent(3)
  const before = { ...battle, turn: 2, enemyHp: 3, dice: [4, 5, 3], slots: ['guard', 'guard', 'attack'] }
  assert.deepEqual(poses(before), ['attack', 'hit'])
})
