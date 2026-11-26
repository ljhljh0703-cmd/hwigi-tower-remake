import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test as base } from '@playwright/test'
import manifest from '../art-source/enemy-motion/manifest.json' with { type: 'json' }
import { availableMapNodes, enterMapNode, resolveAscentTurn } from '../src/ascent.ts'
import { ASCENT_SAVE_KEY } from '../src/ascent-save.ts'
import { checkpoint, encounter, mapBefore } from './rules-six-fixtures.mjs'

const atlasCells = Object.fromEntries(manifest.sheets.map((sheet) => [
  `${sheet.id}.png`, Object.fromEntries(sheet.frames.map(({ id, rect, candidateContact }) => [
    rect.slice(0, 2).join(','), { id, candidateContact },
  ])),
]))

const test = base.extend({
  page: async ({ page }, use) => {
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('response', (response) => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`)
    })
    await page.addInitScript((cells) => {
      const clear = CanvasRenderingContext2D.prototype.clearRect
      const draw = CanvasRenderingContext2D.prototype.drawImage
      const actorPixels = new WeakMap()
      window.arenaFrames = []
      CanvasRenderingContext2D.prototype.clearRect = function (...args) {
        if (this.canvas.parentElement?.id === 'arena') {
          const frames = window.arenaFrames
          if (frames.length > 360) frames.shift()
          frames.push({ at: performance.now(), actors: [] })
        }
        return clear.apply(this, args)
      }
      CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
        draw.call(this, image, ...args)
        if (this.canvas.parentElement?.id !== 'arena' || !(image instanceof HTMLImageElement)) return
        const url = new URL(image.src)
        const art = url.pathname.split('/').at(-1)
        const metadata = url.pathname.includes('/motion/') ? cells[art] : undefined
        if (!metadata && !(/^(hero-|freeze-ready)/.test(art))) return
        const arenaFrame = window.arenaFrames.at(-1)
        if (!arenaFrame) return
        const [sx, sy, sw, sh] = args.length === 8 ? args : [0, 0, image.naturalWidth, image.naturalHeight]
        const [dx, dy, dw, dh] = args.length === 8 ? args.slice(4) : args
        let rgba = actorPixels.get(image)
        if (!rgba) {
          const scratch = document.createElement('canvas')
          scratch.width = image.naturalWidth
          scratch.height = image.naturalHeight
          const context = scratch.getContext('2d')
          draw.call(context, image, 0, 0)
          rgba = context.getImageData(0, 0, scratch.width, scratch.height).data
          actorPixels.set(image, rgba)
        }
        const scale = dw / sw
        let minX = sw, maxX = -1, minY = sh, maxY = -1
        const spans = []
        for (let y = 0; y < sh; y++) {
          const row = []
          for (let x = 0; x < sw; x++) {
            if (rgba[((sy + y) * image.naturalWidth + sx + x) * 4 + 3] <= 100) continue
            minX = Math.min(minX, x)
            maxX = Math.max(maxX, x)
            minY = Math.min(minY, y)
            maxY = Math.max(maxY, y)
            row.push(x)
          }
          spans.push(row)
        }
        const matrix = this.getTransform()
        const x = dx + matrix.e
        const y = dy + matrix.f
        const cell = metadata?.[`${sx},${sy}`]
        arenaFrame.actors.push({
          art, pose: cell?.id ?? art.slice(0, -4), x, y, scale, spans, contact: cell?.candidateContact,
          box: [x + minX * scale, y + minY * scale, (maxX - minX + 1) * scale, (maxY - minY + 1) * scale],
          smoothing: this.imageSmoothingEnabled,
        })
      }
    }, atlasCells)
    await use(page)
    expect(errors, '전장 브라우저 오류').toEqual([])
  },
})

function withBattle(run, state) {
  return { ...run, battle: { ...run.battle, ...state } }
}

async function resume(page, run) {
  const { json, restored } = checkpoint(run)
  expect(restored).not.toBeNull()
  if (page.url() === 'about:blank') await page.goto(process.env.HWIGI_SMOKE_URL)
  await page.evaluate(({ key, json }) => localStorage.setItem(key, json), { key: ASCENT_SAVE_KEY, json })
  await page.reload()
  await page.locator('#continue-ascent').tap()
  await expect(page.locator('#resolve')).toBeVisible()
}

async function frameWith(page, hero, enemy, pose, extraEnemy) {
  const handle = await page.waitForFunction(({ hero, enemy, pose, extraEnemy }) => {
    return window.arenaFrames.findLast(({ actors }) => actors.some(({ art }) => art === `hero-${hero}.png`)
      && actors.some((actor) => actor.art === enemy && (!pose || actor.pose === pose))
      && (!extraEnemy || actors.some(({ art }) => art === extraEnemy)))
  }, { hero, enemy, pose, extraEnemy }, { timeout: 4500 })
  return handle.jsonValue()
}

async function photograph(page, info, name) {
  const root = process.env.HWIGI_HERO_SHOTS
  if (!root) return
  await page.screenshot({
    path: join(root, `${info.project.name.replace('×', 'x')}-${name}.png`),
    animations: name === 'game-over' ? 'disabled' : 'allow',
  })
}

test.beforeAll(async () => {
  if (process.env.HWIGI_HERO_SHOTS) await mkdir(process.env.HWIGI_HERO_SHOTS, { recursive: true })
})

test('황제의 공격 턴과 힘을 모으는 턴의 수치가 구분된다', async ({ page }, info) => {
  const boss = encounter('boss', 12)
  await resume(page, withBattle(boss, { turn: 1 }))
  const intent = page.locator('#intent')
  await expect(intent).toHaveAttribute('data-intent', 'attack')
  await expect(intent.locator('strong')).toHaveText('11 + 10')
  await photograph(page, info, 'intent-attack')

  await resume(page, withBattle(boss, { turn: 2 }))
  await expect(intent).toHaveAttribute('data-intent', 'charge')
  await expect(intent).toHaveAccessibleName(/이번 턴 피해 0 · 다음 턴 피해 20/)
  await expect(intent.locator('strong')).toHaveText('0')
  await expect(intent.locator('.intent-next')).toHaveText('20')
  expect(await intent.evaluate((element) => {
    const size = (selector) => parseFloat(getComputedStyle(element.querySelector(selector)).fontSize)
    return size('.intent-next') < size('strong')
  })).toBe(true)
  await photograph(page, info, 'intent-charge')
})

async function put(page, slot, indices) {
  for (const index of indices) await page.locator(`#die-${index}`).tap()
  await page.locator(`#assign-${slot}`).tap()
  for (const index of indices) await expect(page.locator(`#${slot}-dice #die-${index}`)).toBeVisible()
}

const virtualClocks = new WeakSet()

async function resolveToFrame(page, elapsed) {
  if (!virtualClocks.has(page)) {
    await page.clock.install()
    virtualClocks.add(page)
  }
  const now = await page.evaluate(() => Date.now())
  await page.clock.pauseAt(now + 500)
  const resolve = page.locator('#resolve')
  await expect(resolve).toBeEnabled()
  const { x, y, width, height } = await resolve.boundingBox()
  await page.touchscreen.tap(x + width / 2, y + height / 2)
  await page.clock.runFor(elapsed)
}

async function keepLayout(page, actors) {
  const arena = await page.locator('#arena').boundingBox()
  const fore = await page.locator('#intent').boundingBox()
  const hps = await page.locator('.combatant:not([hidden]) .vital').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().toJSON()))
  const hero = actors.find(({ art }) => art === 'hero-idle.png')
  expect(hero.scale).toBe(3)
  expect(hero.box.slice(2)).toEqual([84, 90])
  expect(hero.smoothing).toBe(false)
  for (const actor of actors) {
    const [x, y, w, h] = actor.box
    expect(x).toBeGreaterThanOrEqual(0)
    expect(x + w).toBeLessThanOrEqual(arena.width)
    expect(y).toBeGreaterThanOrEqual(0)
    expect(Math.abs(y + h - (hero.box[1] + hero.box[3]))).toBeLessThanOrEqual(1)
    const horizontalOverlap = arena.x + x < fore.x + fore.width && arena.x + x + w > fore.x
    if (horizontalOverlap) expect(fore.y + fore.height).toBeLessThanOrEqual(arena.y + y)
    for (const hp of hps) expect(hp.top).toBeGreaterThan(arena.y + y + h)
  }
  const sorted = [...hps].sort((a, b) => a.left - b.left)
  for (let index = 1; index < sorted.length; index++) {
    expect(sorted[index - 1].right).toBeLessThanOrEqual(sorted[index].left)
  }
  for (const locator of [page.locator('#pool-dice button').first(), page.locator('#assign-attack'),
    page.locator('#assign-guard'), page.locator('#resolve')]) {
    await expect(locator).toBeInViewport({ ratio: 1 })
  }
  expect(await page.evaluate(() => {
    const root = document.scrollingElement
    return [root.scrollWidth - root.clientWidth, root.scrollHeight - root.clientHeight]
  })).toEqual([0, 0])
}

test('골렘·자물쇠·얼림·호위·보스의 실루엣과 입력 영역을 확인한다', async ({ page }, info) => {
  const fields = [
    ['thorns', 'golem.png', undefined, [124, 88]],
    ['lock', 'lock.png', undefined, [92, 88]],
    ['freeze', 'freeze-ready.png', undefined, [112, 72]],
    ['escort', 'escort.png', 'escort-guard.png', undefined],
    ['boss', 'boss.png', undefined, [78, 132]],
  ]
  for (const [name, art, guard, dimensions] of fields) {
    let run = encounter(name)
    if (guard) run = withBattle(run, { escort: { hp: 5, bonus: 3 } })
    await resume(page, run)
    const { actors } = await frameWith(page, 'idle', art, art === 'freeze-ready.png' ? undefined : 'ready', guard)
    await keepLayout(page, actors)
    if (dimensions) expect(actors.find((actor) => actor.art === art).box.slice(2)).toEqual(dimensions)
    await put(page, 'attack', [0])
    await page.locator('#attack-dice button').first().tap()
    await photograph(page, info, `ratio-${name}`)
  }
})

function opaqueAt(actor, x, y, tolerance = 1) {
  return actor.spans.some((row, j) => {
    const top = actor.y + j * actor.scale
    return y >= top - tolerance && y <= top + actor.scale + tolerance && row.some((i) => {
      const left = actor.x + i * actor.scale
      return x >= left - tolerance && x <= left + actor.scale + tolerance
    })
  })
}

function bladeTouches(frame, enemy) {
  const hero = frame.actors.find(({ art }) => art === 'hero-attack.png')
  const other = frame.actors.find(({ art }) => art === enemy)
  return hero && other && opaqueAt(other, hero.x + 47.5 * hero.scale, hero.y + 20.5 * hero.scale)
}

function incomingTouches({ actors }, heroArt, enemyArt) {
  const hero = actors.find(({ art }) => art === heroArt)
  const foe = actors.find(({ art, contact }) => art === enemyArt && contact)
  return hero && foe && opaqueAt(hero, foe.x + (foe.contact[0] + .5) * foe.scale, foe.y + (foe.contact[1] + .5) * foe.scale, 2)
}

test('자물쇠의 공방 10컷과 칼끝 접촉을 확인한다', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const init = encounter('lock')
  const run = withBattle(init, { turn: 1, dice: [1, 2, 4, 1], slots: [null, null, null, null] })
  await resume(page, run)
  await put(page, 'attack', [0, 1, 2, 3])
  await resolveToFrame(page, 113)
  await frameWith(page, 'attack', 'lock.png', 'hit')
  await photograph(page, info, 'sword-contact')
  await page.clock.resume()
  await expect(page.locator('#turn')).toHaveAttribute('aria-label', '2턴')
  const attack = await page.evaluate(() => window.arenaFrames)
  expect(attack.some((frame) => bladeTouches(frame, 'lock.png'))).toBe(true)
  const turn = withBattle(init, { turn: 1, dice: [3, 3, 6, 1], slots: [null, null, null, null] })
  await resume(page, turn)
  await put(page, 'guard', [0, 1, 2, 3])
  await resolveToFrame(page, 177)
  await frameWith(page, 'guard-brace', 'lock.png', 'contact')
  await photograph(page, info, 'guard-contact')
  await page.clock.resume()
  await expect(page.locator('#turn')).toHaveAttribute('aria-label', '2턴')
  const defense = await page.evaluate(() => window.arenaFrames)
  const frames = [...attack, ...defense]
  const poses = new Set(frames.flatMap(({ actors }) => actors.map(({ art }) => art)))
  for (const pose of ['idle', 'guard-lift', 'guard', 'guard-brace', 'attack-prepare', 'step', 'attack', 'attack-follow', 'hit', 'recover']) {
    expect(poses, pose).toContain(`hero-${pose}.png`)
  }
  expect(defense.some((frame) => incomingTouches(frame, 'hero-guard-brace.png', 'lock.png'))).toBe(true)
})

test('호위병이 먼저 맞고 보스 충전과 봉인 자세가 실제 판정에 연결된다', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const room = encounter('escort')
  const withGuard = withBattle(room, { turn: 1, dice: [1, 1, 1, 3], slots: [null, null, null, null], escort: { hp: 5, bonus: 3 } })
  await resume(page, withGuard)
  await put(page, 'attack', [0, 1, 2, 3])
  await resolveToFrame(page, 64)
  await frameWith(page, 'attack', 'escort-guard.png', 'hit')
  await photograph(page, info, 'escort-contact')
  await page.clock.resume()
  await expect(page.locator('#turn')).toHaveAttribute('aria-label', '2턴')
  const escort = await page.evaluate(() => window.arenaFrames)
  const guardContact = escort.findIndex((frame) => bladeTouches(frame, 'escort-guard.png'))
  const bossContact = escort.findIndex((frame, index) => index > guardContact && bladeTouches(frame, 'escort.png'))
  expect(guardContact).toBeGreaterThanOrEqual(0)
  expect(bossContact).toBeGreaterThan(guardContact)
  const plan = encounter('boss', 12)
  await resume(page, withBattle(plan, { turn: 2, dice: [1, 2, 3, 1], slots: [null, null, null, null] }))
  const charge = await frameWith(page, 'idle', 'boss-special.png', 'charge-peak')
  await keepLayout(page, charge.actors)
  await photograph(page, info, 'boss-charge')
  await put(page, 'attack', [0, 1, 2, 3])
  await page.locator('#resolve').tap()
  await expect(page.locator('#turn')).toHaveAttribute('aria-label', '3턴')
  await put(page, 'guard', [0, 1, 2, 3])
  await resolveToFrame(page, 177)
  const critical = await frameWith(page, 'hit', 'boss-special.png', 'charge-contact')
  expect(incomingTouches(critical, 'hero-hit.png', 'boss-special.png')).toBe(true)
  await photograph(page, info, 'boss-charge-contact')
  await page.clock.resume()
  const oldMap = mapBefore(plan.seed, 12, 5)
  const legacy = enterMapNode(oldMap, availableMapNodes(oldMap)[0].id)
  const sealed = withBattle(legacy, { turn: 5, dice: [1, 2, 5, 1], slots: [null, null, null, null] })
  await resume(page, sealed)
  await frameWith(page, 'idle', 'boss-special.png', 'seal-set')
  await photograph(page, info, 'boss-seal')
  await put(page, 'guard', [0, 1, 2, 3])
  await resolveToFrame(page, 177)
  const seal = await frameWith(page, 'hit', 'boss-special.png', 'seal-contact')
  expect(incomingTouches(seal, 'hero-hit.png', 'boss-special.png')).toBe(true)
  await photograph(page, info, 'boss-seal-contact')
  await page.clock.resume()
})

test('치명타 뒤 무릎과 쓰러짐을 표시하고 움직임 줄이기에서는 바로 게임 오버로 간다', async ({ page }, info) => {
  const run = withBattle(encounter('lock'), { playerHp: 1, awakened: true, turn: 1, dice: [1, 2, 4, 1], slots: [null, null, null, null] })
  for (const reducedMotion of ['no-preference', 'reduce']) {
    await page.emulateMedia({ reducedMotion })
    await resume(page, run)
    await put(page, 'attack', [0, 1, 2, 3])
    await page.evaluate(() => {
      const game = document.querySelector('main')
      new MutationObserver(() => {
        if (game.dataset.screen === 'defeat') window.defeatAt = performance.now()
      }).observe(game, { attributeFilter: ['data-screen'] })
    })
    if (reducedMotion === 'no-preference') {
      await resolveToFrame(page, 618)
      await frameWith(page, 'fall', 'lock.png')
      await frameWith(page, 'down', 'lock.png')
      await expect(page.locator('main')).toHaveAttribute('data-screen', 'battle', { timeout: 0 })
      await photograph(page, info, 'lethal-down')
      await page.clock.resume()
    } else await page.locator('#resolve').tap()
    await expect(page.getByRole('heading', { name: '게임 오버' })).toBeVisible()
    if (reducedMotion === 'no-preference') await photograph(page, info, 'game-over')
    const duration = await page.evaluate(() => {
      const hit = window.arenaFrames.find(({ actors }) => actors.some(({ art }) => art === 'hero-hit.png'))
      return hit ? window.defeatAt - hit.at : 0
    })
    if (reducedMotion === 'no-preference') expect(duration).toBeGreaterThanOrEqual(220)
    else expect(duration).toBeLessThan(220)
    const expected = resolveAscentTurn(withBattle(run, { slots: ['attack', 'attack', 'attack', 'attack'] }))
    expect(expected.battle.phase).toBe('lost')
  }
})
