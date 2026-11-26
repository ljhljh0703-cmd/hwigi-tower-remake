import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { availableMapNodes, beginMapAscent, enterMapNode } from '../src/ascent.ts'
import { ASCENT_SAVE_KEY } from '../src/ascent-save.ts'
import { openTurn } from '../src/combat.ts'
import { FIRST_RUN_KEY } from '../src/first-run-guide.ts'
import { checkpoint, encounter, mapBefore } from './rules-six-fixtures.mjs'

const note = (page) => page.locator('#first-run-note')
const line = (page) => page.locator('#first-run-line')
const die = (page, index) => page.locator(`#die-${index}`)
const save = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), ASCENT_SAVE_KEY)
const progress = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), FIRST_RUN_KEY)

async function checkNote(page, id, text, photo, info) {
  await expect(note(page)).toHaveAttribute('data-guide', id)
  await expect(line(page)).toHaveText(text)
  await expect(note(page)).toBeInViewport({ ratio: 1 })
  const lines = await line(page).locator('span').evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    return range.getClientRects().length
  })
  expect(lines).toBe(1)
  expect(await page.evaluate(() => {
    const root = document.scrollingElement
    return [root.scrollWidth - root.clientWidth, root.scrollHeight - root.clientHeight]
  })).toEqual([0, 0])

  const gateShot = photo === '01-attack' && process.env.HWIGI_FEEL_GATE_SHOTS
  const path = gateShot || process.env.HWIGI_FIRST_RUN_SHOTS
  if (!photo || !path) return
  await mkdir(path, { recursive: true })
  const fileName = gateShot ? `${info.project.name.replace('×', 'x')}-first-run.png` : `${info.project.name}-${photo}.png`
  await page.screenshot({ path: join(path, fileName), animations: 'disabled' })
}

async function resume(page, run) {
  const { json, restored } = checkpoint(run)
  expect(restored).not.toBeNull()
  await page.evaluate(({ key, json }) => localStorage.setItem(key, json), { key: ASCENT_SAVE_KEY, json })
  await page.reload()
  await page.locator('#continue-ascent').tap()
}

test('첫 등반에서 첫 공격을 하고 정확 방어 뒤 룰렛, 보상, 갈림길과 기믹을 본다', async ({ page }, info) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const opened = performance.now()
  await page.goto(new URL('?seed=10', process.env.HWIGI_SMOKE_URL).href)
  await expect(page.locator('#new-ascent')).toBeVisible()
  const started = performance.now()
  let actions = 0
  const tap = async (target) => { await target.tap(); actions++ }
  const assign = async (indices, slot) => {
    for (const index of indices) await tap(die(page, index))
    await tap(page.locator(`#assign-${slot}`))
  }
  const resolve = page.locator('#resolve')
  const enemyHp = page.locator('#enemy-hp')

  await tap(page.locator('#new-ascent'))
  await tap(page.getByRole('button', { name: /^방패 저금,/ }))
  await expect(note(page)).toBeHidden()
  await tap(page.locator('#fork-options button'))
  await expect(die(page, 0)).toBeVisible()
  await expect(page.locator('#pool-dice .die-face')).toHaveText(['6', '3', '3'])
  await expect(page.locator('#first-run-point svg')).toHaveCSS('animation-name', 'first-run-point')
  await checkNote(page, 'attack', '표시한 주사위를 공격에 놓아요.', '01-attack', info)

  const markedDice = page.locator('#pool-dice button[data-first-run-target]')
  const markedSlot = page.locator('.slot-target[data-first-run-target]')
  const placeMarked = async () => {
    for (const button of await markedDice.all()) await tap(button)
    await tap(markedSlot)
  }
  await placeMarked()
  await checkNote(page, 'defend', '방어 9 = 적 공격 9 → 정확 방어', '03-defend', info)
  await expect(resolve).toBeDisabled()
  await expect(markedDice.locator('.die-face')).toHaveText(['6', '3'])
  await placeMarked()
  await expect(page.locator('#guard-exact')).toBeVisible()
  await checkNote(page, 'end-turn', '턴을 끝내 반격 룰렛을 열어요.', '02-end-turn', info)
  const initialHp = await enemyHp.evaluate((element) => element.value)
  await tap(resolve)
  await expect(enemyHp).toHaveJSProperty('value', initialHp - 3)
  const measure = { msFromLobby: Math.round(performance.now() - started), msFromOpen: Math.round(performance.now() - opened), actions }
  expect(measure.msFromOpen).toBeLessThan(30000)
  expect(actions).toBe(9)
  console.log(`${info.project.name} 첫 공격 ${JSON.stringify(measure)}`)

  await checkNote(page, 'defend', '딱 막았어요! 반격 룰렛을 돌려요.')
  await expect(page.locator('#player-hp')).toHaveJSProperty('value', 22)
  await tap(page.locator('#counter'))

  const reward = page.getByRole('heading', { name: '전투 보상' })
  const guidedAction = page.locator('#counter[data-first-run-target], #resolve[data-first-run-target], .slot-target[data-first-run-target]')
  for (let step = 0; step < 10; step++) {
    await expect(reward.or(guidedAction)).toBeVisible()
    if (await reward.isVisible()) break
    await expect(page.locator('#pool-dice .die-arriving')).toHaveCount(0)
    if (await markedSlot.count()) await placeMarked()
    else await tap(guidedAction)
  }
  await expect(reward).toBeVisible()
  expect((await progress(page)).complete).toBe(true)
  await checkNote(page, 'reward', '카드 한 장을 골라 확인해요.', '05-reward', info)
  await page.reload()
  await tap(page.locator('#continue-ascent'))
  await expect(reward).toBeVisible()
  await expect(note(page)).toBeHidden()
  await tap(page.locator('#skip-reward'))
  await checkNote(page, 'fork', '다음에 갈 길을 골라요.')
  await tap(page.getByRole('button', { name: /전투.*엇걸음병/ }))
  await expect(page.locator('#fight')).toHaveText(/^2\//)
  const battleSeed = (await save(page)).ascent.battle.seed
  const pool = page.locator('#pool-dice button')
  await expect(pool.locator('.die-face')).toHaveText(openTurn(battleSeed, 1).dice.map(String))
  await expect(page.locator('#intent strong')).toHaveText('3×2 + 2')
  await assign([2], 'guard')
  await assign([0, 1], 'attack')
  const before = await page.locator('#player-hp').evaluate((meter) => meter.value)
  await tap(resolve)
  await expect(page.locator('#intent [data-kind="trip"]')).toBeVisible()
  await expect(page.locator('#intent strong')).toHaveText('6')
  await expect(page.locator('#player-hp')).toHaveJSProperty('value', before - 3)
  const received = page.getByRole('list', { name: '1턴 내 피해' })
  await expect(received.getByRole('listitem')).toHaveText(['3→0', '3→1', '2'])
  await expect(received.getByRole('listitem').nth(0)).toHaveAccessibleName('1타 · 예고 3 · 막음, 내 피해 0')
  await expect(received.locator('use')).toHaveCount(3)
  await expect(received.locator('use').nth(0)).toHaveAttribute('href', '#icon-shield')
  await expect(received.locator('use').nth(1)).toHaveAttribute('href', '#icon-heart')
  await expect(received).toBeInViewport({ ratio: 1 })
  await checkNote(page, 'gimmick-trip', '에 1 → 적 다음 공격 건너뜀', '04-gimmick', info)
  expect(await note(page).evaluate((element) => {
    const canvas = document.querySelector('#arena').getBoundingClientRect()
    return Math.max(0, element.getBoundingClientRect().bottom + 7 - canvas.top)
  })).toBe(0)
  await expect(note(page)).toBeHidden({ timeout: 2400 })
  await page.reload()
  await tap(page.locator('#continue-ascent'))
  await expect(page.locator('#intent [data-kind="trip"]')).toBeVisible()
  await expect(note(page)).toBeHidden()
  expect(errors).toEqual([])
})

test('키보드로 배치하고 재개할 수 있고 건너뛰기와 다시 보기가 저장된다', async ({ page }) => {
  async function tabTo(target) {
    for (let i = 0; i < 24 && !(await target.evaluate((element) => element === document.activeElement)); i++) {
      await page.keyboard.press('Tab')
    }
    await expect(target).toBeFocused()
  }

  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto(process.env.HWIGI_SMOKE_URL)
  await page.locator('#lobby-settings').press('Enter')
  await tabTo(page.locator('#settings-motion'))
  await page.keyboard.press('Space')
  await expect(page.locator('#settings-motion')).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')
  await expect(page.locator('#settings')).toBeHidden()
  await tabTo(page.locator('#new-ascent'))
  await page.keyboard.press('Enter')
  const perk = page.locator('#perk-choices button').filter({ hasNotText: '홀짝 서약' }).first()
  await tabTo(perk)
  await page.keyboard.press('Enter')
  await expect(page.locator('#fork-options button')).toBeFocused()
  await page.keyboard.press('Enter')
  await checkNote(page, 'attack', '표시한 주사위를 공격에 놓아요.')
  await expect(page.locator('#first-run-point svg')).toHaveCSS('animation-name', 'none')
  await expect(page.locator('#pool-dice button[data-first-run-target]')).toBeFocused()
  await page.keyboard.press('Enter')
  await tabTo(page.locator('#assign-attack'))
  await page.keyboard.press('Enter')
  await checkNote(page, 'defend', '방어 9 = 적 공격 9 → 정확 방어')

  await page.reload()
  await page.locator('#continue-ascent').press('Enter')
  await checkNote(page, 'defend', '방어 9 = 적 공격 9 → 정확 방어')
  for (const marked of await page.locator('#pool-dice button[data-first-run-target]').all()) {
    await tabTo(marked)
    await page.keyboard.press('Enter')
  }
  await tabTo(page.locator('#assign-guard'))
  await page.keyboard.press('Enter')
  await expect(page.locator('#resolve')).toBeFocused()
  await page.keyboard.press('Enter')
  await checkNote(page, 'defend', '딱 막았어요! 반격 룰렛을 돌려요.')
  await expect(page.locator('#counter')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(note(page)).toBeHidden()
  expect((await progress(page)).complete).toBe(true)
  await page.reload()
  await page.locator('#continue-ascent').press('Enter')
  await expect(note(page)).toBeHidden()
  const current = await save(page)
  await page.locator('#battle-settings').press('Enter')
  await tabTo(page.locator('#replay-first-run'))
  await page.keyboard.press('Enter')
  await expect(page.locator('#replay-first-run-status')).toHaveText('다음 새 등반에서 안내를 다시 봐요.')
  expect(await save(page)).toEqual(current)
  await page.reload()
  await page.locator('#new-ascent').press('Enter')
  await page.locator('#lobby-confirm-action').press('Enter')
  await perk.press('Enter')
  await page.locator('#fork-options button').press('Enter')
  await checkNote(page, 'attack', '표시한 주사위를 공격에 놓아요.')
  expect((await save(page)).ascent.seed).not.toBe(current.ascent.seed)
  const bounds = await page.locator('#pool-dice button[data-first-run-target]').boundingBox()
  const attack = await page.locator('#assign-attack').boundingBox()
  const session = await page.context().newCDPSession(page)
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: attack.x + attack.width / 2, y: attack.y + attack.height / 2 }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await session.detach()
  await checkNote(page, 'defend', '방어 9 = 적 공격 9 → 정확 방어')
  await page.locator('#arena').tap({ position: { x: 8, y: 58 } })
  await expect(note(page)).toBeHidden()
  expect((await progress(page)).complete).toBe(true)
})

test('해금, 상인과 보스 유물 안내는 처음에만 나타난다', async ({ page }) => {
  await page.goto(process.env.HWIGI_SMOKE_URL)
  const mapStart = beginMapAscent(12, 'shield', undefined, 6)
  const run = enterMapNode(mapStart, availableMapNodes(mapStart)[0].id)
  for (const [id, dice, text] of [
    ['unlock-triple', [4, 4, 4], '같은 눈 셋을 공격에 놓아 해금해요.'],
    ['unlock-straight', [2, 3, 4], '이어지는 눈 셋을 한 칸에 놓아요.'],
  ]) {
    const example = { ...run, battle: { ...run.battle, dice } }
    await resume(page, example)
    await checkNote(page, id, text)
    await line(page).tap()
    await expect(note(page)).toBeHidden()
    await resume(page, example)
    await expect(note(page)).toBeHidden()
  }

  let seed = 0
  let map = mapBefore(seed, 7)
  let shop = availableMapNodes(map).find(({ kind }) => kind === 'shop')
  while (!shop) {
    map = mapBefore(++seed, 7)
    shop = availableMapNodes(map).find(({ kind }) => kind === 'shop')
  }
  const merchant = enterMapNode(map, shop.id)
  await resume(page, merchant)
  await checkNote(page, 'shop', '동전으로 물건을 살 수 있어요.')
  await resume(page, merchant)
  await expect(note(page)).toBeHidden()

  const boss = encounter('chain-warden', 6)
  await resume(page, { ...boss, battle: { ...boss.battle, enemyHp: 1 } })
  for (const button of await page.locator('#pool-dice button').all()) await button.tap()
  await page.locator('#assign-attack').tap()
  await page.locator('#resolve').tap()
  await checkNote(page, 'boss-relic', '보스 유물 한 장을 골라요.')
  await page.reload()
  await page.locator('#continue-ascent').tap()
  await expect(page.getByRole('heading', { name: '보스 유물 선택' })).toBeVisible()
  await expect(note(page)).toBeHidden()
  expect((await progress(page)).seen).toEqual(expect.arrayContaining(['unlock-triple', 'unlock-straight', 'shop', 'boss-relic']))
})
