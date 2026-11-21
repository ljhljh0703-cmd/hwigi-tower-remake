import Phaser from 'phaser'
import {
  assignDie, DIE_COUNT, ENEMY_HP, IMPACT, PLAYER_HP, intentOf, rerollDie,
  resolveTurn, startBattle, throwCounter, totals,
} from './combat.ts'
import type { Slot } from './combat.ts'
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
    attack: element<HTMLButtonElement>('assign-attack'),
    guard: element<HTMLButtonElement>('assign-guard'),
  },
  attackTotal: element('attack-total'),
  guardTotal: element('guard-total'),
  reroll: element<HTMLButtonElement>('reroll'),
  resolve: element<HTMLButtonElement>('resolve'),
  counter: element<HTMLButtonElement>('counter'),
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
let selected: number | null = null

class Arena extends Phaser.Scene {
  private player?: Phaser.GameObjects.Rectangle
  private enemy?: Phaser.GameObjects.Rectangle
  private single?: Phaser.GameObjects.Rectangle
  private combo: Phaser.GameObjects.Rectangle[] = []

  create() {
    this.enemy = this.add.rectangle(252, 63, 42, 49, 0x868686).setStrokeStyle(1, 0xc1c1c1)
    this.player = this.add.rectangle(105, 67, 29, 40, 0xd1d1d1)
    this.single = this.add.rectangle(252, 24, 42, 4, 0xd1d1d1)
    this.combo = [238, 252, 266].map((x) => this.add.rectangle(x, 24, 8, 4, 0xd1d1d1))
    this.refresh()
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
  button.addEventListener('click', () => {
    selected = selected === index ? null : index
    render()
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
    button.setAttribute('aria-pressed', String(selected === index))
    if (parent !== button.parentElement) parent.append(button)
  })

  const { attack, guard } = totals(battle.dice, battle.slots)
  ui.attackTotal.textContent = String(attack)
  ui.guardTotal.textContent = String(guard)
  ui.assign.attack.disabled = !planning || selected === null
  ui.assign.guard.disabled = !planning || selected === null
  ui.reroll.disabled = !planning || selected === null || battle.rerolled
  ui.reroll.textContent = battle.rerolled ? '다시 굴리기 사용함' : '다시 굴리기 (1회)'
  ui.resolve.disabled = !planning || battle.slots.includes(null)
}

function describeTurn() {
  const { phase, enemyHp, turn } = battle
  if (phase === 'counter') return '한 방을 막았습니다'
  if (phase === 'won') return '승리'
  if (phase === 'lost') return `패배 · 적 체력 ${enemyHp} 남음`
  return intentOf(turn) === 'impact'
    ? `한 방 · ${IMPACT} 피해 · 전부 막으면 반격`
    : '연타 · 4 피해씩 3번'
}

function describeExchange() {
  const exchange = battle.lastExchange
  if (!exchange) return '주사위를 고르고 공격이나 방어 칸을 누르세요.'
  const taken = exchange.hitsTaken.reduce((sum, value) => sum + value, 0)
  const parts = [`공격 ${exchange.dealt}`, `받은 피해 ${taken}`]
  if (exchange.hitsTaken.length === 3) parts[1] += ` (${exchange.hitsTaken.join(' + ')})`
  if (exchange.overflow) parts.push(`넘친 방어 ${exchange.overflow} 반격`)
  if (exchange.counter !== null) parts.push(`반격 주사위 ${exchange.counter}`)
  return parts.join(' · ')
}

function render() {
  const { phase, turn, playerHp, enemyHp, lastExchange } = battle
  ui.turn.textContent = `${turn}턴`
  ui.intent.textContent = describeTurn()
  ui.playerHp.value = playerHp
  ui.enemyHp.value = enemyHp
  ui.playerTotal.textContent = `${playerHp}/${PLAYER_HP}`
  ui.enemyTotal.textContent = `${enemyHp}/${ENEMY_HP}`
  ui.feedback.textContent = describeExchange()
  ui.awakening.hidden = !lastExchange?.awakened
  ui.awakening.textContent = lastExchange?.awakened
    ? '마타이오스: “이 수를 알아.” · 주사위 모두 6'
    : ''
  ui.planning.hidden = phase !== 'assign'
  ui.counter.hidden = phase !== 'counter'
  ui.retry.hidden = phase !== 'won' && phase !== 'lost'
  refreshDice()
  arena.refresh()
}

function place(slot: Slot) {
  if (selected === null) return
  const placed = selected
  battle = assignDie(battle, placed, slot)
  selected = null
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
ui.assign.attack.addEventListener('click', () => place('attack'))
ui.assign.guard.addEventListener('click', () => place('guard'))
ui.reroll.addEventListener('click', () => {
  if (selected === null) return
  battle = rerollDie(battle, selected)
  render()
  diceButtons[selected].focus()
})
ui.resolve.addEventListener('click', () => {
  battle = resolveTurn(battle)
  selected = null
  render()
  focusPhase()
})
ui.counter.addEventListener('click', () => {
  battle = throwCounter(battle)
  render()
  focusPhase()
})
ui.retry.addEventListener('click', () => {
  battle = freshBattle()
  selected = null
  render()
  focusPhase()
})
render()
