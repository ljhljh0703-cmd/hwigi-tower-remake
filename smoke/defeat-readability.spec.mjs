import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect } from '@playwright/test'
import { encounter } from './rules-six-fixtures.mjs'
import { test, resume, withBattle, stopAtContact } from './combat-presentation.mjs'
import { glyphInk, observeBreak } from './break-frame.mjs'

// Reference values are the public a112a5c seed-12 replay at +112/136/160 ms.
// A passing average still needs a visible flight, landing and clean full viewport.
const publicNear = { 320: [52.9, 48.7, 53.2], 390: [46.8, 55.8, 56.6] }
const times = [16, 112, 136, 160, 211, 340, 420, 560, 640]

async function sample(page, info, scene, offsets, speed = 1, target = 'enemy-damage') {
  const frames = []
  const out = process.env.HWIGI_DEFEAT_REPORT
  const name = info.project.name.replace('×', 'x') + '-' + scene
  if (out) await mkdir(out, { recursive: true })
  const hit = await page.evaluate(target => window.readBreak().hits.find(h => h.target === target), target)
  expect(hit, '실제 피해 표시가 발생함').toBeTruthy()
  for (const offset of offsets) {
    const remaining = await page.evaluate(t => Math.round(t - performance.now()), hit.at + offset / speed)
    if (remaining > 0) await page.clock.runFor(remaining)
    const frame = await page.evaluate(() => window.readBreak())
    if ([112, 136, 160, 340].includes(offset)) frame.glyphPixels = await glyphInk(page, target)
    if (out) await page.screenshot({ path: join(out, name + '-' + offset + 'ms.png') })
    frames.push({ offset, ...frame })
  }
  if (out) await writeFile(join(out, name + '.json'), JSON.stringify(frames, null, 2))
  return frames
}

function checkComposition(frames) {
  for (const f of frames) {
    const moment = '+' + f.offset + 'ms'
    expect(f.outsideCard, moment + ' 피해 숫자와 대상 체력').toBe(false)
    if (f.glyphPixels !== undefined) expect(f.glyphPixels, moment + ' 실제 보이는 글리프').toBeGreaterThan(12)
    expect(f.cardGap, moment + ' 체력 카드 간격').toBeGreaterThanOrEqual(2)
    expect(Math.min(...f.hpInsets), moment + ' 체력값 안쪽 여백').toBeGreaterThanOrEqual(3)
    expect(f.numberBehindCue, moment + ' 피해와 방패·피해 순서·예고').toBe(false)
    expect(f.coveredByNumber, moment + ' 숫자 영역이 가린 불투명 파편 픽셀').toBe(0)
    expect(f.covered, moment + ' HUD가 가린 불투명 파편 픽셀').toBe(0)
    expect(f.clipped, moment + ' 화면 경계').toBe(0)
    expect(f.obscuredMasonryPercent, moment + ' 배경 미장센').not.toBeNull()
    expect(f.obscuredMasonryPercent).toBeLessThan(3)
  }
}

async function prepareSecondTurn(page, checkDiscovery = false) {
  await page.goto(new URL('?seed=12', process.env.HWIGI_SMOKE_URL).href)
  await page.getByRole('button', { name: '새로 하기' }).tap()
  await page.getByRole('button', { name: /^방패의 기세,/ }).tap()
  await page.locator('#fork-options button').tap()
  await page.locator('#enter-room').tap()
  await page.getByRole('button', { name: '안내 건너뛰기' }).tap()
  for (const turn of [1, 2]) {
    await expect(page.locator('#turn')).toHaveAttribute('aria-label', turn + '턴')
    await expect(page.locator('.die-arriving')).toHaveCount(0)
    for (const die of await page.locator('#pool-dice button').all()) await die.tap()
    await page.locator('#assign-attack').tap()
    if (turn === 1) {
      const discovery = page.locator('#unlock-discovery')
      if (checkDiscovery) {
        await expect(discovery).toBeInViewport({ ratio: 1 })
        await expect(discovery).toContainText('같은 눈 셋')
        // Read the actual first confirmation before a timeout can dismiss the lesson.
        await page.locator('#resolve').evaluate(button => button.addEventListener('click', () => {
          window.lessonClosedOnCommit = document.querySelector('#unlock-discovery').hidden
        }, { once: true }))
      }
      await page.locator('#resolve').tap()
      if (checkDiscovery) expect(await page.evaluate(() => window.lessonClosedOnCommit)).toBe(true)
    }
  }
  await expect(page.locator('#enemy-hp')).toHaveJSProperty('value', 11)
  await page.evaluate(observeBreak)
}

test('시드 12 실제 두 턴의 격파에서 숫자·돌 면·벽·착지가 구분된다', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await prepareSecondTurn(page)
  await stopAtContact(page, 225)
  await expect(page.locator('#enemy-hp')).toHaveJSProperty('value', 0)
  const frames = await sample(page, info, 'golem', times)
  const last = frames.at(-1)
  const sounds = last.effects.filter(e => e.at >= last.hits[0].at && /slam|grit|seat/.test(e.name))
  expect(last.hits.map(h => h.damage)).toEqual(['−11'])
  expect(sounds.map(e => e.name)).toEqual(['slam.wav', 'grit.wav', 'seat.wav'])
  expect(sounds[2].at - sounds[0].at).toBeCloseTo(348, 0)
  await page.clock.resume()
  await expect(page.getByRole('heading', { name: '전투 보상' })).toBeVisible()
  checkComposition(frames)
  expect(frames[0].area).toBe(0)
  const early = frames.slice(1, 4)
  const reference = publicNear[page.viewportSize().width]
  let gain = 0
  for (const [i, frame] of early.entries()) {
    expect(frame.area).toBeGreaterThan(100)
    expect(frame.nearBackgroundPercent).toBeLessThan(reference[i])
    gain += reference[i] - frame.nearBackgroundPercent
  }
  expect(gain / early.length, '초기 세 컷의 평균 밝기 근접 면적 개선(%p)').toBeGreaterThanOrEqual(10)
  expect(frames.find(f => f.offset === 211).distinct, '공중에서 구별되는 면적·명암이 있는 덩어리').toBeGreaterThanOrEqual(3)
  expect(last.area).toBeGreaterThan(100)
  expect(last.hash, '착지 뒤 위치가 고정됨').toEqual(frames.at(-2).hash)
})

test.describe('고밀도 전투 HUD', () => {
  test.use({ deviceScaleFactor: 2 })
  test('빠른 직접 강타·격파가 체력 카드 안쪽 여백에 들어간다', async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.addInitScript(() => localStorage.setItem('hwigi-tower.settings', JSON.stringify({ speed: 'fast' })))
    await prepareSecondTurn(page, true)
    await stopAtContact(page, 113)
    const frames = await sample(page, info, 'fast-2x', [16, 112, 136, 160, 340, 560], 2)
    for (const f of frames) expect(f.cardInsets.map(c => c.text)).toEqual(['−11'])
    expect(frames.find(f => f.offset === 160).area).toBeGreaterThan(100)
    checkComposition(frames)
    await page.clock.resume()
    await expect(page.getByRole('heading', { name: '전투 보상' })).toBeVisible()
  })
  test('빠른 호위 대타는 세 체력 카드를 분리하고 주인 피해도 보인다', async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.addInitScript(() => localStorage.setItem('hwigi-tower.settings', JSON.stringify({ speed: 'fast' })))
    await resume(page, withBattle(encounter('escort', 7), { enemyHp: 20, escort: { hp: 5, bonus: 3 },
      dice: [5, 3, 2, 1], slots: ['attack', 'attack', 'guard', 'guard'] }))
    await page.evaluate(observeBreak)
    await stopAtContact(page, 24)
    const frames = await sample(page, info, 'guard-2x', [112, 211, 340, 370, 540], 2, 'escort-damage')
    checkComposition(frames)
    for (const f of frames) expect(f.cardInsets.map(c => c.text)).toEqual(expect.arrayContaining(['−3', '호위−5']))
    expect(frames[1].cardInsets.map(c => c.text)).toContain('나−4')
    for (const [i, f] of frames.entries()) {
      const hp = i < 3 ? 18 : 9
      expect([f.hp, f.hpLabel, f.mapHp]).toEqual([hp, hp + '/22', '체력 ' + hp + '/22'])
    }
    const last = frames.at(-1)
    const incoming = last.hits.filter(h => h.target === 'player-damage')
    expect(incoming.map(h => h.damage)).toEqual(['나−4', '나−9'])
    expect(last.hpChanges).toEqual([{ from: 22, to: 18, at: incoming[0].at }, { from: 18, to: 9, at: incoming[1].at }])
    expect(incoming[1].at - incoming[0].at).toBeCloseTo(124, 0)
    for (const [i, name] of ['tap.wav', 'stone-hit.mp3'].entries()) {
      expect(last.effects.filter(e => e.at === incoming[i].at).map(e => e.name)).toEqual([name])
    }
    await expect(page.locator('#enemy-hp')).toHaveJSProperty('value', 17)
    await page.clock.runFor(100)
    await expect(page.locator('#turn')).toHaveAttribute('aria-label', '2턴')
    await expect(page.locator('#player-hp')).toHaveJSProperty('value', 9)
  })
})

for (const [scene, values, finalScreen] of [
  ['thorns', [7, 3, 0], 'defeat'], ['revival', [1, 0, 9], 'battle'], ['healing', [12, 22], 'reward'],
]) {
  test('동작 줄이기에서 접촉 체력과 최종 정산을 같은 턴에 표시한다 · ' + scene, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const room = encounter(scene === 'revival' ? 'escort' : 'thorns', scene === 'thorns' ? 1 : 7)
    const state = scene === 'thorns' ? { turn: 2, playerHp: 12, dice: [3, 2, 2], slots: Array(3).fill('attack') }
      : scene === 'revival' ? { playerHp: 5, dice: [5, 3, 2, 1], slots: ['attack', 'attack', 'guard', 'guard'],
        escort: { hp: 5, bonus: 3 }, bossRelic: { id: 'revived-heart' } }
      : { playerHp: 17, enemyHp: 8, dice: [6, 2, 1, 1], slots: ['attack', 'guard', 'guard', 'guard'],
        bossRelic: { id: 'healing-scepter' }, loot: { ...room.battle.loot, prepared: { whetstone: 1 } } }
    await resume(page, withBattle(room, { ...state, awakened: true }))
    await page.evaluate(observeBreak)
    await stopAtContact(page, 1)
    const { hpChanges } = await page.evaluate(() => window.readBreak())
    expect(hpChanges.map(c => c.to)).toEqual(values)
    expect(new Set(hpChanges.map(c => c.at)).size, '체력 반영에 새 대기 없음').toBe(1)
    await page.clock.resume()
    await expect(page.locator('main')).toHaveAttribute('data-screen', finalScreen)
    await expect(page.locator('#player-hp')).toHaveJSProperty('value', values.at(-1))
    await expect(page.locator('#map-health')).toHaveAttribute('aria-label', '체력 ' + values.at(-1) + '/22')
  })
}

for (const [rules, waitMs] of [[6, 250], [7, 275]]) {
  test('동작 줄이기 격파·스트레이트 해금의 기존 대기 유지 · 규칙 ' + rules, async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(() => localStorage.setItem('hwigi-tower.settings', JSON.stringify({ music: false, effects: false })))
    if (rules === 7) await prepareSecondTurn(page)
    else {
      await resume(page, withBattle(encounter('thorns', 1, rules), {
        enemyHp: 11, dice: [4, 5, 3], slots: ['attack', 'attack', 'attack'],
      }))
      await page.evaluate(observeBreak)
    }
    await stopAtContact(page, 1)
    const frames = await sample(page, info, 'quiet-unlock-' + rules, [16, 112, waitMs - 1])
    for (const f of frames) {
      expect(f.cardInsets.map(c => c.text)).toEqual(['−11'])
      expect(f.area).toBeGreaterThan(100)
      expect(f.hash).toBe(frames[0].hash)
      expect(f.effects).toEqual([])
    }
    checkComposition(frames)
    await expect(page.locator('main')).toHaveAttribute('data-screen', 'battle')
    await page.clock.runFor(1)
    await expect(page.locator('main')).toHaveAttribute('data-screen', 'unlock')
    await expect(page.locator('.damage-number')).toHaveCount(0)
    await page.clock.resume()
    await expect(page.getByRole('heading', { name: '전투 보상' })).toBeVisible()
  })
}

test('정확 방어 뒤 룰렛이 멈춘 전장에서 골렘 반격 격파까지 읽힌다', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await resume(page, withBattle(encounter('thorns', 1), {
    enemyHp: 1, dice: [1, 3, 5], slots: ['guard', 'guard', 'guard'],
  }))
  await page.evaluate(observeBreak)
  await stopAtContact(page, 1)
  const panel = page.locator('#counter-panel')
  async function advanceToRollState(state) {
    await expect.poll(async () => {
      await page.clock.runFor(32)
      return panel.getAttribute('data-roll-state')
    }, { intervals: [0], timeout: 10000 }).toBe(state)
  }
  await advanceToRollState('spinning')
  const canvas = page.locator('#arena canvas')
  const held = await canvas.evaluate(el => el.toDataURL())
  await advanceToRollState('locked')
  expect(await canvas.evaluate(el => el.toDataURL())).toBe(held)
  await expect(page.locator('#enemy-hp')).toHaveJSProperty('value', 1)
  for (let i = 0; i < 110 && !await page.locator('#enemy-damage span').count(); i++) await page.clock.runFor(8)
  const frames = await sample(page, info, 'counter', [16, 112, 136, 160, 211, 340, 560])
  checkComposition(frames)
  expect(frames[0].area).toBe(0)
  expect(frames.find(f => f.offset === 211).distinct).toBeGreaterThanOrEqual(3)
  const last = frames.at(-1)
  expect(last.hits.map(h => h.damage)).toEqual(['−1'])
  expect(last.effects.filter(e => /perfect-block|roulette-latch|slam|grit|seat/.test(e.name)).map(e => e.name))
    .toEqual(['perfect-block.mp3', 'roulette-latch.wav', 'slam.wav', 'grit.wav', 'seat.wav'])
  await page.clock.resume()
  await expect(page.getByRole('heading', { name: '전투 보상' })).toBeVisible()
})

for (const [scene, enemy, settings] of [
  ['ice', 'freeze', {}], ['brass-fast', 'lock', { speed: 'fast' }],
  ['boss', 'boss', {}], ['guard', 'escort', {}],
  ['quiet', 'thorns', { reducedMotion: true, effects: false }],
]) {
  test('격파의 정상·반례 화면 · ' + scene, async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.addInitScript(settings => localStorage.setItem('hwigi-tower.settings',
      JSON.stringify({ music: false, ...settings })), settings)
    const guard = scene === 'guard', quiet = scene === 'quiet'
    const room = encounter(enemy, guard ? 7 : enemy === 'freeze' ? 10 : undefined)
    const dice = [5, 3, 2, 1].slice(0, room.battle.dice.length)
    const run = withBattle(room, { enemyHp: guard ? 20 : 8, dice,
      slots: dice.map((_, i) => i < 2 ? 'attack' : 'guard'), ...(guard && { escort: { hp: 5, bonus: 3 } }) })
    await resume(page, run)
    await page.evaluate(observeBreak)
    const speed = settings.speed === 'fast' ? 2 : 1
    await stopAtContact(page, quiet ? 1 : guard ? 46 : Math.ceil(224 / speed) + 1)
    const frames = await sample(page, info, scene, quiet ? [16, 112, 200] : guard ? [16, 112, 211, 340] : times, speed,
      guard ? 'escort-damage' : 'enemy-damage')
    checkComposition(frames)
    const last = frames.at(-1)
    expect(last.area).toBeGreaterThan(50)
    const target = guard ? 'escort-damage' : 'enemy-damage'
    expect(last.hits.filter(h => h.target === target).map(h => h.damage)).toEqual([guard ? '호위−5' : '−8'])
    if (quiet) {
      expect(last.effects).toEqual([])
      expect(new Set(frames.map(f => f.hash)).size).toBe(1)
    }
    await page.clock.resume()
    if (guard) await expect(page.locator('#enemy-hp')).toHaveJSProperty('value', 17)
    else await expect(page.locator('#enemy-hp')).toHaveJSProperty('value', 0)
  })
}
