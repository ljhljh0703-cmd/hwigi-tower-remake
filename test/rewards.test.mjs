import assert from 'node:assert/strict'
import { test } from 'node:test'
import { beginAscent, FIGHT_COUNT, nextAscentFight, resolveAscentTurn, rewardOffers, takeAscentReward } from '../src/ascent.ts'
import { loadAscentSave, writeAscentSave } from '../src/ascent-save.ts'
import { resolveYachtTurn, spinYachtCounter, tuneYachtDie } from '../src/yacht-combat.ts'

function won(seed = 2, perk = 'shield', playerHp = 14) {
  const run = beginAscent(seed, perk)
  return { ...run, battle: { ...run.battle, playerHp, phase: 'won', enemyHp: 0, slots: ['attack', 'attack', 'attack'],
    lastExchange: { turn: 1, dealt: 12, hitsTaken: [], counter: null, awakened: false } } }
}

test('the three seats prioritize the starting perk, replace ineligible cards, and gate the wedge', () => {
  assert.deepEqual(rewardOffers(won()), ['buckle', 'tuning', 'bandage'])
  assert.deepEqual(rewardOffers(won(4, 'collector', 22)), ['weight', 'tuning', 'buckle'])
  assert.deepEqual(rewardOffers(won(4, 'counter', 15)), ['buckle', 'tuning', 'weight'])
  const run = won(2, 'shield', 22)
  const testInventory = { ...run, battle: { ...run.battle, rewards: { tuning: 'spent', relics: ['weight'], spent: ['weight'] } } }
  assert.deepEqual(rewardOffers(testInventory), ['buckle', 'wedge', 'rewind']) // Seed 2 leads to the charging vitality elite.
  assert.deepEqual(rewardOffers({ ...testInventory, seed: 4 }), ['buckle', 'rewind']) // Seed 4 leads to reaction.
  assert.deepEqual(rewardOffers({ ...run, fight: FIGHT_COUNT }), [])
})

test('a charging opponent gives the wedge first priority only for vacant seats and clears obsolete previews', () => {
  const run = won(2, 'shield', 22)
  assert.deepEqual(rewardOffers(run), ['buckle', 'tuning', 'wedge'])
  assert.deepEqual(rewardOffers(won(2, 'shield', 14)), ['buckle', 'tuning', 'bandage'])
  assert.deepEqual(rewardOffers(won(4, 'shield', 22)), ['buckle', 'tuning', 'weight'])

  const carried = nextAscentFight(takeAscentReward(run, 'wedge'))
  const eliteVictory = { ...carried, battle: { ...carried.battle, phase: 'won', enemyHp: 0 } }
  assert.deepEqual(rewardOffers(eliteVictory), ['buckle', 'tuning', 'weight'])

  let raw = null
  const store = { getItem: () => raw, setItem: (_, value) => { raw = value } }
  writeAscentSave({ ascent: run, selected: [], rewardPreview: 'weight' }, store)
  const restored = loadAscentSave(store)
  assert.deepEqual(restored.ascent, run)
  assert.equal(restored.rewardPreview, undefined)
})

test('reward previews and confirmed claims survive a save with no repeat grant', () => {
  const run = won()
  let data = null
  const store = { getItem: () => data, setItem: (_, value) => { data = value }, removeItem: () => { data = null } }
  writeAscentSave({ ascent: run, selected: [], rewardPreview: 'bandage' }, store)
  const pending = loadAscentSave(store)
  assert.equal(pending.rewardPreview, 'bandage')
  assert.equal(pending.ascent.battle.playerHp, 14)
  const healed = takeAscentReward(pending.ascent, 'bandage')
  assert.equal(healed.battle.playerHp, 16)
  assert.deepEqual(rewardOffers(healed), [])
  writeAscentSave({ ascent: healed, selected: [] }, store)
  const claimed = loadAscentSave(store).ascent
  assert.equal(takeAscentReward(claimed, 'bandage'), claimed)
  assert.equal(takeAscentReward(claimed, 'tuning'), claimed)
  const next = nextAscentFight(claimed)
  assert.deepEqual([next.battle.playerHp, next.rewardChoice], [16, undefined])

  const relic = takeAscentReward(run, 'buckle')
  const battle = nextAscentFight(relic)
  writeAscentSave({ ascent: battle, selected: [] }, store)
  assert.deepEqual(loadAscentSave(store).ascent.battle.rewards, { relics: ['buckle'], spent: [] })
  assert.equal(takeAscentReward(run, 'wedge'), run)
  assert.equal(takeAscentReward(run, 'skip').battle.playerHp, 14)
})

test('a reward is offered for a roulette win and skipped for a simultaneous thorns defeat', () => {
  const start = beginAscent(42, 'shield')
  const lastExchange = { turn: 1, dealt: 0, hitsTaken: [0], counter: null, awakened: false }
  const counter = spinYachtCounter({ ...start.battle, enemyHp: 1, phase: 'counter', lastExchange })
  assert.equal(counter.phase, 'won')
  assert.equal(rewardOffers({ ...start, battle: counter }).length, 3)

  const thorns = { id: 'impact', name: '가시', hits: [7], mechanic: { kind: 'thorns', value: 6 }, matches: () => true }
  const lost = resolveAscentTurn({ ...start, battle: { ...start.battle, enemyHp: 6, playerHp: 1, awakened: true,
    enemyIntents: [thorns], dice: [3, 3, 3], slots: ['attack', 'attack', 'attack'] } })
  assert.equal(lost.battle.phase, 'lost')
  assert.deepEqual(rewardOffers(lost), [])
})

function turn(relics, dice, slots, intent, extra = {}) {
  return { ...beginAscent(42).battle, dice, slots, enemyIntents: [intent], awakened: true,
    rewards: { relics, spent: [] }, ...extra }
}

const impact = { id: 'impact', name: '공격', hits: [7], matches: () => true }

test('attack relics fire after the base reaction and charge checks and spend each use once', () => {
  const alternate = { ...impact, hits: [2, 2] }
  const reaction = { ...impact, mechanic: { kind: 'reaction', value: 8, alternate } }
  const weight = turn(['weight'], [3, 4, 2], ['attack', 'attack', 'guard'], reaction)
  const first = resolveYachtTurn(weight).battle
  assert.deepEqual(first.lastExchange.hitsTaken, [5])
  assert.equal(first.lastExchange.dealt, 9)
  assert.deepEqual(first.rewards.spent, ['weight'])
  assert.equal(resolveYachtTurn({ ...weight, rewards: first.rewards }).battle.lastExchange.dealt, 7)

  const rewind = turn(['rewind'], [4, 3, 3], ['attack', 'guard', 'guard'], impact, { rerolled: true })
  assert.equal(resolveYachtTurn(rewind).battle.lastExchange.dealt, 6)
  assert.deepEqual(resolveYachtTurn({ ...rewind, rerolled: false }).battle.rewards.spent, [])
  const charge = { ...impact, id: 'charge', hits: [], chargeThreshold: 12 }
  const wedge = turn(['wedge'], [4, 4, 4], ['attack', 'attack', 'attack'], charge)
  const broken = resolveYachtTurn(wedge).battle
  assert.equal(broken.lastExchange.dealt, 15)
  assert.equal(broken.lastExchange.chargeBroken, true)
  assert.equal(broken.weakenedStrikeTurn, 2)
  assert.deepEqual(resolveYachtTurn({ ...wedge, dice: [4, 4, 3] }).battle.rewards.spent, [])
  const intermission = won()
  const next = nextAscentFight({ ...intermission, battle: { ...intermission.battle, rewards: broken.rewards } })
  assert.deepEqual(next.battle.rewards, { relics: ['wedge'], spent: [] })
})

test('buckle protects HP without creating an exact block or removing thorns', () => {
  const thorns = { ...impact, mechanic: { kind: 'thorns', value: 2 } }
  const battle = turn(['buckle'], [3, 3, 4], ['guard', 'guard', 'attack'], thorns)
  const outcome = resolveYachtTurn(battle).battle
  assert.deepEqual(outcome.lastExchange.hitsTaken, [0, 2])
  assert.equal(outcome.playerHp, 20)
  assert.equal(outcome.phase, 'assign')
  assert.deepEqual(outcome.rewards.spent, ['buckle'])
})

test('tuning-made hands count, and tuning respects fixed and sealed dice and the one-use limit', () => {
  const start = beginAscent(3)
  const battle = { ...start.battle, rewards: { relics: [], spent: [], tuning: 'ready' }, dice: [2, 3, 3], slots: ['attack', 'attack', 'attack'] }
  assert.equal(tuneYachtDie({ ...battle, fixedDie: { index: 0, kind: 'lock' } }, 1).dice[0], 2)
  const seal = { ...impact, mechanic: { kind: 'seal', value: 5 } }
  const blocked = { ...battle, enemyIntents: [seal], dice: [4, 3, 3] }
  assert.equal(tuneYachtDie(blocked, 1), blocked)
  const sealed = { ...blocked, dice: [5, 3, 3] }
  assert.equal(tuneYachtDie(sealed, -1), sealed)
  const adjusted = tuneYachtDie(battle, 1)
  assert.deepEqual(adjusted.dice, [3, 3, 3])
  assert.equal(adjusted.rewards.tuning, 'spent')
  assert.equal(tuneYachtDie(adjusted, -1), adjusted)
  assert.equal(resolveAscentTurn({ ...start, battle: adjusted }).newUnlock, 'triple')
})
