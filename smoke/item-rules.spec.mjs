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

async function arm(page, item) {
  const chip = page.locator(`#thumb-items [data-reward="${item}"]`)
  await chip.tap()
  await expect(chip).toHaveAttribute('aria-pressed', 'true')
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
  await expect(page.locator('.shop-price')).toHaveText(['2', '2', '5'])
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
  const seal = page.locator('#completion-seal')
  const unlock = page.locator('#confirm-unlock')
  for (let i = 0; i < 2; i++) {
    await expect(seal.or(unlock).first()).toBeVisible()
    if (await seal.isVisible()) break
    await unlock.tap()
  }
  await expect(seal).toBeVisible()
  expect(errors).toEqual([])
})

test('강적 승리 뒤 장착 유물 세 개를 유지하고 보너스 동전을 한 번 받는다', async ({ page }, info) => {
  const fight = eliteWithThreeArtifacts()
  const equipped = fight.battle.loot.equipped
  await resume(page, nearVictory(fight))
  await finish(page).tap()
  await expect(page.getByRole('heading', { name: '강적 유물 선택' })).toBeVisible()
  const rack = page.getByRole('group', { name: '장착 중인 유물' })
  const held = rack.locator(':scope > button')
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
  const noteLocator = page.locator('#first-run-note')
  await expect(noteLocator).toBeInViewport({ ratio: 1 })
  const note = await noteLocator.boundingBox()
  const heading = await page.locator('#reward-heading').boundingBox()
  expect(note.y + note.height).toBeLessThanOrEqual(heading.y)
  const bossSlot = page.locator('#boss-relic-slot')
  if (await bossSlot.isVisible()) {
    const slot = await bossSlot.boundingBox()
    expect(note.y).toBeGreaterThanOrEqual(slot.y + slot.height)
  }
  const offers = page.locator('#reward-cards button')
  await shot(page, info, 'elite-keep-three', [rack, ...await offers.all(), keep])
  const keepBeforeDismiss = await keep.boundingBox()
  await page.keyboard.press('Escape')
  await expect(noteLocator).toBeHidden()
  expect(await keep.boundingBox()).toEqual(keepBeforeDismiss)
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

test('엄지 띠에서 즉시 대상 선택을 열고 전장 크기를 유지한다', async ({ page }, info) => {
  const fight = encounter('chain-warden', 6, 7)
  const loot = { ...fight.battle.loot, equipped: ['hourglass'], acquired: ['hourglass'], consumables: { tuning: 1, wedge: 1 } }
  await resume(page, { ...fight, battle: { ...fight.battle, loot } })
  const dock = page.getByRole('group', { name: '아이템 조작' })
  const chip = (id) => page.locator(`#thumb-items [data-reward="${id}"]`)
  const die = (index) => page.getByRole('button', { name: new RegExp(`^주사위 ${index},`) })
  const original = await saved(page)
  const intent = page.locator('#intent')
  await expect(chip('hourglass').locator('use')).toHaveAttribute('href', '#icon-treasure-hourglass')
  await expect(chip('wedge').locator('use')).toHaveAttribute('href', '#icon-reward-wedge')
  await expect(intent.locator('.intent-equation')).toBeVisible()
  await expect(intent.locator('.intent-equals + strong')).toHaveText('17')
  expect(await intent.evaluate((element) => {
    const size = (selector) => parseFloat(getComputedStyle(element.querySelector(selector)).fontSize)
    return size('strong') > size('.intent-equation')
  })).toBe(true)
  await shot(page, info, 'midboss-intent', [intent, finish(page)])
  const arena = await page.locator('#arena').boundingBox()
  await chip('hourglass').tap()
  await expect(chip('hourglass')).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect((await saved(page)).battle.loot.spent).toEqual([])
  const planning = await page.locator('#planning').boundingBox()
  const lower = await dock.boundingBox()
  expect(arena.y + arena.height).toBeLessThanOrEqual(planning.y)
  expect(lower.y + lower.height).toBeLessThanOrEqual(arena.y + arena.height)
  expect((await chip('hourglass').boundingBox()).y).toBeGreaterThanOrEqual(planning.y)
  expect(await page.locator('#arena').boundingBox()).toEqual(arena)
  await expect(dock.getByRole('button', { name: '사용', exact: true })).toHaveCount(0)
  const bossName = await page.locator('#encounter-name').boundingBox()
  const bossRelic = page.locator('#boss-relic-slot')
  if (await bossRelic.isVisible()) {
    const chips = await bossRelic.boundingBox()
    const gap = Math.max(chips.y - bossName.y - bossName.height, bossName.y - chips.y - chips.height)
    expect(gap).toBeGreaterThanOrEqual(6)
  }
  await expect(dock.locator('.dock-summary')).toHaveText('−21~6')
  await expect(dock.locator('.dock-summary use').first()).toHaveAttribute('href', '#icon-heart')
  const effect = dock.locator('.dock-effect')
  await expect(effect).toHaveText('전투당 1회, 체력 2를 소모해 일반 주사위 하나를 원하는 눈으로 맞춥니다.')
  await expect(effect).toHaveCSS('white-space', 'normal')
  await expect(effect).toBeInViewport({ ratio: 1 })
  await shot(page, info, 'lower-item-use', [chip('hourglass'), dock, finish(page)])

  const dieTop = (await die(1).boundingBox()).y
  await die(1).tap()
  const face = original.battle.dice[0] === 6 ? 5 : 6
  const pick = dock.getByRole('button', { name: `눈 ${face}로 바꾸기, 체력 2 소모` })
  await expect(dock.locator('.item-selection')).toHaveText('주사위 1/1 선택')
  await expect(pick).toBeInViewport({ ratio: 1 })
  expect(await dock.evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true)
  for (const vital of await page.locator('.encounter .vital:visible').all()) {
    const box = await vital.boundingBox()
    const picker = await dock.boundingBox()
    expect(picker.y + picker.height).toBeLessThanOrEqual(box.y)
  }
  await shot(page, info, 'lower-item-target', [dock, pick, chip('hourglass')])
  const arenaWithPicker = await page.locator('#arena').boundingBox()
  const planningWithPicker = await page.locator('#planning').boundingBox()
  expect(arenaWithPicker.y + arenaWithPicker.height).toBeLessThanOrEqual(planningWithPicker.y)
  await expect(die(1)).toHaveAttribute('aria-pressed', 'true')
  expect((await die(1).boundingBox()).y).toBeCloseTo(dieTop)
  expect((await pick.boundingBox()).y).toBeLessThan((await page.locator('#planning').boundingBox()).y)
  await pick.tap()
  const adjusted = await saved(page)
  expect(adjusted.battle.dice[0]).toBe(face)
  expect(adjusted.battle.playerHp).toBe(original.battle.playerHp - 2)
  expect(adjusted.battle.loot.spent).toEqual(['hourglass'])

  await chip('tuning').tap()
  await expect(effect).toHaveText('고른 일반 주사위의 눈을 1 올리거나 내립니다.')
  await shot(page, info, 'lower-consumable-use', [chip('tuning'), dock, finish(page)])
  await dock.getByRole('button', { name: '조율 -1' }).tap()
  await chip('wedge').tap()
  await expect(dock.locator('.dock-effect')).toHaveText('공격 주사위를 놓은 턴의 공격 합이 3 오릅니다.')
  await expect(chip('wedge')).toHaveAttribute('aria-pressed', 'false')
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
  const coin = page.getByRole('button', { name: '점술사의 은화로 룰렛 한 번 더 돌리기' })
  await page.getByRole('button', { name: '멈추기' }).tap()
  await expect(coin).toBeInViewport({ ratio: 1 })
  const footer = await page.locator('#counter-footer').boundingBox()
  const counterDock = await page.locator('#treasure-controls').boundingBox()
  expect(footer.y + footer.height).toBeLessThanOrEqual(counterDock.y)
  await coin.tap()
  await page.getByRole('button', { name: '멈추기' }).tap()
  await expect.poll(async () => (await saved(page)).battle.loot.counterRecast).toBe(true)
  const second = (await saved(page)).battle.loot.counter
  await reloadRun(page)
  expect((await saved(page)).battle.loot.counter).toEqual(second)
  await expect(coin).toHaveCount(0)
  await expect(page.locator('#counter-damage')).toHaveText(String(second.damage))
  await page.getByRole('button', { name: `피해 ${second.damage} 주기` }).tap()
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

test('유물 네 칸과 소모품이 함께 있어도 엄지 띠에서 조율을 바로 연다', async ({ page }) => {
  const run = eliteWithThreeArtifacts()
  const loot = { ...run.battle.loot, consumables: { wedge: 1, 'advance-knot': 1, tuning: 1, weight: 1, buckle: 1 } }
  await resume(page, { ...run, battle: { ...run.battle, loot } })
  const inventory = page.locator('.inventory-strip')
  await expect(inventory.locator('#artifact-strip button').or(page.locator('#thumb-items button[data-reward]')).first()).toBeVisible()
  await expect(inventory.locator('#boss-relic-slot button')).toBeVisible()
  const item = page.locator('#thumb-items [data-reward="tuning"]')
  await expect(item).toBeInViewport({ ratio: 1 })
  await item.tap()
  const dock = page.getByRole('group', { name: '아이템 조작' })
  await page.getByRole('button', { name: /^주사위 1,/ }).tap()
  const choice = dock.getByRole('button', { name: /^조율 -?1$/ }).first()
  await expect(choice).toBeInViewport({ ratio: 1 })
  await choice.tap()
  expect((await saved(page)).battle.loot.consumables.tuning).toBeUndefined()
})

test('강적 보상과 상점에서 보유 효과를 읽고 교체 전후를 들여다본다', async ({ page }) => {
  const elite = eliteWithThreeArtifacts()
  await resume(page, nearVictory(elite))
  await finish(page).tap()
  const held = page.locator('[data-equipped-reward]')
  const preview = page.locator('#reward-preview')
  const comparison = preview.locator('.replacement-comparison')
  await expect(held).toHaveCount(3)
  const old = await held.first().locator('strong').textContent()
  await expect(held.first().locator('small svg')).toBeVisible()
  await held.first().tap()
  await expect(preview).toContainText(old)
  await expect(preview.locator('span')).not.toBeEmpty()
  const incoming = page.locator('#reward-cards .artifact-card').first()
  const name = await incoming.locator('strong').textContent()
  await incoming.tap()
  await held.first().tap()
  await expect(comparison).toContainText('뺄 것 · ' + old)
  await expect(comparison).toContainText('넣을 것 · ' + name)
  await reloadRun(page)
  await expect(comparison).toContainText('뺄 것 · ' + old)
  await page.locator('[data-option="replace"]').last().tap()
  await expect(comparison).toContainText('뺄 것 · ' + await held.last().locator('strong').textContent())
  expect(await page.evaluate(() => document.scrollingElement.scrollWidth)).toBe(page.viewportSize().width)

  const shopSeed = selectShop()
  const shopNode = shopSeed.route.map.byId[shopSeed.route.node]
  const beforeShop = mapBefore(shopSeed.seed, shopNode.floor, 7, 'emperor-shield')
  const equipped = ['horn', 'overflow', 'mirror']
  const loot = { ...beforeShop.battle.loot, equipped, acquired: equipped }
  const shop = enterMapNode({ ...beforeShop, battle: { ...beforeShop.battle, loot } }, shopNode.id)
  await resume(page, shop)
  const stock = page.locator('#reward-cards .artifact-card').first()
  await expect(stock).toBeVisible()
  await expect(held).toHaveCount(3)
  const owned = await held.first().locator('strong').textContent()
  await held.first().tap()
  await expect(preview).toContainText(owned)
  await stock.tap()
  await held.first().tap()
  await expect(comparison).toContainText('뺄 것 · ' + owned)
  await expect(comparison).toContainText('넣을 것 · ' + await stock.locator('strong').textContent())
})
