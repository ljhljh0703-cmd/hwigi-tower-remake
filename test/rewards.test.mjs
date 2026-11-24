import assert from 'node:assert/strict'
import { test } from 'node:test'
import { beginAscent, FIGHT_COUNT, nextAscentFight, resolveAscentTurn, rewardOffers, takeAscentReward } from '../src/ascent.ts'
import { loadAscentSave, writeAscentSave } from '../src/ascent-save.ts'
import { chargedStrikePreview, incomingAttack } from '../src/combat.ts'
import { forecastYacht, resolveYachtTurn, spinYachtCounter, toggleYachtWedge, tuneYachtDie, yachtAllocationTotals } from '../src/yacht-combat.ts'

function won(seed = 2, perk = 'shield', playerHp = 14) {
  const run = beginAscent(seed, perk)
  return { ...run, battle: { ...run.battle, playerHp, phase: 'won', enemyHp: 0, slots: ['attack', 'attack', 'attack'],
    lastExchange: { turn: 1, dealt: 12, hitsTaken: [], counter: null, awakened: false } } }
}

test('the three seats prioritize the starting perk and replace ineligible cards', () => {
  assert.deepEqual(rewardOffers(won()), ['buckle', 'tuning', 'bandage'])
  assert.deepEqual(rewardOffers(won(4, 'collector', 22)), ['weight', 'tuning', 'buckle'])
  assert.deepEqual(rewardOffers(won(4, 'counter', 15)), ['buckle', 'tuning', 'rewind'])
  const run = won(2, 'shield', 22)
  const testInventory = { ...run, battle: { ...run.battle, rewards: { tuning: 'spent', relics: ['weight'], spent: ['weight'] } } }
  assert.deepEqual(rewardOffers(testInventory), ['buckle', 'rewind', 'wedge'])
  assert.deepEqual(rewardOffers({ ...run, fight: FIGHT_COUNT }), [])
})

test('the wedge fills vacant seats without a charging opponent and is not offered again once held', () => {
  const run = won(7, 'shield', 22)
  assert.deepEqual(rewardOffers(run), ['buckle', 'tuning', 'wedge'])
  const carried = nextAscentFight(takeAscentReward(run, 'wedge'))
  assert.equal(carried.enemy.id, 'reaction')
  assert.deepEqual(rewardOffers(won(8, 'shield', 22)), ['buckle', 'tuning', 'wedge'])
  assert.deepEqual(rewardOffers(won(7, 'shield', 14)), ['buckle', 'tuning', 'bandage'])
  const eliteVictory = { ...carried, battle: { ...carried.battle, phase: 'won', enemyHp: 0 } }
  assert.deepEqual(rewardOffers(eliteVictory), ['buckle', 'tuning', 'rewind'])
})

test('a save restores an armed wedge and clears an obsolete reward preview', () => {
  const run = won(7, 'shield', 22)
  let raw = null
  const store = { getItem: () => raw, setItem: (_, value) => { raw = value } }
  writeAscentSave({ ascent: run, selected: [], rewardPreview: 'weight' }, store)
  const restored = loadAscentSave(store)
  assert.deepEqual(restored.ascent, run)
  assert.equal(restored.rewardPreview, undefined)
  const next = nextAscentFight(takeAscentReward(restored.ascent, 'wedge'))
  const armed = { ...next, battle: toggleYachtWedge(next.battle) }
  writeAscentSave({ ascent: armed, selected: [] }, store)
  assert.deepEqual(loadAscentSave(store).ascent, armed)
  writeAscentSave({ ascent: { ...armed, battle: { ...armed.battle, rewards: { relics: ['wedge'], spent: ['wedge'] } } }, selected: [] }, store)
  assert.equal(loadAscentSave(store), null)
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

test('weight and rewind add damage after the base reaction check and spend each use once', () => {
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
})

test('weight accepts three or more attack dice with both parities and ignores sealed eyes', () => {
  const mixed = turn(['weight'], [1, 2, 3], ['attack', 'attack', 'attack'], impact)
  const result = resolveYachtTurn(mixed).battle
  assert.equal(result.lastExchange.dealt, 8)
  assert.deepEqual(result.rewards.spent, ['weight'])
  assert.equal(forecastYacht(mixed, mixed.slots, [1, 3, 5]).dealt, 9)
  assert.equal(forecastYacht(mixed, [...mixed.slots, 'attack'], [1, 2, 3, 4]).dealt, 12)

  const seal = { ...impact, mechanic: { kind: 'seal', value: 2 } }
  const sealed = resolveYachtTurn({ ...mixed, enemyIntents: [seal] }).battle
  assert.equal(sealed.lastExchange.dealt, 4)
  assert.deepEqual(sealed.rewards.spent, [])
})

test('the wedge uses the displayed attack total for charge, commits once, and resets on the next floor', () => {
  const charge = { ...impact, id: 'charge', hits: [], chargeThreshold: 12 }
  const wedge = turn(['wedge'], [4, 3, 2], ['attack', 'attack', 'attack'], charge)
  assert.equal(forecastYacht(wedge).chargeBroken, false)
  const armed = toggleYachtWedge(wedge)
  const totals = yachtAllocationTotals(armed)
  assert.equal(totals.attack, 12)
  assert.equal(chargedStrikePreview(armed, totals).weakened, true)
  assert.deepEqual(toggleYachtWedge(armed), wedge)
  const incomplete = { ...armed, slots: ['attack', 'attack', null] }
  assert.equal(resolveYachtTurn(incomplete).battle, incomplete)

  const broken = resolveYachtTurn(armed).battle
  assert.equal(broken.lastExchange.dealt, 12)
  assert.equal(broken.lastExchange.chargeBroken, true)
  assert.equal(broken.weakenedStrikeTurn, 2)
  assert.deepEqual(broken.rewards.spent, ['wedge'])
  assert.equal(broken.wedgeArmed, undefined)
  assert.equal(toggleYachtWedge(broken), broken)
  const intermission = won()
  const next = nextAscentFight({ ...intermission, battle: { ...intermission.battle, rewards: broken.rewards } })
  assert.deepEqual(next.battle.rewards, { relics: ['wedge'], spent: [] })
  assert.equal(toggleYachtWedge(next.battle).wedgeArmed, true)
})

test('the wedge changes reaction at the displayed threshold and its flat bonus works on guard-only and lethal turns', () => {
  const alternate = { ...impact, hits: [2, 2] }
  const reaction = { ...impact, mechanic: { kind: 'reaction', value: 10, alternate } }
  const ready = turn(['wedge'], [4, 3, 2], ['attack', 'attack', 'guard'], reaction)
  const armed = toggleYachtWedge(ready)
  assert.deepEqual(forecastYacht(ready).hits, [5])
  assert.deepEqual(incomingAttack(armed, yachtAllocationTotals(armed)).hits, [2, 2])
  const resolved = resolveYachtTurn(armed).battle
  assert.equal(resolved.lastExchange.dealt, 10)
  assert.deepEqual(resolved.lastExchange.hitsTaken, [0, 2])

  const lethal = toggleYachtWedge({ ...ready, enemyHp: 3, slots: ['guard', 'guard', 'guard'] })
  assert.equal(yachtAllocationTotals(lethal).attack, 3)
  const won = resolveYachtTurn(lethal).battle
  assert.equal(won.phase, 'won')
  assert.deepEqual(won.rewards.spent, ['wedge'])
  assert.equal(toggleYachtWedge(won), won)

  const blade = { ...armed, perk: { kind: 'blade', charge: 12 } }
  assert.equal(yachtAllocationTotals(blade).attack, 17)
})

test('buckle covers a guard shortfall of one to three without absorbing thorns or creating a counter', () => {
  const thorns = { ...impact, hits: [4, 3], mechanic: { kind: 'thorns', value: 2 } }
  const battle = turn(['buckle'], [4, 1, 1], ['guard', 'attack', 'attack'], thorns)
  for (const [guard, saved] of [[3, 0], [4, 2], [5, 2], [6, 1]]) {
    const outcome = resolveYachtTurn({ ...battle, dice: [guard, 1, 1] }).battle
    assert.equal(outcome.lastExchange.hitsTaken.at(-1), 4)
    assert.equal(outcome.playerHp, battle.playerHp - (7 - guard + 4 - saved))
    assert.equal(outcome.phase, 'assign')
    assert.deepEqual(outcome.rewards.spent, saved ? ['buckle'] : [])
  }

  const exact = resolveYachtTurn({ ...battle, dice: [4, 3, 1], slots: ['guard', 'guard', 'attack'] }).battle
  assert.equal(exact.phase, 'counter')
  assert.deepEqual(exact.rewards.spent, [])
  const spent = resolveYachtTurn(battle).battle.rewards
  assert.equal(forecastYacht({ ...battle, rewards: spent }).damage, 7)
})

test('buckle can absorb a shortfall across hits without a die in the guard slot', () => {
  const combo = { ...impact, hits: [1, 1, 1] }
  const noGuard = turn(['buckle'], [1, 1, 1], ['attack', 'attack', 'attack'], combo)
  const outcome = resolveYachtTurn(noGuard).battle
  assert.deepEqual(outcome.lastExchange.hitsTaken, [0, 0, 1])
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
