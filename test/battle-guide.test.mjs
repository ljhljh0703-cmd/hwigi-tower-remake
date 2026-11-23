import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { BATTLE_GUIDE } from '../src/battle-guide.ts'

test('the battle guide names and describes every icon in the game library', () => {
  const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  const icons = new Set(Array.from(page.matchAll(/<symbol id="icon-([^"]+)"/g), ([, id]) => id))
  const entries = BATTLE_GUIDE.flatMap(({ entries }) => entries)
  assert.deepEqual(new Set(entries.map(([icon]) => icon)), icons)
  for (const [, name, description] of entries) {
    assert.ok(name.trim())
    assert.match(description, /니다\.$/, name)
  }
})
