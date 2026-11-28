import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { preview } from 'vite'
import { ASCENT_SAVE_KEY } from '../src/ascent-save.ts'
import { resolveAscentTurn, spinAscentCounter } from '../src/ascent.ts'
import { checkpoint, encounter } from './rules-six-fixtures.mjs'

let reference
test.beforeAll(async () => {
  if (process.env.HWIGI_COUNTER_REFERENCE) reference = await preview({
    build: { outDir: process.env.HWIGI_COUNTER_REFERENCE }, preview: { host: '127.0.0.1', port: 0 },
  })
})
test.afterAll(async () => { await reference?.close() })

for (const hp of [20, 1]) {
  test('골렘 반격 피해와 같은 작업에서 접촉 원화를 그린다 · 체력 ' + hp, async ({ page }, info) => {
    const run = encounter('thorns', 1)
    const battle = { ...run.battle, dice: [1, 3, 5], slots: [null, null, null], enemyHp: hp }
    const { json } = checkpoint({ ...run, battle })
    const result = spinAscentCounter(resolveAscentTurn({ ...run, battle: { ...battle, slots: battle.dice.map(() => 'guard') } }))
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto(reference ? 'http://127.0.0.1:' + reference.httpServer.address().port : process.env.HWIGI_SMOKE_URL)
    await page.evaluate(([key, json]) => localStorage.setItem(key, json), [ASCENT_SAVE_KEY, json])
    await page.reload()
    await page.getByRole('button', { name: '이어하기' }).tap()
    await expect(page.locator('#room-transition')).toBeHidden()
    await expect(page.locator('#pool-dice button')).toHaveCount(battle.dice.length)
    await expect(page.locator('.die-arriving')).toHaveCount(0)
    for (const die of await page.locator('#pool-dice button').all()) await die.tap()
    await page.locator('#assign-guard').tap()
    await page.evaluate(() => {
      const canvas = document.querySelector('#arena canvas')
      const panel = document.querySelector('#counter-panel')
      const draw = CanvasRenderingContext2D.prototype.drawImage
      const trace = window.counterTrace = { parkedRequests: 0, contacts: [], maxFragments: 0 }
      let lockedCanvas, lastArt, pieces = 0
      CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
        const result = draw.call(this, image, ...args)
        if (this.canvas !== canvas) return result
        if (image.src?.includes('/ui/backgrounds/')) pieces = 0
        if (image instanceof HTMLCanvasElement) trace.maxFragments = Math.max(trace.maxFragments, ++pieces)
        if (image.src?.endsWith('golem-counter.png') || image.src?.endsWith('golem-parry.png')) {
          lastArt = { sheet: image.src.split('/').at(-1), cell: args[0] / 72 }
        }
        return result
      }
      new MutationObserver(() => {
        if (panel.dataset.rollState === 'locked') lockedCanvas = canvas.toDataURL()
      }).observe(panel, { attributeFilter: ['data-roll-state'] })
      // Lose visual refreshes only between the roulette latch and the damage
      // DOM mutation. Game timers, the initial synchronous draw, and HP all run.
      const raf = requestAnimationFrame.bind(window)
      window.requestAnimationFrame = callback => {
        if (lockedCanvas && !trace.contacts.length) trace.parkedRequests++
        return raf(function deliver(now) {
          if (lockedCanvas && !trace.contacts.length) raf(deliver)
          else callback(now)
        })
      }
      const damage = document.querySelector('#enemy-damage')
      new MutationObserver(() => {
        const number = damage.querySelector('.damage-number')
        if (number) trace.contacts.push({ ...lastArt, held: canvas.toDataURL() === lockedCanvas,
          hp: document.querySelector('#enemy-hp').value, damage: number.textContent })
      }).observe(damage, { childList: true })
    })
    await page.locator('#resolve').tap()
    if (hp === 1) await expect(page.getByRole('heading', { name: '전투 보상' })).toBeVisible()
    else await expect(page.locator('#turn')).toHaveAttribute('aria-label', '2턴')
    const trace = await page.evaluate(() => window.counterTrace)
    const folder = process.env.HWIGI_COUNTER_REPORT
    if (folder) {
      await mkdir(folder, { recursive: true })
      await writeFile(join(folder, info.project.name.replace('×','x') + '-hp' + hp + '.json'), JSON.stringify(trace, null, 2))
    }
    expect(trace.parkedRequests).toBeGreaterThan(0)
    expect(trace.contacts).toEqual([{ sheet: 'golem-counter.png', cell: 4, held: false,
      hp: result.battle.enemyHp, damage: '−' + (hp - result.battle.enemyHp) }])
    if (hp === 1) expect(trace.maxFragments).toBeGreaterThanOrEqual(5)
  })
}
