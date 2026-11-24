import { availableMapNodes } from './ascent.ts'
import type { Ascent } from './ascent.ts'
import { enemyForMapNode, MAP_FLOORS, MAP_START, nextMapNodes } from './ascent-map.ts'
import type { MapNode, MapNodeKind } from './ascent-map.ts'
import { attackFor, enemyIntentAt } from './combat.ts'
import { healingFor, treasureOffers } from './map-treasure.ts'
import { startYachtBattle } from './yacht-combat.ts'

export const MAP_NODE_ICONS: Record<MapNodeKind, string> = { fight: 'sword', elite: 'map-elite', rest: 'map-rest', boss: 'map-boss', event: 'map-event', shop: 'map-shop' }
export const MAP_NODE_NAMES: Record<MapNodeKind, string> = { fight: '일반 전투', elite: '정예', rest: '정비', boss: '보스', event: '사건', shop: '장터 경유' }
const statusNames = { current: '현재', visited: '지나옴', available: '이동 가능', missed: '지나친 갈래', locked: '잠김' }
const statusIcons = { current: 'map-pin', visited: 'map-check', available: 'next', missed: '', locked: 'lock' }
const columns = [100, 240, 170]
const rowHeight = 78

function position(floor: number, lane: number) {
  return [columns[lane], (MAP_FLOORS - floor + 0.5) * rowHeight]
}

export class MapView {
  private readonly scroll: HTMLElement
  private readonly graph: HTMLElement
  private readonly preview: HTMLElement
  private readonly confirm: HTMLButtonElement
  private route?: Ascent['route']

  constructor(panel: HTMLElement, private readonly status: { health: HTMLElement; floor: HTMLElement }, private readonly icon: (name: string) => string, select: (id: number) => void) {
    this.scroll = panel.querySelector('#map-scroll')!
    this.graph = panel.querySelector('#map-graph')!
    this.preview = panel.querySelector('#map-preview')!
    this.confirm = panel.querySelector('#map-confirm')!
    this.graph.addEventListener('click', (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>('button[data-node]')
      if (button) select(Number(button.dataset.node))
    })
  }

  private drawGraph(route: NonNullable<Ascent['route']>, available: readonly MapNode[]) {
    const { map, completed } = route
    const current = completed.at(-1) ?? MAP_START
    const floor = completed.length
    const travelled = [MAP_START, ...completed]
    const ready = new Set(available.map(({ id }) => id))
    const edges = [MAP_START, ...map.nodes.map(({ id }) => id)].flatMap((id) => {
      const from = map.byId[id]
      const [x1, y1] = position(from?.floor ?? 0, from?.lane ?? 2)
      return nextMapNodes(map, id).map((to) => {
        const [x2, y2] = position(to.floor, to.lane)
        const used = travelled[to.floor - 1] === id && travelled[to.floor] === to.id
        const status = used ? 'visited' : id === current ? 'available' : (from?.floor ?? 0) < floor ? 'missed' : 'locked'
        return `<line class="${status}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`
      })
    })
    const levels = Array.from({ length: MAP_FLOORS }, (_, index) => {
      const level = index + 1
      const [, y] = position(level, 2)
      return `<span class="map-level" aria-hidden="true" style="--y:${y}px">${level}</span>`
    })
    const nodes = map.nodes.map((node) => {
      const [x, y] = position(node.floor, node.lane)
      const status = node.id === current ? 'current' : completed.includes(node.id) ? 'visited'
        : node.floor <= floor ? 'missed' : ready.has(node.id) ? 'available' : 'locked'
      const name = `${node.floor}층 ${MAP_NODE_NAMES[node.kind]}, ${statusNames[status]}`
      const marker = statusIcons[status]
      return `<button type="button" data-node="${node.id}" class="map-node ${status}" aria-label="${name}" aria-pressed="false" style="--x:${x / 3.2}%;--y:${y}px">${this.icon(MAP_NODE_ICONS[node.kind])}${marker ? `<span class="map-marker">${this.icon(marker)}</span>` : ''}</button>`
    })
    this.graph.style.setProperty('--map-height', `${(MAP_FLOORS + 1) * rowHeight}px`)
    const [, startY] = position(0, 2)
    this.graph.innerHTML = `
      <svg class="map-lines" viewBox="0 0 320 ${(MAP_FLOORS + 1) * rowHeight}" preserveAspectRatio="none" aria-hidden="true">${edges.join('')}</svg>
      ${levels.join('')}${nodes.join('')}
      <span class="map-node map-start ${current === MAP_START ? 'current' : 'visited'}" role="img" aria-label="출발점" style="--x:${columns[2] / 3.2}%;--y:${startY}px">${this.icon('map-pin')}</span>`
  }

  render(ascent: Ascent, selected: number | undefined, center: boolean, reduced: boolean) {
    const { route, maxHp, battle } = ascent
    if (!route) return
    const available = availableMapNodes(ascent)
    if (this.route?.map !== route.map || this.route.completed !== route.completed) {
      this.drawGraph(route, available)
      this.route = route
      center = true
    }
    const node = selected === undefined ? available[0] : route.map.byId[selected]
    const reachable = available.some(({ id }) => id === node?.id)
    this.graph.querySelectorAll<HTMLButtonElement>('button[data-node]').forEach((button) => {
      button.setAttribute('aria-pressed', String(Number(button.dataset.node) === node?.id))
    })
    this.confirm.disabled = !reachable
    this.confirm.setAttribute('aria-label', node ? `${node.floor}층 ${MAP_NODE_NAMES[node.kind]}으로 이동 확정` : '이동 확정')
    const life = this.status.health
    life.innerHTML = `${this.icon('heart')} ${battle.playerHp}/${maxHp}`
    life.setAttribute('aria-label', `체력 ${battle.playerHp}/${maxHp}`)
    this.status.floor.textContent = `${route.completed.length}/${MAP_FLOORS} 층`
    if (node) this.preview.innerHTML = this.describe(ascent, node, reachable)
    if (!center) return
    const [, currentY] = position(route.completed.length, 2)
    const [, nextY] = position(route.completed.length + 1, 2)
    this.scroll.scrollTo({ top: (currentY + nextY) / 2 - this.scroll.clientHeight / 2, behavior: reduced ? 'instant' : 'smooth' })
  }

  focusFirst() {
    this.graph.querySelector<HTMLButtonElement>('button.available')?.focus({ preventScroll: true })
  }

  private describe(ascent: Ascent, node: MapNode, reachable: boolean): string {
    const initial = `<strong>${this.icon(MAP_NODE_ICONS[node.kind])}${node.floor}/${MAP_FLOORS}</strong>`
    if (!reachable) return `${initial}<span role="img" aria-label="이동 불가">${this.icon('lock')}</span>`
    if (node.kind === 'shop') return `${initial}<span role="img" aria-label="장터 경유">${this.icon('next')}</span>`
    if (node.kind === 'event') {
      const cost = node.event === 'flag' ? '−3' : node.event === 'pulley' ? '−2' : '+3'
      return `${initial}<span role="img" aria-label="선택 ${treasureOffers(ascent, node).length + 1}개, 체력 ${cost}">${this.icon('map-reward')}${treasureOffers(ascent, node).length + 1} ${this.icon('heart')}${cost}</span>`
    }
    if (node.kind === 'rest') return ascent.route?.map.rules === 2
      ? `${initial}<span role="img" aria-label="치료 도구와 숫돌">${this.icon('heart')}${ascent.battle.playerHp}→${Math.min(ascent.maxHp, ascent.battle.playerHp + healingFor('kit'))} ${this.icon('treasure-whetstone')}</span>`
      : `${initial}<span role="img" aria-label="정비 경유">${this.icon('next')}</span>`
    const enemy = enemyForMapNode(node, ascent.route!.map.rules)!
    if (node.kind === 'boss') return `${initial}<span role="img" aria-label="체력 ${enemy.hp}, 힘 모으기와 봉인">${this.icon('heart')}${enemy.hp} ${this.icon('charge')}${this.icon('seal')}</span>`
    const { battle, unlocks } = ascent
    const first = startYachtBattle(node.battleSeed, battle.playerHp, false, false, undefined, enemy, unlocks.length * enemy.attackPerUnlock)
    const { hits } = attackFor(first, enemyIntentAt(first))
    const mechanic = enemy.id === 'reaction' ? 'reaction' : enemy.id === 'escort' ? 'steal' : enemy.id
    return `${initial}<span role="img" aria-label="${hits.length > 1 ? '첫 연타 피해' : '첫 공격 피해'} ${hits.join(' + ')}">${this.icon(mechanic)} ${hits.join(' + ')}</span><span role="img" aria-label="보상 세 장 중 하나">${this.icon('map-reward')}3→1</span>`
  }
}
