import { expect, test as base } from '@playwright/test'
import { ASCENT_SAVE_KEY } from '../src/ascent-save.ts'
import { GAME_SETTINGS_KEY } from '../src/game-settings.ts'
import { checkpoint } from './rules-six-fixtures.mjs'

export const test = base.extend({
  page: async ({ page }, use) => {
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('response', (response) => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`)
    })
    await page.addInitScript(key => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ automaticCounter: true }))
    }, GAME_SETTINGS_KEY)
    await page.addInitScript(() => {
      const bytesToName = new WeakMap()
      const bufferToName = new WeakMap()
      const arrayBuffer = Response.prototype.arrayBuffer
      Response.prototype.arrayBuffer = async function (...args) {
        const bytes = await arrayBuffer.apply(this, args)
        const name = new URL(this.url, location.href).pathname.split('/').at(-1)
        if (name) bytesToName.set(bytes, name)
        return bytes
      }
      const decode = BaseAudioContext.prototype.decodeAudioData
      BaseAudioContext.prototype.decodeAudioData = async function (bytes, ...args) {
        const name = bytesToName.get(bytes)
        const buffer = await decode.call(this, bytes, ...args)
        if (name) bufferToName.set(buffer, name)
        return buffer
      }
      const start = AudioBufferSourceNode.prototype.start
      window.playedEffects = []
      window.effectTimes = []
      AudioBufferSourceNode.prototype.start = function (...args) {
        const name = bufferToName.get(this.buffer)
        const result = start.apply(this, args)
        if (name) {
          window.playedEffects.push(name)
          window.effectTimes.push({ name, at: performance.now() })
        }
        return result
      }
    })
    await use(page)
    expect(errors, '브라우저 오류').toEqual([])
  },
})

export function withBattle(run, state) {
  return { ...run, battle: { ...run.battle, ...state } }
}

export async function resume(page, run) {
  const { json, restored } = checkpoint(run)
  expect(restored).not.toBeNull()
  await page.goto(process.env.HWIGI_SMOKE_URL)
  await page.evaluate(({ key, json }) => localStorage.setItem(key, json), { key: ASCENT_SAVE_KEY, json })
  await page.reload()
  await page.getByRole('button', { name: '이어하기' }).tap()
  await expect(page.locator('#room-transition')).toBeHidden()
}

export async function stopAtContact(page, milliseconds) {
  const resolve = page.locator('#resolve')
  await expect(resolve).toBeVisible()
  await expect(resolve).toBeEnabled()
  await page.clock.install()
  const now = await page.evaluate(() => Date.now())
  await page.clock.pauseAt(now + 500)
  const { x, y, width, height } = await resolve.boundingBox()
  await page.touchscreen.tap(x + width / 2, y + height / 2)
  await page.clock.runFor(milliseconds)
}
