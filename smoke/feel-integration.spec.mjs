import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test as base } from '@playwright/test'
import { resolveAscentTurn, spinAscentCounter } from '../src/ascent.ts'
import { ASCENT_SAVE_KEY } from '../src/ascent-save.ts'
import { checkpoint, encounter } from './rules-six-fixtures.mjs'

const test = base.extend({
  page: async ({ page }, use) => {
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('response', (response) => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`)
    })
    await page.addInitScript(() => {
      const bytesToName = new WeakMap()
      const bufferToName = new WeakMap()
      const arrayBuffer = Response.prototype.arrayBuffer
      Response.prototype.arrayBuffer = async function (...args) {
        const bytes = await arrayBuffer.apply(this, args)
        const name = new URL(this.url, location.href).pathname.split('/').at(-1)
        if (name) bytesToName.set(bytes, name)
        return bytes
      }
      const decode = BaseAudioContext.prototype.decodeAudioData
      BaseAudioContext.prototype.decodeAudioData = async function (bytes, ...args) {
        const name = bytesToName.get(bytes)
        const buffer = await decode.call(this, bytes, ...args)
        if (name) bufferToName.set(buffer, name)
        return buffer
      }
      const start = AudioBufferSourceNode.prototype.start
      window.playedEffects = []
      AudioBufferSourceNode.prototype.start = function (...args) {
        const name = bufferToName.get(this.buffer)
        const result = start.apply(this, args)
        if (name) window.playedEffects.push(name)
        return result
      }
    })
    await use(page)
    expect(errors, '브라우저 오류').toEqual([])
  },
})

async function photograph(page, info, name) {
  const heroShot = ['golem-parry', 'roulette', 'counter', 'reduced-motion', 'roulette-error-recovered'].includes(name) && process.env.HWIGI_HERO_SHOTS
  const gateShot = ['attack', 'game-over'].includes(name) && process.env.HWIGI_FEEL_GATE_SHOTS
  const root = gateShot || heroShot || process.env.HWIGI_FEEL_SHOTS
  if (!root) return
  await page.screenshot({ path: join(root, `${info.project.name.replace('×', 'x')}-${name}.png`) })
}

test.beforeAll(async () => {
  for (const root of [process.env.HWIGI_FEEL_SHOTS, process.env.HWIGI_HERO_SHOTS, process.env.HWIGI_FEEL_GATE_SHOTS]) {
    if (root) await mkdir(root, { recursive: true })
  }
})

function withBattle(run, state) {
  return { ...run, battle: { ...run.battle, ...state } }
}

async function resume(page, run) {
  const { json, restored } = checkpoint(run)
  expect(restored).not.toBeNull()
  await page.goto(process.env.HWIGI_SMOKE_URL)
  await page.evaluate(({ key, json }) => localStorage.setItem(key, json), { key: ASCENT_SAVE_KEY, json })
  await page.reload()
  await page.getByRole('button', { name: '이어 하기' }).tap()
}

async function placeAll(page, slot) {
  for (const die of await page.locator('#pool-dice button').all()) await die.tap()
  await page.locator(`#assign-${slot}`).tap()
}

test('로비부터 1층 평타의 타점과 소리를 확인한다', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto(new URL('?seed=12', process.env.HWIGI_SMOKE_URL).href)
  await page.getByRole('button', { name: '새로 하기' }).tap()
  await page.getByRole('button', { name: /^방패 저금,/ }).tap()
  await page.locator('#fork-options button').tap()
  await page.getByRole('button', { name: '안내 건너뛰기' }).tap()
  await expect(page.locator('#fight')).toHaveText(/^1\//)
  await expect(page.locator('.slot')).toHaveCount(2)
  await expect(page.locator('#pool-dice .die-arriving')).toHaveCount(0)
  await placeAll(page, 'attack')
  const resolve = page.locator('#resolve')
  await expect(resolve).toBeEnabled()
  await page.clock.install()
  const now = await page.evaluate(() => Date.now())
  await page.clock.pauseAt(now + 500)
  const { x, y, width, height } = await resolve.boundingBox()
  await page.touchscreen.tap(x + width / 2, y + height / 2)
  await page.clock.runFor(115)
  await expect(page.locator('#intent .intent-attack-label')).toHaveText('적 공격')
  await expect(page.locator('#intent strong')).toHaveText('7 + 2')
  await expect(page.locator('#enemy-damage .damage-number')).toHaveText('적−12')
  await expect(page.locator('#hit-order')).toBeHidden()
  await photograph(page, info, 'attack')
  await page.clock.runFor(75)
  const hits = page.getByRole('list', { name: '1턴 내 피해' }).getByRole('listitem')
  await expect(hits).toHaveText(['7'])
  await page.clock.runFor(230)
  await expect(hits).toHaveText(['7', '2'])
  await expect(page.locator('#enemy-hp')).toHaveJSProperty('value', 11)
  await expect(page.locator('#player-hp')).toHaveJSProperty('value', 13)
  await page.clock.resume()
  await expect.poll(() => page.evaluate(() => window.playedEffects)).toEqual(
    expect.arrayContaining(['seat.wav', 'swish.wav', 'stone-hit.mp3']),
  )
  await expect(page.locator('#turn')).toHaveAttribute('aria-label', '2턴')
})

test('가시 골렘 정확 방어 자세가 룰렛 동안 정지하고 자동 반격한다', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const run = withBattle(encounter('thorns', 1), { dice: [1, 3, 5], slots: [null, null, null] })
  const expected = spinAscentCounter(resolveAscentTurn(withBattle(run, { slots: ['guard', 'guard', 'guard'] }))).battle
  const loaded = page.waitForResponse((r) => r.url().endsWith('/art/golem-parry.png') && r.ok())
  await resume(page, run)
  await loaded
  await placeAll(page, 'guard')
  const exact = page.locator('#guard-exact')
  await expect(exact).toBeInViewport({ ratio: 1 })
  await page.locator('#guard-dice button').first().tap()
  await expect(exact).toBeHidden()
  await page.locator('#pool-dice button').tap()
  const guardSlot = await page.locator('#guard-dice').boundingBox()
  await page.touchscreen.tap(guardSlot.x + guardSlot.width / 2, guardSlot.y + guardSlot.height - 3)
  await expect(page.locator('#guard-dice button')).toHaveCount(3)
  await expect(exact).toBeVisible()

  const panel = page.locator('#counter-panel')
  const canvas = page.locator('#arena canvas')
  const pose = () => canvas.evaluate((el) => el.toDataURL())
  const planningPose = await pose()
  await panel.evaluate((el) => {
    const canvas = document.querySelector('#arena canvas')
    const enemyHp = document.querySelector('#enemy-hp')
    window.roulettePoses = {}
    window.rouletteHp = {}
    new MutationObserver(() => {
      if (el.hidden || !el.dataset.rollState) return
      window.roulettePoses[el.dataset.rollState] = canvas.toDataURL()
      window.rouletteHp[el.dataset.rollState] = enemyHp.value
    }).observe(el, { attributeFilter: ['data-roll-state'] })
  })
  await page.locator('#resolve').tap()
  await expect(page.locator('#parry-cue')).toHaveClass(/sr-only/)
  await expect(page.locator('#parry-cue')).not.toHaveAttribute('hidden', '')
  const parryPose = await pose()
  expect(parryPose).not.toBe(planningPose)
  await photograph(page, info, 'golem-parry')
  await expect(panel).toHaveAttribute('data-roll-state', 'spinning')
  const wheel = page.locator('.roulette-stage')
  await expect(wheel).toBeInViewport({ ratio: 1 })
  expect(await wheel.evaluate((el) => el.offsetWidth)).toBe(page.viewportSize().width === 320 ? 200 : 258)
  await page.locator('#counter-medallion').waitFor({ state: 'visible' })
  await photograph(page, info, 'roulette')
  const { spinning, locked } = await page.evaluate(() => window.roulettePoses)
  expect(spinning).toBeTruthy()
  expect(spinning).not.toBe(parryPose)
  expect(locked).toBe(spinning)
  expect(await page.evaluate(() => window.rouletteHp)).toEqual({ spinning: run.battle.enemyHp, locked: run.battle.enemyHp })
  await expect(page.locator('#counter-damage')).toHaveText(String(expected.lastExchange.counter.damage))
  await expect(page.locator('#enemy-damage .damage-number')).toBeVisible()
  expect(await pose()).not.toBe(spinning)
  await photograph(page, info, 'counter')
  await expect(page.getByRole('meter', { name: '적 체력' })).toHaveJSProperty('value', expected.enemyHp)
  await expect(page.getByRole('meter', { name: '내 체력' })).toHaveJSProperty('value', expected.playerHp)
  await expect(page.locator('#turn')).toHaveAttribute('aria-label', '2턴')
  const effects = await page.evaluate(() => window.playedEffects.filter((name) => name.startsWith('roulette-')))
  expect(effects).toEqual(['roulette-engage.wav', 'roulette-ratchet.wav', 'roulette-latch.wav'])
})

test('움직임 줄이기와 무음에서 저장된 정확 방어가 한 번만 반격한다', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const run = withBattle(encounter('thorns', 1), { dice: [1, 3, 5], slots: ['guard', 'guard', 'guard'] })
  const pending = resolveAscentTurn(run)
  expect(pending.battle.phase).toBe('counter')
  const expected = spinAscentCounter(pending).battle
  await page.addInitScript(() => {
    localStorage.setItem('hwigi-tower.settings', JSON.stringify({ music: false, effects: false, speed: 'normal', reducedMotion: true }))
    window.rouletteStates = []
    new MutationObserver((changes) => {
      for (const change of changes) if (change.target.id === 'counter-panel') {
        window.rouletteStates.push(change.oldValue, change.target.dataset.rollState)
      }
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-roll-state'], attributeOldValue: true })
  })
  await resume(page, pending)
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true')
  await expect(page.locator('#counter-panel')).toHaveAttribute('data-roll-state', 'locked')
  await photograph(page, info, 'reduced-motion')
  await expect(page.locator('#turn')).toHaveAttribute('aria-label', '2턴')
  expect(await page.evaluate(() => window.rouletteStates)).not.toContain('spinning')
  expect(await page.evaluate(() => window.playedEffects)).toEqual([])
  await expect(page.getByRole('meter', { name: '적 체력' })).toHaveJSProperty('value', expected.enemyHp)
  await page.reload()
  await page.getByRole('button', { name: '이어 하기' }).tap()
  await expect(page.locator('#counter-panel')).toBeHidden()
  await expect(page.getByRole('meter', { name: '적 체력' })).toHaveJSProperty('value', expected.enemyHp)
})

base('룰렛 애니메이션이 실패해도 입력을 풀고 확정된 피해를 보존한다', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.addInitScript(() => {
    const animate = Element.prototype.animate
    Element.prototype.animate = function (...args) {
      if (this.id === 'counter-wheel' && !window.failedRoulette) {
        window.failedRoulette = true
        throw new Error('룰렛 애니메이션 실패 주입')
      }
      return animate.apply(this, args)
    }
  })
  const run = withBattle(encounter('thorns', 1), { dice: [1, 3, 5], slots: ['guard', 'guard', 'guard'] })
  const pending = resolveAscentTurn(run)
  const expected = spinAscentCounter(pending).battle
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await resume(page, pending)

  await expect.poll(() => page.evaluate(() => window.failedRoulette)).toBe(true)
  await expect(page.locator('#counter-panel')).toBeHidden()
  await expect(page.locator('#turn')).toHaveAttribute('aria-label', '2턴')
  const hp = page.getByRole('meter', { name: '적 체력' })
  await expect(hp).toHaveJSProperty('value', expected.enemyHp)
  await expect(page.locator('#battle-settings')).toBeEnabled()
  await page.getByRole('button', { name: '도감' }).tap()
  const guide = page.getByRole('dialog', { name: '도감' })
  await expect(guide).toBeVisible()
  await guide.getByRole('button', { name: '닫기' }).tap()
  await expect(page.locator('#pool-dice .die-arriving')).toHaveCount(0)
  await photograph(page, info, 'roulette-error-recovered')
  await page.locator('#return-lobby').tap()
  await page.getByRole('button', { name: '저장하고 나가기' }).tap()
  await page.getByRole('button', { name: '이어 하기' }).tap()
  await expect(hp).toHaveJSProperty('value', expected.enemyHp)
  await expect(page.locator('#counter-panel')).toBeHidden()
  expect(pageErrors).toEqual([])
})

test('패배한 전장을 남기고 키보드로 다시 오르기와 로비에 갈 수 있다', async ({ page }, info) => {
  const run = withBattle(encounter('thorns', 1), { dice: [1, 1, 2], slots: [null, null, null], playerHp: 1, awakened: true })
  async function lose() {
    await resume(page, run)
    await placeAll(page, 'attack')
    await page.locator('#resolve').tap()
    await expect(page.getByRole('heading', { name: '게임 오버' })).toBeFocused()
    await expect(page.locator('#defeat-floor')).toHaveText('1층에서 쓰러졌습니다.')
    await expect(page.getByRole('region', { name: /마지막 전장/ })).toBeVisible()
    await expect(page.locator('#resolve')).toBeHidden()
    await expect(page.locator('#completion-seal')).toBeHidden()
  }
  await lose()
  const climb = page.getByRole('button', { name: '다시 오르기' })
  const lobby = page.locator('#defeat-lobby')
  for (const button of [climb, lobby]) {
    await expect(button).toBeInViewport({ ratio: 1 })
    expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44)
  }
  await photograph(page, info, 'game-over')
  await page.keyboard.press('Tab')
  await expect(climb).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: '시작 특전' })).toBeVisible()
  await lose()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(lobby).toBeFocused()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: '나가기' }).press('Enter')
  await expect(page.getByRole('button', { name: '새로 하기' })).toBeVisible()
  await expect(page.getByRole('button', { name: '이어 하기' })).toHaveCount(0)
})

test('시드 0에서 선제 처치하면 가시 피해 없이 살아남고 적이 남으면 가시가 발동한다', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.addInitScript(() => {
    localStorage.setItem('hwigi-tower.first-run-guide', JSON.stringify({ complete: true, seen: [] }))
  })
  await page.goto(new URL('?seed=0', process.env.HWIGI_SMOKE_URL).href)
  await page.getByRole('button', { name: '새로 하기' }).tap()
  await page.getByRole('button', { name: /^방패 저금,/ }).tap()
  await page.locator('#fork-options button').tap()
  const resolve = page.locator('#resolve')
  const arriving = page.locator('#pool-dice .die-arriving')
  await expect(page.locator('#pool-dice .die-face')).toHaveText(['6', '6', '5'])
  await expect(arriving).toHaveCount(0)
  await placeAll(page, 'attack')
  await resolve.tap()
  await expect(page.locator('#turn')).toHaveAttribute('aria-label', '2턴')
  await expect(page.locator('#player-hp')).toHaveJSProperty('value', 13)
  await expect(page.locator('#enemy-hp')).toHaveJSProperty('value', 5)
  await expect(page.locator('#pool-dice .die-face')).toHaveText(['2', '4', '3'])
  await expect(arriving).toHaveCount(0)
  const turnTwo = await page.evaluate((key) => localStorage.getItem(key), ASCENT_SAVE_KEY)
  await placeAll(page, 'attack')
  await expect(resolve).toBeEnabled()
  await page.evaluate(() => document.fonts.ready)
  await page.clock.install()
  const now = await page.evaluate(() => Date.now())
  await page.clock.pauseAt(now + 500)
  const { x, y, width, height } = await resolve.boundingBox()
  await page.touchscreen.tap(x + width / 2, y + height / 2)
  await page.clock.runFor(155)
  await expect(page.locator('#enemy-hp')).toHaveJSProperty('value', 0)
  await expect(page.locator('#enemy-damage .damage-number')).toHaveText('적−5')
  await expect(page.locator('#player-hp')).toHaveJSProperty('value', 13)
  await expect(page.locator('#player-damage .damage-number')).toHaveCount(0)
  await expect(page.locator('#hit-order')).toBeHidden()
  await photograph(page, info, 'thorns-finish')
  await page.clock.resume()
  await expect(page.getByRole('heading', { name: '전투 보상' })).toBeVisible()
  await expect(page.locator('#map-health')).toHaveAccessibleName('체력 13/22')

  await page.evaluate(({ key, turnTwo }) => localStorage.setItem(key, turnTwo), { key: ASCENT_SAVE_KEY, turnTwo })
  await page.reload()
  await page.getByRole('button', { name: '이어 하기' }).tap()
  await expect(arriving).toHaveCount(0)
  await page.locator('#die-2').tap()
  await page.locator('#assign-attack').tap()
  await placeAll(page, 'guard')
  await resolve.tap()
  await expect(page.getByRole('listitem', { name: '가시 · 내 피해 6' })).toBeVisible()
  await expect(page.locator('#enemy-hp')).toHaveJSProperty('value', 2)
  await expect(page.locator('#player-hp')).toHaveJSProperty('value', 4)
})

test('턴 끝 숫돌 피해로 이기면 적 타격과 내 체력이 격파보다 먼저 표시된다', async ({ page }) => {
  const golem = encounter('thorns', 1)
  await resume(page, withBattle(golem, { dice: [6, 2, 1], enemyHp: 8,
    loot: { ...golem.battle.loot, prepared: { whetstone: 1 } } }))
  await page.locator('#die-0').tap()
  await page.locator('#assign-attack').tap()
  await placeAll(page, 'guard')
  await page.evaluate(() => {
    window.meterUpdates = []
    const property = Object.getOwnPropertyDescriptor(HTMLMeterElement.prototype, 'value')
    Object.defineProperty(HTMLMeterElement.prototype, 'value', { ...property, set(value) {
      if (this.value !== value) window.meterUpdates.push([this.id, value])
      property.set.call(this, value)
    } })
  })
  await page.locator('#resolve').tap()
  await expect(page.getByRole('heading', { name: '전투 보상' })).toBeVisible()
  expect(await page.evaluate(() => window.meterUpdates)).toEqual([['enemy-hp', 2], ['player-hp', 16], ['enemy-hp', 0]])
})
