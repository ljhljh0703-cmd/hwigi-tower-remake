import Phaser from 'phaser'
import {
  assignDie, DIE_COUNT, ENEMY_HP, PLAYER_HP, incomingAttack, intentOf, rerollDice,
  resolveTurn, spinCounter, startBattle, totals,
} from './combat.ts'
import { bindDiceInput } from './dice-drag.ts'
import { CounterRoulette } from './counter-roulette.ts'
import type { DropZone } from './dice-drag.ts'
import './style.css'

function element<T extends HTMLElement>(id: string): T {
  return document.querySelector<T>(`#${id}`)!
}

const ui = {
  turn: element('turn'),
  intent: element('intent'),
  playerHp: element<HTMLMeterElement>('player-hp'),
  enemyHp: element<HTMLMeterElement>('enemy-hp'),
  playerTotal: element('player-total'),
  enemyTotal: element('enemy-total'),
  feedback: element('feedback'),
  awakening: element('awakening'),
  planning: element('planning'),
  dice: {
    pool: element('pool-dice'),
    attack: element('attack-dice'),
    guard: element('guard-dice'),
  },
  assign: {
    pool: element<HTMLButtonElement>('assign-pool'),
    attack: element<HTMLButtonElement>('assign-attack'),
    guard: element<HTMLButtonElement>('assign-guard'),
  },
  attackTotal: element('attack-total'),
  guardTotal: element('guard-total'),
  reroll: element<HTMLButtonElement>('reroll'),
  resolve: element<HTMLButtonElement>('resolve'),
  counter: element<HTMLButtonElement>('counter'),
  counterPanel: element('counter-panel'),
  retry: element<HTMLButtonElement>('retry'),
}

const seedParam = new URLSearchParams(window.location.search).get('seed')
const fixedSeed = seedParam !== null && /^\d{1,10}$/.test(seedParam) && Number(seedParam) <= 0xffffffff
  ? Number(seedParam)
  : null

function freshBattle() {
  return startBattle(fixedSeed ?? crypto.getRandomValues(new Uint32Array(1))[0])
}

let battle = freshBattle()
const selected = new Set<number>()
const roulette = new CounterRoulette(ui.counterPanel, ui.counter)

class Arena extends Phaser.Scene {
  private player?: Phaser.GameObjects.Rectangle
  private enemy?: Phaser.GameObjects.Rectangle
  private mataios?: Phaser.GameObjects.Rectangle
  private single?: Phaser.GameObjects.Rectangle
  private combo: Phaser.GameObjects.Rectangle[] = []

  create() {
    this.enemy = this.add.rectangle(252, 63, 42, 49, 0x868686).setStrokeStyle(1, 0xc1c1c1)
    this.player = this.add.rectangle(105, 67, 29, 40, 0xd1d1d1)
    this.mataios = this.add.rectangle(55, 72, 20, 30, 0xa9a9a9).setVisible(false)
    this.single = this.add.rectangle(252, 24, 42, 4, 0xd1d1d1)
    this.combo = [238, 252, 266].map((x) => this.add.rectangle(x, 24, 8, 4, 0xd1d1d1))
    this.refresh()
  }

  counterStrike(joint: boolean) {
    const { player, enemy, mataios } = this
    if (!player || !enemy || !mataios) return

    this.tweens.add({ targets: player, x: 214, duration: 128, ease: 'Cubic.In', yoyo: true })
    if (joint) {
      mataios.setVisible(true)
      this.tweens.add({ targets: mataios, x: 192, duration: 144, ease: 'Cubic.In', yoyo: true })
    }
    this.tweens.add({
      targets: enemy, x: joint ? 274 : 264, delay: 128, duration: 68, yoyo: true,
      onStart: () => { enemy.setFillStyle(0xe9e9e9) },
      onComplete: () => { enemy.setFillStyle(0x868686) },
    })
  }

  finishStrike() {
    if (!this.player || !this.enemy || !this.mataios) return
    this.tweens.killTweensOf([this.player, this.enemy, this.mataios])
    this.player.setX(105)
    this.enemy.setX(252).setFillStyle(0x868686)
    this.mataios.setX(55).setVisible(false)
  }

  refresh() {
    const planning = battle.phase === 'assign'
    const heavy = intentOf(battle.turn) === 'impact'
    this.player?.setVisible(battle.playerHp > 0)
    this.enemy?.setVisible(battle.enemyHp > 0)
    this.single?.setVisible(planning && heavy)
    this.combo.forEach((shape) => shape.setVisible(planning && !heavy))
  }
}

const arena = new Arena()
new Phaser.Game({
  type: Phaser.CANVAS,
  backgroundColor: '#292929',
  parent: 'arena',
  width: 360,
  height: 105,
  scene: arena,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  audio: { noAudio: true },
})

const diceButtons = Array.from({ length: DIE_COUNT }, (_, index) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'die'
  button.id = `die-${index}`
  bindDiceInput(button, {
    select: () => {
      if (!selected.delete(index)) selected.add(index)
      render()
    },
    lift: () => {
      const indices = selected.has(index) ? [...selected].sort((a, b) => a - b) : [index]
      return { indices, faces: indices.map((die) => battle.dice[die]).join('  ') }
    },
    drop: (indices, zone) => place(indices, zone),
  })
  return button
})

function refreshDice() {
  const planning = battle.phase === 'assign'
  diceButtons.forEach((button, index) => {
    const value = battle.dice[index]
    const slot = battle.slots[index]
    const parent = ui.dice[slot ?? 'pool']
    button.textContent = String(value)
    const place = slot === 'attack' ? '공격' : slot === 'guard' ? '방어' : '미배치'
    button.setAttribute('aria-label', `주사위 ${index + 1}, ${value}, ${place}`)
    button.setAttribute('aria-pressed', String(selected.has(index)))
    if (parent !== button.parentElement) parent.append(button)
  })

  const { attack, guard } = totals(battle.dice, battle.slots)
  ui.attackTotal.textContent = String(attack)
  ui.guardTotal.textContent = String(guard)
  const canPlace = planning && selected.size > 0
  ui.assign.pool.disabled = !canPlace || ![...selected].some((index) => battle.slots[index] !== null)
  ui.assign.attack.disabled = !canPlace
  ui.assign.guard.disabled = !canPlace
  ui.reroll.disabled = !canPlace || battle.rerolled
  ui.reroll.textContent = battle.rerolled
    ? '다시 굴리기 사용함'
    : selected.size ? `다시 굴리기 (${selected.size}개)` : '다시 굴리기 (1회)'
  ui.resolve.disabled = !planning || battle.slots.includes(null)
}

function describeTurn() {
  const { phase, enemyHp, turn } = battle
  if (phase === 'counter') return '완벽 방어'
  if (phase === 'won') return '승리'
  if (phase === 'lost') return `패배 · 적 체력 ${enemyHp} 남음`
  const { hits, totalDamage } = incomingAttack(turn)
  const attack = hits.length === 1 ? `한 방 · ${totalDamage} 피해` : `연타 · ${hits.join('+')} 피해`
  return `${attack} · 방어 ${totalDamage}면 룰렛`
}

function describeExchange() {
  const exchange = battle.lastExchange
  if (!exchange) return '주사위를 끌어 놓거나, 여러 개를 고른 뒤 칸을 누르세요.'
  const taken = exchange.hitsTaken.reduce((sum, value) => sum + value, 0)
  const parts = [`공격 ${exchange.dealt}`, `받은 피해 ${taken}`]
  if (exchange.hitsTaken.length === 3) parts[1] += ` (${exchange.hitsTaken.join(' + ')})`
  if (exchange.counter) {
    const attack = exchange.counter.joint ? '마타이오스와 합공' : '반격'
    parts.push(`${attack} ${exchange.counter.damage}`)
  }
  return parts.join(' · ')
}

function updateEnemyHp(enemyHp: number) {
  ui.enemyHp.value = enemyHp
  ui.enemyTotal.textContent = `${enemyHp}/${ENEMY_HP}`
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((finish) => window.setTimeout(finish, milliseconds))
}

function render() {
  const { phase, turn, playerHp, enemyHp, lastExchange } = battle
  ui.turn.textContent = `${turn}턴`
  ui.intent.textContent = describeTurn()
  ui.playerHp.value = playerHp
  ui.playerTotal.textContent = `${playerHp}/${PLAYER_HP}`
  updateEnemyHp(enemyHp)
  ui.feedback.textContent = describeExchange()
  ui.awakening.hidden = !lastExchange?.awakened
  ui.awakening.textContent = lastExchange?.awakened
    ? '마타이오스: “이 수를 알아.” · 주사위 모두 6'
    : ''
  ui.planning.hidden = phase !== 'assign'
  roulette.setVisible(phase === 'counter')
  ui.retry.hidden = phase !== 'won' && phase !== 'lost'
  refreshDice()
  arena.refresh()
}

function place(indices: readonly number[], zone: DropZone) {
  if (!indices.length || battle.phase !== 'assign') return
  const slot = zone === 'pool' ? null : zone
  for (const index of indices) battle = assignDie(battle, index, slot)
  selected.clear()
  render()
  const unassigned = battle.slots.indexOf(null)
  if (unassigned < 0) ui.resolve.focus()
  else diceButtons[unassigned].focus()
}

function focusPhase() {
  if (battle.phase === 'counter') ui.counter.focus()
  else if (battle.phase === 'assign') diceButtons[0].focus()
  else ui.retry.focus()
}

ui.playerHp.max = PLAYER_HP
ui.enemyHp.max = ENEMY_HP
for (const zone of ['pool', 'attack', 'guard'] as const) {
  ui.assign[zone].addEventListener('click', () => place([...selected], zone))
}
ui.reroll.addEventListener('click', () => {
  const first = selected.values().next().value
  if (first === undefined) return
  battle = rerollDice(battle, [...selected])
  render()
  diceButtons[first].focus()
})
ui.resolve.addEventListener('click', () => {
  battle = resolveTurn(battle)
  selected.clear()
  render()
  focusPhase()
})
ui.counter.addEventListener('click', async () => {
  if (battle.phase !== 'counter' || ui.counter.disabled) return
  const next = spinCounter(battle)
  const reward = next.lastExchange?.counter
  if (!reward) return

  const animate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  await roulette.reveal(reward, animate)
  if (animate) {
    arena.counterStrike(reward.joint)
    await wait(145)
  }
  updateEnemyHp(next.enemyHp)
  await wait(reward.joint ? 1000 : 700)
  arena.finishStrike()
  battle = next
  render()
  focusPhase()
})
ui.retry.addEventListener('click', () => {
  battle = freshBattle()
  selected.clear()
  render()
  focusPhase()
})
render()
