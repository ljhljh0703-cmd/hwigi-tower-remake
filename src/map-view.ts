import { availableMapNodes } from './ascent.ts'
import type { Ascent } from './ascent.ts'
import { enemyForMapNode, MAP_FLOORS } from './ascent-map.ts'
import type { MapNodeKind } from './ascent-map.ts'
import { SHOP_PRICES } from './map-treasure.ts'

export const MAP_NODE_ICONS: Record<MapNodeKind, string> = {
  fight: 'sword', elite: 'map-elite', rest: 'map-rest', boss: 'map-boss', event: 'map-event', shop: 'map-shop',
}
const names: Record<MapNodeKind, string> = {
  fight: '전투', elite: '강적', rest: '휴식', boss: '보스', event: '이벤트', shop: '상인',
}

export class ForkView {
  private readonly heading: HTMLElement
  private readonly options: HTMLElement

  constructor(panel: HTMLElement, private readonly status: { health: HTMLElement; floor: HTMLElement },
    private readonly icon: (name: string) => string, enter: (id: number) => void) {
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
    this.status.health.innerHTML = `${this.icon('heart')}${ascent.battle.playerHp}/${ascent.maxHp}`
    this.status.health.setAttribute('aria-label', `체력 ${ascent.battle.playerHp}/${ascent.maxHp}`)
    this.options.replaceChildren(...nodes.map((node) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `fork-card ${node.kind}`
      button.dataset.node = String(node.id)
      button.dataset.kind = node.kind
      const name = names[node.kind]
      const enemy = enemyForMapNode(node, ascent.route!.map.rules)
      const hint = enemy ? `<span class="fork-hint" aria-label="적 체력 ${enemy.hp}">${this.icon('heart')}${enemy.hp}</span>`
        : node.kind === 'shop' && ascent.route!.map.rules >= 3
          ? `<span class="fork-hint" aria-label="가격 ${SHOP_PRICES.kit}에서 ${SHOP_PRICES.artifact}동전">${this.icon('ascent-coin')}${SHOP_PRICES.kit}–${SHOP_PRICES.artifact}</span>` : ''
      button.innerHTML = `<span class="fork-symbol">${this.icon(MAP_NODE_ICONS[node.kind])}</span><strong>${name}</strong>${hint}`
      return button
    }))
  }

  focusFirst() {
    this.options.querySelector('button')?.focus()
  }
}
