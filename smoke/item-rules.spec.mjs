import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { availableMapNodes, beginMapAscent, enterMapNode, rewardOffers } from '../src/ascent.ts'
import { generateAscentMap } from '../src/ascent-map.ts'
import { ASCENT_SAVE_KEY } from '../src/ascent-save.ts'
import { BOSS_RELICS, SEVEN_BOSS_RELICS } from '../src/boss-relic.ts'
import { treasureOffers } from '../src/map-treasure.ts'
import { checkpoint, eliteWithThreeArtifacts, encounter, mapBefore } from './rules-six-fixtures.mjs'

const a = 'attack', g = 'guard'
const neonPhase = process.env.HWIGI_NEON_PHASE
const neonOutput = process.env.HWIGI_NEON_SHOTS

async function resume(page, run) {
  const { json, restored } = checkpoint(run)
  expect(restored).not.toBeNull()
  if (page.url() === 'about:blank') await page.goto(process.env.HWIGI_SMOKE_URL)
  await page.evaluate(({ key, json }) => localStorage.setItem(key, json), { key: ASCENT_SAVE_KEY, json })
  await reloadRun(page)
}

async function reloadRun(page) {
  await page.reload()
  await page.getByRole('button', { name: '이어하기' }).tap()
  await expect(page.locator('#room-transition')).toBeHidden()
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
  const output = neonOutput || (name === 'boss-relics' && process.env.HWIGI_BALANCE_SHOTS) || process.env.HWIGI_ITEM_SHOTS
  if (output) {
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    await mkdir(output, { recursive: true })
    const suffix = neonOutput ? `-${neonPhase ?? 'after'}` : ''
    await page.screenshot({ path: join(output, `${info.project.name.replace('×', 'x')}-${name}${suffix}.png`), animations: 'disabled' })
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
  await page.locator('#treasure-controls').getByRole('button', { name: label, exact: true }).tap()
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
  await expect(item.locator('.reward-type')).toHaveText('일회용일반')
  await expect(item.locator('.reward-effect use')).toHaveAttribute('href', '#icon-sword')
  await expect(card(page, 'spacer').locator('.reward-effect use')).toHaveAttribute('href', '#icon-shield')
  await expect(rare.locator('.reward-effect use')).toHaveAttribute('href', '#icon-reroll-die')
  await expect(rare).toHaveAttribute('data-rarity', 'rare')
  await expect.poll(() => rare.locator('img').evaluate((image) => image.naturalWidth)).toBe(24)
  await item.tap()
  await reloadRun(page)
  await expect(item).toHaveAttribute('aria-pressed', 'true')
  await shot(page, info, 'battle-reward', [...await page.locator('#reward-cards button').all(), choose(page)])
  await choose(page).tap()
  await expect.poll(async () => (await saved(page)).battle.loot.consumables['advance-knot']).toBe(1)
  await page.getByRole('group', { name: '다음 층 선택' }).getByRole('button', { name: /^전투/ }).first().tap()
  await page.locator('#enter-room').tap()
  await expect(page.locator('#room-transition')).toBeHidden()
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
  await expect(status.locator('.item-effect-value')).toHaveText('+6')
  if (!neonOutput) await shot(page, info, 'consumable', [status, attack, finish(page)])
  await finish(page).tap()
  await expect.poll(async () => (await saved(page)).battle.loot.consumables['advance-knot'] ?? 0).toBe(0)

  await resume(page, nearVictory(selectElite()))
  await finish(page).tap()
  await expect(page.getByRole('heading', { name: '강적 유물 선택' })).toBeVisible()
  const eliteCards = page.locator('#reward-cards button')
  await expect(eliteCards).toHaveCount(2)
  expect(await eliteCards.evaluateAll((buttons) => buttons.every((button) => button.dataset.rarity === 'common'))).toBe(true)
  await expect(page.locator('#elite-capacity')).toHaveText('유물 0/3')
  await expect(card(page, 'die-latch').locator('.reward-type')).toHaveText('유물일반')
  const latch = card(page, 'die-latch')
  const latchEffect = latch.locator('.reward-effect')
  await expect(latchEffect).toHaveText('다음 턴1개')
  await expect(latchEffect.locator('use').last()).toHaveAttribute('href', '#icon-die')
  const latchFrame = await latch.boundingBox()
  const effectArea = await latchEffect.boundingBox()
  expect(effectArea.y + effectArea.height).toBeLessThan(latchFrame.y + latchFrame.height)
  await card(page, 'die-latch').tap()
  await shot(page, info, 'elite-relic', [...await eliteCards.all(), choose(page)])
  await choose(page).tap()
  await expect.poll(async () => (await saved(page)).battle.loot.equipped).toContain('die-latch')

  await resume(page, nearVictory(encounter('chain-warden', 6, 7)))
  await finish(page).tap()
  await expect(page.getByRole('heading', { name: '보스 유물 선택' })).toBeVisible()
  const bossCards = page.locator('#reward-cards button')
  await expect(bossCards).toHaveCount(4)
  await expect(card(page, 'revived-heart').locator('.relic-cost use')).toHaveAttribute('href', '#icon-healing')
  await expect(bossCards.locator('.relic-cost')).toHaveText(BOSS_RELICS.map((id) => SEVEN_BOSS_RELICS[id].cost[1]))
  const benefit = await bossCards.first().locator('.relic-benefit').boundingBox()
  const cost = await bossCards.first().locator('.relic-cost').boundingBox()
  expect(cost.y).toBeGreaterThan(benefit.y + benefit.height)
  await card(page, 'healing-scepter').tap()
  await expect(page.locator('#reward-preview')).toContainText('기본 재굴림 시 체력 1')
  await card(page, 'emperor-shield').tap()
  await expect(page.locator('#reward-preview')).toContainText('룰렛 피해는 절반')
  await shot(page, info, 'boss-relics', [...await bossCards.all(), choose(page)])
  await choose(page).tap()
  await expect.poll(async () => (await saved(page)).battle.bossRelic?.id).toBe('emperor-shield')

  await resume(page, selectShop())
  await expect(page.getByRole('heading', { name: '상인' })).toBeVisible()
  await expect(page.locator('.shop-price')).toHaveText(['2', '5'])
  const purse = (await saved(page)).route.coins
  await card(page, 'kit').tap()
  await expect(page.getByRole('button', { name: '구매 · 동전 2' })).toBeEnabled()
  await card(page, 'hourglass').tap()
  await reloadRun(page)
  await expect(card(page, 'hourglass')).toHaveAttribute('aria-pressed', 'true')
  const purchase = page.getByRole('button', { name: '구매 · 동전 5' })
  const badge = page.locator('#boss-relic-slot button')
  const frame = await badge.boundingBox()
  const number = await badge.locator('.item-count').boundingBox()
  expect(number.x).toBeGreaterThan(frame.x)
  expect(number.x + number.width).toBeLessThan(frame.x + frame.width)
  expect(number.y + number.height).toBeLessThan(frame.y + frame.height)
  await shot(page, info, 'shop', [...await page.locator('.shop-offer').all(), purchase])
  await purchase.tap()
  await expect.poll(async () => (await saved(page)).route.coins).toBe(purse - 5)
  await reloadRun(page)
  expect((await saved(page)).route.coins).toBe(purse - 5)
  expect((await saved(page)).battle.loot.equipped).toContain('hourglass')

  await resume(page, nearVictory(encounter('boss', 12, 7)))
  await finish(page).tap()
  await expect(page.locator('#completion-seal')).toBeVisible()
  expect(errors).toEqual([])
})

test('강적 승리 뒤 장착 유물 세 개를 유지하고 보너스 동전을 한 번 받는다', async ({ page }, info) => {
  const fight = eliteWithThreeArtifacts()
  const equipped = fight.battle.loot.equipped
  await resume(page, nearVictory(fight))
  await finish(page).tap()
  await expect(page.getByRole('heading', { name: '강적 유물 선택' })).toBeVisible()
  const rack = page.getByRole('group', { name: '장착 중인 유물 세 개' })
  const held = rack.locator(':scope > span')
  await expect(held).toHaveCount(3)
  await expect(page.locator('#elite-capacity')).toHaveText('유물 3/3')
  const positions = await held.evaluateAll((cards) => cards.map((card) => {
    const { x, y } = card.getBoundingClientRect()
    return { x, y }
  }))
  expect(new Set(positions.map(({ y }) => y)).size).toBe(1)
  expect(new Set(positions.map(({ x }) => x)).size).toBe(3)
  const keep = page.getByRole('button', { name: /^지금 유물 유지/ })
  await expect(keep).toContainText('+2')
  await expect(page.locator('#first-run-line')).toHaveText('유물을 바꾸거나 그대로 유지하세요.')
  const note = await page.locator('#first-run-note').boundingBox()
  const bossSlot = page.locator('#boss-relic-slot')
  if (await bossSlot.isVisible()) {
    const slot = await bossSlot.boundingBox()
    expect(note.y).toBeGreaterThanOrEqual(slot.y + slot.height)
  }
  const offers = page.locator('#reward-cards button')
  await shot(page, info, 'elite-keep-three', [rack, ...await offers.all(), keep])
  await offers.first().tap()
  await expect(choose(page)).toBeDisabled()
  await reloadRun(page)
  const before = await saved(page)
  expect(before.route.coins).toBe(fight.route.coins + 2)
  await keep.tap()
  await expect(page.getByRole('heading', { name: '두 갈래 길' })).toBeVisible()
  await reloadRun(page)
  const after = await saved(page)
  expect(after.route.coins).toBe(before.route.coins + 2)
  expect(after.route.declinedEliteRewards).toEqual([before.route.node])
  expect(after.battle.loot.equipped).toEqual(equipped)
  await expect(keep).toBeHidden()

  const boss = encounter('chain-warden', 6, 7)
  await resume(page, nearVictory({ ...boss, battle: { ...boss.battle, loot: { ...boss.battle.loot, equipped, acquired: equipped } } }))
  await finish(page).tap()
  await expect(page.getByRole('heading', { name: '보스 유물 선택' })).toBeVisible()
  await expect(keep).toBeHidden()
  await expect(offers).toHaveCount(4)
  await card(page, 'emperor-shield').tap()
  await choose(page).tap()
  const granted = await saved(page)
  expect(granted.battle.loot.equipped).toEqual(equipped)
  expect(granted.battle.bossRelic.id).toBe('emperor-shield')
})

test('좌상단 아이콘으로 고르고 하단에서 유물 사용과 소모품 선택을 마친다', async ({ page }, info) => {
  const fight = encounter('chain-warden', 6, 7)
  const loot = { ...fight.battle.loot, equipped: ['hourglass'], acquired: ['hourglass'], consumables: { tuning: 1, wedge: 1 } }
  await resume(page, { ...fight, battle: { ...fight.battle, loot } })
  const strip = page.locator('.inventory-strip')
  const dock = page.getByRole('group', { name: '아이템 조작' })
  const chip = (id) => strip.locator(`[data-reward="${id}"]`)
  const die = (index) => page.getByRole('button', { name: new RegExp(`^주사위 ${index},`) })
  const use = dock.getByRole('button', { name: '사용', exact: true })
  const original = await saved(page)
  const intent = page.locator('#intent')
  await expect(intent.locator('.intent-equation')).toBeVisible()
  await expect(intent.locator('.intent-equals + strong')).toHaveText('17')
  expect(await intent.evaluate((element) => {
    const size = (selector) => parseFloat(getComputedStyle(element.querySelector(selector)).fontSize)
    return size('strong') > size('.intent-equation')
  })).toBe(true)
  await shot(page, info, 'midboss-intent', [intent, finish(page)])
  await chip('hourglass').tap()
  await expect(chip('hourglass')).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect((await saved(page)).battle.loot.spent).toEqual([])
  const planning = await page.locator('#planning').boundingBox()
  const lower = await use.boundingBox()
  const arena = await page.locator('#arena').boundingBox()
  expect(arena.y + arena.height).toBeLessThanOrEqual(planning.y)
  expect(lower.y).toBeGreaterThan(planning.y + planning.height)
  expect((await chip('hourglass').boundingBox()).y).toBeLessThan(planning.y)
  const chips = await strip.boundingBox()
  const bossName = await page.locator('#encounter-name').boundingBox()
  expect(chips.y + chips.height).toBeLessThan(bossName.y)
  await expect(dock.locator('.dock-summary')).toHaveText('−21~6')
  await expect(dock.locator('.dock-summary use').first()).toHaveAttribute('href', '#icon-heart')
  await shot(page, info, 'lower-item-use', [chip('hourglass'), dock, use, finish(page)])

  await use.tap()
  const dieTop = (await die(1).boundingBox()).y
  await die(1).tap()
  const face = original.battle.dice[0] === 6 ? 5 : 6
  const pick = dock.getByRole('button', { name: `눈 ${face}로 바꾸기, 체력 2 소모` })
  await expect(pick).toBeInViewport({ ratio: 1 })
  const arenaWithPicker = await page.locator('#arena').boundingBox()
  const planningWithPicker = await page.locator('#planning').boundingBox()
  expect(arenaWithPicker.y + arenaWithPicker.height).toBeLessThanOrEqual(planningWithPicker.y)
  await expect(die(1)).toHaveAttribute('aria-pressed', 'true')
  expect((await die(1).boundingBox()).y).toBeCloseTo(dieTop)
  expect((await pick.boundingBox()).y).toBeGreaterThan((await page.locator('#planning').boundingBox()).y)
  await pick.tap()
  const adjusted = await saved(page)
  expect(adjusted.battle.dice[0]).toBe(face)
  expect(adjusted.battle.playerHp).toBe(original.battle.playerHp - 2)
  expect(adjusted.battle.loot.spent).toEqual(['hourglass'])
  await expect(use).toBeDisabled()

  await chip('tuning').tap()
  await use.tap()
  await dock.getByRole('button', { name: '조율 -1' }).tap()
  await chip('wedge').tap()
  await expect(dock.getByRole('button', { name: '켜기', exact: true })).toBeDisabled()
  const used = await saved(page)
  expect(used.battle.loot.consumables).toEqual({ wedge: 1 })
  expect(used.battle.loot.consumableUsed).toBe(true)
  expect(used.battle.loot.consumableArmed).toBeUndefined()
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
  await expect(coin).toBeInViewport({ ratio: 1 })
  const footer = await page.locator('#counter-footer').boundingBox()
  const counterDock = await page.locator('#treasure-controls').boundingBox()
  expect(footer.y + footer.height).toBeLessThanOrEqual(counterDock.y)
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

test('회복 왕홀을 장착하면 기본 재굴림에서 체력 1을 한 번 내고 그 상태로 재진입한다', async ({ page }) => {
  const run = encounter('shield-soldier', 8, 7)
  await resume(page, { ...run, battle: { ...run.battle, playerHp: 12, bossRelic: { id: 'healing-scepter' } } })
  await page.getByRole('button', { name: /^주사위 1,/ }).tap()
  const reroll = page.getByRole('button', { name: '다시 굴리기, 체력 1 소모' })
  await expect(reroll).toBeEnabled()
  await reroll.tap()
  await expect.poll(async () => (await saved(page)).battle.playerHp).toBe(11)
  await reloadRun(page)
  const restored = (await saved(page)).battle
  expect(restored.playerHp).toBe(11)
  expect(restored.rerolled).toBe(true)
  expect(restored.paidRerollSpent).toBeUndefined()
  await expect(page.locator('#reroll')).toBeDisabled()
})

test('한 자리 동전과 2층에서 전진 매듭의 대기와 발동을 비교한다', async ({ page }, info) => {
  const run = encounter('freeze', 2, 7)
  await resume(page, {
    ...run, route: { ...run.route, coins: 1 },
    battle: { ...run.battle, loot: { ...run.battle.loot, consumables: { 'advance-knot': 1 } } },
  })
  await arm(page, 'advance-knot', '켜기')
  await page.getByRole('button', { name: '아이템 조작 닫기' }).tap()
  const status = page.locator('#treasure-controls .item-effect')
  await expect(status).toHaveAttribute('data-applies', 'false')
  const coins = page.locator('#run-coins')
  const floor = page.locator('#fight')
  await expect(coins).toHaveAccessibleName('보유 동전 1개')
  await expect(floor).toHaveText('2/12 층')
  const coinBox = await coins.boundingBox()
  expect((await floor.boundingBox()).x - (coinBox.x + coinBox.width)).toBeGreaterThanOrEqual(4)
  await expect(status.locator('.item-effect-state')).toHaveText('대기')
  await expect(status.locator('.item-effect-state use')).toHaveCount(0)
  if (neonOutput) await shot(page, info, 'consumable-ready', [status])
  await page.getByRole('button', { name: /^주사위 1,/ }).tap()
  await page.getByRole('button', { name: /^공격 칸/ }).tap()
  await expect(status).toHaveAttribute('data-applies', 'true')
  await expect(status.locator('.item-effect-state')).toHaveText('발동')
  await expect(status.locator('.item-effect-state use')).toHaveAttribute('href', '#icon-map-check')
  if (neonOutput) await shot(page, info, 'consumable', [status, finish(page)])
})

test('유물 네 칸과 소모품이 함께 있으면 넘친 소모품을 열어 하단에서 쓴다', async ({ page }) => {
  const run = eliteWithThreeArtifacts()
  const loot = { ...run.battle.loot, consumables: { wedge: 1, 'advance-knot': 1, tuning: 1, weight: 1, buckle: 1 } }
  await resume(page, { ...run, battle: { ...run.battle, loot } })
  const inventory = page.locator('.inventory-strip')
  await expect(inventory.locator('#artifact-strip button')).toHaveCount(3)
  await expect(inventory.locator('#boss-relic-slot button')).toBeVisible()
  const overflow = inventory.getByRole('button', { name: /^나머지 보유 보상/ })
  await expect(overflow).toBeInViewport({ ratio: 1 })
  await overflow.tap()
  const item = page.locator('#inventory-overflow [data-reward="tuning"]')
  await expect(item).toBeInViewport({ ratio: 1 })
  await item.tap()
  const dock = page.getByRole('group', { name: '아이템 조작' })
  await dock.getByRole('button', { name: '사용', exact: true }).tap()
  await page.getByRole('button', { name: /^주사위 1,/ }).tap()
  const choice = dock.getByRole('button', { name: /^조율 -?1$/ }).first()
  await expect(choice).toBeInViewport({ ratio: 1 })
  await choice.tap()
  expect((await saved(page)).battle.loot.consumables.tuning).toBeUndefined()
})
