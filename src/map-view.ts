import { ENEMY_SPRITES, ESCORT_SPRITE, upperSprites } from './arena.ts'
import { availableMapNodes, enterMapNode } from './ascent.ts'
import type { Ascent } from './ascent.ts'
import { attackFor, enemyIntentAt } from './combat.ts'
import type { MapNode, MapNodeKind } from './ascent-map.ts'
import { enemyBadge } from './enemy-codex.ts'
import type { AscentEnemyId } from './enemy-roster.ts'
import { SHOP_PRICES } from './map-treasure.ts'
import { icon, pixelIcon } from './icons.ts'
import { formationActions, livingEnemies } from './upper-combat.ts'

export const MAP_NODE_ICONS: Record<MapNodeKind, string> = {
  fight: 'sword', elite: 'map-elite', rest: 'map-rest', boss: 'map-boss', event: 'map-event', shop: 'map-shop',
}
const names: Record<MapNodeKind, string> = {
  fight: '전투', elite: '강적', rest: '휴식', boss: '보스', event: '이벤트', shop: '상인',
}
export function enemyPortrait(enemy: string, className: string) {
  if (Object.values(upperSprites).includes(enemy)) return spritePortrait(enemy, className)
  const sprite = enemy === 'escort-guard' ? ESCORT_SPRITE : ENEMY_SPRITES[enemy as AscentEnemyId]
  return sprite ? spritePortrait(sprite.name, className) : ''
}

function spritePortrait(sheet: string, className: string) {
  const url = new URL(`art/${sheet}-idle.png`, document.baseURI)
  return `<img class="${className}" alt="" src="${url.href}">`
}

function roomPortrait(room: Ascent, className: string) {
  const formation = room.battle.formation
  const enemies = formation ? livingEnemies(formation) : []
  const role = (enemies.find(enemy => enemy.id === 'gatekeeper') ?? enemies[0])?.id
  return role ? spritePortrait(upperSprites[role], className) : enemyPortrait(room.enemy.id, className)
}

function firstAttack(room: Ascent) {
  const intent = enemyIntentAt(room.battle)
  const { totalDamage } = room.battle.formation ? formationActions(room.battle.formation) : attackFor(room.battle, intent)
  return `<span aria-label="첫 턴 공격 ${totalDamage}">${icon(totalDamage > 0 ? 'sword' : 'charge')}${totalDamage}</span>`
}

export class ForkView {
  private readonly heading: HTMLElement
  private readonly options: HTMLElement
  constructor(panel: HTMLElement, enter: (id: number) => void) {
    this.heading = panel.querySelector('#fork-heading')!
    this.options = panel.querySelector('#fork-options')!
    this.options.addEventListener('click', (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>('button[data-node]')
      if (!panel.hidden && button) enter(Number(button.dataset.node))
    })
  }

  render(ascent: Ascent) {
    const nodes = availableMapNodes(ascent)
    this.heading.textContent = nodes.length === 2 ? '두 갈래 길' : '다음 층'
    this.options.replaceChildren(...nodes.map((node) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `fork-card ${node.kind}`
      button.dataset.node = String(node.id)
      button.dataset.kind = node.kind
      const name = names[node.kind]
      const rules = ascent.route!.map.rules
      const entered = enterMapNode(ascent, node.id)
      const enemy = entered.route?.screen === 'battle' ? entered.enemy : undefined
      const rulesSix = rules >= 6
      const formation = entered.battle.formation
      const label = formation ? `전위·후위 ${livingEnemies(formation).length}마리` : rulesSix && node.enemyId ? enemyBadge(node.enemyId, rules).label : undefined
      const reward = rulesSix && node.kind === 'elite' ? `<span class="fork-relic" role="img" aria-label="유물 보상">${icon('map-relic')}</span>` : ''
      const hint = enemy ? `<span class="fork-hint"><span aria-label="${label ? `${label}, ` : ''}적 체력 ${enemy.hp}">${icon('heart')}${enemy.hp}</span>${firstAttack(entered)}</span>`
        : node.kind === 'shop' && ascent.route!.map.rules >= 3
          ? `<span class="fork-hint" aria-label="가격 ${SHOP_PRICES.kit}에서 ${rules === 7 ? SHOP_PRICES.rare : SHOP_PRICES.artifact}동전">${icon('ascent-coin')}${SHOP_PRICES.kit}–${rules === 7 ? SHOP_PRICES.rare : SHOP_PRICES.artifact}</span>` : ''
      const portrait = enemy
        ? roomPortrait(entered, 'fork-portrait')
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
