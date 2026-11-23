import { beginAscent, FIGHT_COUNT, nextAscentFight, resolveAscentTurn } from './ascent.ts'
import type { Ascent } from './ascent.ts'
import { Arena } from './arena.ts'
import { BattleAudio } from './battle-audio.ts'
import { BATTLE_GUIDE } from './battle-guide.ts'
import {
  allocationPower, assignDie, attackFor, chargedStrikePreview, DIE_COUNT, dieFaceForSlot, enemyIntentAt, incomingAttack,
} from './combat.ts'
import type { Exchange, SlotTotals } from './combat.ts'
import { collectorBonus, offerPerks, START_PERKS } from './perks.ts'
import type { Parity } from './perks.ts'
import {
  bladeChargePreview, canReroll, previewUnlockProgress, spinYachtCounter, yachtAllocationTotals,
  yachtCounterRewards, yachtRerollCost,
} from './yacht-combat.ts'
import type { Hand, YachtBattle } from './yacht-combat.ts'
import { bindDiceInput, rerollSelectedDice } from './dice-drag.ts'
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
  help: element<HTMLButtonElement>('help'),
  soundToggle: element<HTMLButtonElement>('sound-toggle'),
  guide: element<HTMLDialogElement>('battle-guide'),
  guideEntries: element('guide-entries'),
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
  finalUnlock: element('final-unlock'),
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
  attackBonus: element('attack-bonus'),
  attackMultiplier: element('attack-multiplier'),
  guardTotal: element('guard-total'),
  guardBonus: element('guard-bonus'),
  escortSlot: element('escort-slot'),
  escortHp: element('escort-hp'),
  escortTotal: element('escort-total'),
  escortBonus: element('escort-bonus'),
  reroll: element<HTMLButtonElement>('reroll'),
  rerollCount: element('reroll-count'),
  extraReroll: element<HTMLButtonElement>('extra-reroll'),
  lockedDie: element('locked-die'),
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

function oathDescription(parity?: Parity) {
  const damage = `<strong>피해 ${START_PERKS.oath.bonus}</strong>`
  if (parity) {
    const eyes = parity === 'odd' ? '홀수 눈' : '짝수 눈'
    return `이번 등반에서 <strong>${eyes}</strong> 주사위를 공격에 놓으면, 주사위마다 ${damage}을 더합니다.`
  }
  return `등반 시작에 <strong>홀수와 짝수</strong> 중 하나를 고릅니다. 고른 쪽 눈의 주사위를 공격에 놓으면, 주사위마다 ${damage}을 더합니다.`
}

const perkDisplay = {
  shield: {
    value: `+${START_PERKS.shield.step}`, detail: `${icon('parry')}${icon('sword')}`,
    label: `정확히 막을 때마다 → 공격 +${START_PERKS.shield.step} 누적 (놓치면 0)`,
    description: `방어 합이 적의 공격 피해와 같으면 <strong>정확히 막은 것</strong>이며, 그때마다 공격 피해 보너스가 <strong>${START_PERKS.shield.step}</strong>씩 쌓입니다. 적의 공격을 정확히 막지 못하면 모은 보너스가 사라집니다.`,
  },
  blade: {
    value: `×${START_PERKS.blade.multiplier}`, detail: `${icon('sword')} ${START_PERKS.blade.threshold}`,
    label: `공격에 놓은 눈이 ${START_PERKS.blade.threshold} 쌓이면 → 다음 공격 ${START_PERKS.blade.multiplier}배 (쓰거나 전투가 바뀌면 0)`,
    description: `공격에 놓은 주사위 눈의 합이 <strong>${START_PERKS.blade.threshold} 이상</strong> 쌓이면 다음 공격의 피해가 <strong>${START_PERKS.blade.multiplier}배</strong>가 됩니다. 두 배 공격을 쓰거나 전투가 바뀌면 <strong>0</strong>부터 다시 모읍니다.`,
  },
  collector: {
    value: `+${START_PERKS.collector.initial}~${START_PERKS.collector.maximum}`, detail: `${icon('die')}=${icon('die')}`,
    label: `같은 눈 2개 이상인 칸에 보너스. 처음 ${START_PERKS.collector.initial}, 새 족보(트리플·스트레이트 등) 첫 사용마다 +${START_PERKS.collector.step} (최대 +${START_PERKS.collector.maximum})`,
    description: `같은 눈 주사위를 <strong>2개 이상</strong> 한 칸에 놓으면 그 칸에 보너스를 더합니다. 보너스는 <strong>${START_PERKS.collector.initial}</strong>에서 시작하며, 같은 눈 셋이나 연속된 눈 셋 같은 새 <strong>족보</strong>를 처음 쓸 때마다 <strong>${START_PERKS.collector.step}</strong>씩 올라 <strong>최대 ${START_PERKS.collector.maximum}</strong>가 됩니다.`,
  },
  reroll: {
    value: '+1', detail: `${icon('heart')} −${START_PERKS.reroll.cost}`,
    label: `매 턴 기본 재굴림 후 → 1회 더 (체력 −${START_PERKS.reroll.cost})`,
    description: `매 턴 기본 <strong>재굴림</strong>으로 선택한 주사위를 다시 굴린 뒤 <strong>한 번</strong> 더 굴릴 수 있습니다. 추가로 굴릴 때마다 <strong>체력 ${START_PERKS.reroll.cost}</strong>을 잃습니다.`,
  },
  oath: {
    value: `+${START_PERKS.oath.bonus}`, detail: '홀 / 짝',
    label: `고른 홀·짝 눈을 공격에 놓으면 → 주사위마다 +${START_PERKS.oath.bonus}`,
    description: oathDescription(),
  },
  counter: {
    value: `+${START_PERKS.counter.step}`, detail: `${icon('parry')}${icon('wheel')}`,
    label: `정확히 막아 룰렛을 돌릴 때마다 → 아이콘 없는 칸 중 가장 작은 숫자 +${START_PERKS.counter.step} (계속 쌓임)`,
    description: `방어 합이 적의 공격 피해와 같으면 <strong>정확히 막은 것</strong>이며, 반격 피해를 정하는 <strong>룰렛</strong>을 돌릴 수 있습니다. 돌릴 때마다 아이콘 없는 칸 중 가장 작은 숫자 하나가 <strong>${START_PERKS.counter.step}</strong>씩 커져 등반이 끝날 때까지 쌓입니다.`,
  },
} as const

const parityLabels = { odd: '홀', even: '짝' } as const
const parityIcons = { odd: 'die', even: 'die-even' } as const

function icon(name: string) {
  return `<svg class="icon" aria-hidden="true"><use href="#icon-${name}"/></svg>`
}

ui.guideEntries.innerHTML = BATTLE_GUIDE.map(({ title, entries }) => `
  <section class="guide-section">
    <h3>${title}</h3>
    <dl>${entries.map(([symbol, name, description]) => `
      <div class="guide-entry">
        <dt>${icon(symbol)}<strong>${name}</strong></dt>
        <dd>${description}</dd>
      </div>
    `).join('')}</dl>
  </section>
`).join('')

ui.help.addEventListener('click', () => {
  if (ui.help.disabled || ui.guide.open) return
  ui.guide.showModal()
  ui.guideEntries.scrollTop = 0
})
ui.guide.addEventListener('click', (event) => {
  if (event.target === ui.guide) ui.guide.close()
})
ui.guide.addEventListener('close', () => ui.help.focus())

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
const sound = new BattleAudio()

ui.soundToggle.addEventListener('click', (event) => {
  if (!event.isTrusted) return
  sound.toggle()
  ui.soundToggle.setAttribute('aria-pressed', String(sound.isEnabled))
  ui.soundToggle.querySelector('use')!.setAttribute('href', sound.isEnabled ? '#icon-sound-on' : '#icon-sound-off')
})

const arena = new Arena(element('arena'), ui.encounter)

const diceButtons = Array.from({ length: DIE_COUNT + 1 }, (_, index) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'die'
  button.id = `die-${index}`
  bindDiceInput(button, {
    select: () => {
      if (ui.guide.open) return
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

function renderUnlockProgress(hint: HTMLElement, progress: 0 | 2 | 3) {
  hint.classList.toggle('unlock-partial', progress === 2)
  hint.classList.toggle('unlock-ready', progress === 3)
}

function renderSlotTotal(total: HTMLElement, bonus: HTMLElement, value: number, added: number) {
  total.textContent = String(value)
  bonus.hidden = added === 0
  bonus.textContent = added ? `+${added}` : ''
  return added ? `, 특전 보너스 ${added} 포함` : ''
}

function refreshDice(battle: YachtBattle, { attack, guard, escort }: SlotTotals, unlocks: readonly Hand[]) {
  const planning = battle.phase === 'assign'
  const pendingUnlock = unlocks.length < 2 ? previewUnlockProgress(battle) : undefined
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
  ui.lockedDie.hidden = unlocks.includes('triple')
  if (ui.lockedDie.hidden) ui.lockedDie.removeAttribute('aria-label')
  else ui.lockedDie.setAttribute('aria-label', '잠긴 네 번째 주사위, 같은 눈 셋')
  renderUnlockProgress(ui.lockedDie, ui.lockedDie.hidden ? 0 : pendingUnlock?.triple ?? 0)

  const withoutPerk = allocationPower(battle)
  const bladeReady = planning && bladeChargePreview(battle)?.ready
  const attackHint = renderSlotTotal(ui.attackTotal, ui.attackBonus, attack, battle.perk?.kind === 'blade' ? 0 : attack - withoutPerk.attack)
  ui.attackMultiplier.hidden = !bladeReady
  ui.attackMultiplier.textContent = `×${START_PERKS.blade.multiplier}`
  const multiplierHint = bladeReady ? `, 큰 칼 준비, 공격 피해 ${START_PERKS.blade.multiplier}배` : ''
  ui.assign.attack.setAttribute('aria-label', `공격 칸, 피해 ${attack}${attackHint}${multiplierHint}`)
  const guardHint = renderSlotTotal(ui.guardTotal, ui.guardBonus, guard, guard - withoutPerk.guard)
  ui.assign.guard.setAttribute('aria-label', `방어 칸, 합계 ${guard}${guardHint}`)
  ui.escortSlot.hidden = !battle.escort
  ui.escortSlot.parentElement!.classList.toggle('has-escort', Boolean(battle.escort))
  ui.escortHp.textContent = String(battle.escort?.hp ?? 0)
  const escortHint = renderSlotTotal(ui.escortTotal, ui.escortBonus, escort, escort - withoutPerk.escort)
  ui.assign.escort.setAttribute('aria-label', `호위 공격, 피해 ${escort}${escortHint}, 호위 체력 ${battle.escort?.hp ?? 0}`)
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
  const rerollLocked = !unlocks.includes('straight')
  ui.extraReroll.classList.toggle('unlock-hint', rerollLocked)
  renderUnlockProgress(ui.extraReroll, rerollLocked ? pendingUnlock?.straight ?? 0 : 0)
  ui.extraReroll.disabled = selected.size !== 1 || rerollable.length !== 1 || !battle.rerolled || !battle.extraRerollAvailable
  const extra = Number(battle.extraRerollAvailable)
  ui.extraReroll.innerHTML = `${icon(unlockInfo.straight.icon)}${rerollLocked ? icon('straight') : extra}`
  ui.extraReroll.setAttribute('aria-label', rerollLocked ? '잠긴 재굴림 주사위, 이어지는 눈 셋' : `해금 재굴림 (${extra})`)
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
const unlockDuration = 650
let exchangeTimer: number | undefined

function clearExchange() {
  ui.playerDamage.hidden = true
  ui.enemyDamage.hidden = true
  ui.awakening.hidden = true
}

function showExchange(before: YachtBattle, phase: YachtBattle['phase'], exchange: Exchange) {
  const { dealt, hitsTaken, awakenedDice, escortDealt } = exchange
  const taken = hitsTaken.reduce((sum, value) => sum + value, 0)
  arena.playExchange(before, exchange)
  if (dealt || taken || escortDealt) sound.play('stone-hit')
  if (phase === 'counter') sound.play('perfect-block')
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
  exchangeTimer = window.setTimeout(clearExchange, exchangeDuration)
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
  ui.help.hidden = !inCombat
  ui.help.disabled = !showActions
  ui.soundToggle.hidden = false
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
  const finalUnlock = atEvent && phase === 'lost' && newUnlock ? unlockInfo[newUnlock] : null
  ui.finalUnlock.hidden = !finalUnlock
  ui.finalUnlock.innerHTML = finalUnlock ? `${icon(finalUnlock.icon)}해금 · ${finalUnlock.label}` : ''
  ui.next.hidden = !between
  ui.retry.hidden = !finished
  refreshDice(battle, totals, unlocks)
  arena.refresh(battle, enemy.id)
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
  ui.help.hidden = true
  ui.soundToggle.hidden = true
  ui.perks.hidden = false
  const seed = fixedSeed ?? crypto.getRandomValues(new Uint32Array(1))[0]
  const offers = offerPerks(seed)
  const begin = (event: MouseEvent, perk: keyof typeof START_PERKS, parity?: Parity) => {
    if (event.isTrusted) sound.activate()
    ascent = beginAscent(seed, perk, parity)
    render()
    sound.play('dice-roll')
    focusPhase()
  }
  const buttons = offers.map((perk) => {
    const { name, icon: symbol } = START_PERKS[perk]
    const { description, value, detail } = perkDisplay[perk]
    const button = perkButton(symbol, name, value, detail, description)
    button.addEventListener('click', (event) => {
      if (perk !== 'oath') {
        begin(event, perk)
        return
      }
      const parityButtons = (['odd', 'even'] as const).map((parity) => {
        const choice = perkButton(parityIcons[parity], name, parityLabels[parity], `${icon('sword')} ${value}`, oathDescription(parity))
        choice.addEventListener('click', (event) => begin(event, perk, parity))
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

function perkButton(symbol: string, name: string, value: string, detail: string, description: string) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'perk-choice'
  button.innerHTML = `
    <span class="perk-symbol">${icon(symbol)}</span>
    <span class="perk-name">${name}</span>
    <strong class="perk-value">${value}</strong>
    <span class="perk-detail">${detail}</span>
  `
  const explanation = document.createElement('span')
  explanation.className = 'perk-description'
  explanation.innerHTML = description
  button.append(explanation)
  button.setAttribute('aria-label', `${name}, ${explanation.textContent}`)
  return button
}

function place(indices: readonly number[], zone: DropZone) {
  if (ui.guide.open || !ascent || !indices.length || ascent.battle.phase !== 'assign') return
  const slot = zone === 'pool' ? null : zone
  const before = ascent.battle
  let battle = before
  for (const index of indices) battle = assignDie(battle, index, slot)
  if (indices.some((index) => battle.slots[index] !== before.slots[index])) sound.play('dice-place')
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
  if (ui.guide.open || !ascent) return
  const rerolled = rerollSelectedDice(ascent.battle, selected, extra)
  if (!rerolled) return
  ascent = { ...ascent, battle: rerolled.battle }
  render()
  sound.play('dice-roll')
  diceButtons[rerolled.focusIndex].focus()
}

ui.reroll.addEventListener('click', () => useReroll(false))
ui.extraReroll.addEventListener('click', () => useReroll(true))
ui.resolve.addEventListener('click', async () => {
  if (ui.guide.open || !ascent) return
  const before = ascent.battle
  const next = resolveAscentTurn(ascent)
  if (next === ascent) return
  ascent = next
  selected.clear()
  const { phase, lastExchange } = next.battle
  const pause = next.newUnlock || phase === 'won' || phase === 'lost'
  if (pause) {
    render('exchange')
    if (lastExchange) showExchange(before, phase, lastExchange)
    await wait(next.newUnlock ? 180 : exchangeDuration)
  }
  if (next.newUnlock) {
    render('unlock')
    sound.play('unlock')
    await wait(unlockDuration)
  }
  render()
  if (!pause && lastExchange) showExchange(before, phase, lastExchange)
  if (phase === 'won') sound.play('victory')
  if (phase === 'lost') sound.play('defeat')
  focusPhase()
})
ui.counter.addEventListener('click', async () => {
  if (ui.guide.open || !ascent || ascent.battle.phase !== 'counter' || ui.counter.disabled) return
  const next = spinYachtCounter(ascent.battle)
  const reward = next.lastExchange?.counter
  if (!reward) return
  ui.help.disabled = true

  const animate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (next.perk?.kind === 'counter') renderActivePerk(next)
  await roulette.reveal(reward, animate, () => sound.play('roulette-tick'))
  sound.play('roulette-stop')
  arena.counterStrike(reward.joint, animate)
  if (animate) await wait(145)
  sound.play('stone-hit')
  updateEnemyHp(next.enemyHp)
  await wait(reward.joint ? 1000 : 700)
  arena.finishStrike()
  ascent = { ...ascent, battle: next }
  render()
  if (next.phase === 'won') sound.play('victory')
  focusPhase()
})
ui.next.addEventListener('click', () => {
  if (!ascent) return
  clearExchange()
  ascent = nextAscentFight(ascent)
  render()
  sound.play('dice-roll')
  focusPhase()
})
ui.retry.addEventListener('click', () => showPerks(true))
showPerks(false)
