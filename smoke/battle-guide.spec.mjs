import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { beginMapAscent } from '../src/ascent.ts'
import { ASCENT_SAVE_KEY } from '../src/ascent-save.ts'
import { checkpoint } from './rules-six-fixtures.mjs'

test('도감은 저장 파일이 아닌 현재 등반의 규칙판을 따라간다', async ({ page }, info) => {
  const dialog = page.getByRole('dialog', { name: '도감' })
  const section = dialog.locator('.guide-section').filter({ has: page.getByRole('heading', { name: '적 기믹', exact: true }) })
  const current = ['가시', '자물쇠', '격분', '호위병']
  const legacy = ['가시', '자물쇠', '얼림 · 눈송이', '격분', '반응', '체력 비례', '봉인', '빼앗기', '호위병']
  const oldOnly = /얼림|눈송이|반응|체력 비례|봉인|빼앗|회수 매듭/
  const open = () => page.getByRole('button', { name: '도감', exact: true }).tap()
  const close = () => dialog.getByRole('button', { name: '닫기' }).tap()
  const room = page.locator('#fork-options button')
  async function photograph(name, anchor = section.getByRole('heading')) {
    const output = process.env.HWIGI_CLEANUP_SHOTS
    if (!output) return
    await page.evaluate(() => document.fonts.ready)
    await anchor.evaluate((element) => {
      const container = element.closest('#guide-entries')
      container.scrollTop += element.getBoundingClientRect().top - container.getBoundingClientRect().top - 12
    })
    await expect(anchor).toBeInViewport({ ratio: 1 })
    await mkdir(output, { recursive: true })
    await page.screenshot({ path: join(output, `${info.project.name.replace('×', 'x')}-guide-${name}.png`) })
  }

  await page.goto(new URL('?seed=12', process.env.HWIGI_SMOKE_URL).href)
  await page.getByRole('button', { name: '새로 하기' }).tap()
  await page.getByRole('button', { name: /^방패 저금,/ }).tap()
  await room.tap()
  await page.locator('#enter-room').tap()
  await page.getByRole('button', { name: '안내 건너뛰기' }).tap()
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).ascent.route.rules, ASCENT_SAVE_KEY)).toBe(6)
  await open()
  await expect(section.locator('dt strong')).toHaveText(current)
  await expect(dialog).not.toContainText(oldOnly)
  await photograph('rules-6')

  const { json, restored } = checkpoint(beginMapAscent(12, undefined, 'odd', 5))
  expect(restored.ascent.route.map.rules).toBe(5)
  await page.evaluate(({ key, json }) => localStorage.setItem(key, json), { key: ASCENT_SAVE_KEY, json })
  await page.reload()
  await expect(page.getByRole('button', { name: '이어 하기' })).toBeVisible()
  await open()
  await expect(dialog).not.toContainText(oldOnly)
  await close()
  await page.getByRole('button', { name: '이어 하기' }).tap()
  await room.tap()
  await page.locator('#enter-room').tap()
  await open()
  await expect(section.locator('dt strong')).toHaveText(legacy)
  await expect(dialog).toContainText('봉인집게')
  await expect(dialog).toContainText('회수 매듭')
  await photograph('rules-5')
  if (page.viewportSize().width === 320) {
    await photograph('rules-5-scrolled', section.getByText('반응', { exact: true }))
  }
})
