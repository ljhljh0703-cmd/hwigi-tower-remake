import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { ASCENT_SAVE_KEY } from '../src/ascent-save.ts'
import { availableMapNodes, beginMapAscent, enterMapNode, rewardOffers } from '../src/ascent.ts'
import { checkpoint, encounter, mapBefore, nodeFor, playWith } from './rules-six-fixtures.mjs'

test('규칙판 7 이름을 층 진입·전투·도감·보상에 표시하고 규칙판 6 이름을 복원한다', async ({ page }, info) => {
  async function resume(run) {
    const { json, restored } = checkpoint(run)
    expect(restored).not.toBeNull()
    if (page.url() === 'about:blank') await page.goto(process.env.HWIGI_SMOKE_URL)
    await page.evaluate(({ key, json }) => localStorage.setItem(key, json), { key: ASCENT_SAVE_KEY, json })
    await page.reload()
    await page.getByRole('button', { name: '이어하기' }).tap()
    await expect(page.locator('#room-transition')).toBeHidden()
  }

  async function photo(name, content) {
    await expect(content).toBeInViewport({ ratio: 1 })
    const output = process.env.HWIGI_NAMES_SHOTS
    if (!output) return
    await mkdir(output, { recursive: true })
    await page.screenshot({ path: join(output, `${info.project.name.replace('×', 'x')}-${name}.png`) })
  }

  const { seed, node } = nodeFor('lock', 4, 7)
  await resume(mapBefore(seed, 4, 7))
  await page.locator(`#fork-options [data-node="${node.id}"]`).tap()
  await expect(page.locator('#fork-preview')).toContainText('쇠아귀')
  await page.locator('#enter-room').tap()
  const floor = page.locator('#room-floor')
  await expect(floor).toHaveText('4층 — 무너진 회랑')
  await photo('floor-entry', floor)
  await expect(page.locator('#room-transition')).toBeHidden()
  const nameplate = page.locator('#encounter-name')
  await expect(nameplate).toHaveText('쇠아귀')
  await photo('iron-jaw', nameplate)

  const boss = encounter('chain-warden', 6, 7)
  await resume(boss)
  await expect(nameplate).toHaveText('청동 간수')
  await photo('bronze-warden', nameplate)
  await page.locator('#help').tap()
  const guide = page.locator('#battle-guide')
  await guide.getByRole('tab', { name: '적', exact: true }).tap()
  const enemies = guide.locator('#guide-enemies')
  await expect(enemies.locator('[data-enemy]')).toHaveCount(17)
  await expect(enemies.locator('[data-enemy="boss"]')).toContainText('열두째 층의 문지기')
  await expect(enemies.locator('[data-enemy="escort-guard"]')).toContainText('작은 시종')
  const lore = enemies.locator('[data-enemy="chain-warden"]')
  await expect(lore).toContainText('푸른 녹이 슨 청동 갑주')
  await expect(lore.locator('.codex-mechanic')).toContainText('방어에 5를 놓으면')
  await expect.poll(() => lore.locator('img').evaluate(image => image.naturalWidth)).toBeGreaterThan(0)
  await lore.scrollIntoViewIfNeeded()
  await photo('enemy-codex', lore)
  await guide.getByRole('tab', { name: '이번 등반', exact: true }).tap()
  const items = guide.locator('#guide-entries')
  await expect(items.getByText('간격자', { exact: true })).toHaveCount(1)
  const item = items.locator('[data-guide-name="약초 꾸러미"]')
  await expect(item).toContainText('상점에서 체력 4, 휴식에서 체력 5')
  await item.scrollIntoViewIfNeeded()
  await photo('item-codex', item)
  await guide.getByRole('button', { name: '닫기' }).tap()

  let won
  for (let seed = 0; seed < 128; seed++) {
    const start = beginMapAscent(seed, undefined, 'odd', 7)
    const battle = enterMapNode(start, availableMapNodes(start)[0].id)
    const candidate = playWith(battle, [6, 6, 6], ['attack', 'attack', 'attack'], { enemyHp: 1 })
    if (!rewardOffers(candidate).includes('tuning')) continue
    won = candidate
    break
  }
  expect(won).toBeTruthy()
  await resume(won)
  const reward = page.locator('#reward-cards [data-reward="tuning"]')
  await expect(reward).toContainText('장인의 끌')
  await photo('reward', reward)

  await resume(playWith(boss, [6, 6, 6], ['attack', 'attack', 'attack'], { enemyHp: 1 }))
  const relics = page.locator('#reward-cards')
  await expect(relics.locator('button')).toHaveCount(4)
  await expect(relics).toContainText('짓누르는 왕관')
  await expect(relics).toContainText('속죄의 왕홀')
  await photo('boss-relics', relics)

  const priest = encounter('escort', undefined, 7)
  await resume({ ...priest, battle: { ...priest.battle, escort: { hp: 5, bonus: 3 } } })
  await expect(nameplate).toHaveText('가면 사제')
  const guardName = page.locator('#escort-guard-name')
  await expect(guardName).toHaveText('작은 시종')
  await expect(guardName).toBeInViewport({ ratio: 1 })
  await expect(page.getByRole('img', { name: '작은 시종 체력 5' })).toBeVisible()

  await resume(encounter('chain-warden', 6, 6))
  await expect(nameplate).toHaveText('쇠사슬 집행관')
  await page.locator('#help').tap()
  await expect(guide.getByRole('tab', { name: '적', exact: true })).toBeHidden()
  await expect(guide.locator('[data-guide-name="제동 왕관"]')).toHaveCount(1)
})
