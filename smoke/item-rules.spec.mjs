import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { availableMapNodes, beginMapAscent, enterMapNode, rewardOffers } from '../src/ascent.ts'
import { generateAscentMap } from '../src/ascent-map.ts'
import { ASCENT_SAVE_KEY } from '../src/ascent-save.ts'
import { treasureOffers } from '../src/map-treasure.ts'
import { checkpoint, encounter, mapBefore } from './rules-six-fixtures.mjs'

const a = 'attack', g = 'guard'

async function resume(page, run) {
  const { json, restored } = checkpoint(run)
  expect(restored).not.toBeNull()
  if (page.url() === 'about:blank') await page.goto(process.env.HWIGI_SMOKE_URL)
  await page.evaluate(({ key, json }) => localStorage.setItem(key, json), { key: ASCENT_SAVE_KEY, json })
  await reloadRun(page)
}

async function reloadRun(page) {
  await page.reload()
  await page.getByRole('button', { name: '이어 하기' }).tap()
}

const saved = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).ascent, ASCENT_SAVE_KEY)
const card = (page, id) => page.locator(`#reward-cards [data-reward="${id}"]`)
const finish = (page) => page.getByRole('button', { name: '턴 끝내기' })
const choose = (page) => page.getByRole('button', { name: '확인', exact: true })

async function shot(page, info, name, visible) {
  for (const entry of visible) await expect(entry).toBeInViewport({ ratio: 1 })
  await expect.poll(() => page.evaluate(() => {
    const root = document.scrollingElement
    return [root.scrollWidth - root.clientWidth, root.scrollHeight - root.clientHeight]
  })).toEqual([0, 0])
  const output = process.env.HWIGI_ITEM_SHOTS
  if (output) {
    await mkdir(output, { recursive: true })
    await page.screenshot({ path: join(output, `${info.project.name.replace('×', 'x')}-${name}.png`), animations: 'disabled' })
  }
}

function pickFirstReward() {
  for (let seed = 0; seed < 256; seed++) {
    const run = beginMapAscent(seed, undefined, 'odd', 7)
    const node = availableMapNodes(run)[0]
    const offers = treasureOffers(run, node)
    if (offers.includes('advance-knot') && offers.includes('reserve-gauge')) return enterMapNode(run, node.id)
  }
  throw new Error('전진 매듭과 희귀 보상 시드가 없습니다.')
}

function selectElite() {
  for (let seed = 0; seed < 64; seed++) {
    const node = generateAscentMap(seed, 7).nodes.find(({ kind }) => kind === 'elite')
    const run = enterMapNode(mapBefore(seed, node.floor, 7), node.id)
    if (treasureOffers(run, node).includes('die-latch')) return run
  }
  throw new Error('눈금 걸쇠가 있는 강적 보상 시드가 없습니다.')
}

function selectShop() {
  for (let seed = 0; seed < 64; seed++) {
    const node = generateAscentMap(seed, 7).nodes.find(({ kind }) => kind === 'shop')
    const run = enterMapNode(mapBefore(seed, node.floor, 7, 'emperor-shield'), node.id)
    if (run.route.coins >= 5 && rewardOffers(run).includes('hourglass')) {
      return { ...run, battle: { ...run.battle, playerHp: 17 } }
    }
  }
  throw new Error('희귀 유물을 살 수 있는 상점 시드가 없습니다.')
}

function nearVictory(run) {
  const dice = [4, 2, 4, 6].slice(0, run.battle.dice.length)
  return { ...run, battle: { ...run.battle, awakened: true, enemyHp: 1, dice, slots: dice.map(() => a) } }
}

async function arm(page, item, label) {
  await page.locator(`#reward-strip [data-reward="${item}"]`).tap()
  await page.getByRole('button', { name: label, exact: true }).tap()
  await expect(page.locator(`#reward-strip [data-reward="${item}"]`)).toHaveAttribute('aria-pressed', 'true')
}

test('규칙판 7 보상을 받아 쓰고 강적·보스·상점을 거쳐 문지기를 격파한다', async ({ page }, info) => {
  test.setTimeout(75_000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await resume(page, nearVictory(pickFirstReward()))
  await finish(page).tap()
  await expect(page.getByRole('heading', { name: '전투 보상' })).toBeVisible()
  const item = card(page, 'advance-knot')
  const rare = card(page, 'reserve-gauge')
  await expect(rare).toHaveAttribute('data-rarity', 'rare')
  await expect.poll(() => rare.locator('img').evaluate((image) => image.naturalWidth)).toBe(24)
  await item.tap()
  await reloadRun(page)
  await expect(item).toHaveAttribute('aria-pressed', 'true')
  await shot(page, info, 'battle-reward', [...await page.locator('#reward-cards button').all(), choose(page)])
  await choose(page).tap()
  await expect.poll(async () => (await saved(page)).battle.loot.consumables['advance-knot']).toBe(1)
  await page.getByRole('group', { name: '다음 층 선택' }).getByRole('button', { name: /^전투/ }).first().tap()
  const guard = page.getByRole('button', { name: /^방어 칸/ })
  const attack = page.getByRole('button', { name: /^공격 칸/ })
  const die = (index) => page.getByRole('button', { name: new RegExp(`^주사위 ${index},`) })
  await die(1).tap()
  await guard.tap()
  await die(2).tap()
  await die(3).tap()
  await attack.tap()
  await arm(page, 'advance-knot', '켜기')
  const status = page.locator('#treasure-controls .item-effect')
  await expect(status).toHaveAttribute('data-applies', 'false')
  await reloadRun(page)
  await expect(status).toHaveAttribute('data-applies', 'false')
  await die(1).tap()
  await expect(die(1)).toHaveAccessibleName(/미배치/)
  await die(1).tap()
  await expect(die(1)).toHaveAttribute('aria-pressed', 'true')
  await attack.tap()
  await expect(status).toHaveAttribute('data-applies', 'true')
  await expect(status).toHaveText('+6')
  await shot(page, info, 'consumable', [status, attack, finish(page)])
  await finish(page).tap()
  await expect.poll(async () => (await saved(page)).battle.loot.consumables['advance-knot'] ?? 0).toBe(0)

  await resume(page, nearVictory(selectElite()))
  await finish(page).tap()
  await expect(page.getByRole('heading', { name: '강적 유물 선택' })).toBeVisible()
  const eliteCards = page.locator('#reward-cards button')
  await expect(eliteCards).toHaveCount(2)
  expect(await eliteCards.evaluateAll((buttons) => buttons.every((button) => button.dataset.rarity === 'common'))).toBe(true)
  await card(page, 'die-latch').tap()
  await shot(page, info, 'elite-relic', [...await eliteCards.all(), choose(page)])
  await choose(page).tap()
  await expect.poll(async () => (await saved(page)).battle.loot.equipped).toContain('die-latch')

  await resume(page, nearVictory(encounter('chain-warden', 6, 7)))
  await finish(page).tap()
  await expect(page.getByRole('heading', { name: '보스 유물 선택' })).toBeVisible()
  const bossCards = page.locator('#reward-cards button')
  await expect(bossCards).toHaveCount(4)
  await expect(bossCards.locator('.relic-cost')).toHaveText(['½', '½', '0', '−1'])
  await card(page, 'emperor-shield').tap()
  await expect(page.locator('#reward-preview')).toContainText('룰렛 피해는 절반')
  await shot(page, info, 'boss-relics', [...await bossCards.all(), choose(page)])
  await choose(page).tap()
  await expect.poll(async () => (await saved(page)).battle.bossRelic?.id).toBe('emperor-shield')

  await resume(page, selectShop())
  await expect(page.getByRole('heading', { name: '상인' })).toBeVisible()
  await expect(page.locator('.shop-price')).toHaveText(['2', '5'])
  const purse = (await saved(page)).route.coins
  await card(page, 'hourglass').tap()
  await reloadRun(page)
  await expect(card(page, 'hourglass')).toHaveAttribute('aria-pressed', 'true')
  await shot(page, info, 'shop', [...await page.locator('.shop-offer').all(), choose(page)])
  await choose(page).tap()
  await expect.poll(async () => (await saved(page)).route.coins).toBe(purse - 5)
  await reloadRun(page)
  expect((await saved(page)).route.coins).toBe(purse - 5)
  expect((await saved(page)).battle.loot.equipped).toContain('hourglass')

  await resume(page, nearVictory(encounter('boss', 12, 7)))
  await finish(page).tap()
  await expect(page.locator('#completion-seal')).toBeVisible()
  expect(errors).toEqual([])
})

test('예비 눈금의 선택과 새긴 동전의 두 번째 칸을 새로고침 뒤 한 번씩 정산한다', async ({ page }) => {
  test.setTimeout(45_000)
  const run = encounter('chain-warden', 6, 7)
  await resume(page, { ...run, battle: { ...run.battle, loot: { ...run.battle.loot, consumables: { 'reserve-gauge': 1 } } } })
  await arm(page, 'reserve-gauge', '켜기')
  await page.getByRole('button', { name: /^주사위 1,/ }).tap()
  await page.getByRole('button', { name: /^주사위 2,/ }).tap()
  await page.locator('#reroll').tap()
  const pending = (await saved(page)).battle.loot.reserveRoll
  expect(pending).toHaveLength(2)
  await reloadRun(page)
  expect((await saved(page)).battle.loot.reserveRoll).toEqual(pending)
  for (const option of await page.locator('#treasure-controls button').all()) await expect(option).toBeInViewport({ ratio: 1 })
  await page.getByRole('button', { name: /^주사위 1 새 눈/ }).tap()
  await page.getByRole('button', { name: /^주사위 2 원래 눈/ }).tap()
  const reserved = (await saved(page)).battle
  expect(reserved.loot.reserveRoll).toBeUndefined()
  expect(reserved.loot.consumables).toEqual({})
  expect(reserved.dice.slice(0, 2)).toEqual([pending[0].rolled, pending[1].original])

  const parry = encounter('freeze', 2, 7)
  await resume(page, { ...parry, battle: { ...parry.battle, turn: 2, awakened: true, dice: [1, 3, 3, 6], slots: [a, g, g, a],
    loot: { ...parry.battle.loot, consumables: { coin: 1 } } } })
  await finish(page).tap()
  const coin = page.getByRole('button', { name: '새긴 동전으로 룰렛 한 번 더 돌리기' })
  await expect(coin).toBeVisible()
  await coin.tap()
  await expect.poll(async () => (await saved(page)).battle.loot.counterRecast).toBe(true)
  const second = (await saved(page)).battle.loot.counter
  await reloadRun(page)
  expect((await saved(page)).battle.loot.counter).toEqual(second)
  await expect(coin).toHaveCount(0)
  await expect(page.locator('#counter-damage')).toHaveText(String(second.damage))
  await page.getByRole('button', { name: '지금 룰렛 피해 주기' }).tap()
  await expect.poll(async () => (await saved(page)).battle.lastExchange.counter?.slot).toBe(second.slot)
  expect((await saved(page)).battle.loot.consumables).toEqual({})
})
