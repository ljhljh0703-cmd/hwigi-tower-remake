import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { availableMapNodes, enterMapNode } from '../src/ascent.ts'
import { ASCENT_SAVE_KEY } from '../src/ascent-save.ts'
import { checkpoint, encounter, mapBefore, nodeFor } from './rules-six-fixtures.mjs'

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
  ['trip', 'freeze', 2, 2, [1, 3, 3, 6], 'attack', 'stun', '', /다음 공격/],
  ['armor', 'reaction', undefined, 2, [2, 2, 4, 6], 'attack', 'armor-break', '×1.5', /1\.5배/],
  ['reflect', 'vitality', undefined, 2, [5, 4, 3, 6], 'guard', 'reflect', '', /철추 피해/],
  ['topple', 'seal-sentinel', 9, 2, [3, 4, 5, 6], 'attack', 'knockdown', '×2', /2배/],
  ['retreat', 'escort', undefined, 4, [2, 4, 5, 6], 'attack', 'escort-exit', '', /호위가 물러나고/],
]

test('다섯 예고는 조건과 효과를 표시하며 눈을 넣고 빼면 함께 밝아지고 어두워진다', async ({ page }, info) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const intent = page.locator('#intent')
  const tooltip = page.getByRole('tooltip')
  for (const [kind, enemy, floor, turn, dice, slot, symbol, value, help] of examples) {
    const run = encounter(enemy, floor)
    const battle = { ...run.battle, turn, dice, slots: dice.map(() => null), ...(kind === 'retreat' && { escort: { hp: 5, bonus: 3 } }) }
    await resume(page, { ...run, battle })
    const mark = page.locator(`#intent [data-kind="${kind}"]`)
    await expect(mark).toBeInViewport({ ratio: 1 })
    await expect(mark).toHaveAttribute('data-ready', 'false')
    await expect(mark.locator('i')).toHaveCount(2)
    const effect = mark.locator('.gimmick-effect')
    await expect(mark.locator('.gimmick-arrow use')).toHaveAttribute('href', '#icon-next')
    await expect(effect.locator('use')).toHaveAttribute('href', `#icon-${symbol}`)
    await expect(effect).toHaveText(value)
    await expect(effect).toHaveCSS('border-top-style', 'dashed')
    if (kind === 'trip') {
      const box = await mark.boundingBox()
      const session = await page.context().newCDPSession(page)
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] })
      await expect(tooltip).toHaveText(help)
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await session.detach()
    } else {
      await intent.tap()
      await expect(tooltip).toHaveText(help)
    }
    await expect(tooltip).toBeInViewport({ ratio: 1 })
    expect(await tooltip.evaluate((element) => {
      const text = document.createRange()
      text.selectNodeContents(element)
      return text.getClientRects().length
    })).toBe(1)
    const pool = page.locator('#pool-dice button')
    await pool.nth(0).tap()
    if (kind === 'armor') await pool.nth(1).tap()
    await page.locator(`#assign-${slot}`).tap()
    await expect(mark).toHaveAttribute('data-ready', 'true')
    await expect(effect).toHaveCSS('border-top-style', 'solid')
    await photograph(page, kind, info)
    await page.locator(`#${slot}-dice button`).first().tap()
    await expect(mark).toHaveAttribute('data-ready', 'false')
    await expect(effect).toHaveCSS('border-top-style', 'dashed')
  }
  expect(errors).toEqual([])
})

test('발동한 상태가 적 체력 카드에 남고 공격이나 턴을 소모하면 사라진다', async ({ page }, info) => {
  async function readyTurn(run, dice, attack) {
    await resume(page, { ...run, battle: { ...run.battle, turn: 2, dice, slots: dice.map(() => null) } })
    for (const index of attack) await page.locator(`#die-${index}`).tap()
    await page.locator('#assign-attack').tap()
    await guardRemaining()
  }
  async function guardRemaining() {
    for (const die of await page.locator('#pool-dice button').all()) await die.tap()
    await page.locator('#assign-guard').tap()
    await page.locator('#resolve').tap()
  }
  const status = page.locator('#enemy-status')
  await readyTurn(encounter('freeze', 2), [1, 3, 3, 6], [0])
  await expect(status.locator('[data-status="trip"]')).toHaveText('1')
  await expect(status.getByRole('img')).toHaveAccessibleName('기절 · 공격 1회 남음')
  await guardRemaining()
  await expect(status).toBeHidden()

  const { seed, node } = nodeFor('shield-soldier', 8)
  const shieldSoldier = enterMapNode(mapBefore(seed, node.floor, 6, 'brake-crown'), node.id)
  await readyTurn(shieldSoldier, [2, 2, 3, 6], [0, 1])
  const armor = status.locator('[data-status="armor"]')
  const topple = status.locator('[data-status="topple"]')
  await expect(armor).toHaveText('∞')
  await expect(topple).toHaveCount(0)
  await page.locator('#counter').tap()
  await expect(topple).toHaveText('1')
  await expect(topple).toHaveAccessibleName('넘어짐 · 1턴 남음')
  await expect(status).toBeInViewport({ ratio: 1 })
  await page.reload()
  await page.getByRole('button', { name: '이어 하기' }).tap()
  await expect(armor).toHaveText('∞')
  await expect(topple).toHaveText('1')
  await photograph(page, 'enemy-status', info)
  await guardRemaining()
  await expect(topple).toHaveCount(0)
  await expect(armor).toHaveText('∞')
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
  for (const card of await cards.all()) {
    await expect(card).toBeInViewport({ ratio: 1 })
    expect((await card.boundingBox()).height).toBeGreaterThanOrEqual(72)
  }
  const rewardCenter = () => page.locator('#reward-panel').evaluate((element) => {
    const { top, height } = element.getBoundingClientRect()
    return (top + height / 2) / innerHeight
  })
  expect(await rewardCenter()).toBeCloseTo(0.4, 2)
  await cards.filter({ hasText: '제동 왕관' }).tap()
  await expect(page.locator('#reward-preview')).toContainText('첫 정확 방어')
  await expect(page.locator('#confirm-reward')).toBeInViewport({ ratio: 1 })
  expect(await rewardCenter()).toBeCloseTo(0.4, 2)
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
