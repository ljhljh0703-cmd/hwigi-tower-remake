import assert from 'node:assert/strict'
import { test } from 'node:test'
import { companionDieIndex } from '../src/companion.ts'
import { ASCENT_ENEMIES } from '../src/enemy-roster.ts'
import { resolveYachtTurn, startYachtBattle } from '../src/yacht-combat.ts'

test('the awakened die follows the playable row when an ordinary die is stolen or returned', () => {
  const overseer = ASCENT_ENEMIES[1].find(({ id }) => id === 'escort')
  const sleeping = startYachtBattle(42, 22, false, false, undefined, overseer)
  const awakened = startYachtBattle(42, 22, true, false, undefined, overseer)
  assert.equal(companionDieIndex(sleeping), null)
  assert.equal(companionDieIndex(awakened), 3)
  assert.equal(companionDieIndex({ ...awakened, phase: 'counter' }), null)

  const guarded = { ...awakened, dice: [6, 6, 6, 6], slots: ['guard', 'guard', 'guard', 'guard'] }
  const { battle: robbed } = resolveYachtTurn(guarded)
  assert.ok(robbed.stolenDie)
  assert.equal(companionDieIndex(robbed), 2)

  const { battle: returned } = resolveYachtTurn({ ...robbed, dice: [6, 6, 6], slots: ['attack', 'attack', 'attack'] })
  assert.equal(returned.stolenDie, undefined)
  assert.equal(companionDieIndex(returned), 3)
})
