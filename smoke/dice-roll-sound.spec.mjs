import { expect, test } from '@playwright/test'
import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { resolveAscentTurn } from '../src/ascent.ts'
import { ASCENT_SAVE_KEY } from '../src/ascent-save.ts'
import { checkpoint, encounter } from './rules-six-fixtures.mjs'
import { observeDice, rollStraight, startSeedSeven } from './dice-sound-probe.mjs'

const url = () => process.env.HWIGI_SMOKE_URL
const sounds = page => page.evaluate(() => window.diceProbe.sounds)
const names = async page => (await sounds(page)).map(e => e.name)
const save = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)).ascent, ASCENT_SAVE_KEY)
const visibleDice = page => page.locator('#pool-dice button:not([hidden])')
// Use the same software compositor as the comparison clips. GPU warm-up on
// Windows otherwise introduces unrelated long frames into the nominal cases.
test.use({ launchOptions: { args: ['--disable-gpu'] } })

async function setup(page, settings = {}) {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.addInitScript(observeDice)
  await page.addInitScript(settings => {
    localStorage.setItem('hwigi-tower.settings', JSON.stringify({ music: false, ...settings }))
    localStorage.setItem('hwigi-tower.first-run-guide', JSON.stringify({ complete: true, seen: [] }))
  }, settings)
}

async function resume(page, run) {
  const { json, restored } = checkpoint(run)
  expect(restored).not.toBeNull()
  await page.goto(url())
  await page.evaluate(({ key, json }) => localStorage.setItem(key, json), { key: ASCENT_SAVE_KEY, json })
  await page.reload()
  await page.locator('#continue-ascent').tap()
  await expect(page.locator('#room-transition')).toBeHidden()
}

async function photo(page, info, name) {
  if (process.env.HWIGI_DICE_SHOTS) await page.screenshot({
    path: join(process.env.HWIGI_DICE_SHOTS, info.project.name.replace('×', 'x') + '-' + name + '.png'),
  })
}

test.describe('Dice audio', () => {
  test.describe('모서리 확대', () => {
    test.use({ deviceScaleFactor: 2 })
    test('두 접점의 먼지와 가장 낮은 모서리가 만난다', async ({ page }, info) => {
      await setup(page, { effects: false })
      await startSeedSeven(page, url())
      await page.evaluate(() => {
        const observer = new MutationObserver(() => {
          const layer = document.querySelector('.encounter .dice-motion')
          if (!layer) return
          observer.disconnect()
          window.rollTracks = layer.getAnimations({ subtree: true })
          for (const a of window.rollTracks) { a.pause(); a.currentTime = 0 }
        })
        observer.observe(document.body, { subtree: true, childList: true })
      })
      await page.locator('#fork-options button').tap()
      await expect(page.locator('#room-transition')).toBeHidden()
      const witnesses = []
      for (const [index, part] of ['land', 'bounce'].entries()) {
        const geometry = await page.evaluate(index => {
          for (const a of window.rollTracks) a.currentTime = 664 * [0.45, 0.76][index] + .001
          const layer = document.querySelector('.encounter .dice-motion')
          const die = layer.querySelector('.dice-tumble')
          const box = die.getBoundingClientRect()
          const matrix = new DOMMatrix(getComputedStyle(die).transform)
          const points = [-1, 1].flatMap(u => [-1, 1].map(v => ({
            x: box.x + box.width / 2 + (u * die.offsetWidth * matrix.a + v * die.offsetHeight * matrix.c) / 2,
            y: box.y + box.height / 2 + (u * die.offsetWidth * matrix.b + v * die.offsetHeight * matrix.d) / 2,
          })))
          const corner = points.sort((a, b) => b.y - a.y)[0]
          const particle = layer.querySelectorAll('.dice-roll-dust')[index]
          const dust = particle.getBoundingClientRect()
          const shadow = layer.querySelector('.dice-roll-shadow').getBoundingClientRect()
          const x = dust.x + dust.width / 2
          const ground = shadow.y + shadow.height / 2
          return { corner, x, ground, dustBottom: dust.bottom, opacity: Number(getComputedStyle(particle).opacity),
            chip: getComputedStyle(document.querySelector('#planning .unlock-chip')).visibility }
        }, index)
        expect(Math.abs(geometry.corner.x - geometry.x)).toBeLessThan(.15)
        expect(Math.abs(geometry.corner.y - geometry.ground)).toBeLessThan(.15)
        expect(Math.abs(geometry.dustBottom - geometry.ground)).toBeLessThan(.15)
        expect(geometry.opacity).toBeGreaterThan(.4)
        expect(geometry.chip).toBe('hidden')
        witnesses.push({ part, ...geometry })
        if (process.env.HWIGI_DICE_SHOTS) {
          const prefix = join(process.env.HWIGI_DICE_SHOTS, info.project.name.replace('×', 'x') + '-' + part)
          await page.screenshot({ scale: 'css', path: prefix + '.png' })
          await page.screenshot({ clip: { x: Math.max(0, Math.floor(geometry.x - 48)),
            y: Math.floor(geometry.ground - 65), width: 148, height: 78 }, path: prefix + '-detail.png' })
        }
      }
      if (process.env.HWIGI_DICE_SHOTS) await writeFile(join(process.env.HWIGI_DICE_SHOTS,
        info.project.name.replace('×', 'x') + '-geometry.json'), JSON.stringify(witnesses, null, 2) + '\n')
    })
  })
  for (const mode of ['normal', 'fast', 'muted', 'reduced', 'unavailable', 'late']) {
    test(mode + ' · 첫 굴림부터 다음 턴까지 같은 버튼과 눈', async ({ page }, info) => {
      await setup(page, { speed: mode === 'fast' ? 'fast' : 'normal', effects: mode !== 'muted', reducedMotion: mode === 'reduced' })
      let release
      if (mode === 'late') {
        const pending = new Promise(resolve => { release = resolve })
        await page.route(/\/sfx\/(die-.*|seat)\.wav$/, async route => { await pending; await route.continue() })
      }
      if (mode === 'unavailable') await page.addInitScript(() => { window.AudioContext = undefined })
      await startSeedSeven(page, url())
      await rollStraight(page)
      const result = await save(page)
      expect(result.unlocks).toEqual(['straight'])
      expect(result.battle.turn).toBe(2)
      expect(result.battle.dice).toEqual([5, 1, 2])
      expect(result.battle.extraRerollAvailable).toBe(true)
      expect((await visibleDice(page).allTextContents()).map(Number)).toEqual(result.battle.dice)
      await expect(visibleDice(page).first()).toBeFocused()
      const log = await page.evaluate(() => window.diceProbe)
      const count = name => log.sounds.filter(s => s.name === name).length
      const audible = !['muted', 'late', 'unavailable'].includes(mode)
      expect(count('die-corner.wav')).toBe(audible && mode !== 'reduced' ? 6 : 0)
      expect(count('die-rebound.wav')).toBe(audible ? mode === 'reduced' ? 1 : 3 : 0)
      expect(count('dice-place.mp3')).toBe(['unavailable', 'muted'].includes(mode) ? 0 : 1)
      expect(count('seat.wav')).toBe(audible ? 2 : 0)
      expect(count('unlock.mp3') + count('dice-roll.mp3') + count('rebound.wav') + count('hum.wav')).toBe(0)
      const notes = log.sounds.filter(s => s.name === 'die-note.wav')
      expect(notes.map(s => s.filled)).toEqual(audible ? [1, 2, 3] : [])
      for (const [i, note] of notes.entries()) expect(note.rate).toBeCloseTo([.79, 1, 1.27][i], 4)
      if (mode === 'reduced') {
        expect(log.rolls).toHaveLength(0)
        expect(log.rerolls).toHaveLength(0)
        await photo(page, info, 'reduced')
      } else {
        expect(log.rolls).toHaveLength(6)
        expect(log.rerolls).toHaveLength(2)
        expect(log.rerolls.map(r => r.to)).toEqual(['3', '2'])
        const speed = mode === 'fast' ? 2 : 1
        expect(log.rolls[0].duration).toBe(664 / speed)
        expect(log.rolls[2].start - log.rolls[0].start).toBeCloseTo(48 / speed)
        if (audible) for (const [index, roll] of log.rolls.entries()) {
          const at = log.sounds.filter(s => s.name === 'die-corner.wav')[index].frame
          expect(at).toBeGreaterThanOrEqual(roll.land - 1)
        }
      }
      if (release) {
        const loaded = page.waitForResponse(r => r.url().endsWith('die-corner.wav'))
        release()
        await loaded
        await page.waitForTimeout(350)
        expect((await names(page)).filter(n => n.startsWith('die-') || n === 'seat.wav')).toEqual([])
      }
      await page.reload()
      await page.locator('#continue-ascent').tap()
      await expect(page.locator('#room-transition')).toBeHidden()
      expect((await save(page)).battle.dice).toEqual(result.battle.dice)
      expect((await names(page)).filter(n => n.startsWith('die-') || n === 'seat.wav')).toEqual([])
    })
  }

  test('첫 착지와 해금 첫 음 직후 중단하면 나머지 예약음은 사라진다', async ({ page }) => {
    await setup(page)
    await startSeedSeven(page, url())
    await page.evaluate(() => {
      const start = AudioBufferSourceNode.prototype.start
      const pending = new Set(['die-corner.wav', 'die-note.wav'])
      AudioBufferSourceNode.prototype.start = function (...args) {
        const result = start.apply(this, args)
        const name = window.diceProbe.sounds.at(-1).name
        if (pending.delete(name)) window.dispatchEvent(new Event('resize'))
        return result
      }
    })
    await rollStraight(page)
    const log = await page.evaluate(() => window.diceProbe)
    const firstReroll = log.taps.find(t => t.button === 'reroll').at
    expect(log.sounds.filter(s => s.at < firstReroll && (s.name.startsWith('die-') || s.name === 'seat.wav'))
      .map(s => s.name)).toEqual(['die-corner.wav'])
    expect(log.sounds.filter(s => s.name === 'die-note.wav').map(s => s.filled)).toEqual([1])
    expect((await save(page)).unlocks).toEqual(['straight'])
  })

  test('잠금·권리 소진과 같은 눈 재굴림', async ({ page }, info) => {
    await setup(page)
    const start = encounter('thorns', 1, 7)
    await resume(page, { ...start, battle: { ...start.battle, fixedDie: { kind: 'lock', index: 1 } } })
    const dice = visibleDice(page)
    const reroll = page.locator('#reroll')
    const tapDisabled = async () => {
      await expect(reroll).toBeDisabled()
      const { x, y, width, height } = await reroll.boundingBox()
      await page.touchscreen.tap(x + width / 2, y + height / 2)
    }
    await dice.nth(1).tap()
    await tapDisabled()
    expect(await names(page)).not.toContain('die-rebound.wav')
    await photo(page, info, 'locked')
    await dice.nth(0).tap()
    await reroll.tap()
    await expect.poll(async () => (await names(page)).filter(n => n === 'die-rebound.wav').length).toBe(1)
    expect((await save(page)).battle.dice).toEqual(start.battle.dice)
    const moved = await page.evaluate(() => window.diceProbe.rerolls)
    expect(moved.map(r => [r.from, r.to])).toEqual([['6', '6']])
    await dice.nth(0).tap()
    await tapDisabled()
    expect((await names(page)).filter(n => n === 'die-rebound.wav')).toHaveLength(1)
  })

  for (const [slot, turn, dice, slots] of [
    ['guard', 1, [1, 1, 1], ['guard', 'guard', 'guard']],
    ['attack', 1, [2, 1, 1], ['attack', 'attack', 'guard']],
    ['rest', 2, [6, 2, 1], ['guard', 'guard', 'guard']],
  ]) {
    test('에고 ' + slot + ' · 확정음과 도착음', async ({ page }) => {
      await setup(page)
      const start = encounter('thorns', 1, 7)
      const run = { ...start, unlocks: ['triple'], battle: { ...start.battle, fourthDieUnlocked: true, turn, dice, slots } }
      const expected = resolveAscentTurn(run).battle.lastExchange.ego
      await resume(page, run)
      await page.locator('#resolve').tap()
      await expect.poll(async () => (await save(page)).battle.lastExchange?.ego).toEqual(expected)
      const log = await page.evaluate(() => window.diceProbe)
      expect(log.ego.map(e => [e.slot, e.face])).toEqual([[slot, expected.face]])
      const ordered = log.sounds.filter(e => ['die-rebound.wav', 'seat.wav'].includes(e.name))
      expect(ordered.map(e => e.name)).toEqual(['die-rebound.wav', 'seat.wav'])
      expect(ordered[1].at - ordered[0].at).toBeGreaterThan(330)
      expect(log.sounds.some(e => e.name === 'die-corner.wav' || e.name === 'die-note.wav')).toBe(false)
    })
  }

  for (const kind of ['partial', 'owned', 'sealed', 'triple']) {
    test('세 음 중복 방지 · ' + kind, async ({ page }) => {
      await setup(page, { reducedMotion: true })
      const start = kind === 'sealed' ? encounter('seal-sentinel', 9, 3) : encounter('thorns', 1, 7)
      const dice = { partial: [1, 2, 5], owned: [1, 2, 3], sealed: [3, 4, 5, 1], triple: [3, 3, 3] }[kind]
      const run = { ...start, unlocks: kind === 'owned' ? ['straight'] : start.unlocks,
        battle: { ...start.battle, dice, slots: dice.map((_, i) => i === 3 ? 'guard' : 'attack'),
          turn: kind === 'sealed' ? 2 : 1, ...(kind === 'owned' && { extraRerollAvailable: true }) } }
      const resolved = resolveAscentTurn(run)
      expect(resolved.newUnlock).toBe(kind === 'triple' ? 'triple' : null)
      await resume(page, run)
      await page.locator('#resolve').tap()
      await expect.poll(async () => (await save(page)).battle.lastExchange?.turn).toBe(run.battle.turn)
      if (kind === 'triple') {
        await expect.poll(async () => (await names(page)).includes('unlock.mp3')).toBe(true)
        await page.locator('#confirm-unlock').tap()
      }
      await expect(page.locator('#planning')).not.toHaveAttribute('inert', '')
      expect(await names(page)).not.toContain('die-note.wav')
    })
  }

  for (const interruption of ['resize', 'hidden', 'speed']) {
    test('진행 중 중단 · ' + interruption, async ({ page }) => {
      await setup(page)
      await startSeedSeven(page, url())
      await page.evaluate(kind => {
        const snapshot = () => { window.soundsAtInterrupt = window.diceProbe.sounds.length }
        if (kind === 'speed') document.addEventListener('change', snapshot, { capture: true, once: true })
        else if (kind === 'hidden') document.addEventListener('visibilitychange', snapshot, { once: true })
        else window.addEventListener('resize', snapshot, { once: true })
      }, interruption)
      await page.locator('#fork-options button').tap()
      await expect(page.locator('.encounter .dice-motion')).toHaveCount(1)
      if (interruption === 'resize') await page.setViewportSize({ ...page.viewportSize(), height: page.viewportSize().height - 16 })
      if (interruption === 'hidden') await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true })
        document.dispatchEvent(new Event('visibilitychange'))
        delete document.hidden
        document.dispatchEvent(new Event('visibilitychange'))
      })
      if (interruption === 'speed') {
        await page.locator('#battle-settings').tap()
        await page.locator('input[value=fast]').check()
      }
      await expect(page.locator('.dice-motion')).toHaveCount(0)
      await page.waitForTimeout(600)
      const after = await page.evaluate(() => window.diceProbe.sounds.slice(window.soundsAtInterrupt).map(s => s.name))
      expect(after.filter(n => n.startsWith('die-') || n === 'seat.wav')).toEqual([])
      expect((await save(page)).battle.dice).toEqual([1, 1, 1])
    })
  }
  test('긴 프레임 하나가 두 접지를 지나도 지난 소리를 몰아 틀지 않는다', async ({ page }, info) => {
    await setup(page)
    await startSeedSeven(page, url())
    await page.evaluate(() => {
      const observer = new MutationObserver(() => {
        const track = document.querySelector('.encounter .dice-tumble')?.getAnimations()[0]
        if (!track) return
        observer.disconnect()
        const clock = Number(track.startTime)
        const end = clock + 615
        setTimeout(() => {
          const begin = performance.now()
          while (performance.now() < end) { /* Deliberate single long task crossing both impacts. */ }
          window.longFrame = { beginMs: begin - clock, endMs: performance.now() - clock, clock }
        }, Math.max(0, clock + 140 - performance.now()))
      })
      observer.observe(document.body, { childList: true, subtree: true })
    })
    await page.locator('#fork-options button').tap()
    const die = visibleDice(page).first()
    await expect(die).toBeVisible()
    await expect.poll(() => page.evaluate(() => window.longFrame?.endMs)).toBeGreaterThan(600)
    const report = await page.evaluate(() => ({ ...window.longFrame, sounds: window.diceProbe.sounds
      .filter(s => s.name?.startsWith('die-') || s.name === 'seat.wav')
      .map(s => ({ name: s.name, atMs: s.at - window.longFrame.clock })) }))
    expect(report.beginMs).toBeLessThan(299)
    expect(report.sounds.map(s => s.name)).toEqual(['seat.wav'])
    await die.tap()
    await page.locator('#reroll').tap()
    await expect.poll(async () => (await names(page)).filter(n => n === 'die-rebound.wav').length).toBe(1)
    if (process.env.HWIGI_DICE_SHOTS) await writeFile(join(process.env.HWIGI_DICE_SHOTS,
      info.project.name.replace('×', 'x') + '-long-frame.json'), JSON.stringify(report, null, 2) + '\n')
  })
})
