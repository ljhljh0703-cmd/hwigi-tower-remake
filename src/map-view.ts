import { ENEMY_SPRITES } from './arena.ts'
import { availableMapNodes, enterMapNode } from './ascent.ts'
import type { Ascent } from './ascent.ts'
import { attackFor, enemyIntentAt } from './combat.ts'
import { MAP_ENEMY_BADGES, RULES_SIX_BADGES } from './ascent-map.ts'
import type { MapNode, MapNodeKind } from './ascent-map.ts'
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
export const ENEMY_BADGES: Record<AscentEnemyId, { icon: string; label: string }> = {
  thorns: { icon: 'thorns', label: '가시 골렘' },
  lock: { icon: 'lock', label: '자물쇠' },
  freeze: { icon: 'freeze', label: '얼림' },
  rage: { icon: 'rage', label: '격분' },
  reaction: { icon: 'reaction', label: '반응' },
  vitality: { icon: 'vitality', label: '체력 비례 일격' },
  escort: { icon: 'escort', label: '호위와 주사위 빼앗기' },
  boss: { icon: 'charge', label: '힘 모으는 보스' },
  'chain-warden': RULES_SIX_BADGES['chain-warden'],
  ...MAP_ENEMY_BADGES,
}

function portraitFor(enemy: AscentEnemyId, className: string) {
  const url = new URL(`art/${ENEMY_SPRITES[enemy].name}-idle.png`, document.baseURI)
  return `<img class="${className}" alt="" src="${url.href}">`
}

function firstAttack(room: Ascent) {
  const intent = enemyIntentAt(room.battle)
  const { totalDamage } = attackFor(room.battle, intent)
  return `<span aria-label="첫 턴 공격 ${totalDamage}">${icon(totalDamage > 0 ? 'sword' : 'charge')}${totalDamage}</span>`
}

export class ForkView {
  private readonly heading: HTMLElement
  private readonly options: HTMLElement
  private readonly preview: HTMLElement
  private readonly previewContent: HTMLElement
  private readonly confirm: HTMLButtonElement
  private readonly map: HTMLElement
  private choice?: HTMLButtonElement
  private ascent?: Ascent

  constructor(private readonly panel: HTMLElement, enter: (id: number) => void) {
    this.heading = panel.querySelector('#fork-heading')!
    this.options = panel.querySelector('#fork-options')!
    this.preview = panel.querySelector('#fork-preview')!
    this.previewContent = panel.querySelector('#fork-preview-content')!
    this.confirm = panel.querySelector('#enter-room')!
    this.map = panel.querySelector('#tower-map')!
    this.options.addEventListener('click', (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>('button[data-node]')
      const node = this.ascent?.route?.map.byId[Number(button?.dataset.node)]
      if (!button || !node) return
      this.choose(button, node)
      if (event.detail === 0) this.confirm.focus()
    })
    this.confirm.addEventListener('click', () => {
      if (!this.panel.hidden && this.choice) enter(Number(this.choice.dataset.node))
    })
    document.addEventListener('click', (event) => {
      if (this.panel.hidden || !this.choice || !(event.target instanceof Element)) return
      if (!event.target.closest('.fork-card, #fork-preview, #tower-preview, button, a, dialog, #first-run-note')) this.clearChoice()
    })
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.panel.hidden && this.choice && !document.querySelector('dialog[open]')) {
        this.clearChoice()
      }
    })
  }

  private clearChoice() {
    if (this.preview.contains(document.activeElement)) this.choice?.focus({ preventScroll: true })
    this.choice?.setAttribute('aria-pressed', 'false')
    this.choice = undefined
    this.preview.hidden = true
  }

  private choose(button: HTMLButtonElement, node: MapNode) {
    const ascent = this.ascent!
    const room = enterMapNode(ascent, node.id)
    if (room === ascent) return
    this.choice?.setAttribute('aria-pressed', 'false')
    this.choice = button
    this.choice.setAttribute('aria-pressed', 'true')
    if (room.route?.screen === 'battle') {
      const { battle, enemy } = room
      const name = (battle.rulesSix && rulesSixBadges[enemy.id]?.label) || ENEMY_BADGES[enemy.id].label
      this.previewContent.innerHTML = `${portraitFor(enemy.id, 'fork-preview-portrait')}
        <div><strong>${name}</strong><div class="fork-preview-stats">
          <span aria-label="적 체력 ${battle.enemyHp}">${icon('heart')}${battle.enemyHp}</span>
          ${firstAttack(room)}
        </div></div>`
    } else {
      this.previewContent.innerHTML = `${pixelIcon(MAP_NODE_ICONS[node.kind])}<strong>${names[node.kind]}</strong>`
    }
    this.preview.hidden = false
  }

  render(ascent: Ascent) {
    this.clearChoice()
    this.ascent = ascent
    const nodes = availableMapNodes(ascent)
    const route = ascent.route!
    const last = route.completed.at(-1)
    const floors = Array.from({ length: 12 }, (_, index) => 12 - index)
    const x = (node: MapNode) => 30 + node.lane * 40
    const y = (node: MapNode) => 9 + (12 - node.floor) * 18
    const paths = route.map.nodes.flatMap(node => node.next.map(id => {
      const next = route.map.byId[id]
      return `<line x1="${x(node)}" y1="${y(node)}" x2="${x(next)}" y2="${y(next)}"></line>`
    })).join('')
    this.map.innerHTML = `<span class="tower-position">${last === undefined ? '입구' : `${route.map.byId[last].floor}층 통과`}</span>
      <div class="tower-grid"><svg class="tower-paths" viewBox="0 0 140 216" preserveAspectRatio="none" aria-hidden="true">${paths}</svg>
      ${floors.map(floor => `<div class="tower-floor" aria-label="${floor}층"><span>${floor}</span>${route.map.nodes.filter(node => node.floor === floor).map(node => {
        const special = node.enemyId === 'chain-warden' || node.kind === 'boss' ? 'boss' : node.kind
        const state = node.id === last ? 'current' : route.completed.includes(node.id) ? 'visited' : nodes.includes(node) ? 'next' : ''
        return `<span class="tower-node" style="--lane:${node.lane}" data-kind="${special}" data-state="${state}" role="img"
          aria-label="${floor}층 ${names[special]}${state === 'current' ? ', 현재 위치' : state === 'next' ? ', 진입 가능' : ''}">${icon(MAP_NODE_ICONS[special])}</span>`
      }).join('')}</div>`).join('')}</div><div class="tower-legend">${(['shop', 'elite', 'rest', 'boss'] as const)
        .map(kind => `<span>${icon(MAP_NODE_ICONS[kind])}${names[kind]}</span>`).join('')}</div>`
    this.heading.textContent = nodes.length === 2 ? '두 갈래 길' : '다음 층'
    this.options.replaceChildren(...nodes.map((node) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `fork-card ${node.kind}`
      button.dataset.node = String(node.id)
      button.dataset.kind = node.kind
      button.setAttribute('aria-pressed', 'false')
      button.setAttribute('aria-controls', this.preview.id)
      const name = names[node.kind]
      const rules = ascent.route!.map.rules
      const entered = enterMapNode(ascent, node.id)
      const enemy = entered.route?.screen === 'battle' ? entered.enemy : undefined
      const rulesSix = rules >= 6
      const label = rulesSix && node.enemyId ? rulesSixBadges[node.enemyId]?.label : undefined
      const reward = rulesSix && node.kind === 'elite' ? `<span class="fork-relic" role="img" aria-label="유물 보상">${icon('map-relic')}</span>` : ''
      const hint = enemy ? `<span class="fork-hint"><span aria-label="${label ? `${label}, ` : ''}적 체력 ${enemy.hp}">${icon('heart')}${enemy.hp}</span>${firstAttack(entered)}</span>`
        : node.kind === 'shop' && ascent.route!.map.rules >= 3
          ? `<span class="fork-hint" aria-label="가격 ${SHOP_PRICES.kit}에서 ${rules === 7 ? SHOP_PRICES.rare : SHOP_PRICES.artifact}동전">${icon('ascent-coin')}${SHOP_PRICES.kit}–${rules === 7 ? SHOP_PRICES.rare : SHOP_PRICES.artifact}</span>` : ''
      const portrait = enemy
        ? portraitFor(enemy.id, 'fork-portrait')
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
