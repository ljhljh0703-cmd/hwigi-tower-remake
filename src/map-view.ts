import { ENEMY_SPRITES } from './arena.ts'
import { availableMapNodes } from './ascent.ts'
import type { Ascent } from './ascent.ts'
import { enemyForMapNode, MAP_FLOORS, RULES_SIX_BADGES } from './ascent-map.ts'
import type { MapNodeKind } from './ascent-map.ts'
import type { AscentEnemyId } from './enemy-roster.ts'
import { SHOP_PRICES } from './map-treasure.ts'
import { icon, pixelIcon } from './icons.ts'

export const MAP_NODE_ICONS: Record<MapNodeKind, string> = {
  fight: 'sword', elite: 'map-elite', rest: 'map-rest', boss: 'map-boss', event: 'map-event', shop: 'map-shop',
}
const names: Record<MapNodeKind, string> = {
  fight: '전투', elite: '강적', rest: '휴식', boss: '보스', event: '이벤트', shop: '상인',
}
const rulesSixBadges: Partial<Record<AscentEnemyId, { label: string }>> = RULES_SIX_BADGES

export class ForkView {
  private readonly heading: HTMLElement
  private readonly options: HTMLElement

  constructor(panel: HTMLElement, private readonly status: { health: HTMLElement; floor: HTMLElement },
    enter: (id: number) => void) {
    this.heading = panel.querySelector('#fork-heading')!
    this.options = panel.querySelector('#fork-options')!
    this.options.addEventListener('click', (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>('button[data-node]')
      if (button) enter(Number(button.dataset.node))
    })
  }

  render(ascent: Ascent) {
    const nodes = availableMapNodes(ascent)
    this.heading.textContent = nodes.length === 2 ? '두 갈래 길' : '다음 층'
    this.status.floor.textContent = `${nodes[0]?.floor ?? 1}/${MAP_FLOORS}층`
    this.status.health.innerHTML = `${icon('heart')}${ascent.battle.playerHp}/${ascent.maxHp}`
    this.status.health.setAttribute('aria-label', `체력 ${ascent.battle.playerHp}/${ascent.maxHp}`)
    this.options.replaceChildren(...nodes.map((node) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `fork-card ${node.kind}`
      button.dataset.node = String(node.id)
      button.dataset.kind = node.kind
      const name = names[node.kind]
      const enemy = enemyForMapNode(node, ascent.route!.map.rules)
      const rulesSix = ascent.route!.map.rules === 6
      const label = rulesSix && node.enemyId ? rulesSixBadges[node.enemyId]?.label : undefined
      const reward = rulesSix && node.kind === 'elite' ? `<span class="fork-relic" role="img" aria-label="유물 보상">${icon('map-reward')}</span>` : ''
      const hint = enemy ? `<span class="fork-hint" aria-label="${label ? `${label}, ` : ''}적 체력 ${enemy.hp}">${icon('heart')}${enemy.hp}</span>`
        : node.kind === 'shop' && ascent.route!.map.rules >= 3
          ? `<span class="fork-hint" aria-label="가격 ${SHOP_PRICES.kit}에서 ${SHOP_PRICES.artifact}동전">${icon('ascent-coin')}${SHOP_PRICES.kit}–${SHOP_PRICES.artifact}</span>` : ''
      const portrait = enemy
        ? `<img class="fork-portrait" alt="" src="${new URL(`art/${ENEMY_SPRITES[enemy.id].name}-idle.png`, document.baseURI).href}">`
        : `<span class="fork-symbol">${pixelIcon(MAP_NODE_ICONS[node.kind])}</span>`
      button.innerHTML = `
        <span class="fork-visual" aria-hidden="true"><span class="fork-art">${portrait}</span></span>
        <span class="fork-caption"><strong>${node.enemyId === 'chain-warden' ? label ?? name : name}</strong>${hint}</span>
        ${reward}
      `
      return button
    }))
  }

  focusFirst() {
    this.options.querySelector('button')?.focus()
  }
}
