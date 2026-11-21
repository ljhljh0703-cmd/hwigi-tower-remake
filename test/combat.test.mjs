import assert from 'node:assert/strict'
import { test } from 'node:test'
import { intentForTurn, startBattle } from '../src/combat.ts'

const readPattern = (seed) => Array.from({ length: 12 }, (_, index) =>
  intentForTurn(seed, index + 1),
)

test('same seed yields the same encounter and intent order', () => {
  assert.deepEqual(startBattle(42), startBattle(42))
  assert.deepEqual(readPattern(42), readPattern(42))
  const samples = Array.from({ length: 32 }, (_, seed) => readPattern(seed).join())
  assert.ok(new Set(samples).size > 1, 'the seed affects the pattern')
})

test('each group of three turns contains each move once', () => {
  const intents = readPattern(42)
  for (let offset = 0; offset < intents.length; offset += 3) {
    assert.deepEqual(intents.slice(offset, offset + 3).sort(), ['heavy', 'jab', 'rush'])
  }
})

test('same seed and policy yield the same full sequence', async () => {
  const { readIntent, simulate } = await import('../src/simulate.ts')
  for (let seed = 0; seed < 64; seed += 1) {
    assert.deepEqual(simulate(seed, readIntent), simulate(seed, readIntent))
  }
})

test('guard counters a heavy blow and interrupt stops a rush', async () => {
  const { takeTurn } = await import('../src/combat.ts')
  const battle = startBattle(31)
  const guarded = takeTurn({ ...battle, intent: 'heavy' }, 'guard')
  const interrupted = takeTurn({ ...battle, intent: 'rush' }, 'interrupt')
  assert.deepEqual(guarded.lastExchange, { action: 'guard', intent: 'heavy', dealt: 4, taken: 0 })
  assert.deepEqual(interrupted.lastExchange, { action: 'interrupt', intent: 'rush', dealt: 6, taken: 0 })
})

test('a finishing attack prevents the enemy strike and the terminal state stays put', async () => {
  const { takeTurn } = await import('../src/combat.ts')
  const final = takeTurn({ ...startBattle(1), intent: 'heavy', playerHp: 1, enemyHp: 1 }, 'attack')
  assert.equal(final.outcome, 'won')
  assert.equal(final.playerHp, 1)
  assert.equal(final.enemyHp, 0)
  assert.equal(takeTurn(final, 'attack'), final)
})

test('reading the tells and ignoring them produce a different outcome', async () => {
  const { attackOnly, readIntent, simulate } = await import('../src/simulate.ts')
  for (let seed = 0; seed < 64; seed += 1) {
    const read = simulate(seed, readIntent).at(-1)
    const spam = simulate(seed, attackOnly).at(-1)
    assert.equal(read.outcome, 'won')
    assert.equal(read.turn, 5)
    assert.equal(spam.outcome, 'lost')
  }
})
