import assert from 'node:assert/strict'
import { test } from 'node:test'
import { availableMapNodes, beginMapAscent, enterMapNode, resolveAscentTurn, returnToMap, rewardOffers, spinAscentCounter, takeAscentReward } from '../src/ascent.ts'
import { CURRENT_MAP_RULES, enemyForMapNode } from '../src/ascent-map.ts'
import { BOSS_RELICS, EMPEROR_SHIELD_CAP, HEART_REVIVAL_HP } from '../src/boss-relic.ts'
import { attackFor, draw, enemyIntentAt } from '../src/combat.ts'
import { treasureOffers } from '../src/map-treasure.ts'
import { ARTIFACTS } from '../src/treasure.ts'
import { forecastYacht, resolveYachtTurn, yachtAllocationTotals, yachtGimmick } from '../src/yacht-combat.ts'
import { checkpoint, encounter, finishRoom, mapBefore, playWith } from '../smoke/rules-six-fixtures.mjs'

const a = 'attack', g = 'guard'

test('규칙판 6 시드 0의 선제 처치는 새 등반과 이어 하기 모두 가시 없이 승리한다', () => {
  const start = beginMapAscent(0, 'shield', 'odd', 6)
  const golem = enterMapNode(start, availableMapNodes(start)[0].id)
  assert.deepEqual(golem.battle.dice, [6, 6, 5])
  const afterOne = playWith(golem, golem.battle.dice, [a, a, a])
  assert.deepEqual([afterOne.battle.playerHp, afterOne.battle.enemyHp], [13, 5])
  assert.deepEqual(afterOne.battle.dice, [2, 4, 3])
  const pending = { ...afterOne, battle: { ...afterOne.battle, slots: [a, a, a] } }
  for (const run of [pending, checkpoint(pending).restored.ascent]) {
    const won = resolveAscentTurn(run)
    const { phase, playerHp, enemyHp, lastExchange } = checkpoint(won).restored.ascent.battle
    assert.deepEqual([phase, playerHp, enemyHp, lastExchange.hitsTaken, lastExchange.defeatedByThorns],
      ['won', 13, 0, [], undefined])
  }

  const direct = playWith(golem, golem.battle.dice, [a, g, g], { playerHp: 1, enemyHp: 6, awakened: true }).battle
  assert.deepEqual([direct.phase, direct.playerHp, direct.enemyHp, direct.lastExchange.hitsTaken], ['won', 1, 0, []])
})

test('살아 있는 골렘의 가시는 발동하고 이전 규칙판에서는 처치 때도 적용된다', () => {
  const current = encounter('thorns', 1)
  const turnTwo = { ...current.battle, turn: 2, playerHp: 13, enemyHp: 5, dice: [2, 4, 3], slots: [g, g, a], awakened: true }
  const live = resolveYachtTurn(turnTwo).battle
  assert.deepEqual([live.phase, live.playerHp, live.enemyHp, live.lastExchange.hitsTaken], ['assign', 4, 2, [0, 3, 6]])
  const late = resolveYachtTurn({ ...turnTwo, loot: { ...turnTwo.loot, prepared: { whetstone: 1 } } }).battle
  assert.deepEqual([late.phase, late.playerHp, late.enemyHp, late.lastExchange.hitsTaken], ['won', 4, 0, [0, 3, 6]])

  for (const rules of [1, 2, 3, 4, 5]) {
    const map = beginMapAscent(0, 'shield', 'odd', rules)
    const golem = enterMapNode(map, availableMapNodes(map)[0].id)
    const pending = { ...golem, battle: { ...golem.battle, turn: 2, playerHp: 13, enemyHp: 5, dice: [2, 4, 3], slots: [a, a, a], awakened: true } }
    const { phase, playerHp, enemyHp, lastExchange } = resolveAscentTurn(checkpoint(pending).restored.ascent).battle
    assert.deepEqual([phase, playerHp, enemyHp, lastExchange.hitsTaken, lastExchange.defeatedByThorns],
      ['lost', 0, 0, [18], true], `규칙판 ${rules}`)
  }
})

test('선제 처치에서 철추 반사 피해는 추가되지 않고 숫돌 처치는 적 공격 뒤예요', () => {
  const thrower = encounter('chain-warden', 6)
  const direct = { ...thrower.battle, turn: 2, playerHp: 1, enemyHp: 6, awakened: true, dice: [6, 5, 1], slots: [a, g, g] }
  const reflect = forecastYacht(direct)
  assert.equal(reflect.opening.dealt, 6)
  assert.equal(reflect.reflected.dealt, 0)
  assert.deepEqual(resolveYachtTurn(direct).battle.lastExchange.hitsTaken, [])

  const golem = encounter('thorns', 1)
  const delayed = { ...golem.battle, dice: [6, 2, 1], slots: [a, g, g], enemyHp: 8,
    loot: { ...golem.battle.loot, prepared: { whetstone: 1 } } }
  const result = forecastYacht(delayed)
  assert.equal(result.opening.dealt, 6)
  assert.equal(result.dealt, 8)
  assert.deepEqual(result.hits, [6])
  assert.deepEqual(resolveYachtTurn(delayed).battle.lastExchange.hitsTaken, [6])
})

test('다섯 기믹은 지정된 칸의 눈으로만 성립하고 현재 턴과 다음 턴을 구분한다', () => {
  const trip = encounter('freeze', 2)
  const turnTwo = { ...trip, battle: { ...trip.battle, turn: 2, awakened: true } }
  const missed = playWith(turnTwo, [1, 3, 3], [g, a, g]).battle
  assert.equal(missed.interrupted, undefined)
  const tripped = playWith(turnTwo, [1, 3, 3], [a, g, g]).battle
  assert.equal(tripped.lastExchange.dealt, 1)
  assert.equal(tripped.lastExchange.gimmick, 'trip')
  assert.equal(tripped.phase, 'counter')
  const trippedNext = spinAscentCounter({ ...turnTwo, battle: tripped }).battle
  assert.equal(enemyIntentAt(trippedNext).id, 'stunned')
  assert.deepEqual(forecastYacht(trippedNext, [g, g, g]).incoming.hits, [])

  const armored = encounter('reaction')
  const armor = { ...armored, battle: { ...armored.battle, turn: 2, awakened: true } }
  assert.equal(playWith(armor, [2, 2, 5], [g, g, a]).battle.armorBroken, undefined)
  const broken = playWith(armor, [2, 2, 5], [a, a, g])
  assert.equal(broken.battle.lastExchange.dealt, 4)
  const resumed = checkpoint(broken).restored.ascent.battle
  assert.equal(resumed.armorBroken, true)
  assert.equal(yachtAllocationTotals(resumed, [a, a, g], [2, 3, 5]).attack, 7)
  assert.equal(yachtAllocationTotals({ ...resumed, interrupted: { turn: resumed.turn, kind: 'topple' } }, [a, a, g], [2, 3, 5]).attack, 10)
  assert.equal(yachtGimmick({ ...resumed, turn: 6 }), null)

  const thrower = encounter('vitality')
  const reflectBattle = { ...thrower.battle, turn: 2, awakened: true, dice: [5, 4, 3] }
  const incoming = attackFor(reflectBattle, enemyIntentAt(reflectBattle)).totalDamage
  assert.equal(incoming, 8)
  assert.equal(forecastYacht(reflectBattle, [a, g, g]).incoming.totalDamage, incoming)
  const reflected = resolveYachtTurn({ ...reflectBattle, slots: [g, a, g] }).battle
  assert.equal(reflected.lastExchange.dealt, incoming + 4)
  assert.equal(reflected.phase, 'assign')
  assert.deepEqual(reflected.lastExchange.hitsTaken, [])

  const sentinel = encounter('seal-sentinel', 9)
  const topple = { ...sentinel, battle: { ...sentinel.battle, turn: 2, awakened: true } }
  assert.equal(playWith(topple, [3, 4, 5], [g, g, a]).battle.interrupted, undefined)
  const toppled = playWith(topple, [3, 4, 5], [a, g, g])
  const knocked = spinAscentCounter(toppled)
  assert.equal(enemyIntentAt(knocked.battle).id, 'knockdown')
  assert.equal(yachtGimmick(knocked.battle), null)
  assert.equal(yachtAllocationTotals(knocked.battle, [a, g, g], [3, 4, 5]).attack, 6)

  const captain = encounter('escort')
  assert.equal(yachtGimmick(captain.battle), null)
  const guard = { ...captain.battle, turn: 4, escort: { hp: 5, bonus: 3 }, dice: [2, 4, 5] }
  const held = forecastYacht(guard, [g, a, g])
  assert.equal(held.escortDealt, 4)
  assert.equal(held.incoming.totalDamage, 3 + attackFor(guard, enemyIntentAt(guard), false).totalDamage)
  const dismissed = resolveYachtTurn({ ...guard, slots: [a, g, g] }).battle
  assert.equal(dismissed.escort, undefined)
  assert.equal(dismissed.lastExchange.dealt, 2)
  assert.equal(dismissed.lastExchange.gimmick, 'retreat')
  const parry = forecastYacht(guard, [a, g, g, g], [2, 6, 6, 6])
  assert.equal(parry.incoming.totalDamage, 18)
  assert.equal(parry.counter, true)
})

test('각성은 확정 때 성립한 기믹을 유지하고 다른 칸에서 기믹을 만들지 않는다', () => {
  const run = encounter('freeze', 2)
  const seed = Array.from({ length: 100 }, (_, index) => index).find((id) => draw(id, 2, 5) / 0x100000000 < .1)
  const base = { ...run.battle, seed, turn: 2, playerHp: 5, dice: [1, 2, 4] }
  const success = resolveYachtTurn({ ...base, slots: [a, g, g] }).battle
  assert.equal(success.lastExchange.awakened, true)
  assert.equal(success.lastExchange.gimmick, 'trip')
  const failure = resolveYachtTurn({ ...base, slots: [g, a, g] }).battle
  assert.equal(failure.lastExchange.awakened, true)
  assert.equal(failure.lastExchange.gimmick, undefined)
})

test('5층 어느 갈래에서 복원해도 6층 하나로 모이고 보스 유물 선택 전후를 복원한다', () => {
  assert.equal(CURRENT_MAP_RULES, 6)
  const initial = mapBefore(3, 5)
  for (const node of availableMapNodes(initial)) {
    const fifth = checkpoint(enterMapNode(initial, node.id)).restored.ascent
    const finished = checkpoint(finishRoom(fifth)).restored.ascent
    const fork = checkpoint(returnToMap(finished)).restored.ascent
    assert.deepEqual(availableMapNodes(fork).map(({ id }) => id), [26])
    const before = checkpoint(enterMapNode(fork, 26)).restored.ascent
    assert.equal(before.enemy.hp, 62)
    assert.equal(before.battle.enemyAttackBuff, 0)
    const win = playWith(before, [6, 6, 4, 6], [a, a, a, a], { enemyHp: 1, playerHp: 4 })
    assert.deepEqual(rewardOffers(win), BOSS_RELICS)
    assert.equal(takeAscentReward(win, 'skip'), win)
    const preview = checkpoint(win, 'healing-scepter').restored
    assert.equal(preview.rewardPreview, 'healing-scepter')
    const claimed = checkpoint(takeAscentReward(preview.ascent, preview.rewardPreview)).restored.ascent
    assert.equal(claimed.battle.playerHp, claimed.maxHp)
    assert.deepEqual(claimed.battle.loot.equipped, win.battle.loot.equipped)
    assert.equal(takeAscentReward(claimed, 'revived-heart'), claimed)
    assert.equal(availableMapNodes(returnToMap(claimed)).length, 2)
  }
})

test('규칙판 6의 일반 적과 6층 보스가 예고한 공격 박자를 반복한다', () => {
  for (const [id, hits] of Object.entries({
    thorns: [[9], [4, 3], [4], [2]], lock: [[5, 4], [7], [1, 2], [2]],
    freeze: [[3, 3, 2], [5], [2, 2], [2]], rage: [[7, 2], [4, 3], [6], [2]],
  })) {
    const run = encounter(id)
    assert.deepEqual([1, 2, 3, 4].map((turn) => enemyIntentAt({ ...run.battle, turn }).hits), hits)
  }
  const run = encounter('chain-warden')
  const charged = playWith(run, [6, 3, 3, 4], [a, a, a, g], { turn: 3, awakened: true })
  assert.equal(forecastYacht(charged.battle).incoming.totalDamage, 9)
  assert.equal(yachtGimmick({ ...run.battle, turn: 7 }).kind, 'reflect')
  assert.equal(enemyIntentAt({ ...run.battle, turn: 10 }).id, 'knockdown')
})

test('심장 소진은 전투를 넘어 저장되고 두 번째 치명 피해에 패배한다', () => {
  const fork = mapBefore(0, 12)
  const boss = enterMapNode(fork, availableMapNodes(fork)[0].id)
  const first = playWith(boss, [1, 1, 2, 2], [g, g, a, a], { playerHp: 2, awakened: true })
  assert.equal(first.battle.playerHp, HEART_REVIVAL_HP)
  assert.equal(first.battle.lastExchange.heartRevived, true)
  const resumed = checkpoint(first).restored.ascent
  assert.equal(resumed.battle.enemyHp, boss.enemy.hp - 4)
  const charge = playWith(resumed, [1, 1, 2, 2], [a, a, a, a])
  const lost = playWith(charge, [1, 1, 2, 2], [a, a, a, a])
  assert.equal(lost.battle.phase, 'lost')
  assert.equal(lost.battle.bossRelic.heartUsed, true)
})

test('왕관은 복원한 정확 방어 룰렛 뒤 한 번 쓰이고 방패는 연타를 지정량만큼 줄인다', () => {
  const fork = mapBefore(0, 12, 6, 'brake-crown')
  const boss = enterMapNode(fork, availableMapNodes(fork)[0].id)
  let run = playWith(boss, [6, 6, 5, 4], [g, g, g, g], { loot: { ...boss.battle.loot, equipped: ['mirror'], acquired: ['mirror'] } })
  assert.equal(run.battle.phase, 'counter')
  const pending = spinAscentCounter(run)
  assert(pending.battle.loot.counter)
  run = checkpoint(pending).restored.ascent
  assert.equal(run.battle.crownUsed, undefined)
  const next = spinAscentCounter(run, 'now')
  assert.equal(next.battle.crownUsed, true)
  assert.equal(next.battle.lastExchange.crownTriggered, true)
  assert.equal(enemyIntentAt(checkpoint(next).restored.ascent.battle).id, 'knockdown')
  assert.equal(spinAscentCounter(next), next)

  const shielded = { ...boss.battle, bossRelic: { id: 'emperor-shield' }, dice: [6, 6, 6, 1] }
  const outcome = forecastYacht(shielded, [g, g, a, a])
  assert.equal(outcome.incoming.totalDamage, 21 - EMPEROR_SHIELD_CAP)
  assert.equal(outcome.counter, false)
})

test('강적은 일반 유물만 제시하고 풀이 소진되면 같은 유물의 중복 없이 재장착한다', () => {
  const run = encounter('reaction')
  const won = playWith(run, [6, 5, 6, 4], [a, a, a, a], { enemyHp: 1 })
  assert.equal(rewardOffers(won).length, 2)
  assert(rewardOffers(won).every((id) => ARTIFACTS.includes(id)))
  const equipped = ['mirror', 'hammer', 'banner']
  const fallbackRun = { ...run, battle: { ...run.battle, loot: { ...run.battle.loot, acquired: ARTIFACTS, equipped } } }
  const fallback = playWith(fallbackRun, [6, 5, 6, 4], [a, a, a, a], { enemyHp: 1 })
  assert.equal(rewardOffers(fallback).length, 2)
  assert(rewardOffers(fallback).every((id) => !equipped.includes(id)))
  const choice = rewardOffers(fallback).find((id) => id !== 'incomplete' && id !== 'heart-die')
  assert.equal(takeAscentReward(fallback, choice), fallback)
  const claimed = takeAscentReward(fallback, choice, { replace: 'mirror' })
  assert.deepEqual(claimed.battle.loot.equipped, [choice, 'hammer', 'banner'])
  assert.deepEqual(claimed.battle.loot.acquired, ARTIFACTS)
  assert.equal(claimed.route.coins - run.route.coins, 2)
  for (const node of run.route.map.nodes.filter(({ kind }) => kind === 'fight')) {
    assert(treasureOffers(run, node).every((id) => id !== 'knot' && id !== 'tongs'))
  }
})

test('왕홀은 이긴 턴에 먼저 회복하고 회복된 체력으로 일반 보상을 만든다', () => {
  const fork = mapBefore(0, 7, 6, 'healing-scepter')
  const node = availableMapNodes(fork).find((entry) => entry.kind === 'fight')
  const run = enterMapNode(fork, node.id)
  const won = playWith(run, [6, 5, 4, 6], [a, a, a, a], { playerHp: 4, enemyHp: 1 })
  assert.equal(won.battle.playerHp, won.maxHp)
  assert.equal(rewardOffers(won).length, 3)
  assert(!rewardOffers(won).includes('bandage'))
  assert.equal(checkpoint(won).restored.ascent.battle.playerHp, won.maxHp)
})

test('1~5 저장으로 전투와 보상을 복원하고 같은 적과 지도 규칙으로 이어 간다', () => {
  for (const rules of [1, 2, 3, 4, 5]) {
    const map = mapBefore(2, 5, rules)
    const node = availableMapNodes(map).find((entry) => entry.kind === 'fight')
    const before = enterMapNode(map, node.id)
    const resumed = checkpoint(before).restored.ascent
    assert.equal(resumed.route.map.rules, rules)
    assert.equal(resumed.enemy.hp, enemyForMapNode(node, rules).hp)
    assert.deepEqual(resumed.battle.dice, before.battle.dice)
    assert.equal(resumed.battle.rulesSix, undefined)
    const won = playWith(resumed, [6, 5, 4, 6], [a, a, a, a], { enemyHp: 1 })
    assert.deepEqual(rewardOffers(checkpoint(won).restored.ascent), rewardOffers(won))
    const continued = returnToMap(checkpoint(takeAscentReward(won, 'skip')).restored.ascent)
    assert(availableMapNodes(continued).every((entry) => entry.enemyId !== 'chain-warden'))
  }
})
