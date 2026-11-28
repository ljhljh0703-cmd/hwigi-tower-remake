import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { availableMapNodes, beginMapAscent, enterMapNode, resolveAscentTurn, rewardOffers } from '../src/ascent.ts'
import { ASCENT_SAVE_KEY } from '../src/ascent-save.ts'
import { draw } from '../src/combat.ts'
import { ALL_META_FLOORS } from '../src/meta-progress.ts'
import { isConsumable } from '../src/treasure.ts'
import { displayedCounterRewards, yachtCounterSlot } from '../src/yacht-combat.ts'
import { checkpoint, encounter, mapBefore } from './rules-six-fixtures.mjs'

const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)).ascent, ASCENT_SAVE_KEY)

async function resume(page, run) {
  const { json, restored } = checkpoint(run)
  expect(restored).not.toBeNull()
  await page.goto(process.env.HWIGI_SMOKE_URL)
  await page.evaluate(({ key, json }) => localStorage.setItem(key, json), { key: ASCENT_SAVE_KEY, json })
  await page.reload()
  await page.getByRole('button', { name: '이어하기' }).tap()
  await expect(page.locator('#room-transition')).toBeHidden()
}

async function photo(page, info, name) {
  const root = process.env.HWIGI_NEON_APPLY_SHOTS
  if (!root) return
  await mkdir(root, { recursive: true })
  await page.screenshot({ path: join(root, `${info.project.name.replace('×', 'x')}-${name}.png`) })
}

test('특전·적 이름·방어 목표가 보이고 첫 기믹 안내는 탭할 때까지 남는다', async ({ page }, info) => {
  const run = encounter('seal-sentinel', 9, 7)
  await resume(page, { ...run, battle: { ...run.battle, turn: 2, perk: { kind: 'shield', bonus: 8 } } })
  const perk = page.locator('#active-perk')
  await expect(perk).toHaveAccessibleName('방패의 기세 +8')
  await expect(perk).toBeInViewport({ ratio: 1 })
  await expect(page.locator('#map-health')).toBeHidden()
  await expect(page.getByRole('meter', { name: '내 체력' })).toBeVisible()
  await expect(page.locator('#encounter-name')).toBeVisible()
  await expect(page.locator('#guard-goal')).toHaveText('/9')
  const note = page.locator('#first-run-note')
  await expect(note).toHaveAttribute('data-guide', 'gimmick-topple')
  await expect(note).toContainText('공격 3 →')
  const name = await page.locator('#encounter-name').boundingBox()
  const bossRelic = await page.locator('#boss-relic-slot').boundingBox()
  expect(name.y - bossRelic.y - bossRelic.height).toBeGreaterThanOrEqual(6)
  await page.waitForTimeout(1700)
  await expect(note).toBeVisible()
  await photo(page, info, 'battle-status')
  await perk.tap()
  await expect(note).toBeHidden()
  const tip = page.getByRole('tooltip')
  await expect(tip).toContainText('방패의 기세 +8')
  await expect(tip).toBeInViewport({ ratio: 1 })
  const title = await page.locator('#encounter-name').boundingBox()
  expect((await tip.boundingBox()).x).toBeGreaterThan(title.x + title.width)
  await photo(page, info, 'perk-help')
  await page.locator('#help').tap()
  await expect(page.locator('#guide-entries [data-guide-name="쇠쐐기"]')).toHaveCount(1)
})

test('갈림길에서 층 지도 대신 입장할 문을 표시한다', async ({ page }) => {
  await resume(page, mapBefore(0, 8, 7))
  await expect(page.locator('#tower-preview')).toHaveCount(0)
  await expect(page.locator('#fork-options button').first()).toBeVisible()
})

test('상점에서 효과를 확인하고 한 방문에 두 품목을 산 뒤 떠난다', async ({ page }, info) => {
  const before = mapBefore(0, 8, 7)
  const shop = availableMapNodes(before).find(node => node.kind === 'shop')
  const entered = enterMapNode({ ...before, meta: { generation: 0, pool: ALL_META_FLOORS, opened: [] } }, shop.id)
  const goods = rewardOffers(entered).find(isConsumable)
  expect(goods).toBeTruthy()
  await resume(page, { ...entered, battle: { ...entered.battle, playerHp: 16 } })
  const offers = page.locator('#reward-cards .reward-card')
  await expect(offers).toHaveCount(4)
  await expect(page.locator('#elite-capacity')).toHaveText(/유물 \d\/3/)
  await expect(offers.filter({ hasText: '약초 꾸러미' }).locator('.reward-effect-line')).toHaveText('체력 4→2 회복')
  for (const card of await offers.all()) await expect(card.locator('.reward-effect-line')).toBeInViewport({ ratio: 1 })
  await photo(page, info, 'shop-stock')
  const buy = page.getByRole('button', { name: '구매 · 동전 2' })
  await offers.filter({ hasText: '약초 꾸러미' }).tap()
  await buy.tap()
  await expect(page.getByRole('heading', { name: '상인' })).toBeVisible()
  expect((await saved(page)).route.coins).toBe(entered.route.coins - 2)
  await page.reload()
  await page.getByRole('button', { name: '이어하기' }).tap()
  await page.locator(`#reward-cards [data-reward="${goods}"]`).tap()
  await buy.tap()
  expect((await saved(page)).route.coins).toBe(entered.route.coins - 4)
  expect((await saved(page)).battle.loot.consumables[goods]).toBe(1)
  await page.getByRole('button', { name: '떠나기' }).tap()
  await expect(page.locator('#ascent-fork')).toBeVisible()
})

test('위기 턴을 그대로 막고 수동 룰렛과 새긴 동전으로 큰 결과를 적용한다', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  let ready
  for (let seed = 0; seed < 512 && !ready; seed++) {
    const start = beginMapAscent(seed, undefined, 'odd', 7)
    const run = enterMapNode(start, availableMapNodes(start)[0].id)
    if (draw(run.battle.seed, 1, 5) / 0x100000000 >= .1) continue
    const battle = { ...run.battle, playerHp: 6, dice: [5, 2, 2], slots: ['guard', 'guard', 'guard'],
      loot: { ...run.battle.loot, consumables: { coin: 1 } } }
    const result = resolveAscentTurn({ ...run, battle })
    const rewards = displayedCounterRewards(battle)
    const first = rewards[yachtCounterSlot(battle)].damage
    const second = rewards[yachtCounterSlot(battle, true)].damage
    if (result.battle.phase === 'counter' && second < first) ready = { run: { ...run, battle }, first, second }
  }
  expect(ready).toBeTruthy()
  const { run, first, second } = ready
  await resume(page, run)
  await page.locator('#resolve').tap()
  const spin = page.getByRole('button', { name: '룰렛 돌리기' })
  const stop = page.getByRole('button', { name: '룰렛 멈추기' })
  await expect(spin).toBeVisible()
  await expect(page.locator('#awakening')).toBeHidden()
  expect((await saved(page)).battle.lastExchange.awakened).toBe(false)
  await expect(page.locator('#player-hp')).toHaveJSProperty('value', 6)
  await spin.tap()
  await expect(stop).toBeVisible()
  const button = await stop.boundingBox()
  expect(button.y + button.height).toBeGreaterThan(page.viewportSize().height - 24)
  expect((await saved(page)).battle.loot.counter).toBeUndefined()
  await photo(page, info, 'manual-roulette')
  await stop.tap()
  const coin = page.getByRole('button', { name: '점술사의 은화로 룰렛 한 번 더 돌리기' })
  await expect(coin).toBeVisible()
  await coin.tap()
  await stop.tap()
  await expect(page.locator('#counter-comparison')).toHaveText(`첫 ${first} · 다시 ${second} → ${first}`)
  await expect(page.locator('#counter-damage')).toHaveText(String(first))
  await photo(page, info, 'better-coin-result')
  await page.getByRole('button', { name: `피해 ${first} 주기` }).tap()
  await expect.poll(async () => (await saved(page)).battle.lastExchange.counter?.damage).toBe(first)
  await expect(page.locator('#turn')).toHaveAccessibleName('2턴')
  await expect(page.locator('#player-hp')).toHaveJSProperty('value', 6)
  await photo(page, info, 'crisis-without-awakening')
  await expect(page.locator('#thumb-items [data-reward="coin"]')).toHaveCount(0)
})

test('설정에서 자동 진행을 켠 뒤에는 룰렛이 입력 없이 끝난다', async ({ page }, info) => {
  const run = encounter('thorns', 1, 7)
  await resume(page, { ...run, battle: { ...run.battle, dice: [5, 2, 2], slots: ['guard', 'guard', 'guard'] } })
  await page.locator('#battle-settings').tap()
  const setting = page.getByRole('switch', { name: '룰렛 자동 진행' })
  await expect(setting).toHaveAttribute('aria-checked', 'false')
  await setting.tap()
  await expect(setting).toHaveAttribute('aria-checked', 'true')
  await photo(page, info, 'automatic-setting')
  await page.locator('#settings').getByRole('button', { name: '닫기' }).tap()
  await page.reload()
  await page.getByRole('button', { name: '이어하기' }).tap()
  await page.locator('#resolve').tap()
  await expect.poll(async () => (await saved(page)).battle.lastExchange.counter?.damage).toBeGreaterThan(0)
})
