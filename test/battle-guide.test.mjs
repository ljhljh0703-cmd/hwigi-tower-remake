import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { battleGuideFor } from '../src/battle-guide.ts'

test('the legacy battle guide names and describes every icon in the game library', () => {
  const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  const icons = new Set(Array.from(page.matchAll(/<symbol id="icon-([^"]+)"/g), ([, id]) => id))
  assert.ok(icons.delete('healing'), 'rules-seven recovery cost icon')
  const entries = battleGuideFor(5).flatMap(({ entries }) => entries)
  assert.deepEqual(new Set(entries.map(([icon]) => icon)), icons)
  for (const [, name, description] of entries) {
    assert.ok(name.trim())
    assert.match(description, /(?:니다|요)\.$/, name)
  }
})

test('only rules 1–5 describe removed mechanics and their rewards', () => {
  const removed = ['freeze', 'reaction', 'vitality', 'seal', 'steal', 'treasure-tongs', 'treasure-knot']
  const section = (guide, title) => guide.find((entry) => entry.title === title).entries.map(([icon]) => icon)
  const guide = battleGuideFor(6)
  assert.deepEqual(battleGuideFor(), battleGuideFor(7))
  assert.doesNotMatch(JSON.stringify(guide), /얼림|눈송이|반응|체력 비례|봉인|빼앗|회수 매듭/)
  const icons = guide.flatMap(({ entries }) => entries.map(([icon]) => icon))
  for (const icon of removed) assert.ok(!icons.includes(icon), icon)
  assert.deepEqual(section(guide, '적 기믹'), ['thorns', 'lock', 'rage', 'escort'])
  assert.deepEqual(section(guide, '적 공격 예고'), ['sword', 'charge', 'break-charge', 'critical', 'knockdown'])
  assert.deepEqual(section(guide, '적의 빈틈'), ['stun', 'armor-break', 'stacked-pair', 'reflect', 'knockdown', 'escort-exit'])
  assert.ok(icons.includes('treasure-banner'))
  for (const rules of [1, 2, 3, 4, 5]) {
    const legacy = battleGuideFor(rules).flatMap(({ entries }) => entries)
    for (const icon of removed) assert.ok(legacy.some(([symbol]) => symbol === icon), `rules ${rules}: ${icon}`)
  }
})

test('the rules-seven guide replaces the retired loot and its own relic text', () => {
  const current = JSON.stringify(battleGuideFor(7))
  for (const name of ['되감기 핀', '봉인집게', '분할 망토', '회수 매듭', '호위 갈고리', '응급 천', '협공 잔편', '강타 잔편', '금 가르는 망치']) {
    assert.ok(!current.includes(name), name)
  }
  assert.match(current, /쌍금 틀/)
  assert.match(current, /룰렛 피해는 절반/)
  assert.match(current, /기본 재굴림 시 체력 1/)
  assert.match(JSON.stringify(battleGuideFor(6)), /호위 갈고리/)
})

test('the guide describes the thorns rule for the current or saved rule set', () => {
  const thorns = (rules) => battleGuideFor(rules).find(({ title }) => title === '적 기믹').entries.find(([icon]) => icon === 'thorns')[2]
  for (const rules of [6, 7]) assert.match(thorns(rules), /공격 칸 피해로 적을 쓰러뜨리면 발동하지 않습니다/)
  for (const rules of [1, 2, 3, 4, 5]) assert.match(thorns(rules), /적을 쓰러뜨려도 발동합니다/)
})
