import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { availableMapNodes, enterMapNode } from '../src/ascent.ts'
import { ASCENT_SAVE_KEY } from '../src/ascent-save.ts'
import { META_SAVE_KEY } from '../src/meta-progress.ts'
import { isMetaPerk } from '../src/meta-unlocks.ts'
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
  await page.getByRole('button', { name: '이어 하기' }).tap()
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
  await page.getByRole('button', { name: '이어 하기' }).tap()
  await page.getByRole('button', { name: '턴 끝내기' }).tap()
  const reveal = page.locator('#meta-reveal')
  await expect(reveal.locator('li')).toHaveCount(4)
  await expect(reveal.getByText('핏빛 손잡이')).toBeVisible()
  await shot(page, info, 'result-unlocked-cards', reveal)
  await page.locator('#climb-again').tap()
  await expect(page.locator('#boss-relic-slot')).toBeHidden()
  await expect(page.locator('#perk-choices .meta-new').first()).toHaveText('새')
  await expect.poll(async () => (await record(page)).seen.length).toBeGreaterThan(0)
  await shot(page, info, 'new-perk-badge', page.locator('#perk-choices'))
  await page.locator('#return-lobby').tap()
  await page.locator('#new-ascent').tap()
  await expect(page.locator('#perk-choices .meta-new')).toHaveCount(0)
})

test('설정에서 확인해야 해금만 초기화하고 기존 등반 저장을 계속 불러온다', async ({ page }) => {
  await page.goto(process.env.HWIGI_SMOKE_URL)
  const run = { ...mapBefore(14, 9, 7), meta: { generation: 0, pool: [], opened: initialStages } }
  await store(page, run, profile())
  await page.reload()
  const before = await saved(page)
  await page.locator('#lobby-settings').tap()
  await page.getByRole('button', { name: '영구 해금 기록 지우기' }).tap()
  const confirmation = page.getByRole('dialog', { name: '영구 해금 기록을 지울까요?' })
  await confirmation.getByRole('button', { name: '취소' }).tap()
  expect((await record(page)).unlocked).toEqual(initialStages)
  await page.getByRole('button', { name: '영구 해금 기록 지우기' }).tap()
  await confirmation.getByRole('button', { name: '해금 기록 지우기' }).tap()
  await expect(page.getByRole('button', { name: '다음 등반 해금 0/10' })).toBeVisible()
  expect(await saved(page)).toEqual(before)
  await page.getByRole('button', { name: '이어 하기' }).tap()
  expect((await record(page)).unlocked).toEqual([])
})

test('옮김 고리는 유물 칸에서 열고 하단에서 두 눈을 옮겨 재진입한다', async ({ page }) => {
  await page.goto(process.env.HWIGI_SMOKE_URL)
  const map = { ...mapBefore(14, 9, 7), meta: { generation: 0, pool: [7], opened: [] } }
  const combat = availableMapNodes(map).find(node => node.kind === 'fight' || node.kind === 'elite')
  const run = enterMapNode(map, combat.id)
  const battle = { ...run.battle, dice: run.battle.dice.map((face, index) => [5, 3, 2][index] ?? face),
    loot: { ...run.battle.loot, equipped: ['pip-ring'], acquired: ['pip-ring'] } }
  await store(page, { ...run, battle }, profile())
  await page.reload()
  await page.getByRole('button', { name: '이어 하기' }).tap()
  await page.locator('#artifact-strip [data-reward="pip-ring"]').tap()
  const dock = page.locator('#treasure-controls')
  await dock.getByRole('button', { name: '사용', exact: true }).tap()
  await page.getByRole('button', { name: /^주사위 1,/ }).tap()
  await page.getByRole('button', { name: /^주사위 2,/ }).tap()
  await dock.getByRole('button', { name: '주사위 1에서 주사위 2로 눈 1 옮기기' }).tap()
  await expect.poll(async () => (await saved(page)).ascent.battle.dice.slice(0, 2)).toEqual([4, 4])
  await page.reload()
  await page.getByRole('button', { name: '이어 하기' }).tap()
  expect((await saved(page)).ascent.battle.loot.spent).toEqual(['pip-ring'])
})
