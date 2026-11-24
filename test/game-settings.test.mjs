import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ASCENT_SAVE_KEY, clearAscentSave } from '../src/ascent-save.ts'
import { GAME_SETTINGS_KEY, loadGameSettings, saveGameSettings, toggleMute } from '../src/game-settings.ts'

function memoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
}

test('settings use one key and leave initial reduction up to the device', () => {
  const store = memoryStorage()
  assert.deepEqual(loadGameSettings(store), { music: true, effects: true, speed: 'normal' })
  const preferences = { music: false, effects: true, speed: 'fast', reducedMotion: false }
  saveGameSettings(preferences, store)
  assert.deepEqual(JSON.parse(store.getItem(GAME_SETTINGS_KEY)), preferences)
  assert.deepEqual(loadGameSettings(store), preferences)
  store.setItem(ASCENT_SAVE_KEY, 'checkpoint')
  clearAscentSave(store)
  assert.equal(store.getItem(ASCENT_SAVE_KEY), null)
  assert.deepEqual(loadGameSettings(store), preferences)
})

test('mute persists across reload and restores the independently chosen audio channels', () => {
  const store = memoryStorage()
  const effectsOnly = { music: false, effects: true, speed: 'normal' }
  const muted = toggleMute(effectsOnly)
  assert.deepEqual(muted, { music: false, effects: false, speed: 'normal', restoreAudio: 'effects' })
  saveGameSettings(muted, store)
  assert.deepEqual(toggleMute(loadGameSettings(store)), effectsOnly)
  assert.deepEqual(toggleMute({ music: false, effects: false, speed: 'normal' }), loadGameSettings(memoryStorage()))
})

test('malformed or inaccessible settings fall back without preventing play', () => {
  const store = memoryStorage()
  store.setItem(GAME_SETTINGS_KEY, JSON.stringify({ music: 'off', effects: false, speed: -1, reducedMotion: null }))
  assert.deepEqual(loadGameSettings(store), { music: true, effects: false, speed: 'normal' })
  store.setItem(GAME_SETTINGS_KEY, '{')
  assert.deepEqual(loadGameSettings(store), loadGameSettings(memoryStorage()))
  const unavailable = () => { throw new Error('storage blocked') }
  assert.deepEqual(loadGameSettings({ getItem: unavailable }), loadGameSettings(memoryStorage()))
  assert.doesNotThrow(() => saveGameSettings(loadGameSettings(store), { setItem: unavailable }))
  assert.doesNotThrow(() => clearAscentSave({ removeItem: unavailable }))
})
