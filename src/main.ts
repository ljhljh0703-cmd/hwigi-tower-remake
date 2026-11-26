import {
  ascentFinished, beginMapAscent, enterMapNode, FIGHT_COUNT, nextAscentFight, resolveAscentTurn,
  returnToMap, rewardOffers, spinAscentCounter, takeAscentReward,
} from './ascent.ts'
import type { Ascent } from './ascent.ts'
import { CURRENT_MAP_RULES, MAP_ENEMY_BADGES, MAP_FLOORS, RULES_SIX_BADGES } from './ascent-map.ts'
import { BOSS_RELIC_CARDS, isBossRelic } from './boss-relic.ts'
import { ASCENT_SAVE_KEY, clearAscentSave, loadAscentSave, readAscentSave, writeAscentSave } from './ascent-save.ts'
import { Arena } from './arena.ts'
import type { BattleHit } from './arena.ts'
import { BattleAudio } from './battle-audio.ts'
import { BATTLE_GUIDE } from './battle-guide.ts'
import { oathDescription, PERK_TEXT, REWARD_TEXT } from './reward-copy.ts'
import { COMPANION_LINES, companionDieIndex } from './companion.ts'
import { enemyForFight } from './enemy-roster.ts'
import { loadGameSettings, saveGameSettings, toggleMute } from './game-settings.ts'
import type { GameSettings } from './game-settings.ts'
import { MAP_NODE_ICONS, ForkView } from './map-view.ts'
import { currentTreasureRoom, grantTreasure, healingFor, shopPrice, treasureCost, treasureEnabled } from './map-treasure.ts'
import { ARTIFACT_SLOTS, ITEMS, PREPARATIONS, SHARDS, artifactReady, isArtifact, itemUses } from './treasure.ts'
import type { Artifact, ArtifactOptions, CounterChoice } from './treasure.ts'
import { availableCounterChoices, cancelSeal, chooseHourglass, draftSeal, startHourglass, toggleArtifact, toggleShard } from './treasure-combat.ts'
import { relicReady, REWARD_CARDS, WEDGE_BONUS } from './rewards.ts'
import type { Reward, RewardChoice } from './rewards.ts'
import {
  allocationPower, assignDie, attackFor, chargedStrikePreview, combatSlots, DIE_COUNT, enemyIntentAt, incomingAttack, splitEnemyDamage,
} from './combat.ts'
import type { Exchange, Gimmick, SlotTotals } from './combat.ts'
import { collectorBonus, offerPerks, START_PERKS } from './perks.ts'
import type { Parity } from './perks.ts'
import {
  bladeChargePreview, canReroll, canResolveYachtTurn, previewUnlockProgress, toggleYachtWedge, tuneYachtDie, yachtAllocationTotals,
  emperorShieldActive, forecastYacht, yachtCounterRewards, yachtGimmick, yachtRerollCost,
} from './yacht-combat.ts'
import type { Hand, UnlockHint, YachtBattle } from './yacht-combat.ts'
import { bindDiceInput, rerollSelectedDice } from './dice-drag.ts'
import { dieCenter, playDiceMotion, playPlacementMotion } from './dice-motion.ts'
import { CounterRoulette } from './counter-roulette.ts'
import type { DropZone } from './dice-drag.ts'
import './style.css'

function element<T extends HTMLElement>(id: string): T {
  return document.querySelector<T>(`#${id}`)!
}

const ui = {
  main: document.querySelector('main')!,
  lobby: element('lobby'),
  masthead: element('masthead'),
  continueAscent: element<HTMLButtonElement>('continue-ascent'),
  saveNotice: element('save-notice'),
  newAscent: element<HTMLButtonElement>('new-ascent'),
  returnLobby: element<HTMLButtonElement>('return-lobby'),
  lobbyGuide: element<HTMLButtonElement>('lobby-guide'),
  lobbySound: element<HTMLButtonElement>('lobby-sound'),
  lobbySettings: element<HTMLButtonElement>('lobby-settings'),
  battleSettings: element<HTMLButtonElement>('battle-settings'),
  settings: element<HTMLDialogElement>('settings'),
  settingsMusic: element<HTMLButtonElement>('settings-music'),
  settingsEffects: element<HTMLButtonElement>('settings-effects'),
  settingsSpeed: Array.from(document.querySelectorAll<HTMLInputElement>('input[name="animation-speed"]')),
  settingsMotion: element<HTMLButtonElement>('settings-motion'),
  abandonAscent: element<HTMLButtonElement>('abandon-ascent'),
  confirm: element<HTMLDialogElement>('lobby-confirm'),
  confirmTitle: element('lobby-confirm-title'),
  confirmText: element('lobby-confirm-text'),
  confirmAction: element<HTMLButtonElement>('lobby-confirm-action'),
  perks: element('perks'),
  perkChoices: element('perk-choices'),
  battle: element('battle'),
  fork: element('ascent-fork'),
  mapHealth: element('map-health'),
  mapFloor: element('map-floor'),
  runCoins: element('run-coins'),
  mapRest: element('map-rest-marker'),
  encounter: document.querySelector<HTMLElement>('.encounter')!,
  encounterName: element('encounter-name'),
  fight: element('fight'),
  activePerk: element('active-perk'),
  bladeMeter: element('blade-meter'),
  companionFlight: element('companion-flight'),
  companionAwakenLine: element('companion-awaken-line'),
  companionSleepLine: element('companion-sleep-line'),
  turn: element('turn'),
  help: element<HTMLButtonElement>('help'),
  soundToggle: element<HTMLButtonElement>('sound-toggle'),
  guide: element<HTMLDialogElement>('battle-guide'),
  guideEntries: element('guide-entries'),
  intent: element('intent'),
  playerHp: element<HTMLMeterElement>('player-hp'),
  enemyHp: element<HTMLMeterElement>('enemy-hp'),
  playerTotal: element('player-total'),
  enemyTotal: element('enemy-total'),
  enemyStatus: element('enemy-status'),
  escortGuard: element('escort-guard'),
  escortGuardVital: element('escort-guard-vital'),
  escortGuardTotal: element('escort-guard-total'),
  feedback: element('feedback'),
  playerDamage: element('player-damage'),
  enemyDamage: element('enemy-damage'),
  escortDamage: element('escort-damage'),
  hitOrder: element('hit-order'),
  parry: element('parry-cue'),
  unlockImpact: element('unlock-impact'),
  awakening: element('awakening'),
  newUnlock: element('new-unlock'),
  unlockHeading: element('unlock-heading'),
  unlockReveal: element('unlock-reveal'),
  ownedUnlocks: element('owned-unlocks'),
  finalUnlock: element('final-unlock'),
  ascentEvent: element('ascent-event'),
  eventFloor: element('event-floor'),
  result: element('result'),
  completionSeal: element('completion-seal'),
  rewardPanel: element('reward-panel'),
  rewardHeading: element('reward-heading'),
  rewardContext: element('reward-context'),
  rewardCards: element('reward-cards'),
  rewardPreview: element('reward-preview'),
  confirmReward: element<HTMLButtonElement>('confirm-reward'),
  skipReward: element<HTMLButtonElement>('skip-reward'),
  rewardStrip: element('reward-strip'),
  artifactStrip: element('artifact-strip'),
  bossRelicSlot: element('boss-relic-slot'),
  artifactOptions: element('artifact-options'),
  treasureControls: element('treasure-controls'),
  tuningControls: element('tuning-controls'),
  tuneDown: element<HTMLButtonElement>('tune-down'),
  tuneUp: element<HTMLButtonElement>('tune-up'),
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
  attackBonus: element('attack-bonus'),
  wedgeBonus: element('wedge-bonus'),
  attackMultiplier: element('attack-multiplier'),
  guardTotal: element('guard-total'),
  guardBonus: element('guard-bonus'),
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
  triple: { icon: 'companion-awake', value: '+1', label: '에고 주사위' },
  straight: { icon: 'reroll-die', value: '1', label: '전투당 재굴림 주사위 1회' },
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
      <div class="guide-entry" data-guide-icon="${symbol}" data-guide-name="${name}">
        <dt>${icon(symbol)}<strong>${name}</strong></dt>
        <dd>${description}</dd>
      </div>
    `).join('')}</dl>
  </section>
`).join('')

let guideTrigger: HTMLButtonElement | undefined
function openGuide(button: HTMLButtonElement, symbol?: string, name?: string) {
  if (button.disabled || ui.guide.open) return
  guideTrigger = button
  ui.guide.showModal()
  ui.guideEntries.scrollTop = 0
  const entry = symbol && (name && ui.guideEntries.querySelector(`[data-guide-icon="${symbol}"][data-guide-name="${name}"]`) || ui.guideEntries.querySelector(`[data-guide-icon="${symbol}"]`))
  if (entry) ui.guideEntries.scrollTop = entry.getBoundingClientRect().top - ui.guideEntries.getBoundingClientRect().top - 12
}

for (const button of [ui.help, ui.lobbyGuide]) {
  button.addEventListener('click', () => openGuide(button))
}
ui.guide.addEventListener('click', (event) => {
  if (event.target === ui.guide) ui.guide.close()
})
ui.guide.addEventListener('close', () => guideTrigger?.focus())

const enemyBadges: Record<string, { icon: string; label: string }> = {
  thorns: { icon: 'thorns', label: '가시' },
  lock: { icon: 'lock', label: '자물쇠' },
  freeze: { icon: 'freeze', label: '얼림' },
  rage: { icon: 'rage', label: '격분' },
  reaction: { icon: 'reaction', label: '반응' },
  vitality: { icon: 'vitality', label: '체력 비례 일격' },
  escort: { icon: 'escort', label: '호위와 주사위 빼앗기' },
  boss: { icon: 'charge', label: '힘 모으는 보스' },
  ...MAP_ENEMY_BADGES,
}
const rulesSixBadges: Partial<typeof enemyBadges> = RULES_SIX_BADGES
const gimmickEffects = {
  trip: { icon: 'stun', help: '적의 다음 공격을 한 번 건너뛰어요.' },
  armor: { icon: 'armor-break', value: '×1.5', help: '다음 턴부터 공격 피해가 1.5배예요.' },
  reflect: { icon: 'reflect', help: '철추 피해를 적에게 돌려줘요.' },
  topple: { icon: 'knockdown', value: '×2', help: '다음 턴에 적이 쉬고 공격 피해가 2배예요.' },
  retreat: { icon: 'escort-exit', help: '호위가 물러나고 공격이 본체에 닿아요.' },
} satisfies Record<Gimmick, { icon: string; value?: string; help: string }>

let ascent: Ascent | null = null
let chosenReward: Reward | undefined
let artifactOptions: ArtifactOptions = {}
let exchangeBusy = false
let stopDiceMotion: (() => void) | undefined
let stopPlacementMotion: (() => void) | undefined
const selected = new Set<number>()
const roulette = new CounterRoulette(ui.counterPanel, ui.counter)
const sound = new BattleAudio()
const systemMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
let settings = loadGameSettings()
const forkView = new ForkView(ui.fork, { health: ui.mapHealth, floor: ui.mapFloor }, icon, enterFork)

function reducedMotion() { return settings.reducedMotion ?? systemMotion.matches }
function animationSpeed() { return settings.speed === 'fast' ? 2 : 1 }
function effectDuration(milliseconds: number) { return milliseconds / animationSpeed() }

function renderSettings() {
  const reduced = reducedMotion()
  document.documentElement.dataset.reducedMotion = String(reduced)
  document.documentElement.dataset.animationSpeed = settings.speed
  arena.setAnimation(animationSpeed(), reduced)
  if (reduced) {
    roulette.finishMotion()
    stopDiceMotion?.()
    stopPlacementMotion?.()
  }
  const switches = [
    [ui.settingsMusic, settings.music], [ui.settingsEffects, settings.effects], [ui.settingsMotion, reduced],
  ] as const
  for (const [button, checked] of switches) {
    button.setAttribute('aria-checked', String(checked))
    button.querySelector('strong')!.textContent = checked ? '켬' : '끔'
  }
  for (const option of ui.settingsSpeed) option.checked = option.value === settings.speed
  const muted = !settings.music && !settings.effects
  for (const button of [ui.soundToggle, ui.lobbySound]) {
    button.setAttribute('aria-pressed', String(muted))
    button.querySelector('use')!.setAttribute('href', muted ? '#icon-sound-off' : '#icon-sound-on')
  }
  sound.setEnabled(settings.music, settings.effects)
}

function updateSettings(next: GameSettings, activateAudio = false) {
  settings = next
  saveGameSettings(settings)
  renderSettings()
  if (activateAudio) sound.activate()
}

function toggleSound(event: MouseEvent) {
  if (!event.isTrusted) return
  updateSettings(toggleMute(settings), true)
}

ui.soundToggle.addEventListener('click', toggleSound)
ui.lobbySound.addEventListener('click', toggleSound)
for (const button of [ui.lobbySettings, ui.battleSettings]) {
  button.addEventListener('click', () => {
    const phase = ascent?.battle.phase
    ui.abandonAscent.hidden = phase !== 'assign' && phase !== 'counter'
    ui.settings.showModal()
  })
}
ui.settings.addEventListener('click', (event) => {
  if (event.target === ui.settings) ui.settings.close()
})
for (const [button, channel] of [[ui.settingsMusic, 'music'], [ui.settingsEffects, 'effects']] as const) {
  button.addEventListener('click', (event) => {
    const enabled = !settings[channel]
    updateSettings({ ...settings, [channel]: enabled, restoreAudio: undefined }, event.isTrusted && enabled)
  })
}
for (const option of ui.settingsSpeed) {
  option.addEventListener('change', () => updateSettings({ ...settings, speed: option.value === 'fast' ? 'fast' : 'normal' }))
}
ui.settingsMotion.addEventListener('click', () => updateSettings({ ...settings, reducedMotion: !reducedMotion() }))
systemMotion.addEventListener('change', renderSettings)

document.addEventListener('visibilitychange', () => { if (document.hidden) sound.suspend() })
window.addEventListener('pagehide', () => sound.suspend())
function resumeAudio(event: Event) {
  if (event.isTrusted && !document.hidden) sound.resumeOnGesture()
}
window.addEventListener('pointerup', (event) => { if (event.pointerType !== 'touch') resumeAudio(event) }, true)
window.addEventListener('touchend', resumeAudio, { capture: true, passive: true })
window.addEventListener('keydown', resumeAudio, true)

function saveCurrent(checkpoint = ascent) {
  if (checkpoint) writeAscentSave({
    ascent: checkpoint, selected: [...selected], rewardPreview: chosenReward,
    ...(isArtifact(chosenReward) && { artifactOptions }),
  })
}

let onConfirm: (() => void) | undefined
function confirmLobbyAction(title: string, description: string, label: string, action: () => void) {
  ui.confirmTitle.textContent = title
  ui.confirmText.textContent = description
  ui.confirmAction.textContent = label
  ui.confirm.returnValue = ''
  onConfirm = action
  ui.confirm.showModal()
}

ui.confirm.addEventListener('close', () => {
  const action = onConfirm
  onConfirm = undefined
  if (ui.confirm.returnValue === 'confirm') action?.()
})

ui.abandonAscent.addEventListener('click', () => {
  if (ascent?.battle.phase !== 'assign' && ascent?.battle.phase !== 'counter') return
  confirmLobbyAction('등반을 포기할까요?', '포기하면 현재 등반의 저장이 사라집니다.', '등반 포기', () => {
    clearAscentSave()
    ui.settings.close()
    showLobby(true)
  })
})

const holdHelp = element('hold-help')
let helpTarget: HTMLElement | undefined
let holding: { timer: number; x: number; y: number } | undefined
function stopHolding() {
  if (holding) window.clearTimeout(holding.timer)
  holding = undefined
}
function showHelp(target: HTMLElement) {
  helpTarget = target
  holdHelp.textContent = target.dataset.helpText ?? target.getAttribute('aria-label')
  holdHelp.hidden = false
  const bounds = target.getBoundingClientRect()
  const width = holdHelp.offsetWidth
  const height = holdHelp.offsetHeight
  const left = bounds.left + (bounds.width - width) / 2
  const top = bounds.top > height + 16 ? bounds.top - height - 8 : bounds.bottom + 8
  holdHelp.style.left = `${Math.min(innerWidth - width - 16, Math.max(16, left))}px`
  holdHelp.style.top = `${Math.min(innerHeight - height - 16, top)}px`
}
const helpTargets = Array.from(document.querySelectorAll<HTMLElement>('[data-hold-help]'))
for (const target of helpTargets) {
  target.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    stopHolding()
    holding = { timer: window.setTimeout(() => showHelp(target), 450), x: event.clientX, y: event.clientY }
  })
  target.addEventListener('click', (event) => {
    if (target.classList.contains('pool-return') && helpTarget === target && !holdHelp.hidden) {
      event.preventDefault()
      event.stopPropagation()
    }
  }, { capture: true })
  target.addEventListener('contextmenu', (event) => event.preventDefault())
  target.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    if (target.querySelector('button:enabled')) return
    event.preventDefault()
    showHelp(target)
  })
}
document.addEventListener('pointermove', (event) => {
  if (holding && Math.hypot(event.clientX - holding.x, event.clientY - holding.y) > 8) stopHolding()
})
for (const type of ['pointerup', 'pointercancel'] as const) document.addEventListener(type, stopHolding)
document.addEventListener('pointerdown', () => { holdHelp.hidden = true }, { capture: true })
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') holdHelp.hidden = true })
for (const target of [ui.intent, ui.lockedDie, element('pool-help')]) {
  target.addEventListener('click', () => showHelp(target))
}
ui.bladeMeter.addEventListener('click', (event) => {
  if (ui.assign.attack.disabled) showHelp(ui.bladeMeter)
  if (helpTarget === ui.bladeMeter && !holdHelp.hidden) event.stopPropagation()
})
window.addEventListener('resize', () => { holdHelp.hidden = true })

const arena = new Arena(element('arena'), ui.encounter, ui.intent, document.querySelector<HTMLElement>('.inventory-strip')!)

const diceButtons = Array.from({ length: DIE_COUNT + 1 }, (_, index) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'die'
  button.id = `die-${index}`
  bindDiceInput(button, {
    select: (source) => {
      if (ui.guide.open || exchangeBusy || stopDiceMotion) return
      if (source === 'pointer' && ascent?.battle.slots[index]) {
        place([index], 'pool')
        return
      }
      if (!selected.delete(index)) selected.add(index)
      saveCurrent()
      render()
    },
    lift: () => {
      const indices = selected.has(index) ? [...selected].sort((a, b) => a - b) : [index]
      const battle = ascent?.battle
      const mechanic = battle && enemyIntentAt(battle).mechanic
      const faces = battle ? indices.map((die) => mechanic?.kind === 'seal' && battle.dice[die] === mechanic.value ? '봉인' : battle.dice[die]) : []
      return { indices, faces: faces.join('  '), companion: !!battle && indices.length === 1 && indices[0] === companionDieIndex(battle) }
    },
    drop: (indices, zone) => place(indices, zone),
  })
  return button
})

for (const zone of combatSlots) {
  for (let index = 0; index <= DIE_COUNT; index++) {
    const seat = document.createElement('span')
    seat.className = 'die-seat'
    seat.setAttribute('aria-hidden', 'true')
    ui.dice[zone].append(seat)
  }
}

const stolenPlaceholder = document.createElement('span')
stolenPlaceholder.className = 'die stolen-die'
stolenPlaceholder.setAttribute('role', 'img')

function renderUnlockProgress(hint: HTMLElement, preview?: UnlockHint) {
  const { progress, blocked } = preview ?? { progress: 0 }
  hint.classList.toggle('unlock-partial', progress === 2)
  hint.classList.toggle('unlock-ready', progress === 3)
  hint.querySelector('.unlock-blocker')?.remove()
  if (!blocked) return ''
  hint.insertAdjacentHTML('beforeend', `<span class="unlock-blocker">${icon(blocked === 'guard' ? 'parry' : 'seal')}</span>`)
  return blocked === 'guard' ? ', 정확 방어가 필요함' : ', 봉인된 눈은 제외됨'
}

function renderSlotTotal(total: HTMLElement, bonus: HTMLElement, value: number, added: number) {
  total.textContent = String(value)
  bonus.hidden = added === 0
  bonus.textContent = added ? `+${added}` : ''
  return added ? `, 특전 보너스 ${added} 포함` : ''
}

function refreshDice(battle: YachtBattle, { attack, guard }: SlotTotals, unlocks: readonly Hand[]) {
  const planning = battle.phase === 'assign'
  const pendingUnlock = unlocks.length < 2 ? previewUnlockProgress(battle) : undefined
  const intent = enemyIntentAt(battle)
  const mechanic = intent.mechanic
  const companion = companionDieIndex(battle)
  diceButtons.forEach((button, index) => {
    const value = battle.dice[index]
    button.hidden = value === undefined
    const isCompanion = index === companion
    button.classList.toggle('companion-die', isCompanion)
    if (value === undefined) return
    button.disabled = !planning
    const slot = battle.slots[index]
    const parent = ui.dice[slot ?? 'pool']
    const fixed = battle.fixedDie?.index === index ? battle.fixedDie.kind : undefined
    const sealed = mechanic?.kind === 'seal' && value === mechanic.value
    const oathFace = battle.perk?.kind === 'oath' && !sealed && value % 2 === Number(battle.perk.parity === 'odd')
    const picked = selected.has(index)
    const indicators = [
      picked && icon('map-check'),
      fixed && icon(fixed),
      sealed && icon('seal'),
      oathFace && icon(parityIcons[value % 2 ? 'odd' : 'even']),
    ].filter(Boolean).join('')
    button.innerHTML = `<span class="die-face${isCompanion ? ' ego-face' : ''}">${value}</span><span class="die-indicators" aria-hidden="true">${indicators}</span>`
    const place = slot ? { attack: '공격', guard: '방어' }[slot] : '미배치'
    let faceLabel = ''
    if (oathFace) faceLabel = `, 공격에 놓으면 +${START_PERKS.oath.bonus}`
    if (fixed) faceLabel += `, ${fixed === 'lock' ? '잠김' : '얼림'}, 재굴림 불가`
    if (sealed) faceLabel += ', 봉인된 눈은 합계에서 빠짐'
    const name = isCompanion ? '에고 주사위' : `주사위 ${index + 1}`
    button.setAttribute('aria-label', `${name}, ${value}, ${place}${faceLabel}`)
    button.setAttribute('aria-pressed', String(picked))
    if (parent !== button.parentElement) parent.append(button)
  })

  for (const zone of combatSlots) {
    const row = ui.dice[zone]
    const used = row.querySelectorAll('.die:not([hidden])').length
    row.querySelectorAll<HTMLElement>('.die-seat').forEach((seat, index) => {
      seat.hidden = used + index >= battle.dice.length
    })
  }

  const stolen = battle.stolenDie?.remaining
  stolenPlaceholder.hidden = stolen === undefined
  if (stolen !== undefined) {
    stolenPlaceholder.innerHTML = `<span class="recovery-progress">${icon('return')}${stolen}</span><span class="die-status">${icon('steal')}</span>`
    stolenPlaceholder.setAttribute('aria-label', `빼앗긴 주사위, 적에게 피해 ${stolen}을 주면 되찾음`)
    ui.dice.pool.append(stolenPlaceholder)
  }
  ui.lockedDie.hidden = unlocks.includes('triple')
  const tripleHint = renderUnlockProgress(ui.lockedDie, ui.lockedDie.hidden ? undefined : pendingUnlock?.triple)
  ui.lockedDie.setAttribute('aria-label', `공격이나 정확히 막은 방어 칸에 같은 눈 셋을 놓으면 에고 주사위가 열려요${tripleHint}.`)

  const withoutPerk = allocationPower(battle)
  const bladeReady = planning && bladeChargePreview(battle)?.ready
  const wedge = battle.wedgeArmed ? WEDGE_BONUS : 0
  const perkBonus = battle.perk?.kind === 'blade' ? 0 : attack - withoutPerk.attack - wedge
  const attackHint = renderSlotTotal(ui.attackTotal, ui.attackBonus, attack, perkBonus)
  ui.wedgeBonus.hidden = !wedge
  ui.wedgeBonus.innerHTML = wedge ? `${icon('reward-wedge')}+${wedge}` : ''
  ui.attackMultiplier.hidden = !bladeReady
  ui.attackMultiplier.textContent = `×${START_PERKS.blade.multiplier}`
  const multiplierHint = bladeReady ? `, 큰 칼 준비, 공격 피해 ${START_PERKS.blade.multiplier}배` : ''
  const wedgeHint = wedge ? `, 쇠쐐기 보너스 ${wedge} 포함` : ''
  ui.assign.attack.setAttribute('aria-label', `공격 칸, 피해 ${attack}${attackHint}${multiplierHint}${wedgeHint}`)
  const guardHint = renderSlotTotal(ui.guardTotal, ui.guardBonus, guard, guard - withoutPerk.guard)
  ui.assign.guard.setAttribute('aria-label', `방어 칸, 합계 ${guard}${guardHint}`)
  const canPlace = planning && selected.size > 0
  const rerollable = [...selected].filter((index) => canReroll(battle, index))
  ui.assign.pool.disabled = !canPlace || ![...selected].some((index) => battle.slots[index] !== null)
  ui.assign.pool.parentElement!.tabIndex = ui.assign.pool.disabled ? 0 : -1
  ui.assign.attack.disabled = !canPlace
  ui.assign.guard.disabled = !canPlace
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
  ui.extraReroll.disabled = selected.size !== 1 || rerollable.length !== 1 || !battle.rerolled || !battle.extraRerollAvailable
  const extra = Number(battle.extraRerollAvailable)
  const straight = pendingUnlock?.straight
  const sealedStraight = rerollLocked && straight?.blocked === 'seal'
  const rerollStatus = !rerollLocked ? '열림' : sealedStraight ? '봉인됨' : straight?.progress === 3 ? '준비' : '잠김'
  ui.extraReroll.innerHTML = sealedStraight ? icon('seal')
    : `${icon(unlockInfo.straight.icon)}${rerollLocked ? '' : extra}<span class="reroll-state">${rerollStatus}</span>`
  const straightHint = renderUnlockProgress(ui.extraReroll, rerollLocked && !sealedStraight ? straight : undefined)
  const rerollLabel = rerollLocked ? `재굴림 ${rerollStatus}, 같은 칸에 이어지는 눈 셋${straightHint}` : `재굴림 열림, 이번 전투 ${extra}회 남음`
  ui.extraReroll.setAttribute('aria-label', rerollLabel)
  ui.extraReroll.title = rerollLabel
  ui.resolve.disabled = !planning || !canResolveYachtTurn(battle)
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

function renderEnemyStatus(battle: YachtBattle) {
  const statuses: string[] = []
  const chip = (kind: 'trip' | 'armor' | 'topple', label: string, count: string) =>
    `<span class="enemy-status-chip" data-status="${kind}" role="img" aria-label="${label}">${icon(gimmickEffects[kind].icon)}<b>${count}</b></span>`
  if (battle.rulesSix && battle.enemyHp > 0 && (battle.phase === 'assign' || battle.phase === 'counter')) {
    const interruption = battle.interrupted?.kind
    if (interruption === 'trip') statuses.push(chip('trip', '기절 · 공격 1회 남음', '1'))
    if (interruption === 'topple' || (battle.phase === 'assign' && enemyIntentAt(battle).id === 'knockdown')) {
      statuses.push(chip('topple', '넘어짐 · 1턴 남음', '1'))
    }
    if (battle.armorBroken) statuses.push(chip('armor', '갑옷 파괴 · 전투가 끝날 때까지', '∞'))
  }
  ui.enemyStatus.innerHTML = statuses.join('')
  ui.enemyStatus.hidden = !statuses.length
}

function renderIntent(battle: YachtBattle, totals: SlotTotals, enemyId: string) {
  const badge = (battle.rulesSix && rulesSixBadges[enemyId]) || enemyBadges[enemyId]
  const clause = battle.phase === 'assign' ? yachtGimmick(battle) : null
  const ready = Boolean(clause?.ready)
  const escort = clause?.kind === 'retreat' && ready ? undefined : battle.escort
  const badgeIcon = battle.rulesSix || escort && badge.icon === 'escort' ? '' : icon(badge.icon)
  ui.encounter.dataset.gimmick = clause?.kind ?? ''
  ui.encounter.classList.toggle('gimmick-ready', ready)
  ui.encounter.classList.toggle('armor-broken', Boolean(battle.armorBroken))
  const effect = clause ? gimmickEffects[clause.kind] : undefined
  const multiplier = effect && 'value' in effect ? `<b>${effect.value}</b>` : ''
  const mark = clause && effect ? `<span class="gimmick-mark" data-kind="${clause.kind}" data-ready="${ready}" aria-hidden="true">
    <i>${icon(clause.slot === 'guard' ? 'shield' : 'sword')}</i>
    <i>${clause.face === null ? icon('stacked-pair') : `<span class="gimmick-die" data-face="${clause.face}">${'<b></b>'.repeat(clause.face)}</span>`}</i>
    <span class="gimmick-arrow">${icon('next')}</span><span class="gimmick-effect">${icon(effect.icon)}${multiplier}</span>
  </span>` : ''
  if (effect) ui.intent.dataset.helpText = effect.help
  else delete ui.intent.dataset.helpText
  ui.intent.setAttribute('role', effect ? 'button' : 'img')
  const display = (symbol: string, value: string, label: string, detail = badgeIcon) => {
    const secondary = detail ? `<span class="intent-detail">${detail}</span>` : ''
    const priority = escort ? `<span class="intent-detail intent-escort" aria-hidden="true">${icon('sword')}${icon('next')}${icon('escort')}<span class="intent-escort-hp">${escort.hp}</span></span>` : ''
    ui.intent.innerHTML = `<span>${icon(symbol)}${value ? `<strong>${value}</strong>` : ''}</span>${secondary}${mark}${priority}`
    const condition = clause ? ` · ${clause.name} · ${clause.slot === 'attack' ? '공격' : '방어'} ${clause.face ?? '같은 눈 둘'}${ready ? ' · 성립' : ''}` : ''
    ui.intent.setAttribute('aria-label', `${badge.label} · ${label}${condition}${effect ? ` · ${effect.help}` : ''}`)
    if (escort) ui.intent.setAttribute('aria-description', `공격 대상 1순위 호위병 · 생존 시 적 공격 +${escort.bonus}`)
    else ui.intent.removeAttribute('aria-description')
  }
  const { phase } = battle
  ui.intent.hidden = phase === 'won' || phase === 'lost'
  if (phase === 'counter') {
    display('parry', '', '정확히 막았어요. 룰렛으로 반격할 수 있어요.')
  } else if (phase === 'assign') {
    const intent = enemyIntentAt(battle)
    const attackingBattle = escort === battle.escort ? battle : { ...battle, escort }
    const charge = chargedStrikePreview(attackingBattle, totals, battle.loot?.armed?.includes('hammer'))
    if (charge) {
      const { threshold, totalDamage, hammerThreshold } = charge
      const secondary = hammerThreshold ? `${icon('treasure-hammer')}${hammerThreshold}` : `${icon('break-charge')}${threshold}`
      display('charge', String(totalDamage), hammerThreshold
        ? `본체에 닿는 공격 피해가 ${hammerThreshold} 이상이면 망치가 다음 큰 공격을 막아요.`
        : `본체에 닿는 공격 피해가 ${threshold} 이상이면 다음 큰 공격을 약하게 만들어요.`, secondary)
      return
    }
    if (intent.damageTakenMultiplier !== undefined) {
      const multiplier = intent.damageTakenMultiplier
      display('knockdown', `×${multiplier}`, `적이 쓰러져 있어 이번 공격이 ${multiplier}배예요.`)
      return
    }
    const mechanic = intent.mechanic
    const { hits } = incomingAttack(attackingBattle, totals)
    if (emperorShieldActive(battle) && hits.length) {
      const remaining = forecastYacht(battle).incoming
      display('shield', remaining.hits.length ? hitNumbers(remaining.hits) : '0',
        `황제의 방패 적용 · 남은 공격 ${remaining.totalDamage}`, '')
      return
    }
    if (intent.id === 'stunned') {
      display('stun', '0', '기절해서 공격을 쉬어요.', '')
      return
    }
    if (intent.id === 'critical' && battle.erasedStrikeTurn === battle.turn) {
      display('treasure-hammer', '0', '망치가 적의 큰 공격을 막았어요.')
      return
    }
    let label = hits.length ? `피해 ${hitNumbers(hits)}의 공격이 와요.` : intent.name
    let detail = badgeIcon
    if (mechanic) {
      switch (mechanic.kind) {
        case 'lock':
          detail = `${icon('lock')}1`
          label = '다음 차례에 가장 낮은 주사위 하나를 잠가요.'
          break
        case 'freeze':
          detail = `${icon('freeze')}1`
          label = '다음 차례에 주사위 하나를 1로 얼려요.'
          break
        case 'thorns':
          detail = `${icon('thorns')}${mechanic.value}`
          label = `공격에 놓은 주사위마다 가시 피해 ${mechanic.value}를 받아요.`
          break
        case 'rage':
          detail = `${icon('rage')}${mechanic.value}`
          label = `다시 굴리면 적 공격이 ${mechanic.value}만큼 세져요.`
          break
        case 'reaction': {
          const alternate = hitNumbers(attackFor(battle, mechanic.alternate).hits)
          detail = `${icon('reaction')}${mechanic.value}`
          label = `공격 합이 ${mechanic.value} 이상이면 적 공격이 ${alternate}로 바뀌어요.`
          break
        }
        case 'vitality':
          detail = icon('vitality')
          label = '내 체력이 높을수록 적의 공격이 세져요.'
          break
        case 'seal':
          detail = `${icon('seal')}${mechanic.value}`
          label = `이번 차례에 ${mechanic.value} 눈은 합계와 해금에서 빠져요.`
          break
        case 'steal':
          if (!battle.stolenDie) {
            detail = `${icon('steal')}1`
            label = '다음 차례부터 주사위 하나를 빼앗겨요.'
          }
          break
        case 'escort':
          if (!battle.escort) {
            detail = `${icon('escort')}${mechanic.hp}`
            label = `호위병 소환 · 체력 ${mechanic.hp} · 생존 시 적 공격 +${mechanic.bonus}`
          }
          break
      }
    }
    display(hits.length ? (intent.id === 'critical' ? 'critical' : 'sword') : badge.icon, hits.length ? hitNumbers(hits) : '0', label, detail)
  }
}

const damageDuration = 700
const chipDelay = 350
const parryDuration = 120
const unlockImpactDuration = 300
const unlockDuration = 650
const companionAwakenDuration = 520
const companionFlightDuration = 500
const companionImpactTime = 350
const incomingContact = 152
const repeatContact = 248
const escortDefeatPause = 160
const damageOutput = { player: ui.playerDamage, enemy: ui.enemyDamage, escort: ui.escortDamage }

function clearExchange() {
  for (const output of Object.values(damageOutput)) output.replaceChildren()
  ui.hitOrder.replaceChildren()
  ui.hitOrder.hidden = true
  ui.parry.hidden = true
  ui.awakening.hidden = true
  arena.clearContact()
}

function showDamage(hit: BattleHit) {
  const { target, damage } = hit
  const number = document.createElement('span')
  number.className = 'damage-number'
  number.classList.toggle('heavy', damage >= 5)
  number.textContent = `−${damage}`
  number.style.setProperty('--damage-scale', String(1 + .25 * Math.log2(damage)))
  damageOutput[target].append(number)
  window.setTimeout(() => number.remove(), effectDuration(damageDuration))
}

function markVital(vital: HTMLElement) {
  vital.getAnimations().filter((animation) => animation.id === 'hurt').forEach((animation) => animation.cancel())
  const animation = vital.animate([
    { boxShadow: 'inset 0 0 0 2px #f2ddc8' },
    { boxShadow: 'inset 0 0 0 2px #f2ddc8' },
  ], 640)
  animation.id = 'hurt'
}

function updateVital(meter: HTMLMeterElement, label: HTMLElement, hp: number, max = meter.max) {
  const previous = meter.max === max ? meter.value : hp
  meter.max = max
  meter.value = hp
  label.textContent = `${hp}/${max}`
  if (hp >= previous) return
  if (reducedMotion()) {
    markVital(meter.closest<HTMLElement>('.vital')!)
    return
  }
  const trail = meter.nextElementSibling as HTMLElement
  trail.getAnimations().forEach((animation) => animation.cancel())
  trail.style.left = `${hp / max * 100}%`
  trail.animate([
    { width: `${(previous - hp) / max * 100}%` },
    { width: '0%' },
  ], { duration: effectDuration(140), delay: effectDuration(chipDelay), fill: 'backwards', easing: 'ease-out' })
}

function updateEscortVital(hp: number) {
  ui.escortGuardTotal.textContent = String(hp)
  ui.escortGuardVital.setAttribute('aria-label', `호위병 체력 ${hp}`)
  if (hp === 0) {
    ui.intent.querySelector('.intent-escort')?.remove()
    ui.intent.removeAttribute('aria-description')
  } else {
    const previewHp = ui.intent.querySelector('.intent-escort-hp')
    if (previewHp) previewHp.textContent = String(hp)
  }
}

function showParry() {
  ui.parry.hidden = false
  sound.play('perfect-block')
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((finish) => window.setTimeout(finish, effectDuration(milliseconds)))
}

async function showExchange(before: YachtBattle, after: YachtBattle, exchange: Exchange) {
  const { dealt, hitsTaken, awakenedDice, escortDealt } = exchange
  const retreat = exchange.gimmick === 'retreat'
  const reflected = exchange.gimmick === 'reflect'
  const taken = hitsTaken.reduce((sum, value) => sum + value, 0)
  const totals = yachtAllocationTotals(before, before.slots, awakenedDice ?? before.dice)
  const opening = splitEnemyDamage(retreat ? { ...before, escort: undefined } : before, totals.attack)
  const lateEscortDamage = (escortDealt ?? 0) - opening.escortDealt
  // 아이템 추가 피해가 적을 쓰러뜨려도 원래 확정된 공격 타수는 표시한다.
  const incoming = opening.dealt < before.enemyHp
    ? Math.min(hitsTaken.length, forecastYacht(before, before.slots, awakenedDice ?? before.dice, yachtGimmick(before)).incoming.hits.length) : 0
  const thorns = hitsTaken.length > incoming ? hitsTaken.at(-1)! : 0
  const exact = after.phase === 'counter'
  const ordered = incoming > 1
  const entries = ordered ? hitsTaken.map((_, index) => {
    const item = document.createElement('li')
    const label = index < incoming ? `${index + 1}타` : '가시'
    item.setAttribute('aria-label', `${label} · 대기`)
    item.innerHTML = `${icon(index < incoming ? 'sword' : 'thorns')}<span aria-hidden="true">…</span>`
    return { item, label }
  }) : []
  ui.hitOrder.replaceChildren(...entries.map(({ item }) => item))
  ui.hitOrder.hidden = !ordered
  const readHit = (index: number) => {
    const entry = entries[index]
    if (!entry) return
    const damage = hitsTaken[index]
    const symbol = index >= incoming ? 'thorns' : damage ? 'sword' : 'shield'
    entry.item.setAttribute('aria-label', `${entry.label} · ${damage ? `피해 ${damage}` : '막음 0'}`)
    entry.item.innerHTML = `${icon(symbol)}<span aria-hidden="true">${damage}</span>`
    entry.item.dataset.result = damage ? 'damage' : 'blocked'
  }
  const start = performance.now()
  const at = async (time: number) => {
    const remaining = start + effectDuration(time) - performance.now()
    if (!reducedMotion() && remaining > 0) {
      await new Promise<void>((finish) => window.setTimeout(finish, remaining))
    }
  }
  type HitCue = { pitch?: number; guarded?: boolean; ordered?: boolean; parry?: boolean }
  const emit = (hits: BattleHit[], { pitch = 1, ...contact }: HitCue = {}) => {
    arena.contact(hits, contact)
    for (const hit of hits) showDamage(hit)
    if (hits.length || contact.guarded) sound.play('stone-hit', pitch)
  }
  const enemyHit: BattleHit[] = dealt ? [{ target: 'enemy', damage: dealt, defeated: after.enemyHp === 0 }] : []
  const earlyEnemyHit = lateEscortDamage ? [] : enemyHit
  const heroHit = (damage: number, final = true): BattleHit[] => damage ? [{ target: 'player', damage, defeated: final && after.playerHp === 0 }] : []
  const renewed = exchange.heartRevived || after.phase === 'won' && before.bossRelic?.id === 'healing-scepter' && after.playerHp > before.playerHp - taken
  const updatePlayer = () => updateVital(ui.playerHp, ui.playerTotal, renewed ? Math.max(0, before.playerHp - taken) : after.playerHp)
  const updateEnemy = () => updateVital(ui.enemyHp, ui.enemyTotal, after.enemyHp)
  arena.playExchange(before, exchange)
  ui.awakening.hidden = !awakenedDice
  ui.awakening.innerHTML = awakenedDice ? `${icon('die')}${awakenedDice.map((face) => `<span>${face}</span>`).join('')}` : ''
  ui.awakening.setAttribute('aria-label', awakenedDice ? `각성 ${awakenedDice.join(', ')}` : '')

  const hitEscort = (damage: number, hp: number) => {
    emit([{ target: 'escort', damage, defeated: hp === 0 }])
    updateEscortVital(hp)
  }
  if (retreat) {
    if (!reducedMotion()) await at(60)
    sound.play('dice-place', .72)
    updateEscortVital(0)
  }
  if (reflected) {
    if (!reducedMotion()) await at(65)
    showParry()
  }
  if (exchange.gimmick === 'armor' || exchange.gimmick === 'trip' || exchange.gimmick === 'topple') {
    if (!reducedMotion()) await at(75)
    sound.play('stone-hit', exchange.gimmick === 'armor' ? 1.33 : .82)
  }
  if (emperorShieldActive(before) && !reflected) sound.play('stone-hit', .62)
  if (opening.escortDealt && before.escort) {
    if (!reducedMotion()) await at(45)
    hitEscort(opening.escortDealt, before.escort.hp - opening.escortDealt)
  }
  if (incoming) arena.queueShadow(start + effectDuration(incomingContact), false)
  if (ordered) {
    if (earlyEnemyHit.length || thorns) {
      if (!reducedMotion()) await at(96)
      emit([...earlyEnemyHit, ...heroHit(thorns, false)])
      if (earlyEnemyHit.length) updateEnemy()
      if (thorns) readHit(incoming)
    }
    for (let index = 0; index < incoming; index++) {
      const time = incomingContact + index * repeatContact
      if (index) arena.queueShadow(start + effectDuration(time), true)
      if (!reducedMotion()) await at(time)
      const damage = hitsTaken[index]
      const final = index === incoming - 1
      emit(heroHit(damage, final), {
        pitch: 1 + index * .08, ordered: true,
        guarded: damage === 0 && !(exact && final), parry: exact && final,
      })
      readHit(index)
      if (final) updatePlayer()
    }
  } else if (incoming || earlyEnemyHit.length || thorns) {
    if (!reducedMotion()) await at(incoming ? incomingContact : 96)
    emit([...earlyEnemyHit, ...heroHit(taken)], { parry: exact, guarded: incoming > 0 && hitsTaken[0] === 0 && !exact })
    if (earlyEnemyHit.length) updateEnemy()
    updatePlayer()
  }
  if (lateEscortDamage > 0) {
    const lastContact = incoming ? incomingContact + (incoming - 1) * repeatContact : 96
    if (!reducedMotion()) await at(lastContact + 70)
    hitEscort(lateEscortDamage, after.escort?.hp ?? 0)
    if (dealt) {
      if (!reducedMotion()) await at(lastContact + 140)
      emit(enemyHit)
      updateEnemy()
    }
  }
  if (renewed) {
    if (!reducedMotion()) await wait(160)
    sound.play('unlock', exchange.heartRevived ? .54 : .72)
    updateVital(ui.playerHp, ui.playerTotal, after.playerHp)
    markVital(ui.playerHp.closest<HTMLElement>('.vital')!)
  }
  ui.feedback.textContent = `적 피해 ${dealt}, 내 피해 ${taken}${escortDealt ? `, 호위 피해 ${escortDealt}` : ''}${awakenedDice ? `, 각성 ${awakenedDice.join(', ')}` : ''}`
  if (ordered) window.setTimeout(() => {
    if (entries[0].item.parentElement === ui.hitOrder) {
      ui.hitOrder.hidden = true
      ui.hitOrder.replaceChildren()
    }
  }, effectDuration(damageDuration))
  if (exact) {
    showParry()
    if (before.bossRelic?.id === 'brake-crown' && !before.crownUsed) {
      ui.bossRelicSlot.classList.add('crown-ready')
    }
    await wait(parryDuration)
    ui.parry.hidden = true
  } else if (escortDealt && !after.escort && after.phase === 'assign' && !reducedMotion()) {
    await wait(escortDefeatPause)
  }
}

function renderActivePerk(battle: YachtBattle) {
  const { perk } = battle
  const blade = bladeChargePreview(battle)
  ui.bladeMeter.hidden = !blade
  if (blade) {
    const meter = ui.bladeMeter.querySelector('meter')!
    meter.max = START_PERKS.blade.threshold
    meter.value = blade.ready ? meter.max : blade.nextCharge
    meter.setAttribute('aria-label', `큰 칼 충전 ${meter.value}/${meter.max}`)
    ui.bladeMeter.classList.toggle('charged', meter.value >= meter.max)
    ui.bladeMeter.setAttribute('aria-label', `큰 칼. 다 차면 다음 공격 피해가 ${START_PERKS.blade.multiplier}배예요.`)
  }
  ui.activePerk.hidden = !perk
  if (!perk) return
  const { name, icon: defaultSymbol } = START_PERKS[perk.kind]
  const symbol = perk.kind === 'oath' ? parityIcons[perk.parity] : defaultSymbol
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
  ui.activePerk.setAttribute('aria-label', `${name} ${value}${previewLabel}, ${PERK_TEXT[perk.kind]}`)
  ui.activePerk.title = name
}

function showCompanionLine(output: HTMLElement, line: string) {
  output.textContent = line
  output.hidden = !line.trim()
}

function renderRewardPreview(run: Ascent) {
  ui.rewardCards.querySelectorAll('button').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.reward === chosenReward))
  })
  ui.confirmReward.disabled = !chosenReward || Boolean(run.battle.loot && !isBossRelic(chosenReward) && !grantTreasure(run, chosenReward, artifactOptions))
  ui.rewardPreview.hidden = !chosenReward
  if (isArtifact(chosenReward)) renderArtifactOptions(run, chosenReward)
  else ui.artifactOptions.replaceChildren()
  ui.artifactOptions.hidden = !ui.artifactOptions.childElementCount
  if (!chosenReward) return

  const card = REWARD_CARDS[chosenReward]
  if (isBossRelic(chosenReward)) {
    ui.rewardPreview.innerHTML = `<strong>${card.name}</strong><span>${card.description}</span>`
    return
  }
  const room = currentTreasureRoom(run)
  const heal = healingFor(chosenReward, room, run.route?.map.rules)
  const cost = treasureCost(room, chosenReward)
  const price = room?.kind === 'shop' ? shopPrice(chosenReward) : 0
  const effect = heal ? `고르면 체력을 ${heal} 회복해요.` : REWARD_TEXT[chosenReward]
  const payment = price ? ` 동전 ${price}개를 내요.` : ''
  const gain = heal ? `${icon('heart')}+${heal}` : `${icon(card.icon)}+1`
  const exchange = room?.kind === 'event' ? `<span class="reward-exchange"><span aria-label="얻음">얻음 ${gain}</span>${cost ? `<span aria-label="잃음">잃음 ${icon('heart')}−${cost}</span>` : ''}</span>` : ''
  ui.rewardPreview.innerHTML = `<strong>${card.name}</strong><span>${effect}${payment}</span>${exchange}`
}

function renderArtifactOptions(run: Ascent, artifact: Artifact) {
  const field = (option: keyof ArtifactOptions, title: string, values: readonly (readonly [string, string])[]) => `
    <div class="artifact-option"><strong>${title}</strong><div role="group" aria-label="${title}">${values.map(([value, label]) =>
      `<button type="button" data-option="${option}" data-value="${value}" aria-pressed="${artifactOptions[option] === value}">${label}</button>`).join('')}</div></div>`
  const equipped = run.battle.loot?.equipped ?? []
  ui.artifactOptions.innerHTML = [
    equipped.length === ARTIFACT_SLOTS ? field('replace', '교체할 유물', equipped.map((id) => [id, `${icon(REWARD_CARDS[id].icon)}${REWARD_CARDS[id].name}`])) : '',
    artifact === 'heart-die' ? field('parity', '에고 주사위 눈', [['odd', '홀수'], ['even', '짝수']]) : '',
    artifact === 'incomplete' ? field('hand', '맞출 주사위 눈', (['triple', 'straight'] as const).filter((id) => !run.unlocks.includes(id)).map((id) => [id, id === 'triple' ? '같은 눈 셋' : '이어지는 눈 셋'])) : '',
  ].join('')
}

ui.artifactOptions.addEventListener('click', (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>('button')
  if (!button || !ascent || !isArtifact(chosenReward)) return
  const { option, value } = button.dataset
  if (!option || !value) return
  artifactOptions = { ...artifactOptions, [option]: value }
  renderRewardPreview(ascent)
  ui.artifactOptions.querySelector<HTMLButtonElement>(`[data-option="${option}"][data-value="${value}"]`)?.focus()
  saveCurrent()
})

function renderRewardOffers(run: Ascent, offers: readonly Reward[]) {
  const { seed, fight } = run
  const room = currentTreasureRoom(run)
  const atRoom = room?.kind === 'event' || room?.kind === 'shop' || room?.kind === 'rest'
  const bossReward = room?.enemyId === 'chain-warden'
  const eliteReward = room?.kind === 'elite' && run.route?.map.rules === 6
  ui.rewardPanel.classList.toggle('battle-reward', !atRoom)
  ui.rewardPanel.classList.toggle('boss-reward', bossReward)
  const atShop = room?.kind === 'shop' && (run.route?.map.rules ?? 0) >= 3
  const eventName = room?.event === 'medicine' ? '무너진 약상자' : room?.event === 'pulley' ? '녹슨 도르래' : '빈 깃대'
  ui.rewardHeading.innerHTML = bossReward ? '보스 유물 선택' : atRoom ? `${icon(MAP_NODE_ICONS[room.kind])} ${room.kind === 'event' ? eventName : room.kind === 'rest' ? '11층 휴식' : atShop ? '상인' : '장터 경유'}` : '전투 보상'
  ui.skipReward.textContent = atRoom ? '떠나기' : '건너뛰기'
  ui.skipReward.hidden = bossReward || Boolean(eliteReward && offers.length)
  const eventContext = {
    medicine: '깨진 약상자에 약봉지와 천이 남아 있어요.',
    pulley: '도르래를 당기면 돌 밑의 숫돌을 꺼낼 수 있어요.',
    flag: '깃대에 묶인 유물을 풀려면 체력을 써야 해요.',
  }
  ui.rewardContext.replaceChildren()
  if (room?.event) ui.rewardContext.textContent = eventContext[room.event]
  if (!run.route) {
    const next = enemyForFight(seed, fight + 1)
    const badge = enemyBadges[next.id]
    const charge = next.intents.some((intent) => intent.chargeThreshold !== undefined)
    ui.rewardContext.innerHTML = `<span title="다음 적: ${badge.label}" aria-label="다음 적: ${badge.label}" role="img">${icon(badge.icon)}${charge && badge.icon !== 'charge' ? icon('charge') : ''}</span>`
  }
  ui.rewardCards.replaceChildren(...offers.map((reward) => {
    const { name, icon: symbol } = REWARD_CARDS[reward]
    const card = document.createElement('button')
    card.type = 'button'
    card.className = 'reward-card'
    card.classList.toggle('artifact-card', isArtifact(reward))
    card.dataset.reward = reward
    card.setAttribute('aria-label', name)
    card.innerHTML = isBossRelic(reward) ? `${icon(symbol)}<strong>${name}</strong><small>${REWARD_CARDS[reward].value}</small>` : icon(symbol)
    card.addEventListener('click', () => {
      chosenReward = chosenReward === reward ? undefined : reward
      artifactOptions = {}
      renderRewardPreview(run)
      saveCurrent()
    })
    if (!atShop || isBossRelic(reward)) return card

    const price = shopPrice(reward)
    const offer = document.createElement('div')
    offer.className = 'shop-offer'
    const affordable = treasureEnabled(run, reward)
    offer.classList.toggle('unavailable', !affordable)
    card.setAttribute('aria-label', `${name}, 동전 ${price}개${affordable ? '' : ', 구매할 수 없음'}`)
    const label = document.createElement('span')
    label.className = 'shop-price'
    label.innerHTML = `${icon('ascent-coin')}${price}`
    offer.append(card, label)
    return offer
  }))
  if (atShop && !offers.some(isArtifact)) {
    const emptyStock = document.createElement('button')
    emptyStock.type = 'button'
    emptyStock.className = 'reward-card artifact-card empty-reward'
    emptyStock.disabled = true
    emptyStock.setAttribute('aria-label', '유물 품절')
    emptyStock.innerHTML = icon('lock')
    const soldOut = document.createElement('div')
    soldOut.className = 'shop-offer unavailable'
    const label = document.createElement('span')
    label.className = 'shop-price'
    label.textContent = '품절'
    soldOut.append(emptyStock, label)
    ui.rewardCards.append(soldOut)
  }
  if (run.route && !atRoom && !bossReward && !eliteReward) {
    for (let seat = offers.length; seat < 3; seat++) {
      const empty = document.createElement('div')
      empty.className = 'reward-card empty-reward'
      empty.setAttribute('role', 'img')
      empty.setAttribute('aria-label', '빈 보상 자리')
      empty.innerHTML = icon('map-reward')
      ui.rewardCards.append(empty)
    }
  }
  renderRewardPreview(run)
}

const inventoryDetail = element<HTMLDialogElement>('inventory-detail')
const inventoryUse = element<HTMLButtonElement>('inventory-use')
let useInventory: (() => void) | undefined
inventoryDetail.addEventListener('close', () => {
  const action = useInventory
  useInventory = undefined
  if (inventoryDetail.returnValue === 'use') action?.()
})

function inventoryChip(id: Reward, uses: number, capacity: number, disabled: boolean, action?: () => void, label = '사용', effect?: string) {
  const card = REWARD_CARDS[id]
  const button = document.createElement('button')
  button.type = 'button'
  button.dataset.reward = id
  button.disabled = disabled
  button.classList.toggle('spent', capacity > 0 && uses === 0)
  button.setAttribute('aria-label', capacity ? `${card.name}, ${uses}회 남음` : card.name)
  button.setAttribute('aria-haspopup', 'dialog')
  const dots = Array.from({ length: capacity }, (_, i) => `<i class="${i < uses ? 'filled' : ''}"></i>`).join('')
  button.innerHTML = `${icon(card.icon)}${dots ? `<span class="use-dots" aria-hidden="true">${dots}</span>` : ''}`
  button.addEventListener('click', () => {
    element('inventory-title').textContent = card.name
    element('inventory-description').textContent = isBossRelic(id) ? BOSS_RELIC_CARDS[id].description
      : effect ? `${REWARD_TEXT[id]} ${effect}` : REWARD_TEXT[id]
    useInventory = action
    ui.tuningControls.hidden = id !== 'tuning' || (ui.tuneDown.disabled && ui.tuneUp.disabled)
    inventoryUse.hidden = !action
    inventoryUse.textContent = label
    inventoryDetail.returnValue = ''
    inventoryDetail.showModal()
  })
  return button
}

function renderRewardStrip(battle: YachtBattle, disabled: boolean) {
  if (battle.loot) {
    renderTreasureStrips(battle, disabled)
    return
  }
  ui.artifactStrip.hidden = true
  ui.rewardStrip.classList.remove('treasure-items')
  const rewards = battle.rewards
  const held = [...(rewards?.relics ?? []), ...(rewards?.tuning ? ['tuning' as const] : [])]
  ui.rewardStrip.hidden = !held.length
  ui.rewardStrip.replaceChildren(...held.map((reward) => {
    const remaining = reward === 'tuning' ? rewards?.tuning === 'ready' : relicReady(rewards, reward)
    const toggle = reward === 'wedge' && remaining && battle.phase === 'assign'
    const toggleLabel = battle.wedgeArmed ? '끄기' : '켜기'
    const action = toggle ? () => updateTreasureBattle(battle, toggleYachtWedge(battle), '#reward-strip [data-reward="wedge"]') : undefined
    const button = inventoryChip(reward, Number(remaining), 1, disabled, action, toggleLabel)
    if (toggle) button.setAttribute('aria-pressed', String(Boolean(battle.wedgeArmed)))
    return button
  }))
}

function updateTreasureBattle(before: YachtBattle, next: YachtBattle, selector?: string, clearSelection = false) {
  if (!ascent || ascent.battle !== before || next === before || ui.guide.open || exchangeBusy) return
  ascent = { ...ascent, battle: next }
  if (clearSelection) selected.clear()
  saveCurrent()
  render()
  const control = selector && document.querySelector<HTMLElement>(selector)
  if (control) {
    if (control.closest('#inventory-overflow')) setInventoryOverflow(true)
    control.focus()
  }
}

function setInventoryOverflow(open: boolean) {
  const panel = ui.rewardStrip.querySelector<HTMLElement>('#inventory-overflow')
  const trigger = ui.rewardStrip.querySelector<HTMLButtonElement>('[aria-controls="inventory-overflow"]')
  if (!panel || !trigger || trigger.hidden) return
  panel.hidden = !open
  trigger.setAttribute('aria-expanded', String(open))
}

function layoutTreasureItems() {
  const strip = ui.rewardStrip
  const panel = strip.querySelector<HTMLElement>('#inventory-overflow')
  const trigger = strip.querySelector<HTMLButtonElement>('[aria-controls="inventory-overflow"]')
  if (!panel || !trigger || strip.hidden) return
  const buttons = Array.from(strip.querySelectorAll<HTMLButtonElement>('[data-reward]'))
  const style = getComputedStyle(strip)
  const gap = Number.parseFloat(style.columnGap)
  const chip = Number.parseFloat(style.getPropertyValue('--item-chip-width'))
  const capacity = Math.floor((strip.clientWidth + gap) / (chip + gap))
  const visible = buttons.length > capacity ? Math.max(0, capacity - 1) : buttons.length
  const overflow = buttons.slice(visible)
  if (overflow.every((button) => button.parentElement === panel) && panel.childElementCount === overflow.length) return

  const focused = document.activeElement
  panel.replaceChildren(...overflow)
  for (const button of buttons.slice(0, visible)) strip.insertBefore(button, trigger)
  trigger.textContent = `+${overflow.length}`
  trigger.setAttribute('aria-label', `나머지 보유 보상 ${overflow.length}개`)
  if (!overflow.length) setInventoryOverflow(false)
  trigger.hidden = !overflow.length
  if (focused instanceof HTMLButtonElement && buttons.includes(focused)) {
    if (focused.parentElement === panel && panel.hidden) trigger.focus({ preventScroll: true })
    else focused.focus({ preventScroll: true })
  } else if (focused === trigger && trigger.hidden) {
    buttons.at(-1)?.focus({ preventScroll: true })
  }
}

const inventoryResize = new ResizeObserver(layoutTreasureItems)
inventoryResize.observe(ui.rewardStrip)
ui.rewardStrip.addEventListener('keydown', (event) => {
  const trigger = ui.rewardStrip.querySelector<HTMLButtonElement>('[aria-controls="inventory-overflow"][aria-expanded="true"]')
  if (event.key !== 'Escape' || !trigger) return
  event.preventDefault()
  setInventoryOverflow(false)
  trigger.focus()
})
document.addEventListener('pointerdown', (event) => {
  if (event.target instanceof Node && !ui.rewardStrip.contains(event.target) && !ui.guide.open) setInventoryOverflow(false)
})

function renderTreasureStrips(battle: YachtBattle, disabled: boolean) {
  const loot = battle.loot!
  const ready = battle.phase === 'assign' && !loot.hourglass && !disabled
  const itemButtons = ITEMS.filter((id) => loot.items[id]).map((id) => {
    const uses = itemUses(loot, id)
    const wedge = ready && id === 'wedge' && uses > 0
    const button = inventoryChip(id, uses, loot.items[id]!, disabled,
      wedge ? () => updateTreasureBattle(battle, toggleYachtWedge(battle), '#reward-strip [data-reward="wedge"]') : undefined,
      battle.wedgeArmed ? '끄기' : '켜기')
    if (wedge) button.setAttribute('aria-pressed', String(Boolean(battle.wedgeArmed)))
    return button
  })
  const shardButtons = SHARDS.filter((id) => loot.shards[id] || loot.triggered?.includes(id)).map((id) => {
    const clickable = ready && id !== 'tuning' && loot.shards[id] && !loot.tuned && !loot.sealDraft
    const count = loot.shards[id] ?? 0
    const button = inventoryChip(id, count, Math.max(count, 1), disabled,
      clickable ? () => updateTreasureBattle(battle, toggleShard(battle, id), `#reward-strip [data-reward="${id}"]`) : undefined,
      loot.shardArmed === id ? '끄기' : '켜기')
    if (clickable) button.setAttribute('aria-pressed', String(loot.shardArmed === id))
    return button
  })
  const prepButtons = PREPARATIONS.filter((id) => loot.prepared[id] || loot.prep[id] || loot.triggered?.includes(id)).map((id) => {
    const count = (loot.prepared[id] ?? 0) + (loot.prep[id] ?? 0)
    return inventoryChip(id, count, Math.max(count, 1), disabled)
  })
  const relicButtons = loot.equipped.map((id) => {
    const available = artifactReady(loot, id) && !(id === 'incomplete' && loot.sealUsed)
    const toggle = ready && available && (id === 'banner' || (id === 'hammer' && enemyIntentAt(battle).chargeThreshold !== undefined))
    const hourglass = ready && id === 'hourglass' && startHourglass(battle, [...selected]) !== battle
    const delay = id === 'mirror' ? loot.mirrorDamage : id === 'overflow' ? loot.overflowDamage : undefined
    const action = toggle && (id === 'banner' || id === 'hammer') ? () => updateTreasureBattle(battle, toggleArtifact(battle, id), `#artifact-strip [data-reward="${id}"]`)
      : hourglass ? () => updateTreasureBattle(battle, startHourglass(battle, [...selected]), '#treasure-controls button', true) : undefined
    const on = loot.armed?.includes(id as 'banner' | 'hammer') ?? false
    const button = inventoryChip(id, Number(available), id === 'heart-die' ? 0 : 1, disabled, action,
      toggle ? (on ? '끄기' : '켜기') : '사용', delay ? `다음 공격에 피해 ${delay}를 더해요.` : undefined)
    if (toggle) button.setAttribute('aria-pressed', String(on))
    return button
  })
  for (const button of [...itemButtons, ...shardButtons, ...prepButtons, ...relicButtons]) {
    button.classList.toggle('triggered', loot.triggered?.some((id) => id === button.dataset.reward) ?? false)
  }
  ui.artifactStrip.replaceChildren(...relicButtons)
  ui.artifactStrip.hidden = !relicButtons.length

  const items = [...itemButtons, ...shardButtons, ...prepButtons]
  items.sort((first, second) => Number(second.hasAttribute('aria-pressed')) - Number(first.hasAttribute('aria-pressed')))
  const overflow = document.createElement('button')
  overflow.type = 'button'
  overflow.disabled = disabled
  overflow.hidden = true
  overflow.setAttribute('aria-controls', 'inventory-overflow')
  overflow.setAttribute('aria-expanded', 'false')
  const panel = document.createElement('div')
  panel.id = 'inventory-overflow'
  panel.hidden = true
  overflow.addEventListener('click', () => setInventoryOverflow(panel.hidden))
  ui.rewardStrip.classList.add('treasure-items')
  ui.rewardStrip.replaceChildren(...items, overflow, panel)
  ui.rewardStrip.hidden = !items.length
  layoutTreasureItems()
}

function renderBossRelicSlot(battle: YachtBattle, disabled: boolean) {
  const relic = battle.bossRelic
  ui.bossRelicSlot.hidden = !relic
  ui.bossRelicSlot.classList.toggle('crown-ready', relic?.id === 'brake-crown' && !battle.crownUsed && battle.phase === 'counter')
  if (!relic) return
  const spent = relic.heartUsed || battle.crownUsed || relic.id === 'emperor-shield' && battle.turn > 1
  const button = inventoryChip(relic.id, Number(!spent), 0, disabled)
  button.classList.toggle('spent', Boolean(spent))
  if (relic.heartUsed) button.dataset.cracked = ''
  ui.bossRelicSlot.replaceChildren(button)
}

function renderTreasureControls(battle: YachtBattle, enabled: boolean) {
  ui.treasureControls.replaceChildren()
  ui.treasureControls.hidden = true
  const { loot } = battle
  if (!loot || !enabled) return
  const control = (label: string, content: string, action: () => void, disabled = false) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute('aria-label', label)
    button.innerHTML = content
    button.disabled = disabled
    button.addEventListener('click', action)
    return button
  }
  if (loot.hourglass) {
    for (const entry of loot.hourglass) {
      const group = document.createElement('div')
      group.className = 'treasure-die-choice'
      group.setAttribute('role', 'group')
      group.setAttribute('aria-label', `주사위 ${entry.index + 1}`)
      group.innerHTML = `<span>${icon('die')}${entry.index + 1}</span>`
      group.append(control(`주사위 ${entry.index + 1} 원래 눈 ${entry.original}`, `${icon('return')}${entry.original}`, () => updateTreasureBattle(battle, chooseHourglass(battle, entry.index, false), '#treasure-controls button')),
        control(`주사위 ${entry.index + 1} 새 눈 ${entry.rolled}`, `${icon('reroll')}${entry.rolled}`, () => updateTreasureBattle(battle, chooseHourglass(battle, entry.index, true), '#treasure-controls button')))
      ui.treasureControls.append(group)
    }
  } else if (loot.counter) {
    const choices = availableCounterChoices(battle)
    const damage = loot.counter.damage
    ui.treasureControls.append(control('지금 룰렛 피해 주기', `${icon('wheel')}${damage}`, () => void playCounter('now')))
    if (loot.equipped.includes('mirror')) ui.treasureControls.append(control('반전 거울로 미루기', `${icon('treasure-mirror')}→${Math.min(12, damage * 2)}`, () => void playCounter('mirror'), !choices.includes('mirror')))
    if (loot.equipped.includes('horn')) ui.treasureControls.append(control('교대의 뿔로 합공', `${icon('treasure-horn')}8`, () => void playCounter('horn'), !choices.includes('horn')))
  } else if (loot.sealDraft) {
    ui.treasureControls.append(control('미완의 인장 조정 취소', `${icon('treasure-incomplete')}${icon('return')}`, () => updateTreasureBattle(battle, cancelSeal(battle), '#resolve')))
  } else if (battle.phase === 'assign' && selected.size === 1 && loot.equipped.includes('incomplete') && loot.sealHand && !ascent?.unlocks.includes(loot.sealHand)) {
    const index = [...selected][0]
    for (const change of [-2, -1, 1, 2] as const) {
      const next = draftSeal(battle, index, change)
      if (next === battle) continue
      const number = change > 0 ? `+${change}` : `−${-change}`
      ui.treasureControls.append(control(`미완의 인장 ${number}`, `${icon('treasure-incomplete')}${number}`, () => updateTreasureBattle(battle, next, '#treasure-controls button', true)))
    }
  }
  ui.treasureControls.hidden = !ui.treasureControls.childElementCount
}

function renderCoins(balance?: number) {
  ui.runCoins.hidden = balance === undefined
  if (balance === undefined) return
  ui.runCoins.innerHTML = `${icon('ascent-coin')}${balance}`
  ui.runCoins.setAttribute('aria-label', `보유 동전 ${balance}개`)
}

function renderHealth(hp: number, max: number) {
  ui.mapHealth.innerHTML = `${icon('heart')}${hp}/${max}`
  ui.mapHealth.setAttribute('aria-label', `체력 ${hp}/${max}`)
}

function render(presentation: 'normal' | 'unlock' = 'normal', rollTurn = false) {
  stopDiceMotion?.()
  stopPlacementMotion?.()
  if (!ascent) return
  holdHelp.hidden = true
  const { battle, fight, enemy, maxHp, unlocks, newUnlock, route } = ascent
  const { phase, turn, playerHp, enemyHp } = battle
  const atMap = presentation === 'normal' && route?.screen === 'map'
  const atRest = presentation === 'normal' && route?.screen === 'rest'
  const atTreasureRoom = route && route.map.rules >= 2 && (atRest || route.screen === 'event' || route.screen === 'shop')
  const between = route ? route.screen === 'return' || atRest : phase === 'won' && fight < FIGHT_COUNT
  const finished = ascentFinished(ascent)
  const offers = presentation === 'normal' ? rewardOffers(ascent) : []
  const atRewards = presentation === 'normal' && (route ? route.screen === 'reward' || atTreasureRoom : offers.length > 0)
  const atEvent = presentation === 'normal' && !atRewards && (between || finished)
  const atUnlock = presentation === 'unlock' && newUnlock !== null
  const inCombat = !atMap && !atEvent && !atUnlock && !atRewards
  const showActions = presentation === 'normal' && inCombat
  const companionAwake = unlocks.includes('triple')
  ui.main.dataset.screen = atMap ? 'fork' : atRewards ? 'reward' : atEvent ? 'event' : atUnlock ? 'unlock' : 'battle'
  ui.lobby.hidden = true
  ui.masthead.hidden = false
  ui.returnLobby.disabled = presentation !== 'normal'
  ui.returnLobby.setAttribute('aria-haspopup', 'dialog')
  ui.perks.hidden = true
  ui.battle.hidden = atMap
  ui.fork.hidden = !atMap
  ui.mapHealth.hidden = inCombat || atUnlock
  if (!atMap) renderHealth(playerHp, maxHp)
  ui.mapFloor.hidden = !atMap
  renderCoins(route?.coins)
  renderBossRelicSlot(battle, presentation !== 'normal')
  ui.encounter.hidden = !inCombat
  ui.fight.hidden = atMap || (!inCombat && !atRewards)
  const floor = route ? (route.node === null ? route.completed.length : route.map.byId[route.node].floor) : fight
  const floors = route ? MAP_FLOORS : FIGHT_COUNT
  ui.fight.textContent = `${floor}/${floors} 층`
  renderActivePerk(battle)
  ui.turn.hidden = !inCombat
  ui.help.hidden = !inCombat && !atMap
  ui.help.disabled = !showActions && !atMap
  ui.battleSettings.hidden = !inCombat
  ui.battleSettings.disabled = !showActions
  ui.soundToggle.hidden = atMap
  if (atMap) {
    ui.activePerk.hidden = true
    ui.rewardStrip.hidden = true
    ui.artifactStrip.hidden = true
    forkView.render(ascent)
    return
  }
  renderRewardStrip(battle, presentation !== 'normal')
  ui.turn.innerHTML = `${icon('turn')}${turn}`
  ui.turn.setAttribute('aria-label', `${turn}턴`)
  const totals = yachtAllocationTotals(battle)
  ui.encounterName.hidden = enemy.id !== 'chain-warden'
  ui.encounterName.textContent = enemy.id === 'chain-warden' ? RULES_SIX_BADGES[enemy.id].label : ''
  renderIntent(battle, totals, enemy.id)
  renderEnemyStatus(battle)
  updateVital(ui.playerHp, ui.playerTotal, playerHp, maxHp)
  updateVital(ui.enemyHp, ui.enemyTotal, enemyHp, enemy.hp)
  ui.escortGuard.hidden = !battle.escort || enemyHp <= 0
  ui.encounter.classList.toggle('escort-room', enemy.id === 'escort')
  if (battle.escort) updateEscortVital(battle.escort.hp)
  ui.newUnlock.hidden = !atUnlock
  showCompanionLine(ui.companionAwakenLine, atUnlock && newUnlock === 'triple' ? COMPANION_LINES.awaken : '')
  if (atUnlock) {
    const unlock = unlockInfo[newUnlock]
    ui.unlockReveal.classList.toggle('companion-reveal', newUnlock === 'triple')
    const revealLabel = newUnlock === 'triple' ? `${unlock.label} 깨어남` : `${unlock.label} 해금`
    if (newUnlock === 'triple') {
      ui.unlockHeading.innerHTML = `${icon(unlock.icon)}${unlock.label}`
      ui.unlockReveal.innerHTML = `<span class="companion-tile" aria-hidden="true">${icon(unlock.icon)}</span>`
    } else {
      const faces = [2, 4, 1, 3, 6, 5].map((face) => `<span>${face}</span>`).join('')
      ui.unlockHeading.innerHTML = `${icon('unlock')}해금`
      ui.unlockReveal.innerHTML = `<div class="die-net" aria-hidden="true">${faces}</div><span class="unlock-value">${icon(unlock.icon)}<strong>${unlock.value}</strong></span>`
    }
    ui.unlockReveal.setAttribute('aria-label', revealLabel)
    ui.feedback.textContent = revealLabel
  }
  ui.planning.hidden = !showActions || phase !== 'assign'
  ui.tuneDown.disabled = tuneYachtDie(battle, -1) === battle
  ui.tuneUp.disabled = tuneYachtDie(battle, 1) === battle
  roulette.setVisible(showActions && phase === 'counter' ? yachtCounterRewards(battle) : null, companionAwake)
  if (showActions && phase === 'counter') {
    ui.counter.hidden = Boolean(battle.loot?.counter)
    ui.counter.disabled = Boolean(battle.loot?.counter)
  }
  renderTreasureControls(battle, showActions)
  ui.rewardPanel.hidden = !atRewards
  if (atRewards) renderRewardOffers(ascent, offers)
  ui.ascentEvent.hidden = !atEvent
  ui.mapRest.hidden = !atRest
  const companionFallsAsleep = atEvent && finished && companionAwake
  ui.ownedUnlocks.hidden = !(between && unlocks.length) && !companionFallsAsleep
  if (companionFallsAsleep) {
    ui.ownedUnlocks.innerHTML = `<span class="companion-tile companion-asleep">${icon('companion-sleep')}</span>`
    ui.ownedUnlocks.setAttribute('aria-label', '에고 주사위 잠듦')
  } else {
    ui.ownedUnlocks.innerHTML = unlocks.map((hand) => {
      const unlock = unlockInfo[hand]
      return `<span>${icon(unlock.icon)}${unlock.value}</span>`
    }).join('')
    ui.ownedUnlocks.setAttribute('aria-label', unlocks.map((hand) => unlockInfo[hand].label).join(', '))
  }
  showCompanionLine(ui.companionSleepLine, companionFallsAsleep ? COMPANION_LINES.sleep : '')
  const wins = route?.completed.length ?? (phase === 'lost' ? fight - 1 : fight)
  if (atRest) {
    ui.eventFloor.innerHTML = `<strong>${floor}/${floors}</strong><span>${icon('heart')}${playerHp}/${maxHp}</span>`
    ui.eventFloor.setAttribute('aria-label', `${floor}층 정비, 체력 ${playerHp}/${maxHp}`)
  } else if (route && finished && phase === 'lost') {
    ui.eventFloor.innerHTML = `<span>${icon('map-check')}${wins}/${floors}</span><strong>${icon('critical')}${floor}/${floors}</strong>`
    ui.eventFloor.setAttribute('aria-label', `완료 ${wins}층, 실패 ${floor}층`)
  } else {
    ui.eventFloor.innerHTML = between
      ? `<span>${floor}/${floors}</span>${icon('next')}<strong>${floor + 1}/${floors}</strong>` : `<strong>${wins}/${floors}</strong>`
    ui.eventFloor.setAttribute('aria-label', between ? `${floor}층에서 ${floor + 1}층으로` : `${floors}층 중 ${wins}층 통과`)
  }
  ui.ascentEvent.classList.toggle('finished', finished)
  ui.result.hidden = !atEvent || !finished
  ui.result.textContent = phase === 'won' ? '성공' : '실패'
  ui.completionSeal.hidden = !atEvent || !finished || phase !== 'won'
  const finalUnlock = atEvent && phase === 'lost' && newUnlock ? unlockInfo[newUnlock] : null
  ui.finalUnlock.hidden = !finalUnlock
  ui.finalUnlock.innerHTML = finalUnlock ? `${icon(finalUnlock.icon)}해금 · ${finalUnlock.label}` : ''
  ui.next.hidden = !between || !atEvent
  ui.next.innerHTML = route ? `다음 층 ${icon('next')}` : `다음 전투 ${icon('next')}`
  ui.retry.hidden = !finished
  refreshDice(battle, totals, unlocks)
  arena.refresh(battle, enemy.id)
  if (rollTurn && !ui.planning.hidden && !reducedMotion()) {
    const ego = companionDieIndex(battle)
    stopDiceMotion = playDiceMotion(ui.encounter, battle.dice.map((face, index) => ({
      button: diceButtons[index], face, ego: index === ego,
    })), () => {
      stopDiceMotion = undefined
      if (document.activeElement === ui.planning) focusPhase()
    })
  }
}

function refreshLobbyActions() {
  const { checkpoint, invalidMap } = readAscentSave()
  const hasSave = checkpoint !== null
  ui.continueAscent.hidden = !hasSave
  ui.saveNotice.hidden = !invalidMap
  ui.newAscent.classList.toggle('primary', !hasSave)
}

function showLobby(focus = false) {
  stopDiceMotion?.()
  stopPlacementMotion?.()
  renderCoins()
  ascent = null
  chosenReward = undefined
  artifactOptions = {}
  selected.clear()
  clearExchange()
  roulette.setVisible(null)
  ui.main.dataset.screen = 'lobby'
  ui.lobby.hidden = false
  ui.masthead.hidden = true
  ui.rewardStrip.hidden = true
  ui.artifactStrip.hidden = true
  ui.perks.hidden = true
  ui.battle.hidden = true
  ui.fork.hidden = true
  refreshLobbyActions()
  if (focus) (ui.continueAscent.hidden ? ui.newAscent : ui.continueAscent).focus()
}

function showPerks() {
  stopDiceMotion?.()
  stopPlacementMotion?.()
  renderCoins()
  ascent = null
  chosenReward = undefined
  artifactOptions = {}
  selected.clear()
  roulette.setVisible(null)
  ui.main.dataset.screen = 'perks'
  ui.lobby.hidden = true
  ui.masthead.hidden = false
  ui.rewardStrip.hidden = true
  ui.artifactStrip.hidden = true
  ui.returnLobby.disabled = false
  ui.returnLobby.removeAttribute('aria-haspopup')
  ui.battle.hidden = true
  ui.fork.hidden = true
  ui.mapHealth.hidden = true
  ui.mapFloor.hidden = true
  ui.activePerk.hidden = true
  ui.fight.hidden = true
  ui.turn.hidden = true
  ui.help.hidden = true
  ui.battleSettings.hidden = true
  ui.soundToggle.hidden = true
  ui.perks.hidden = false
  const seed = fixedSeed ?? crypto.getRandomValues(new Uint32Array(1))[0]
  const offers = offerPerks(seed)
  const begin = (event: MouseEvent, perk: keyof typeof START_PERKS, parity?: Parity) => {
    if (event.isTrusted) sound.activate()
    ascent = beginMapAscent(seed, perk, parity, CURRENT_MAP_RULES)
    saveCurrent()
    render()
    focusPhase()
  }
  const buttons = offers.map((perk) => {
    const { name, icon: symbol } = START_PERKS[perk]
    const button = perkButton(symbol, name, PERK_TEXT[perk])
    button.addEventListener('click', (event) => {
      if (perk !== 'oath') {
        begin(event, perk)
        return
      }
      const parityButtons = (['odd', 'even'] as const).map((parity) => {
        const label = parity === 'odd' ? '홀수 서약' : '짝수 서약'
        const choice = perkButton(parityIcons[parity], label, oathDescription(parity))
        choice.addEventListener('click', (event) => begin(event, perk, parity))
        return choice
      })
      const back = document.createElement('button')
      back.type = 'button'
      back.className = 'perk-back'
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
  buttons[0].focus()
}

function perkButton(symbol: string, name: string, description: string) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'perk-choice'
  button.innerHTML = `
    <span class="perk-symbol">${icon(symbol)}</span>
    <span class="perk-name">${name}</span>
  `
  const explanation = document.createElement('span')
  explanation.className = 'perk-description'
  explanation.innerHTML = description
  button.append(explanation)
  button.setAttribute('aria-label', `${name}, ${explanation.textContent}`)
  return button
}

function place(indices: readonly number[], zone: DropZone) {
  if (ui.guide.open || exchangeBusy || stopDiceMotion || !ascent || !indices.length || ascent.battle.phase !== 'assign' || ascent.battle.loot?.hourglass) return
  const slot = zone === 'pool' ? null : zone
  const before = ascent.battle
  let battle = before
  for (const index of indices) battle = assignDie(battle, index, slot)
  const moved = indices.filter((index) => battle.slots[index] !== before.slots[index])
  if (moved.length) sound.play('dice-place')
  const scene = ui.planning.getBoundingClientRect()
  const ego = companionDieIndex(battle)
  const animated = slot && !reducedMotion() ? moved.map((index) => ({
    button: diceButtons[index],
    face: battle.dice[index],
    ego: index === ego,
    from: dieCenter(diceButtons[index], scene),
  })) : []
  ascent = { ...ascent, battle }
  selected.clear()
  saveCurrent()
  render()
  if (animated.length) {
    stopPlacementMotion = playPlacementMotion(ui.planning, animated, () => { stopPlacementMotion = undefined })
  }
  const unassigned = battle.slots.indexOf(null)
  if (unassigned < 0) ui.resolve.focus()
  else diceButtons[unassigned].focus()
}

function focusPhase() {
  if (!ascent) return
  if (!ui.fork.hidden) forkView.focusFirst()
  else if (!ui.rewardPanel.hidden) {
    const target = ui.rewardCards.querySelector<HTMLButtonElement>('[aria-pressed="true"]') ?? ui.rewardCards.querySelector('button:not(:disabled)') ?? ui.skipReward
    target.focus()
  }
  else if (ascent.battle.loot?.hourglass || ascent.battle.loot?.counter) ui.treasureControls.querySelector('button')?.focus()
  else if (ascent.battle.phase === 'counter') ui.counter.focus()
  else if (ascent.battle.phase === 'assign') {
    const target = stopDiceMotion ? ui.planning : diceButtons[selected.values().next().value ?? 0]
    target.focus({ preventScroll: true })
  }
  else if (!ui.next.hidden) ui.next.focus()
  else ui.retry.focus()
}

for (const zone of ['pool', ...combatSlots] as const) {
  const button = ui.assign[zone]
  button.addEventListener('click', () => place([...selected], zone))
  if (zone === 'pool') continue
  ui.dice[zone].parentElement!.addEventListener('click', (event) => {
    if (event.target instanceof Element && !event.target.closest('button')) button.click()
  })
}
function useReroll(extra: boolean) {
  if (ui.guide.open || exchangeBusy || !ascent) return
  const rerolled = rerollSelectedDice(ascent.battle, selected, extra)
  if (!rerolled) return
  ascent = { ...ascent, battle: rerolled.battle }
  saveCurrent()
  render()
  sound.play('dice-roll')
  diceButtons[rerolled.focusIndex].focus()
}

ui.reroll.addEventListener('click', () => useReroll(false))
ui.extraReroll.addEventListener('click', () => useReroll(true))
function useTuning(change: -1 | 1) {
  if (ui.guide.open || !ascent) return
  const battle = tuneYachtDie(ascent.battle, change)
  if (battle === ascent.battle) return
  if (inventoryDetail.open) inventoryDetail.close()
  ascent = { ...ascent, battle }
  saveCurrent()
  render()
  diceButtons[0].focus()
}

ui.tuneDown.addEventListener('click', () => useTuning(-1))
ui.tuneUp.addEventListener('click', () => useTuning(1))

function claimReward(choice: RewardChoice) {
  if (!ascent || ui.guide.open) return
  const next = takeAscentReward(ascent, choice, artifactOptions)
  if (next === ascent) return
  ascent = returnToMap(next)
  chosenReward = undefined
  artifactOptions = {}
  saveCurrent()
  render()
  focusPhase()
}

ui.confirmReward.addEventListener('click', () => { if (chosenReward) claimReward(chosenReward) })
ui.skipReward.addEventListener('click', () => claimReward('skip'))
function lockExchange(locked: boolean) {
  exchangeBusy = locked
  ui.planning.inert = locked
  ui.rewardStrip.inert = locked
  ui.artifactStrip.inert = locked
  ui.bossRelicSlot.inert = locked
  if (!locked) return
  ui.help.disabled = true
  ui.battleSettings.disabled = true
  ui.returnLobby.disabled = true
}

ui.resolve.addEventListener('click', async () => {
  if (ui.guide.open || exchangeBusy || !ascent) return
  const before = ascent.battle
  const next = resolveAscentTurn(ascent)
  if (next === ascent) return
  lockExchange(true)
  selected.clear()
  clearExchange()
  ascent = next
  saveCurrent()

  const { phase, lastExchange } = next.battle
  try {
    if (lastExchange) await showExchange(before, next.battle, lastExchange)
    if (next.newUnlock) {
      sound.play('unlock')
      if (next.newUnlock === 'triple' && !reducedMotion()) {
        ui.unlockImpact.hidden = false
        arena.freeze(unlockImpactDuration)
        await wait(unlockImpactDuration)
        ui.unlockImpact.hidden = true
      } else if (lastExchange && (lastExchange.dealt || lastExchange.escortDealt || lastExchange.hitsTaken.some(Boolean))) {
        await wait(250)
      }
      render('unlock')
      await wait(next.newUnlock === 'triple' ? companionAwakenDuration : unlockDuration)
    } else if (phase === 'won' || phase === 'lost') {
      await wait(reducedMotion() ? 320 : damageDuration)
    }
  } finally {
    lockExchange(false)
    render('normal', next.battle.turn !== before.turn)
    if (phase === 'won') sound.play('victory')
    if (phase === 'lost') sound.play('defeat')
    focusPhase()
  }
})
let counterBusy = false
async function playCounter(choice?: CounterChoice) {
  if (ui.guide.open || exchangeBusy || !ascent || ascent.battle.phase !== 'counter' || counterBusy || (!choice && ui.counter.disabled)) return
  const checkpoint = spinAscentCounter(ascent, choice)
  if (checkpoint === ascent) return
  const next = checkpoint.battle
  const pending = next.loot?.counter
  const reward = pending ?? next.lastExchange?.counter
  if (!reward) return
  counterBusy = true
  saveCurrent(checkpoint)
  const before = ascent.battle
  const dealt = before.enemyHp - next.enemyHp
  const escortDealt = (before.escort?.hp ?? 0) - (next.escort?.hp ?? 0)
  const companionJoint = reward.joint && ascent.unlocks.includes('triple')
  ui.help.disabled = true
  ui.battleSettings.disabled = true
  ui.returnLobby.disabled = true
  ui.rewardStrip.querySelectorAll('button').forEach((button) => { button.disabled = true })
  ui.artifactStrip.querySelectorAll('button').forEach((button) => { button.disabled = true })
  ui.treasureControls.hidden = true

  const animate = !reducedMotion()
  if (next.perk?.kind === 'counter') renderActivePerk(next)
  if (!choice) {
    await roulette.reveal(reward, animate, () => sound.play('roulette-tick'), animationSpeed())
    sound.play('roulette-stop')
  }
  if (pending) {
    ascent = checkpoint
    counterBusy = false
    render()
    focusPhase()
    return
  }
  if (companionJoint && !reducedMotion()) {
    ui.companionFlight.style.setProperty('--flight-duration', `${effectDuration(companionFlightDuration)}ms`)
    ui.companionFlight.hidden = false
    await wait(companionImpactTime)
  } else if ((dealt || escortDealt) && !reducedMotion()) {
    arena.counterStrike()
    await wait(128)
  }
  clearExchange()
  if (escortDealt > 0) {
    const hit = { target: 'escort', damage: escortDealt, defeated: !next.escort } as const
    arena.contact([hit], { counter: true })
    showDamage(hit)
    updateEscortVital(next.escort?.hp ?? 0)
    sound.play('stone-hit')
    if (dealt && animate) await wait(70)
  }
  if (dealt > 0) {
    const hit = { target: 'enemy', damage: dealt, defeated: next.enemyHp === 0 } as const
    arena.contact([hit], { counter: true })
    showDamage(hit)
    sound.play('stone-hit')
  }
  updateVital(ui.enemyHp, ui.enemyTotal, next.enemyHp)
  if (next.lastExchange?.crownTriggered) sound.play('stone-hit', .66)
  if (next.phase === 'won' && next.playerHp > before.playerHp) {
    sound.play('unlock', .72)
    updateVital(ui.playerHp, ui.playerTotal, next.playerHp)
    markVital(ui.playerHp.closest<HTMLElement>('.vital')!)
  }
  if (!ui.companionFlight.hidden) {
    await wait(companionFlightDuration - companionImpactTime)
    ui.companionFlight.hidden = true
  }
  await wait(reducedMotion() || !(dealt || escortDealt) ? 320 : damageDuration)
  arena.finishStrike()
  ascent = checkpoint
  counterBusy = false
  render('normal', next.phase === 'assign')
  if (next.phase === 'won') sound.play('victory')
  focusPhase()
}
ui.counter.addEventListener('click', () => void playCounter())
function enterFork(id: number) {
  if (ui.guide.open || exchangeBusy || ascent?.route?.screen !== 'map') return
  const next = enterMapNode(ascent, id)
  if (next === ascent) return
  clearExchange()
  ascent = next
  saveCurrent()
  render('normal', true)
  if (ascent.route?.screen === 'battle') sound.play('dice-roll')
  focusPhase()
}
ui.next.addEventListener('click', () => {
  if (exchangeBusy || !ascent || rewardOffers(ascent).length) return
  const next = ascent.route ? returnToMap(ascent) : nextAscentFight(ascent)
  if (ascent === next) return
  clearExchange()
  ascent = next
  saveCurrent()
  render('normal', true)
  if (!ascent.route) sound.play('dice-roll')
  focusPhase()
})
ui.retry.addEventListener('click', showPerks)
ui.continueAscent.addEventListener('click', (event) => {
  const checkpoint = loadAscentSave()
  if (!checkpoint) {
    showLobby(true)
    return
  }
  ascent = returnToMap(checkpoint.ascent)
  chosenReward = checkpoint.rewardPreview
  artifactOptions = checkpoint.artifactOptions ?? {}
  selected.clear()
  for (const index of checkpoint.selected) selected.add(index)
  if (event.isTrusted) sound.activate()
  render()
  focusPhase()
})
ui.newAscent.addEventListener('click', () => {
  const { checkpoint, invalidMap } = readAscentSave()
  if (checkpoint || invalidMap) {
    confirmLobbyAction('새로 하기', '새 등반을 시작하면 저장된 등반을 덮어씁니다.', '새로 하기', showPerks)
  } else showPerks()
})
ui.returnLobby.addEventListener('click', () => {
  if (exchangeBusy || counterBusy) return
  if (!ascent) showLobby(true)
  else {
    if (ascentFinished(ascent)) {
      confirmLobbyAction('로비로 돌아갈까요?', '등반 결과 화면을 닫아요.', '나가기', () => showLobby(true))
    } else {
      confirmLobbyAction('등반을 저장하고 나갈까요?', '로비에서 이어 할 수 있어요.', '저장하고 나가기', () => {
        saveCurrent()
        showLobby(true)
      })
    }
  }
})
window.addEventListener('storage', (event) => {
  if ((event.key === ASCENT_SAVE_KEY || event.key === null) && !ui.lobby.hidden) refreshLobbyActions()
})
renderSettings()
showLobby()
