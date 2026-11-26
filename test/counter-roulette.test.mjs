import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CounterRoulette } from '../src/counter-roulette.ts'

test('a rejected roulette presentation releases the input lock and allows another spin', async () => {
  const failure = Error('roulette animation failed')
  const wheel = { animate() { throw failure } }
  const panel = {
    querySelector: (selector) => selector === '#counter-wheel' ? wheel : null,
    classList: { contains: () => true },
    dataset: {},
  }
  const button = { querySelector: () => ({}) }
  const roulette = new CounterRoulette(panel, button)
  const spin = roulette.play(() => roulette.reveal({ slot: 0, damage: 1, joint: false }, true, () => {}))

  assert.equal(roulette.busy, true)
  await roulette.play(async () => assert.fail('a second spin acquired the lock'))
  await assert.rejects(spin, failure)
  assert.equal(roulette.busy, false)

  let retried = false
  await roulette.play(async () => { retried = roulette.busy })
  assert.equal(retried, true)
  assert.equal(roulette.busy, false)
})
