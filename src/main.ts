import Phaser from 'phaser'
import { ASCENT_ENEMIES, beginAscent, FIGHT_COUNT, nextAscentFight, resolveAscentTurn } from './ascent.ts'
import type { Ascent } from './ascent.ts'
import { assignDie, DIE_COUNT, incomingAttack, intentOf, totals } from './combat.ts'
import { offerPerks, START_PERKS } from './perks.ts'
import {
  rerollYachtDice, spendExtraReroll, spinYachtCounter, yachtAttackBonus, yachtCounterRewards, yachtRerollCost,
} from './yacht-combat.ts'
import type { YachtBattle } from './yacht-combat.ts'
import { bindDiceInput } from './dice-drag.ts'
import { CounterRoulette } from './counter-roulette.ts'
import type { DropZone } from './dice-drag.ts'
import './style.css'

function element<T extends HTMLElement>(id: string): T {
  return document.querySelector<T>(`#${id}`)!
}

const ui = {
  perks: element('perks'),
  battle: element('battle'),
  fight: element('fight'),
  activePerk: element('active-perk'),
  turn: element('turn'),
  intent: element('intent'),
  playerHp: element<HTMLMeterElement>('player-hp'),
  enemyHp: element<HTMLMeterElement>('enemy-hp'),
  playerTotal: element('player-total'),
  enemyTotal: element('enemy-total'),
  feedback: element('feedback'),
  awakening: element('awakening'),
  newUnlock: element('new-unlock'),
  ownedUnlocks: element('owned-unlocks'),
  result: element('result'),
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
  extraReroll: element<HTMLButtonElement>('extra-reroll'),
  resolve: element<HTMLButtonElement>('resolve'),
  counter: element<HTMLButtonElement>('counter'),
  counterPanel: element('counter-panel'),
  next: element<HTMLButtonElement>('next'),
  retry: element<HTMLButtonElement>('retry'),
}

const seedParam = new URLSearchParams(window.location.search).get('seed')
const fixedSeed = seedParam !== null && /^\d{1,10}$/.test(seedParam) && Number(seedParam) <= 0xffffffff
  ? Number(seedParam)
  : null

const unlockInfo = {
  triple: { icon: '🎲+1', label: '네 번째 주사위' },
  straight: { icon: '⟳', label: '전투당 재굴림 주사위 1회' },
} as const

let ascent: Ascent | null = null
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

  refresh(battle = ascent?.battle) {
    if (!battle) return
    const hitCount = battle.phase === 'assign' ? incomingAttack(battle).hits.length : 0
    const comboCount = hitCount > 1 ? hitCount : 0
    this.player?.setVisible(battle.playerHp > 0)
    this.enemy?.setVisible(battle.enemyHp > 0)
    this.single?.setVisible(hitCount === 1)
    if (!this.single) return

    while (this.combo.length < comboCount) {
      this.combo.push(this.add.rectangle(252, 24, 8, 4, 0xd1d1d1))
    }
    this.combo.forEach((shape, index) => {
      shape.setX(252 + (index - (comboCount - 1) / 2) * 14).setVisible(index < comboCount)
    })
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
  audio: { noAudio: true },
})

const diceButtons = Array.from({ length: DIE_COUNT + 1 }, (_, index) => {
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
      return { indices, faces: indices.map((die) => ascent?.battle.dice[die]).join('  ') }
    },
    drop: (indices, zone) => place(indices, zone),
  })
  return button
})

function refreshDice(battle: YachtBattle) {
  const planning = battle.phase === 'assign'
  const { faceBonus, faceCap } = START_PERKS.reroll
  diceButtons.forEach((button, index) => {
    const value = battle.dice[index]
    button.hidden = value === undefined
    if (value === undefined) return
    button.disabled = !planning
    const slot = battle.slots[index]
    const parent = ui.dice[slot ?? 'pool']
    button.textContent = String(value)
    const replacedFace = battle.perk === 'face' && index === 0
    const boostedFace = battle.devilBoostedDice?.includes(index) ?? false
    button.classList.toggle('altered-face', replacedFace || boostedFace)
    const place = slot === 'attack' ? '공격' : slot === 'guard' ? '방어' : '미배치'
    let faceLabel = ''
    if (replacedFace) faceLabel = `, 1면을 ${START_PERKS.face.replacement}로 교체`
    if (boostedFace) faceLabel = `, 유료 재굴림으로 눈 +${faceBonus}`
    button.setAttribute('aria-label', `주사위 ${index + 1}, ${value}, ${place}${faceLabel}`)
    button.setAttribute('aria-pressed', String(selected.has(index)))
    if (parent !== button.parentElement) parent.append(button)
  })

  const { attack, guard } = totals(battle.dice, battle.slots)
  ui.attackTotal.textContent = String(attack + yachtAttackBonus(battle))
  ui.guardTotal.textContent = String(guard)
  const canPlace = planning && selected.size > 0
  ui.assign.pool.disabled = !canPlace || ![...selected].some((index) => battle.slots[index] !== null)
  ui.assign.attack.disabled = !canPlace
  ui.assign.guard.disabled = !canPlace
  const rerollCost = yachtRerollCost(battle)
  ui.reroll.disabled = !canPlace || rerollCost === null || rerollCost >= battle.playerHp
  ui.reroll.textContent = rerollCost ? `⚄+${faceBonus}≤${faceCap} ♥-${rerollCost}` : `다시 굴리기 (${Number(rerollCost === 0)})`
  if (rerollCost) ui.reroll.setAttribute('aria-label', `다시 굴리기, 눈 +${faceBonus}, 최대 ${faceCap}, 체력 ${rerollCost} 소모`)
  else ui.reroll.removeAttribute('aria-label')
  ui.extraReroll.hidden = !battle.extraRerollAvailable && !battle.extraRerollSpent
  ui.extraReroll.disabled = !planning || selected.size !== 1 || !battle.rerolled || !battle.extraRerollAvailable
  const extra = Number(battle.extraRerollAvailable)
  ui.extraReroll.textContent = `⟳ (${extra})`
  ui.extraReroll.setAttribute('aria-label', `해금 재굴림 (${extra})`)
  ui.resolve.disabled = !planning || battle.slots.includes(null)
}

function renderIntent(battle: YachtBattle) {
  const { phase } = battle
  ui.intent.hidden = phase === 'won' || phase === 'lost'
  if (phase === 'counter') {
    ui.intent.textContent = '⛨ ✓'
    ui.intent.setAttribute('aria-label', '정확 방어')
  } else if (phase === 'assign') {
    const { hits } = incomingAttack(battle)
    const groups: { damage: number; count: number }[] = []
    for (const hit of hits) {
      const group = groups.at(-1)
      if (group?.damage === hit) group.count++
      else groups.push({ damage: hit, count: 1 })
    }
    const damage = groups.map(({ damage, count }) => count === 1 ? String(damage) : `${damage}×${count}`).join(' + ')
    const critical = intentOf(battle) === 'critical'
    ui.intent.textContent = `${critical ? '✸' : '⚔︎'} ${damage}`
    ui.intent.setAttribute('aria-label', `${critical ? '치명 일격' : '적 공격'} 피해 ${hits.join(', ')}`)
  }
}

function describeExchange(battle: YachtBattle) {
  const exchange = battle.lastExchange
  if (!exchange) return ''
  const taken = exchange.hitsTaken.reduce((sum, value) => sum + value, 0)
  const parts = [`⚔︎ ${exchange.dealt}`, `♥ −${taken}`]
  if (exchange.counter) {
    parts.push(`${exchange.counter.joint ? '⚔︎⚔︎' : '◎'} ${exchange.counter.damage}`)
  }
  return parts.join(' · ')
}

function updateEnemyHp(enemyHp: number) {
  ui.enemyHp.value = enemyHp
  ui.enemyTotal.textContent = `${enemyHp}/${ui.enemyHp.max}`
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((finish) => window.setTimeout(finish, milliseconds))
}

function render() {
  if (!ascent) return
  const { battle, fight, perk, maxHp, unlocks, newUnlock } = ascent
  const { phase, turn, playerHp, enemyHp, lastExchange } = battle
  const between = phase === 'won' && fight < FIGHT_COUNT
  const finished = phase === 'lost' || (phase === 'won' && !between)
  ui.perks.hidden = true
  ui.battle.hidden = false
  ui.fight.hidden = false
  ui.fight.textContent = `◇ ${fight}/${FIGHT_COUNT}`
  ui.fight.setAttribute('aria-label', `${FIGHT_COUNT}전투 중 ${fight}번째`)
  ui.activePerk.hidden = !perk
  if (perk) {
    ui.activePerk.textContent = START_PERKS[perk].icon
    ui.activePerk.setAttribute('aria-label', START_PERKS[perk].label)
  }
  ui.turn.hidden = phase === 'won' || phase === 'lost'
  ui.turn.textContent = `◷ ${turn}`
  ui.turn.setAttribute('aria-label', `${turn}턴`)
  renderIntent(battle)
  ui.playerHp.max = maxHp
  ui.playerHp.value = playerHp
  ui.playerTotal.textContent = `${playerHp}/${maxHp}`
  ui.enemyHp.max = ASCENT_ENEMIES[fight - 1].hp
  updateEnemyHp(enemyHp)
  ui.feedback.textContent = describeExchange(battle)
  ui.feedback.hidden = !lastExchange
  const awakenedDice = lastExchange?.awakenedDice
  ui.awakening.hidden = !awakenedDice
  ui.awakening.textContent = awakenedDice ? `✦ 🎲 → ${awakenedDice.join('·')}` : ''
  ui.newUnlock.hidden = !newUnlock
  ui.newUnlock.textContent = newUnlock ? unlockInfo[newUnlock].icon : ''
  ui.newUnlock.setAttribute('aria-label', newUnlock ? `${unlockInfo[newUnlock].label} 해금` : '')
  ui.planning.hidden = phase !== 'assign'
  roulette.setVisible(phase === 'counter' ? yachtCounterRewards(battle) : null)
  const priorUnlocks = unlocks.filter((hand) => hand !== newUnlock)
  ui.ownedUnlocks.hidden = !between || priorUnlocks.length === 0
  ui.ownedUnlocks.textContent = priorUnlocks.map((hand) => unlockInfo[hand].icon).join(' · ')
  ui.ownedUnlocks.setAttribute('aria-label', priorUnlocks.map((hand) => unlockInfo[hand].label).join(', '))
  const wins = phase === 'lost' ? fight - 1 : fight
  ui.result.hidden = !finished
  ui.result.textContent = `${phase === 'won' ? '✓' : '×'} ${wins}/${FIGHT_COUNT}`
  ui.result.setAttribute('aria-label', `등반 ${phase === 'won' ? '완주' : '실패'}, ${wins}승`)
  ui.next.hidden = !between
  ui.retry.hidden = !finished
  refreshDice(battle)
  arena.refresh(battle)
}

function showPerks(focus: boolean) {
  ascent = null
  selected.clear()
  roulette.setVisible(null)
  ui.battle.hidden = true
  ui.activePerk.hidden = true
  ui.fight.hidden = true
  ui.turn.hidden = true
  ui.perks.hidden = false
  const seed = fixedSeed ?? crypto.getRandomValues(new Uint32Array(1))[0]
  const buttons = offerPerks(seed).map((perk) => {
    const { icon, label } = START_PERKS[perk]
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = icon
    button.setAttribute('aria-label', label)
    button.title = label
    button.addEventListener('click', () => {
      ascent = beginAscent(seed, perk)
      render()
      focusPhase()
    })
    return button
  })
  ui.perks.replaceChildren(...buttons)
  if (focus) buttons[0].focus()
}

function place(indices: readonly number[], zone: DropZone) {
  if (!ascent || !indices.length || ascent.battle.phase !== 'assign') return
  const slot = zone === 'pool' ? null : zone
  let { battle } = ascent
  for (const index of indices) battle = assignDie(battle, index, slot)
  ascent = { ...ascent, battle }
  selected.clear()
  render()
  const unassigned = battle.slots.indexOf(null)
  if (unassigned < 0) ui.resolve.focus()
  else diceButtons[unassigned].focus()
}

function focusPhase() {
  if (!ascent) return
  if (ascent.battle.phase === 'counter') ui.counter.focus()
  else if (ascent.battle.phase === 'assign') diceButtons[0].focus()
  else if (!ui.next.hidden) ui.next.focus()
  else ui.retry.focus()
}

for (const zone of ['pool', 'attack', 'guard'] as const) {
  ui.assign[zone].addEventListener('click', () => place([...selected], zone))
}
function useReroll(extra: boolean) {
  const indices = [...selected]
  if (!ascent || indices.length === 0) return
  const battle = extra ? spendExtraReroll(ascent.battle, indices[0]) : rerollYachtDice(ascent.battle, indices)
  ascent = { ...ascent, battle }
  render()
  diceButtons[indices[0]].focus()
}

ui.reroll.addEventListener('click', () => useReroll(false))
ui.extraReroll.addEventListener('click', () => useReroll(true))
ui.resolve.addEventListener('click', () => {
  if (!ascent) return
  ascent = resolveAscentTurn(ascent)
  selected.clear()
  render()
  focusPhase()
})
ui.counter.addEventListener('click', async () => {
  if (!ascent || ascent.battle.phase !== 'counter' || ui.counter.disabled) return
  const next = spinYachtCounter(ascent.battle)
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
  ascent = { ...ascent, battle: next }
  render()
  focusPhase()
})
ui.next.addEventListener('click', () => {
  if (!ascent) return
  ascent = nextAscentFight(ascent)
  render()
  focusPhase()
})
ui.retry.addEventListener('click', () => showPerks(true))
showPerks(false)
