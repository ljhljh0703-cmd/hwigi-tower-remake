import { expect, test as base } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { ASCENT_SAVE_KEY } from '../src/ascent-save.ts'

const test = base.extend({
  screenErrors: async ({ page }, use) => {
    const errors = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`콘솔 오류 ${message.text()}`)
    })
    page.on('pageerror', (error) => errors.push(`페이지 오류 ${error.message}`))
    await use(errors)
    expect(errors, '등반 중 브라우저 오류').toEqual([])
  },
})

test('새 등반에서 1층 승리와 저장 복원을 거쳐 2층 전투에 진입한다', async ({ page, screenErrors }, info) => {
  const main = page.getByRole('main')
  const newAscent = page.getByRole('button', { name: '새로 하기' })
  const continueAscent = page.getByRole('button', { name: '이어 하기' })
  const perks = page.locator('#perk-choices').getByRole('button')
  const routes = page.getByRole('group', { name: '다음 층 선택' })
  const routeButtons = routes.getByRole('button')
  const fightRoute = routes.getByRole('button', { name: /^전투/ })
  const eliteRoute = routes.getByRole('button', { name: /^강적/ })
  const enter = page.getByRole('button', { name: '입장', exact: true })
  const battleFloor = page.locator('#fight')
  const mapFloor = page.locator('#map-floor')
  const mapHealth = page.locator('#map-health')
  const poolDice = page.locator('#pool-dice button')
  const attackDice = page.locator('#attack-dice').getByRole('button')
  const attack = page.getByRole('button', { name: /^공격 칸/ })
  const attackSlot = page.locator('.slot[data-dice-zone="attack"]')
  const guard = page.getByRole('button', { name: /^방어 칸/ })
  const reroll = page.locator('#reroll')
  const resolve = page.getByRole('button', { name: '턴 끝내기' })
  const rewardHeading = page.getByRole('heading', { name: '전투 보상' })
  const rewardCards = page.getByRole('group', { name: '보상 카드' }).getByRole('button')
  const confirm = page.getByRole('button', { name: '확인', exact: true })
  const skip = page.getByRole('button', { name: '건너뛰기' })
  async function photograph(name) {
    const root = (name === 'perks' && process.env.HWIGI_FEEL_GATE_SHOTS) || process.env.HWIGI_FEEL_SHOTS
    if (!root) return
    await mkdir(root, { recursive: true })
    await page.screenshot({ path: join(root, `${info.project.name.replace('×', 'x')}-${name}.png`) })
  }

  async function checkScreen(screen, buttons) {
    await expect(main).toHaveAttribute('data-screen', screen)
    for (const button of buttons) {
      await expect(button).toBeVisible()
      await expect(button).toBeInViewport({ ratio: 1 })
    }
    await expect.poll(() => page.evaluate(() => {
      const root = document.scrollingElement
      return root.scrollHeight - root.clientHeight
    }), { message: '문서의 세로 스크롤 가능 범위(px)' }).toBe(0)
    expect(screenErrors, '이 단계까지의 브라우저 오류').toEqual([])
  }

  async function readRewardScreen() {
    await expect(rewardHeading).toBeVisible()
    await expect(battleFloor).toHaveText(/^1\s*\//)
    await expect(rewardCards).toHaveCount(3)
    await checkScreen('reward', [...await rewardCards.all(), confirm, skip])
    await expect(confirm).toBeDisabled()
    const coins = page.locator('#run-coins')
    await expect(mapHealth).toBeVisible()
    await expect(coins).toBeVisible()
    const numberStyle = (element) => {
      const { color, fontFamily, fontSize, fontWeight } = getComputedStyle(element)
      return { color, fontFamily, fontSize, fontWeight }
    }
    expect(await coins.evaluate(numberStyle)).toEqual(await battleFloor.evaluate(numberStyle))
    const icons = rewardCards.locator('.pixel-icon')
    await expect(icons).toHaveCount(3)
    await expect.poll(() => icons.evaluateAll((images) => images.every((image) => {
      const { width, height } = image.getBoundingClientRect()
      return image.naturalWidth === 24 && image.naturalHeight === 24 && width === 48 && height === 48 &&
        getComputedStyle(image).imageRendering === 'pixelated'
    }))).toBe(true)
    return {
      floor: await battleFloor.innerText(),
      health: await mapHealth.innerText(),
      coins: await coins.innerText(),
      cards: await rewardCards.evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label'))),
    }
  }

  await test.step('로비에서 새 등반을 시작하고 특전을 고른다', async () => {
    await page.goto(new URL('?seed=12', process.env.HWIGI_SMOKE_URL).href)
    await checkScreen('lobby', [newAscent])
    await expect(continueAscent).toHaveCount(0)
    await newAscent.tap()
    await expect(page.getByRole('heading', { name: '시작 특전' })).toBeVisible()
    await expect(page.locator('#perks-instruction')).toHaveText('이번 등반에 쓸 특전을 하나 고르세요.')
    await expect(perks).toHaveCount(3)
    await checkScreen('perks', await perks.all())
    expect((await perks.first().boundingBox()).y).toBeLessThan(page.viewportSize().height * .4)
    await photograph('perks')
    await page.getByRole('button', { name: /^방패 저금,/ }).tap()
  })

  await test.step('1층에 들어가 주사위를 배치하고 두 턴에 승리한다', async () => {
    await expect(mapFloor).toHaveText(/^1\s*\//)
    await expect(routeButtons).toHaveCount(1)
    await checkScreen('fork', [fightRoute])
    await fightRoute.tap()
    await enter.tap()
    await page.getByRole('button', { name: '안내 건너뛰기' }).tap()

    // 시드 12에서 방패 저금을 고르면 두 턴 모두 공격에 배치해 1층을 이긴다.
    for (const turn of [1, 2]) {
      await expect(battleFloor).toHaveText(/^1\s*\//)
      await expect(page.locator('#turn')).toHaveAttribute('aria-label', `${turn}턴`)
      await expect(poolDice).toHaveCount(3)
      const dice = await poolDice.all()
      await checkScreen('battle', [...dice, attack, guard, reroll, resolve])
      for (const die of dice) await die.tap()
      await expect(attackSlot).toHaveCSS('outline-style', 'dashed')
      await attack.tap()
      await expect(attackDice).toHaveCount(3)
      await expect(attackSlot).toHaveCSS('border-image-source', /stone-selected\.png/)
      await expect(poolDice).toHaveCount(0)
      await checkScreen('battle', [...await attackDice.all(), resolve])
      await expect(resolve).toBeEnabled()
      await resolve.tap()
    }
    await expect(rewardHeading).toBeVisible()
  })

  await test.step('1층 승리 직후 새로고침하고 같은 보상 화면을 복원한다', async () => {
    const beforeReload = await readRewardScreen()
    await page.reload()
    await checkScreen('lobby', [continueAscent, newAscent])
    await continueAscent.tap()
    expect(await readRewardScreen()).toEqual(beforeReload)
  })

  await test.step('보상 세 장 중 한 장을 받고 2층 두 갈래에서 전투에 진입한다', async () => {
    const beforeHealth = Number.parseInt(await mapHealth.innerText(), 10)
    const bandage = page.getByRole('button', { name: '약초 붕대', exact: true })
    await bandage.tap()
    await expect(bandage).toHaveAttribute('aria-pressed', 'true')
    await expect(confirm).toBeEnabled()
    await checkScreen('reward', [...await rewardCards.all(), confirm, skip])
    const bounds = await Promise.all((await rewardCards.all()).map((card) => card.boundingBox()))
    expect(new Set(bounds.map(({ y }) => y)).size).toBe(1)
    await expect(page.locator('#reward-preview')).toContainText(/체력을 \d+ 회복해요/)
    await photograph('reward')
    await confirm.tap()

    await expect(page.getByRole('heading', { name: '두 갈래 길' })).toBeVisible()
    await expect(mapFloor).toHaveText(/^2\s*\//)
    await expect(routeButtons).toHaveCount(2)
    await checkScreen('fork', [fightRoute, eliteRoute])
    await photograph('fork')
    const healedHealth = Number.parseInt(await mapHealth.innerText(), 10)
    expect(healedHealth, '약초 붕대 수령 후 체력').toBeGreaterThan(beforeHealth)
    const readSave = () => page.evaluate((key) => localStorage.getItem(key), ASCENT_SAVE_KEY)
    const checkpoint = await readSave()
    expect(checkpoint).not.toBeNull()
    await eliteRoute.tap()
    await checkScreen('fork', [eliteRoute, fightRoute, enter])
    await expect(eliteRoute).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.fork-preview-portrait')).toBeVisible()
    await expect(page.locator('.fork-preview-stats')).toContainText('27')
    expect(await readSave()).toBe(checkpoint)
    await photograph('fork-selected')
    await fightRoute.tap()
    await expect(fightRoute).toHaveAttribute('aria-pressed', 'true')
    await expect(eliteRoute).toHaveAttribute('aria-pressed', 'false')
    expect(await readSave()).toBe(checkpoint)
    await page.locator('#fork-heading').tap()
    await expect(enter).toBeHidden()
    await expect(fightRoute).toHaveAttribute('aria-pressed', 'false')
    expect(await readSave()).toBe(checkpoint)
    await fightRoute.tap()
    await enter.tap()

    await expect(battleFloor).toHaveText(/^2\s*\//)
    await expect(page.locator('#turn')).toHaveAttribute('aria-label', '1턴')
    await expect(poolDice).toHaveCount(3)
    await expect(page.getByRole('region', { name: '전장' })).toBeVisible()
    await expect(page.getByRole('meter', { name: '내 체력' })).toHaveJSProperty('value', healedHealth)
    await checkScreen('battle', [...await poolDice.all(), attack, guard, reroll, resolve])
  })
})
