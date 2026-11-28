import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { availableMapNodes, enterMapNode, rewardOffers } from '../src/ascent.ts'
import { ASCENT_SAVE_KEY } from '../src/ascent-save.ts'
import { ALL_META_FLOORS, META_SAVE_KEY } from '../src/meta-progress.ts'
import { isMetaPerk } from '../src/meta-unlocks.ts'
import { perkDisplayName } from '../src/display-names.ts'
import { offerPerks } from '../src/perks.ts'
import { forecastYacht, resolveYachtTurn } from '../src/yacht-combat.ts'
import { checkpoint, mapBefore } from './rules-six-fixtures.mjs'

const initialStages = [3, 5, 7]
const stages = [...initialStages, 9]
const seed = Array.from({ length: 100 }, (_, index) => index).find(index => offerPerks(index, stages).some(isMetaPerk))
const profile = (unlocked = initialStages) => ({ version: 1, generation: 0, unlocked, seen: [] })
const saved = (page) => page.evaluate(key => JSON.parse(localStorage.getItem(key)), ASCENT_SAVE_KEY)
const record = (page) => page.evaluate(key => JSON.parse(localStorage.getItem(key)), META_SAVE_KEY)

async function shot(page, info, name, target) {
  await expect(target).toBeInViewport({ ratio: 1 })
  const folder = process.env.HWIGI_META_SHOTS
  if (!folder) return
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  await mkdir(folder, { recursive: true })
  await page.screenshot({ path: join(folder, `${info.project.name.replace('×', 'x')}-${name}.png`), animations: 'disabled' })
}

async function store(page, run, progress) {
  const data = checkpoint(run)
  expect(data.restored).not.toBeNull()
  await page.evaluate(({ saveKey, metaKey, json, progress }) => {
    localStorage.setItem(saveKey, json)
    if (progress) localStorage.setItem(metaKey, JSON.stringify(progress))
  }, { saveKey: ASCENT_SAVE_KEY, metaKey: META_SAVE_KEY, json: data.json, progress })
}

test('로비는 0/10을 표시하고 도감 다음 등반 탭에서 각 해금 조건을 펼친다', async ({ page }, info) => {
  await page.goto(process.env.HWIGI_SMOKE_URL)
  const count = page.getByRole('button', { name: '다음 등반 해금 0/10' })
  await shot(page, info, 'lobby-0-of-10', count)
  await page.locator('#lobby-guide').tap()
  const tab = page.getByRole('tab', { name: '다음 등반' })
  await tab.tap()
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  const items = page.locator('#guide-meta details')
  await expect(items).toHaveCount(10)
  await expect(page.locator('#guide-meta [data-unlocked="false"]')).toHaveCount(10)
  await items.first().locator('summary').tap()
  await expect(items.first().getByText('3층 첫 입장')).toBeVisible()
  await shot(page, info, 'guide-next-ascent', page.locator('#battle-guide'))
})

test('새 층 첫 입장, 저장 재진입, 결과에서 여러 쌍 공개와 시작 카드 새 표식을 확인한다', async ({ page }, info) => {
  test.setTimeout(55_000)
  await page.goto(new URL(`?seed=${seed}`, process.env.HWIGI_SMOKE_URL).href)
  const approach = { ...mapBefore(14, 9, 7), meta: { generation: 0, pool: [], opened: initialStages } }
  const combat = availableMapNodes(approach).find(node => node.kind === 'fight' || node.kind === 'elite')
  await store(page, approach, profile())
  await page.reload()
  await page.getByRole('button', { name: '이어하기' }).tap()
  expect((await record(page)).unlocked).toEqual(initialStages)
  await page.getByRole('region', { name: '두 갈래 길' }).locator(`[data-node="${combat.id}"]`).tap()

  await expect.poll(async () => (await record(page)).unlocked).toEqual(stages)
  await expect.poll(async () => (await saved(page)).ascent.meta.opened).toEqual(stages)

  const entered = enterMapNode(approach, combat.id)
  const losing = {
    ...entered.battle, playerHp: 1, awakened: true,
    bossRelic: entered.battle.bossRelic?.id === 'revived-heart' ? { id: 'revived-heart', heartUsed: true } : entered.battle.bossRelic,
    dice: entered.battle.dice.map(() => 1), slots: entered.battle.slots.map(() => 'attack'),
  }
  losing.turn = [1, 2, 3, 4, 5].find(turn => forecastYacht({ ...losing, turn }).damage >= 1)
  expect(losing.turn).toBeDefined()
  expect(resolveYachtTurn(losing).battle.phase).toBe('lost')
  await store(page, { ...entered, meta: { ...approach.meta, opened: stages }, battle: losing })
  await page.reload()
  await page.getByRole('button', { name: '이어하기' }).tap()
  await page.getByRole('button', { name: '턴 끝내기' }).tap()
  const reveal = page.locator('#meta-reveal')
  await expect(reveal.locator('li')).toHaveCount(4)
  await expect(reveal.getByText('핏빛 칼자루')).toBeVisible()
  await shot(page, info, 'result-unlocked-cards', reveal)
  await page.locator('#climb-again').tap()
  await expect(page.locator('#boss-relic-slot')).toBeHidden()
  const startingCards = page.locator('#perk-choices .perk-choice')
  await expect(startingCards).toHaveCount(4)
  for (const [index, perk] of offerPerks(seed).entries()) {
    await expect(startingCards.nth(index)).toContainText(perkDisplayName(perk, true))
  }
  await expect(page.locator('#perk-choices .meta-new').first()).toHaveText('새')
  await expect.poll(async () => (await record(page)).seen.length).toBeGreaterThan(0)
  await shot(page, info, 'new-perk-badge', page.locator('#perk-choices'))
  await page.locator('#return-lobby').tap()
  await page.locator('#new-ascent').tap()
  await expect(page.locator('#perk-choices .meta-new')).toHaveCount(0)
})

test('상점의 기존 후보와 추가 일회용품 및 해금 유물을 복원한다', async ({ page }) => {
  await page.goto(process.env.HWIGI_SMOKE_URL)
  const before = mapBefore(0, 8, 7)
  const shop = availableMapNodes(before).find(node => node.kind === 'shop')
  const regular = rewardOffers(enterMapNode(before, shop.id))
  const run = enterMapNode({ ...before, meta: { generation: 0, pool: ALL_META_FLOORS, opened: [] } }, shop.id)
  await store(page, run, profile(ALL_META_FLOORS))
  await page.reload()
  await page.getByRole('button', { name: '이어하기' }).tap()
  const cards = page.locator('#reward-cards button')
  await expect(cards).toHaveCount(4)
  for (const [index, id] of regular.entries()) await expect(cards.nth(index)).toHaveAttribute('data-reward', id)
  const bonus = cards.last()
  await expect(bonus).toHaveAttribute('data-reward', 'linked-cup')
  await expect(bonus.locator('.reward-type')).toContainText('해금 유물')
  for (const card of await cards.all()) await expect(card).toBeInViewport({ ratio: 1 })
  await bonus.tap()
  await page.reload()
  await page.getByRole('button', { name: '이어하기' }).tap()
  await expect(bonus).toHaveAttribute('aria-pressed', 'true')
  const buy = page.getByRole('button', { name: '구매 · 동전 5' })
  await expect(buy).toBeInViewport({ ratio: 1 })
  await buy.tap()
  await expect.poll(async () => (await saved(page)).ascent.battle.loot.equipped).toContain('linked-cup')
  expect((await saved(page)).ascent.route.coins).toBe(run.route.coins - 5)
})

test('선행 재굴림은 족보를 열기 전 첫 전투에서 특전 1회로 보이고 기본보다 먼저 쓸 수 있다', async ({ page }) => {
  const withEarly = Array.from({ length: 100 }, (_, index) => index).find(index => offerPerks(index, ALL_META_FLOORS).includes('early-reroll'))
  await page.goto(new URL(`?seed=${withEarly}`, process.env.HWIGI_SMOKE_URL).href)
  await page.evaluate(({ key, progress }) => localStorage.setItem(key, JSON.stringify(progress)), {
    key: META_SAVE_KEY, progress: profile(ALL_META_FLOORS),
  })
  await page.reload()
  await page.getByRole('button', { name: '새로 하기' }).tap()
  await page.getByRole('button', { name: /첫수의 행운/ }).tap()
  await page.getByRole('group', { name: '다음 층 선택' }).getByRole('button', { name: /^전투/ }).tap()

  await expect(page.locator('#room-transition')).toBeHidden()
  await page.getByRole('button', { name: '안내 건너뛰기' }).tap()
  await page.getByRole('button', { name: /^주사위 1,/ }).tap()
  const extra = page.getByRole('button', { name: '특전 재굴림, 이번 전투 1회 남음' })
  await expect(extra).toBeEnabled()
  await extra.tap()
  const run = (await saved(page)).ascent
  expect(run.unlocks).toEqual([])
  expect(run.battle.rerolled).toBe(false)
  expect(run.battle.extraRerollSpent).toBe(true)
  await expect(page.getByRole('button', { name: '특전 재굴림, 이번 전투 0회 남음' })).toBeDisabled()
})

test('설정에서 확인해야 해금만 초기화하고 기존 등반 저장을 계속 불러온다', async ({ page }) => {
  await page.goto(process.env.HWIGI_SMOKE_URL)
  const run = { ...mapBefore(14, 9, 7), meta: { generation: 0, pool: [], opened: initialStages } }
  await store(page, run, profile())
  await page.reload()
  const before = await saved(page)
  await page.locator('#lobby-settings').tap()
  await page.getByRole('button', { name: '영구 해금 기록 지우기' }).tap()
  const confirmation = page.getByRole('dialog', { name: '영구 해금 기록을 지우겠습니까?' })
  await expect(confirmation.locator('#lobby-confirm-text')).toHaveText('다음 등반의 해금과 새 카드 표시 기록이 초기화됩니다.')
  await confirmation.getByRole('button', { name: '취소' }).tap()
  expect((await record(page)).unlocked).toEqual(initialStages)
  await page.getByRole('button', { name: '영구 해금 기록 지우기' }).tap()
  await confirmation.getByRole('button', { name: '해금 기록 지우기' }).tap()
  await expect(page.getByRole('button', { name: '다음 등반 해금 0/10' })).toBeVisible()
  expect(await saved(page)).toEqual(before)
  await page.getByRole('button', { name: '이어하기' }).tap()
  expect((await record(page)).unlocked).toEqual([])
})

test('엄지 띠의 옮김 고리에서 바로 두 눈을 골라 옮기고 재진입한다', async ({ page }) => {
  await page.goto(process.env.HWIGI_SMOKE_URL)
  const map = { ...mapBefore(14, 9, 7), meta: { generation: 0, pool: [7], opened: [] } }
  const combat = availableMapNodes(map).find(node => node.kind === 'fight' || node.kind === 'elite')
  const run = enterMapNode(map, combat.id)
  const battle = { ...run.battle, dice: run.battle.dice.map((face, index) => [5, 3, 2][index] ?? face),
    loot: { ...run.battle.loot, equipped: ['pip-ring'], acquired: ['pip-ring'] } }
  await store(page, { ...run, battle }, profile())
  await page.reload()
  await page.getByRole('button', { name: '이어하기' }).tap()
  await page.locator('#thumb-items [data-reward="pip-ring"]').tap()
  const dock = page.locator('#treasure-controls')
  await expect(dock).toContainText('주사위 두 개를 고르세요.')
  await page.getByRole('button', { name: /^주사위 1,/ }).tap()
  await page.getByRole('button', { name: /^주사위 2,/ }).tap()
  await dock.getByRole('button', { name: '주사위 1에서 주사위 2로 눈 1 옮기기' }).tap()
  await expect.poll(async () => (await saved(page)).ascent.battle.dice.slice(0, 2)).toEqual([4, 4])
  await page.reload()
  await page.getByRole('button', { name: '이어하기' }).tap()
  expect((await saved(page)).ascent.battle.loot.spent).toEqual(['pip-ring'])
})
