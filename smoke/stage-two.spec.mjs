import { readFileSync } from 'node:fs'
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
const atlas = JSON.parse(readFileSync(new URL('../art-source/enemy-motion/manifest.json', import.meta.url))).sheets

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const canvas = CanvasRenderingContext2D.prototype
    const clear = canvas.clearRect
    canvas.clearRect = function (...args) {
      if (this.canvas.parentElement?.id === 'arena') window.upperSpriteDraws = []
      return clear.apply(this, args)
    }
    const draw = canvas.drawImage
    canvas.drawImage = function (source, ...args) {
      if (this.canvas.parentElement?.id === 'arena' && source.src?.includes('/art/motion/') && args.length === 8) {
        window.upperSpriteDraws?.push({ sheet: source.src.split('/').at(-1).replace('.png', ''), args })
      }
      return draw.call(this, source, ...args)
    }
  })
})

async function verifyFormationArt(page, sheets) {
  await expect.poll(async () => (await page.evaluate(() => window.upperSpriteDraws ?? []))
    .filter(draw => sheets.includes(draw.sheet)).length).toBe(sheets.length)
  const draws = await page.evaluate(() => window.upperSpriteDraws)
  const field = await page.locator('#arena canvas').evaluate(el => ({ width: el.width, height: el.height }))
  const boxes = sheets.map(sheet => {
    const { args } = draws.find(draw => draw.sheet === sheet)
    const [sx, sy, sw, sh, x, y, width] = args
    const frame = atlas.find(entry => entry.id === sheet).frames.find(entry => entry.rect.join() === [sx, sy, sw, sh].join())
    const scale = width / sw
    const [left, top, bodyWidth, height] = frame.bounds.map(value => value * scale)
    return { left: x + left, top: y + top, right: x + left + bodyWidth, bottom: y + top + height, height }
  })
  const [front, ...rear] = boxes
  expect(front.height).toBeGreaterThanOrEqual(95)
  for (const back of rear) {
    expect(back.height).toBeGreaterThanOrEqual(front.height * .75 - 1)
    expect(back.height).toBeLessThanOrEqual(front.height * .85 + 1)
    expect(front.bottom - back.bottom).toBeGreaterThanOrEqual(30)
  }
  for (const [index, box] of boxes.entries()) {
    expect(box.left).toBeGreaterThanOrEqual(0)
    expect(box.top).toBeGreaterThanOrEqual(0)
    expect(box.right).toBeLessThanOrEqual(field.width)
    expect(box.bottom).toBeLessThan(field.height)
    for (const neighbor of boxes.slice(index + 1)) expect(box.right).toBeLessThanOrEqual(neighbor.left)
  }
  await expect(page.locator('.upper-card[data-lane="0"] .upper-position use')).toHaveAttribute('href', '#icon-formation-front')
  await expect(page.locator('.upper-card[data-lane="1"] .upper-position use')).toHaveAttribute('href', '#icon-formation-rear')
}

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
  const healthFits = await page.locator('.upper-card').evaluateAll(nodes => nodes.every(node => {
    const card = node.getBoundingClientRect()
    const hp = node.querySelector('.upper-hp').getBoundingClientRect()
    return hp.left > card.left && hp.right < card.right
  }))
  expect(healthFits).toBe(true)
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
  await page.locator('.dice-motion').waitFor({ state: 'detached' })
  await inFrame(page, ['.upper-goal', '.upper-card[data-role="dash"]', '.upper-card[data-role="support"]', '#resolve'])
  await verifyFormationArt(page, ['seal-sentinel', 'escort'])
  await photo(page, '13-turn1-formation')

  await resume(page, withDice(atFloor(13), [6, 4, 2], allAttack))
  await expect(card(page, 'dash').locator('.upper-intent')).toHaveAttribute('data-cancelled', '')
  await expect(card(page, 'support').locator('.upper-preview')).toHaveText('↪2')
  await nextTurn(page).tap()
  await expect(card(page, 'dash').locator('.upper-damage')).toHaveText('−10')
  await photo(page, '13-turn1-front-hit')
  await expect(page.locator('.upper-readout[data-advance="support"]')).toBeVisible()
  await page.waitForTimeout(55)
  await photo(page, '13-turn1-rear-stepping')
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
  await expect(goal(page)).toContainText('16')
  await expect(card(page, 'dash').locator('.upper-intent')).toContainText('8')
  await expect(card(page, 'support').locator('.upper-intent')).toContainText('지원')
  await inFrame(page, ['.upper-goal', ...['shield', 'dash', 'support'].map(id => `.upper-card[data-role="${id}"]`), '#resolve'])
  await verifyFormationArt(page, ['shield-soldier', 'seal-sentinel', 'escort'])
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
    await expect(goal(page)).toContainText(rear ? '13' : '0')
    await photo(page, rear ? '14-turn3-retreat' : '14-turn3-no-rear')
  }

  await resume(page, atFloor(19))
  await expect(card(page, 'gatekeeper')).toHaveAttribute('data-lane', '1')
  await expect(goal(page)).toContainText('16')
  await inFrame(page, ['.upper-goal', '.upper-card[data-role="guard"]', '.upper-card[data-role="gatekeeper"]', '#resolve'])
  await verifyFormationArt(page, ['reaction', 'boss'])
  await photo(page, '19-turn1-guarded-boss')

  for (const power of [11, 12]) {
    let run = withFormation(atFloor(19), [0, 64])
    let formation = { ...run.battle.formation, bossStep: 'flurry' }
    formation = openFormation(formation, 5)
    run = { ...run, battle: { ...run.battle, formation, turn: 5 } }
    await resume(page, withDice(run, [6, 4, power - 10], allAttack))
    await nextTurn(page).tap()
    await expect(goal(page)).toContainText(power === 12 ? '11' : '21')
    await photo(page, power === 12 ? '19-turn6-weakened' : '19-turn6-full')
  }
  await resume(page, withDice(withFormation(atFloor(19), [1, 1]), [6, 5, 3], allAttack))
  await nextTurn(page).tap()
  await expect(page.locator('#result')).toHaveText('하층 완주 · 상층 완주')
  await photo(page, '19-result')
  await page.reload()
  await expect(page.locator('#continue-ascent')).toBeHidden()
  await expect(page.locator('#lobby-upper-seal')).toBeVisible()
  await resume(page, atFloor(11))
  await expect(page.locator('#reward-context')).toContainText('상층 인장을 새겼습니다')
  await page.reload()
  await page.locator('#continue-ascent').tap()
  await expect(page.locator('#reward-context')).not.toContainText('상층 인장을 새겼습니다')
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
  await resume(page, choice)
  await page.locator('#finish-lower').tap()
  await expect(page.locator('#result')).toHaveText('하층 완주 · 상층 미진입')
  expect(await save(page)).toBeNull()
  let run = withDice(withFormation(atFloor(13), [5, 9]), [1, 1, 2], ['guard', 'guard', 'guard'])
  run = { ...run, battle: { ...run.battle, turn: 2, formation: openFormation(run.battle.formation, 2),
    loot: { ...run.battle.loot, consumables: { coin: 1 } } } }
  run = spinAscentCounter(resolveAscentTurn(run))
  await resume(page, run)
  await expect(card(page, 'dash')).toHaveAttribute('data-counter-target', '')
  await expect(page.locator('#counter-panel')).toBeVisible()
  const target = await card(page, 'dash').boundingBox()
  const outcome = await page.locator('#counter-footer').boundingBox()
  expect(outcome.x >= target.x + target.width || outcome.y + outcome.height <= target.y).toBe(true)
  await photo(page, '13-turn2-counter-target')
})
