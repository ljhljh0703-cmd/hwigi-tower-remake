import { beginAscent, FIGHT_COUNT, nextAscentFight, resolveAscentTurn } from './ascent.ts'
import type { Ascent } from './ascent.ts'
import {
  assignDie, attackFor, chargedStrikePreview, DIE_COUNT, dieFaceForSlot, enemyIntentAt, incomingAttack,
} from './combat.ts'
import type { Exchange, SlotTotals } from './combat.ts'
import { collectorBonus, offerPerks, START_PERKS } from './perks.ts'
import type { Parity } from './perks.ts'
import {
  bladeChargePreview, canReroll, rerollYachtDice, spendExtraReroll, spinYachtCounter, yachtAllocationTotals,
  yachtCounterRewards, yachtRerollCost,
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
  main: document.querySelector('main')!,
  perks: element('perks'),
  perkChoices: element('perk-choices'),
  battle: element('battle'),
  encounter: document.querySelector<HTMLElement>('.encounter')!,
  fight: element('fight'),
  activePerk: element('active-perk'),
  turn: element('turn'),
  intent: element('intent'),
  playerHp: element<HTMLMeterElement>('player-hp'),
  enemyHp: element<HTMLMeterElement>('enemy-hp'),
  enemyBadge: element('enemy-badge'),
  playerTotal: element('player-total'),
  enemyTotal: element('enemy-total'),
  feedback: element('feedback'),
  playerDamage: element('player-damage'),
  enemyDamage: element('enemy-damage'),
  awakening: element('awakening'),
  newUnlock: element('new-unlock'),
  unlockReveal: element('unlock-reveal'),
  ownedUnlocks: element('owned-unlocks'),
  ascentEvent: element('ascent-event'),
  eventFloor: element('event-floor'),
  result: element('result'),
  planning: element('planning'),
  dice: {
    pool: element('pool-dice'),
    attack: element('attack-dice'),
    guard: element('guard-dice'),
    escort: element('escort-dice'),
  },
  assign: {
    pool: element<HTMLButtonElement>('assign-pool'),
    attack: element<HTMLButtonElement>('assign-attack'),
    guard: element<HTMLButtonElement>('assign-guard'),
    escort: element<HTMLButtonElement>('assign-escort'),
  },
  attackTotal: element('attack-total'),
  attackMultiplier: element('attack-multiplier'),
  guardTotal: element('guard-total'),
  escortSlot: element('escort-slot'),
  escortHp: element('escort-hp'),
  escortTotal: element('escort-total'),
  reroll: element<HTMLButtonElement>('reroll'),
  rerollCount: element('reroll-count'),
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
  triple: { icon: 'die', value: '+1', label: '네 번째 주사위' },
  straight: { icon: 'reroll-die', value: '1', label: '전투당 재굴림 주사위 1회' },
} as const

function oathDescription(parity: string) {
  return `${parity} 눈을 공격에 놓으면 → 주사위마다 +${START_PERKS.oath.bonus}`
}

const perkDisplay = {
  shield: {
    value: `+${START_PERKS.shield.step}`, detail: `${icon('parry')}${icon('sword')}`,
    label: `정확히 막을 때마다 → 공격 +${START_PERKS.shield.step} 누적 (놓치면 0)`,
  },
  blade: {
    value: `×${START_PERKS.blade.multiplier}`, detail: `${icon('sword')} ${START_PERKS.blade.threshold}`,
    label: `공격에 놓은 눈이 ${START_PERKS.blade.threshold} 쌓이면 → 다음 공격 ${START_PERKS.blade.multiplier}배 (쓰거나 전투가 바뀌면 0)`,
  },
  collector: {
    value: `+${START_PERKS.collector.initial}~${START_PERKS.collector.maximum}`, detail: `${icon('die')}=${icon('die')}`,
    label: `같은 눈 2개 이상인 칸에 보너스. 처음 ${START_PERKS.collector.initial}, 새 족보(트리플·스트레이트 등) 첫 사용마다 +${START_PERKS.collector.step} (최대 +${START_PERKS.collector.maximum})`,
  },
  reroll: {
    value: '+1', detail: `${icon('heart')} −${START_PERKS.reroll.cost}`,
    label: `매 턴 기본 재굴림 후 → 1회 더 (체력 −${START_PERKS.reroll.cost})`,
  },
  oath: {
    value: `+${START_PERKS.oath.bonus}`, detail: '홀 / 짝',
    label: oathDescription('고른 홀·짝'),
  },
  counter: {
    value: `+${START_PERKS.counter.step}`, detail: `${icon('parry')}${icon('wheel')}`,
    label: `정확히 막아 룰렛을 돌릴 때마다 → 아이콘 없는 칸 중 가장 작은 숫자 +${START_PERKS.counter.step} (계속 쌓임)`,
  },
} as const

const parityLabels = { odd: '홀', even: '짝' } as const
const parityIcons = { odd: 'die', even: 'die-even' } as const

function icon(name: string) {
  return `<svg class="icon" aria-hidden="true"><use href="#icon-${name}"/></svg>`
}

const enemyBadges: Record<string, { icon: string; label: string }> = {
  thorns: { icon: 'thorns', label: '가시' },
  lock: { icon: 'lock', label: '자물쇠' },
  freeze: { icon: 'freeze', label: '얼림' },
  rage: { icon: 'rage', label: '격분' },
  reaction: { icon: 'reaction', label: '반응' },
  vitality: { icon: 'vitality', label: '체력 비례 일격' },
  escort: { icon: 'escort', label: '호위와 주사위 빼앗기' },
  boss: { icon: 'charge', label: '힘 모으는 보스' },
}

let ascent: Ascent | null = null
const selected = new Set<number>()
const roulette = new CounterRoulette(ui.counterPanel, ui.counter)

const player = { x: 94, width: 63, height: 95, fill: '#d1d1d1' }
const enemy = { x: 262, width: 106, height: 153, fill: '#868686' }
const mataios = { x: 23, width: 29, height: 67, fill: '#a9a9a9' }

function strikeProgress(elapsed: number, oneWay: number) {
  return Math.max(0, 1 - Math.abs(elapsed / oneWay - 1))
}

class Arena {
  private readonly canvas = document.createElement('canvas')
  private readonly context = this.canvas.getContext('2d')!
  private density = 1
  private scale = 0
  private ground = 0
  private mataiosHome = mataios.x
  private playerHome = player.x
  private battle?: YachtBattle
  private strike?: { start: number; joint: boolean }
  private animation = 0

  constructor(private readonly frame: HTMLElement, private readonly encounter: HTMLElement) {
    frame.append(this.canvas)
    new ResizeObserver(this.resize).observe(frame)
    window.addEventListener('resize', this.resize)
    this.watchDensity()
  }

  private watchDensity = () => {
    window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      .addEventListener('change', this.watchDensity, { once: true })
    this.resize()
  }

  private resize = () => {
    const { left, right, top, bottom, width, height } = this.frame.getBoundingClientRect()
    if (!width || !height) return

    const density = window.devicePixelRatio
    const pxLeft = Math.round(left * density)
    const pxTop = Math.round(top * density)
    this.density = density
    // One canvas pixel per device pixel, including when the stage begins between device pixels.
    this.canvas.width = Math.round(right * density) - pxLeft
    this.canvas.height = Math.round(bottom * density) - pxTop
    this.canvas.style.left = `${pxLeft / density - left}px`
    this.canvas.style.top = `${pxTop / density - top}px`
    this.canvas.style.width = `${this.canvas.width / density}px`
    this.canvas.style.height = `${this.canvas.height / density}px`
    this.scale = Math.min(width / 240, height / 300)
    this.ground = height / 2 + 85 * this.scale
    const unitsPerPixel = 360 / width
    const mataiosHalfWidth = mataios.width * this.scale / 2
    const playerHalfWidth = player.width * this.scale / 2
    this.mataiosHome = Math.max(mataios.x, (12 + mataiosHalfWidth) * unitsPerPixel)
    this.playerHome = Math.max(player.x, this.mataiosHome + (mataiosHalfWidth + playerHalfWidth + 8) * unitsPerPixel)
    this.encounter.style.setProperty('--ground', `${this.ground}px`)
    this.encounter.style.setProperty('--enemy-head', `${this.ground - enemy.height * this.scale}px`)
    this.encounter.style.setProperty('--player-head', `${this.ground - player.height * this.scale}px`)
    this.encounter.style.setProperty('--player-x', `${this.playerHome / 3.6}%`)
    this.draw()
  }

  private drawActor(actor: typeof player, x: number, fill = actor.fill, outlined = false) {
    const center = x * this.canvas.width / 360
    const halfWidth = actor.width * this.scale * this.density / 2
    const left = Math.round(center - halfWidth)
    const width = Math.round(center + halfWidth) - left
    const top = Math.round((this.ground - actor.height * this.scale) * this.density)
    const height = Math.round(this.ground * this.density) - top
    const edge = outlined ? Math.max(1, Math.round(this.density)) : 0
    if (outlined) {
      this.context.fillStyle = '#c1c1c1'
      this.context.fillRect(left, top, width, height)
    }
    this.context.fillStyle = fill
    this.context.fillRect(left + edge, top + edge, width - 2 * edge, height - 2 * edge)
  }

  private draw() {
    const { strike, battle, canvas, context } = this
    context.clearRect(0, 0, canvas.width, canvas.height)
    if (!battle || !this.scale) return
    const elapsed = strike ? performance.now() - strike.start : Infinity
    if (strike?.joint) this.drawActor(mataios, this.mataiosHome + (192 - this.mataiosHome) * strikeProgress(elapsed, 144) ** 3)
    if (battle.playerHp > 0) this.drawActor(player, this.playerHome + (214 - this.playerHome) * strikeProgress(elapsed, 128) ** 3)
    if (battle.enemyHp > 0) {
      const stagger = strikeProgress(elapsed - 128, 68)
      this.drawActor(enemy, enemy.x + (strike?.joint ? 16 : 12) * stagger, stagger > 0 ? '#e9e9e9' : enemy.fill, true)
    }
  }

  private animateStrike = () => {
    this.draw()
    if (this.strike && performance.now() - this.strike.start < 288) {
      this.animation = requestAnimationFrame(this.animateStrike)
    }
  }

  counterStrike(joint: boolean) {
    this.strike = { start: performance.now(), joint }
    this.animateStrike()
  }

  finishStrike() {
    cancelAnimationFrame(this.animation)
    this.strike = undefined
    this.draw()
  }

  refresh(battle: YachtBattle) {
    this.battle = battle
    this.draw()
  }
}

const arena = new Arena(element('arena'), ui.encounter)

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
      const battle = ascent?.battle
      const mechanic = battle && enemyIntentAt(battle).mechanic
      const faces = battle ? indices.map((die) => dieFaceForSlot(battle.dice[die], battle.slots[die], mechanic)) : []
      return { indices, faces: faces.join('  ') }
    },
    drop: (indices, zone) => place(indices, zone),
  })
  return button
})

const stolenPlaceholder = document.createElement('span')
stolenPlaceholder.className = 'die stolen-die'
stolenPlaceholder.setAttribute('role', 'img')

function refreshDice(battle: YachtBattle, { attack, guard, escort }: SlotTotals) {
  const planning = battle.phase === 'assign'
  const intent = enemyIntentAt(battle)
  const mechanic = intent.mechanic
  diceButtons.forEach((button, index) => {
    const value = battle.dice[index]
    button.hidden = value === undefined
    if (value === undefined) return
    button.disabled = !planning
    const slot = battle.slots[index]
    const parent = ui.dice[slot ?? 'pool']
    const fixed = battle.fixedDie?.index === index ? battle.fixedDie.kind : undefined
    const sealed = mechanic?.kind === 'seal' && value === mechanic.value
    const status = fixed ?? (sealed ? 'seal' : undefined)
    button.innerHTML = `${dieFaceForSlot(value, slot, mechanic)}${status ? `<span class="die-status">${icon(status)}</span>` : ''}`
    const oathFace = battle.perk?.kind === 'oath' && !sealed && value % 2 === Number(battle.perk.parity === 'odd')
    button.classList.toggle('altered-face', oathFace)
    const place = slot ? { attack: '공격', guard: '방어', escort: '호위 공격' }[slot] : '미배치'
    let faceLabel = ''
    if (oathFace) faceLabel = `, 공격에 놓으면 +${START_PERKS.oath.bonus}`
    if (fixed) faceLabel += `, ${fixed === 'lock' ? '잠김' : '얼림'}, 재굴림 불가`
    if (sealed) faceLabel += ', 봉인되어 0으로 계산'
    button.setAttribute('aria-label', `주사위 ${index + 1}, ${value}, ${place}${faceLabel}`)
    button.setAttribute('aria-pressed', String(selected.has(index)))
    if (parent !== button.parentElement) parent.append(button)
  })

  const stolen = battle.stolenDie?.remaining
  stolenPlaceholder.hidden = stolen === undefined
  if (stolen !== undefined) {
    stolenPlaceholder.innerHTML = `<span class="recovery-progress">${icon('return')}${stolen}</span><span class="die-status">${icon('steal')}</span>`
    stolenPlaceholder.setAttribute('aria-label', `빼앗긴 주사위, 적에게 피해 ${stolen}을 주면 되찾음`)
    ui.dice.pool.append(stolenPlaceholder)
  }

  ui.attackTotal.textContent = String(attack)
  ui.attackMultiplier.hidden = !planning || !bladeChargePreview(battle)?.ready
  ui.attackMultiplier.textContent = `×${START_PERKS.blade.multiplier}`
  ui.guardTotal.textContent = String(guard)
  ui.escortSlot.hidden = !battle.escort
  ui.escortSlot.parentElement!.classList.toggle('has-escort', Boolean(battle.escort))
  ui.escortHp.textContent = String(battle.escort?.hp ?? 0)
  ui.assign.escort.setAttribute('aria-label', `호위 공격, 호위 체력 ${battle.escort?.hp ?? 0}`)
  ui.escortTotal.textContent = String(escort)
  const canPlace = planning && selected.size > 0
  const rerollable = [...selected].filter((index) => canReroll(battle, index))
  ui.assign.pool.disabled = !canPlace || ![...selected].some((index) => battle.slots[index] !== null)
  ui.assign.attack.disabled = !canPlace
  ui.assign.guard.disabled = !canPlace
  ui.assign.escort.disabled = !canPlace
  const rerollCost = yachtRerollCost(battle)
  ui.reroll.disabled = !rerollable.length || rerollCost === null || rerollCost >= battle.playerHp
  const freeRolls = Number(rerollCost === 0)
  ui.rerollCount.innerHTML = rerollCost
    ? `<span>${icon('heart')} −${rerollCost}</span>`
    : String(freeRolls)
  ui.reroll.setAttribute('aria-label', rerollCost
    ? `다시 굴리기, 체력 ${rerollCost} 소모`
    : `다시 굴리기 ${freeRolls}회`)
  ui.reroll.title = '다시 굴리기'
  ui.extraReroll.hidden = !battle.extraRerollAvailable && !battle.extraRerollSpent
  ui.extraReroll.disabled = selected.size !== 1 || rerollable.length !== 1 || !battle.rerolled || !battle.extraRerollAvailable
  const extra = Number(battle.extraRerollAvailable)
  ui.extraReroll.innerHTML = `${icon(unlockInfo.straight.icon)}${extra}`
  ui.extraReroll.setAttribute('aria-label', `해금 재굴림 (${extra})`)
  ui.extraReroll.title = '해금 재굴림'
  ui.resolve.disabled = !planning || battle.slots.includes(null)
}

function hitNumbers(hits: readonly number[]) {
  const groups: { damage: number; count: number }[] = []
  for (const hit of hits) {
    const group = groups.at(-1)
    if (group?.damage === hit) group.count++
    else groups.push({ damage: hit, count: 1 })
  }
  return groups.map(({ damage, count }) => count === 1 ? String(damage) : `${damage}×${count}`).join(' + ')
}

function renderIntent(battle: YachtBattle, totals: SlotTotals) {
  const { phase } = battle
  ui.intent.hidden = phase === 'won' || phase === 'lost'
  if (phase === 'counter') {
    ui.intent.innerHTML = icon('parry')
    ui.intent.setAttribute('aria-label', '정확 방어')
  } else if (phase === 'assign') {
    const intent = enemyIntentAt(battle)
    const charge = chargedStrikePreview(battle, totals)
    if (charge) {
      const { threshold, totalDamage, weakened } = charge
      ui.intent.innerHTML = `<span>${icon('charge')}<strong>${totalDamage}</strong></span><span class="intent-detail${weakened ? ' active-intent' : ''}">${icon('break-charge')}${threshold}</span>`
      ui.intent.setAttribute('aria-label',
        `${intent.name}, 공격 합 ${threshold} 이상이면 약화, 다음 치명 일격 피해 ${totalDamage}${weakened ? ', 약화 예고' : ''}`)
      return
    }
    if (intent.damageTakenMultiplier !== undefined) {
      const multiplier = intent.damageTakenMultiplier
      ui.intent.innerHTML = `${icon('knockdown')}<strong>×${multiplier}</strong>`
      ui.intent.setAttribute('aria-label', `${intent.name}, 적이 받는 피해 ${multiplier}배`)
      return
    }
    const mechanic = intent.mechanic
    const { hits } = incomingAttack(battle, totals)
    let primary = hits.length ? `${icon(intent.id === 'critical' ? 'critical' : 'sword')}<strong>${hitNumbers(hits)}</strong>` : ''
    let label = hits.length ? `${intent.name} 피해 ${hits.join(', ')}` : intent.name
    let detail = ''
    if (mechanic) {
      const { kind } = mechanic
      switch (kind) {
        case 'lock':
          detail = `${icon('lock')}${icon('die')}1`
          label += ', 다음 턴 가장 낮은 주사위 하나 잠금'
          break
        case 'freeze':
          detail = `${icon('freeze')}1`
          label += ', 다음 턴 주사위 하나를 1로 얼림'
          break
        case 'thorns':
          detail = `${icon('thorns')}${icon('die')}${mechanic.value}`
          label += `, 공격 주사위마다 가시 피해 ${mechanic.value}`
          break
        case 'rage':
          detail = `${icon('rage')}+${mechanic.value}`
          label += `, 재굴림 시 공격 피해 ${mechanic.value} 증가`
          break
        case 'reaction': {
          const changed = totals.attack >= mechanic.value
          const base = hitNumbers(attackFor(battle, intent).hits)
          const alternate = hitNumbers(attackFor(battle, mechanic.alternate).hits)
          primary = `${icon('sword')}<strong${changed ? ' class="inactive-intent"' : ''}>${base}</strong>`
          detail = `${icon('reaction')}${mechanic.value} <span${changed ? ' class="active-intent"' : ''}>${icon('sword')}${alternate}</span>`
          label = `기본 공격 ${base}, 공격 합 ${mechanic.value} 이상이면 ${alternate}, 현재 피해 ${hits.join(', ')}`
          break
        }
        case 'vitality':
          primary = icon('heart') + primary
          label += ', 내 현재 체력에 비례'
          break
        case 'seal':
          detail = `${icon('seal')}${mechanic.value}`
          label += `, 이번 턴 ${mechanic.value} 주사위 봉인`
          break
        case 'steal':
          if (!battle.stolenDie) {
            detail = `${icon('steal')}${icon('die')}1`
            label += ', 다음 턴부터 주사위 하나 빼앗김'
          }
          break
        case 'escort':
          if (!battle.escort) detail = `${icon('escort')}1`
          label += battle.escort ? ', 호위 한 마리 생존'
            : `, 호위 체력 ${mechanic.hp}, 호위가 살아 있으면 공격 피해 ${mechanic.bonus} 증가`
          break
      }
    }
    if (battle.escort && hits.length) {
      detail += `${icon('escort')}+${battle.escort.bonus}`
      label += `, 호위 생존 시 공격 피해 ${battle.escort.bonus} 증가`
    }
    ui.intent.innerHTML = detail ? `<span>${primary}</span><span class="intent-detail">${detail}</span>` : primary
    ui.intent.setAttribute('aria-label', label)
  }
}

const exchangeDuration = 1200
let exchangeTimer: number | undefined

function showExchange({ dealt, hitsTaken, awakenedDice, escortDealt }: Exchange) {
  const taken = hitsTaken.reduce((sum, value) => sum + value, 0)
  ui.feedback.textContent = `적 피해 ${dealt}, 내 피해 ${taken}${escortDealt ? `, 호위 피해 ${escortDealt}` : ''}${awakenedDice ? `, 각성 ${awakenedDice.join(', ')}` : ''}`
  for (const [output, damage] of [[ui.playerDamage, taken], [ui.enemyDamage, dealt]] as const) {
    output.getAnimations().forEach((animation) => animation.cancel())
    output.textContent = `−${damage}`
    output.hidden = damage === 0
    if (damage && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      output.animate(
        [{ translate: '0 7px', opacity: 0 }, { translate: '0 0', opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.75 }, { translate: '0 -9px', opacity: 0 }],
        { duration: exchangeDuration },
      )
    }
  }
  ui.awakening.hidden = !awakenedDice
  ui.awakening.innerHTML = awakenedDice ? `${icon('die')}${awakenedDice.map((face) => `<span>${face}</span>`).join('')}` : ''
  ui.awakening.setAttribute('aria-label', awakenedDice ? `각성 ${awakenedDice.join(', ')}` : '')
  window.clearTimeout(exchangeTimer)
  exchangeTimer = window.setTimeout(() => {
    ui.playerDamage.hidden = true
    ui.enemyDamage.hidden = true
    ui.awakening.hidden = true
  }, exchangeDuration)
}

function updateEnemyHp(enemyHp: number) {
  ui.enemyHp.value = enemyHp
  ui.enemyTotal.textContent = `${enemyHp}/${ui.enemyHp.max}`
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((finish) => window.setTimeout(finish, milliseconds))
}

function renderActivePerk(battle: YachtBattle) {
  const { perk } = battle
  ui.activePerk.hidden = !perk
  if (!perk) return
  const { name, icon: defaultSymbol } = START_PERKS[perk.kind]
  const symbol = perk.kind === 'oath' ? parityIcons[perk.parity] : defaultSymbol
  const blade = bladeChargePreview(battle)
  let value: string
  switch (perk.kind) {
    case 'shield': value = `+${perk.bonus}`; break
    case 'blade': value = `${perk.charge}/${START_PERKS.blade.threshold}`; break
    case 'collector': value = `+${collectorBonus(perk.hands)}`; break
    case 'reroll': value = battle.paidRerollSpent ? '0' : '+1'; break
    case 'oath': value = `${parityLabels[perk.parity]} +${START_PERKS.oath.bonus}`; break
    case 'counter': value = `+${perk.growth}`; break
  }
  const projected = blade && battle.phase === 'assign' && blade.nextCharge !== blade.charge
    ? `${blade.nextCharge}/${START_PERKS.blade.threshold}` : null
  ui.activePerk.classList.toggle('perk-ready', blade?.ready ?? false)
  const pips = blade?.pipsAdded ? `${icon('die')}+${blade.pipsAdded}` : ''
  const preview = projected ? `<small class="perk-preview">${pips} →${projected}</small>` : ''
  const previewLabel = projected
    ? `${blade?.pipsAdded ? `, 공격 눈 합 +${blade.pipsAdded}` : ''}, 배치 후 예상 ${projected}` : ''
  ui.activePerk.innerHTML = `${icon(symbol)}<strong>${value}</strong>${preview}`
  ui.activePerk.setAttribute('aria-label', `${name} ${value}${previewLabel}, ${perkDisplay[perk.kind].label}`)
  ui.activePerk.title = name
}

function render(presentation: 'normal' | 'exchange' | 'unlock' = 'normal') {
  if (!ascent) return
  const { battle, fight, enemy, maxHp, unlocks, newUnlock } = ascent
  const { phase, turn, playerHp, enemyHp } = battle
  const between = phase === 'won' && fight < FIGHT_COUNT
  const finished = phase === 'lost' || (phase === 'won' && !between)
  const atEvent = presentation === 'normal' && (between || finished)
  const atUnlock = presentation === 'unlock' && newUnlock !== null
  const inCombat = !atEvent && !atUnlock
  const showActions = presentation === 'normal' && inCombat
  ui.main.dataset.screen = atEvent ? 'event' : atUnlock ? 'unlock' : 'battle'
  ui.perks.hidden = true
  ui.battle.hidden = false
  ui.encounter.hidden = !inCombat
  ui.fight.hidden = !inCombat
  ui.fight.textContent = `${fight}/${FIGHT_COUNT} 층`
  renderActivePerk(battle)
  ui.turn.hidden = !inCombat
  ui.turn.innerHTML = `${icon('turn')}${turn}`
  ui.turn.setAttribute('aria-label', `${turn}턴`)
  const totals = yachtAllocationTotals(battle)
  renderIntent(battle, totals)
  ui.playerHp.max = maxHp
  ui.playerHp.value = playerHp
  ui.playerTotal.textContent = `${playerHp}/${maxHp}`
  ui.enemyHp.max = enemy.hp
  const badge = enemyBadges[enemy.id]
  ui.enemyBadge.innerHTML = icon(badge.icon)
  ui.enemyBadge.setAttribute('aria-label', badge.label)
  updateEnemyHp(enemyHp)
  ui.newUnlock.hidden = !atUnlock
  if (atUnlock) {
    const unlock = unlockInfo[newUnlock]
    const faces = [2, 4, 1, 3, 6, 5].map((face) => `<span>${face}</span>`).join('')
    ui.unlockReveal.innerHTML = `<div class="die-net" aria-hidden="true">${faces}</div><span class="unlock-value">${icon(unlock.icon)}<strong>${unlock.value}</strong></span>`
    ui.unlockReveal.setAttribute('aria-label', `${unlock.label} 해금`)
    ui.feedback.textContent = `${unlock.label} 해금`
  }
  ui.planning.hidden = !showActions || phase !== 'assign'
  roulette.setVisible(showActions && phase === 'counter' ? yachtCounterRewards(battle) : null)
  ui.ascentEvent.hidden = !atEvent
  ui.ownedUnlocks.hidden = !between || unlocks.length === 0
  ui.ownedUnlocks.innerHTML = unlocks.map((hand) => {
    const unlock = unlockInfo[hand]
    return `<span>${icon(unlock.icon)}${unlock.value}</span>`
  }).join('')
  ui.ownedUnlocks.setAttribute('aria-label', unlocks.map((hand) => unlockInfo[hand].label).join(', '))
  const wins = phase === 'lost' ? fight - 1 : fight
  ui.eventFloor.innerHTML = between
    ? `<span>${fight}/${FIGHT_COUNT}</span>${icon('next')}<strong>${fight + 1}/${FIGHT_COUNT}</strong>`
    : `<strong>${wins}/${FIGHT_COUNT}</strong>`
  ui.eventFloor.setAttribute('aria-label', between
    ? `${fight}층에서 ${fight + 1}층으로`
    : `${FIGHT_COUNT}층 중 ${wins}층 통과`)
  ui.ascentEvent.classList.toggle('finished', finished)
  ui.result.hidden = !atEvent || !finished
  ui.result.textContent = phase === 'won' ? '성공' : '실패'
  ui.next.hidden = !between
  ui.retry.hidden = !finished
  refreshDice(battle, totals)
  arena.refresh(battle)
}

function showPerks(focus: boolean) {
  ascent = null
  selected.clear()
  roulette.setVisible(null)
  ui.main.dataset.screen = 'perks'
  ui.battle.hidden = true
  ui.activePerk.hidden = true
  ui.fight.hidden = true
  ui.turn.hidden = true
  ui.perks.hidden = false
  const seed = fixedSeed ?? crypto.getRandomValues(new Uint32Array(1))[0]
  const offers = offerPerks(seed)
  const begin = (perk: keyof typeof START_PERKS, parity?: Parity) => {
    ascent = beginAscent(seed, perk, parity)
    render()
    focusPhase()
  }
  const buttons = offers.map((perk) => {
    const { name, icon: symbol } = START_PERKS[perk]
    const { label, value, detail } = perkDisplay[perk]
    const button = perkButton(symbol, name, value, detail, label)
    button.addEventListener('click', () => {
      if (perk !== 'oath') {
        begin(perk)
        return
      }
      const parityButtons = (['odd', 'even'] as const).map((parity) => {
        const label = oathDescription(parity === 'odd' ? '홀수' : '짝수')
        const choice = perkButton(parityIcons[parity], name, parityLabels[parity], `${icon('sword')} ${value}`, label)
        choice.addEventListener('click', () => begin(perk, parity))
        return choice
      })
      const back = document.createElement('button')
      back.type = 'button'
      back.innerHTML = icon('return')
      back.setAttribute('aria-label', '시작 특전으로 돌아가기')
      back.addEventListener('click', () => {
        ui.perkChoices.replaceChildren(...buttons)
        button.focus()
      })
      ui.perkChoices.replaceChildren(...parityButtons, back)
      parityButtons[0].focus()
    })
    return button
  })
  ui.perkChoices.replaceChildren(...buttons)
  if (focus) buttons[0].focus()
}

function perkButton(symbol: string, name: string, value: string, detail: string, label: string) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'perk-choice'
  button.setAttribute('aria-label', `${name}, ${label}`)
  button.innerHTML = `
    <span class="perk-symbol">${icon(symbol)}</span>
    <span class="perk-name">${name}</span>
    <strong class="perk-value">${value}</strong>
    <span class="perk-detail">${detail}</span>
    <span class="perk-description">${label}</span>
  `
  return button
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

for (const zone of ['pool', 'attack', 'guard', 'escort'] as const) {
  ui.assign[zone].addEventListener('click', () => place([...selected], zone))
}
function useReroll(extra: boolean) {
  if (!ascent) return
  const current = ascent.battle
  const indices = [...selected].filter((index) => canReroll(current, index))
  if (indices.length === 0) return
  const battle = extra ? spendExtraReroll(current, indices[0]) : rerollYachtDice(current, indices)
  ascent = { ...ascent, battle }
  render()
  diceButtons[indices[0]].focus()
}

ui.reroll.addEventListener('click', () => useReroll(false))
ui.extraReroll.addEventListener('click', () => useReroll(true))
ui.resolve.addEventListener('click', async () => {
  if (!ascent) return
  const next = resolveAscentTurn(ascent)
  if (next === ascent) return
  ascent = next
  selected.clear()
  const { phase, lastExchange } = next.battle
  const pause = next.newUnlock || phase === 'won' || phase === 'lost'
  if (pause) {
    render('exchange')
    if (lastExchange) showExchange(lastExchange)
    await wait(exchangeDuration)
  }
  if (next.newUnlock) {
    render('unlock')
    await wait(1650)
  }
  render()
  if (!pause && lastExchange) showExchange(lastExchange)
  focusPhase()
})
ui.counter.addEventListener('click', async () => {
  if (!ascent || ascent.battle.phase !== 'counter' || ui.counter.disabled) return
  const next = spinYachtCounter(ascent.battle)
  const reward = next.lastExchange?.counter
  if (!reward) return

  const animate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (next.perk?.kind === 'counter') renderActivePerk(next)
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
