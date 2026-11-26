import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { availableMapNodes } from '../src/ascent.ts'
import { ASCENT_SAVE_KEY } from '../src/ascent-save.ts'
import { checkpoint, encounter, mapBefore } from './rules-six-fixtures.mjs'

async function resume(page, run, preview) {
  const { json, restored } = checkpoint(run, preview)
  expect(restored).not.toBeNull()
  if (page.url() === 'about:blank') await page.goto(process.env.HWIGI_SMOKE_URL)
  await page.evaluate(({ key, json }) => localStorage.setItem(key, json), { key: ASCENT_SAVE_KEY, json })
  await page.reload()
  await page.getByRole('button', { name: '이어 하기' }).tap()
}

async function photograph(page, name, info) {
  await expect.poll(() => page.evaluate(() => {
    const root = document.scrollingElement
    return [root.scrollWidth - root.clientWidth, root.scrollHeight - root.clientHeight]
  })).toEqual([0, 0])
  const root = process.env.HWIGI_RETURN_SHOTS
  if (!root) return
  await mkdir(root, { recursive: true })
  await page.screenshot({ path: join(root, `${info.project.name}-${name}.png`), animations: 'disabled' })
}

const examples = [
  ['trip', 'freeze', 2, 2, [1, 3, 3, 6], 'attack'],
  ['armor', 'reaction', undefined, 2, [2, 2, 4, 6], 'attack'],
  ['reflect', 'vitality', undefined, 2, [5, 4, 3, 6], 'guard'],
  ['topple', 'seal-sentinel', 9, 2, [3, 4, 5, 6], 'attack'],
  ['retreat', 'escort', undefined, 4, [2, 4, 5, 6], 'attack'],
]

test('다섯 예고는 눈을 넣고 빼면 테두리가 닫히고 다시 열린다', async ({ page }, info) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  for (const [kind, enemy, floor, turn, dice, slot] of examples) {
    const run = encounter(enemy, floor)
    const battle = { ...run.battle, turn, dice, slots: dice.map(() => null), ...(kind === 'retreat' && { escort: { hp: 5, bonus: 3 } }) }
    await resume(page, { ...run, battle })
    const mark = page.locator(`#intent [data-kind="${kind}"]`)
    await expect(mark).toBeInViewport({ ratio: 1 })
    await expect(mark).toHaveAttribute('data-ready', 'false')
    await expect(mark.locator('i')).toHaveCount(2)
    const pool = page.locator('#pool-dice button')
    await pool.nth(0).tap()
    if (kind === 'armor') await pool.nth(1).tap()
    await page.locator(`#assign-${slot}`).tap()
    await expect(mark).toHaveAttribute('data-ready', 'true')
    await photograph(page, kind, info)
    await page.locator(`#${slot}-dice button`).first().tap()
    await expect(mark).toHaveAttribute('data-ready', 'false')
  }
  expect(errors).toEqual([])
})

test('6층 전투에서 보스 유물 네 장을 보고 고른 뒤 7층의 두 갈래로 간다', async ({ page }, info) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const run = encounter('chain-warden', 6)
  const sprite = page.waitForResponse((response) => response.url().endsWith('/art/chain-warden-idle.png') && response.ok())
  await resume(page, run)
  await sprite
  await page.locator('#arena canvas').evaluate((canvas) => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await expect(page.locator('#intent')).toHaveAttribute('aria-label', /쇠사슬 집행관/)
  await photograph(page, 'midboss', info)

  await resume(page, { ...run, battle: { ...run.battle, enemyHp: 1, playerHp: 7 } })
  for (const die of await page.locator('#pool-dice button').all()) await die.tap()
  await page.locator('#assign-attack').tap()
  await page.locator('#resolve').tap()
  await expect(page.getByRole('heading', { name: '보스 유물 선택' })).toBeVisible()
  const cards = page.locator('#reward-cards button')
  await expect(cards).toHaveCount(4)
  for (const card of await cards.all()) await expect(card).toBeInViewport({ ratio: 1 })
  await cards.filter({ hasText: '제동 왕관' }).tap()
  await expect(page.locator('#reward-preview')).toContainText('첫 정확 방어')
  await expect(page.locator('#confirm-reward')).toBeInViewport({ ratio: 1 })
  await photograph(page, 'boss-reward', info)
  await page.reload()
  await page.getByRole('button', { name: '이어 하기' }).tap()
  await expect(cards.filter({ hasText: '제동 왕관' })).toHaveAttribute('aria-pressed', 'true')
  await page.locator('#confirm-reward').tap()
  await expect(page.locator('#boss-relic-slot button')).toHaveAccessibleName('제동 왕관')
  await expect(page.locator('#fork-options button')).toHaveCount(2)
  await expect(page.locator('#map-floor')).toHaveText(/^7\//)
  expect(errors).toEqual([])
})

test('강적 갈림길 카드에 유물 아이콘이 보인다', async ({ page }, info) => {
  let seed = 0
  let run = mapBefore(seed, 2)
  while (!availableMapNodes(run).some(({ kind }) => kind === 'elite')) run = mapBefore(++seed, 2)
  await resume(page, run)
  await expect(page.locator('.fork-card.elite [aria-label="유물 보상"]')).toBeInViewport({ ratio: 1 })
  await photograph(page, 'elite-fork', info)
})
