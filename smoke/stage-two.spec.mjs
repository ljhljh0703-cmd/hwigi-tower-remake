import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { chooseUpperAscent, resolveAscentTurn, spinAscentCounter } from '../src/ascent.ts'
import { ASCENT_SAVE_KEY, loadAscentSave } from '../src/ascent-save.ts'
import { openFormation } from '../src/upper-combat.ts'
import { atFloor, checkpointFor, withDice, withFormation } from './stage-two-fixture.mjs'

const allAttack = ['attack', 'attack', 'attack']
const nextTurn = page => page.locator('#resolve')
const card = (page, id) => page.locator(`.upper-card[data-role="${id}"]`)
const save = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), ASCENT_SAVE_KEY)
const goal = page => page.locator('.upper-goal')

async function resume(page, run) {
  const { storage, json } = checkpointFor(run)
  expect(loadAscentSave(storage)).not.toBeNull()
  if (page.url() === 'about:blank') await page.goto(process.env.HWIGI_SMOKE_URL)
  await page.evaluate(({ key, json }) => localStorage.setItem(key, json), { key: ASCENT_SAVE_KEY, json })
  await page.reload()
  await page.locator('#continue-ascent').tap()
  await expect(page.locator('#room-transition')).toBeHidden()
}

async function photo(page, label) {
  const output = process.env.HWIGI_STAGE_TWO_SHOTS
  if (!output) return
  await mkdir(output, { recursive: true })
  await page.evaluate(() => document.fonts.ready)
  const { width, height } = page.viewportSize()
  await page.screenshot({ path: join(output, `${width}x${height}-seed12-${label}.png`), caret: 'hide', scale: 'css' })
}

async function inFrame(page, selectors) {
  const items = await Promise.all(selectors.map(selector => page.locator(selector).boundingBox()))
  const { width, height } = page.viewportSize()
  for (const item of items) {
    expect(item).not.toBeNull()
    expect(item.x).toBeGreaterThanOrEqual(0)
    expect(item.y).toBeGreaterThanOrEqual(0)
    expect(item.x + item.width).toBeLessThanOrEqual(width)
    expect(item.y + item.height).toBeLessThanOrEqual(height)
  }
  const cards = await page.locator('.upper-card').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()))
  if (cards.length && await page.locator('#planning').isVisible()) {
    const planning = await page.locator('#planning').boundingBox()
    for (const box of cards) expect(box.bottom).toBeLessThanOrEqual(planning.y - 2)
    const player = await page.locator('.upper-field .player .vital').boundingBox()
    expect(player.y + player.height).toBeLessThanOrEqual(planning.y - 2)
  }
  for (let i = 1; i < cards.length; i++) expect(cards[i].left - cards[i - 1].right).toBeGreaterThanOrEqual(2)
  expect(await page.evaluate(() => document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth)).toBe(0)
}

test('12층 선택에서 13층 진입과 전위 격파 및 후위 전진을 정상 속도로 재생한다', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const floor12 = atFloor(12)
  const close = { ...floor12, battle: { ...floor12.battle, enemyHp: 1, playerHp: 12 } }
  await resume(page, withDice(close, [6, 5, 3], allAttack))
  await nextTurn(page).tap()
  await expect(page.locator('#result')).toHaveText('하층 완주')
  await expect(page.locator('#finish-lower')).toBeVisible()
  await inFrame(page, ['#next', '#finish-lower'])
  await photo(page, '12-turn1-choice')
  await page.locator('#next').tap()
  await page.locator('#fork-options button').tap()
  await page.locator('#enter-room').tap()
  await expect(page.locator('#room-transition')).toBeHidden()
  await expect(card(page, 'dash')).toHaveAttribute('data-lane', '0')
  await expect(card(page, 'support')).toHaveAttribute('data-lane', '1')
  await expect(goal(page)).toContainText('4')
  await expect.poll(async () => (await save(page)).ascent.battle.playerHp).toBe(18)
  await expect.poll(async () => (await save(page)).ascent.battle.loot.consumables.tuning).toBe(1)
  await inFrame(page, ['.upper-goal', '.upper-card[data-role="dash"]', '.upper-card[data-role="support"]', '#resolve'])
  await photo(page, '13-turn1-formation')

  await resume(page, withDice(atFloor(13), [6, 4, 2], allAttack))
  await expect(card(page, 'dash').locator('.upper-intent')).toHaveAttribute('data-cancelled', '')
  await expect(card(page, 'support').locator('.upper-preview')).toHaveText('↪2')
  await nextTurn(page).tap()
  await expect(card(page, 'dash').locator('.upper-damage')).toHaveText('−10')
  await photo(page, '13-turn1-front-hit')
  await expect(card(page, 'support')).toHaveAttribute('data-lane', '0')
  await photo(page, '13-turn1-rear-advanced')
  await expect(nextTurn(page)).toBeVisible()
  expect((await save(page)).ascent.battle.formation.enemies.map(enemy => enemy.hp)).toEqual([0, 10])
  await page.reload()
  await page.locator('#continue-ascent').tap()
  await expect(card(page, 'support').locator('.upper-hp')).toHaveAttribute('aria-label', '체력 10/12')
  expect(errors).toEqual([])
})

test('17층 세 마리와 지원, 14층 교대·취소, 19층 강타·약화 및 결산을 검증한다', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await resume(page, atFloor(17, 'elite'))
  await expect(goal(page)).toContainText('11')
  await expect(card(page, 'dash').locator('.upper-intent')).toContainText('5')
  await expect(card(page, 'support').locator('.upper-intent')).toContainText('지원')
  await inFrame(page, ['.upper-goal', ...['shield', 'dash', 'support'].map(id => `.upper-card[data-role="${id}"]`), '#resolve'])
  await photo(page, '17-turn1-elite')
  await resume(page, withDice(withFormation(atFloor(17, 'elite'), [5, 4, 14]), [6, 4, 2], allAttack))
  await expect(card(page, 'support').locator('.upper-preview')).toHaveText('↪3')
  await expect(goal(page)).toContainText('0')
  await nextTurn(page).tap()
  await expect.poll(async () => (await save(page)).ascent.battle.formation.enemies.map(enemy => enemy.hp)).toEqual([0, 0, 11])

  for (const rear of [true, false]) {
    let run = atFloor(14)
    if (!rear) run = withFormation(run, [14, 0])
    run = { ...run, battle: { ...run.battle, turn: 3, formation: openFormation(run.battle.formation, 3) } }
    await resume(page, run)
    await expect(card(page, rear ? 'dash' : 'shield')).toHaveAttribute('data-lane', '0')
    await expect(goal(page)).toContainText(rear ? '8' : '0')
    await photo(page, rear ? '14-turn3-retreat' : '14-turn3-no-rear')
  }

  await resume(page, atFloor(19))
  await expect(card(page, 'gatekeeper')).toHaveAttribute('data-lane', '1')
  await expect(goal(page)).toContainText('8')
  await inFrame(page, ['.upper-goal', '.upper-card[data-role="guard"]', '.upper-card[data-role="gatekeeper"]', '#resolve'])
  await photo(page, '19-turn1-guarded-boss')

  for (const power of [11, 12]) {
    let run = withFormation(atFloor(19), [0, 64])
    let formation = { ...run.battle.formation, bossStep: 'flurry' }
    formation = openFormation(formation, 5)
    run = { ...run, battle: { ...run.battle, formation, turn: 5 } }
    await resume(page, withDice(run, [6, 4, power - 10], allAttack))
    await nextTurn(page).tap()
    await expect(goal(page)).toContainText(power === 12 ? '9' : '18')
    await photo(page, power === 12 ? '19-turn6-weakened' : '19-turn6-full')
  }
  await resume(page, withDice(withFormation(atFloor(19), [1, 1]), [6, 5, 3], allAttack))
  await nextTurn(page).tap()
  await expect(page.locator('#result')).toHaveText('하층 완주 · 상층 완주')
  await photo(page, '19-result')
  await page.reload()
  await expect(page.locator('#continue-ascent')).toBeHidden()
  await expect(page.locator('#lobby-upper-seal')).toBeVisible()
  expect(errors).toEqual([])
})

test('상층 상인과 휴식 및 룰렛을 이어하기에서 확인한다', async ({ page }) => {
  let shop = atFloor(16)
  shop = { ...shop, battle: { ...shop.battle, playerHp: 10 } }
  await resume(page, shop)
  await page.locator('#reward-cards [data-reward="kit"]').tap()
  await page.locator('#confirm-reward').tap()
  await expect.poll(async () => (await save(page)).ascent.battle.playerHp).toBe(14)
  await expect(page.locator('#reward-cards button')).toHaveCount(0)
  await photo(page, '16-purchased')
  await resume(page, atFloor(18))
  await expect(page.locator('#reward-heading')).toContainText('18층 휴식')
  await expect(page.locator('#reward-cards [data-reward="whetstone"]')).toBeVisible()
  await photo(page, '18-rest')

  const floor12 = atFloor(12)
  const choice = resolveAscentTurn(withDice({ ...floor12, battle: { ...floor12.battle, enemyHp: 1 } }, [6, 5, 3], allAttack))
  expect(chooseUpperAscent(choice, false).route.screen).toBe('finished')
  let run = withDice(withFormation(atFloor(13), [5, 9]), [1, 1, 2], ['guard', 'guard', 'guard'])
  run = { ...run, battle: { ...run.battle, turn: 2, formation: openFormation(run.battle.formation, 2),
    loot: { ...run.battle.loot, consumables: { coin: 1 } } } }
  run = spinAscentCounter(resolveAscentTurn(run))
  await resume(page, run)
  await expect(card(page, 'dash')).toHaveAttribute('data-counter-target', '')
  await expect(page.locator('#counter-panel')).toBeVisible()
  await photo(page, '13-turn2-counter-target')
})
