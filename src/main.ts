import { FeelEffects } from './feel-effects.ts'
import {
  ascentFinished, availableMapNodes, beginMapAscent, enterMapNode, FIGHT_COUNT, nextAscentFight, resolveAscentTurn,
  returnToMap, rewardOffers, spinAscentCounter, takeAscentReward,
} from './ascent.ts'
import type { Ascent } from './ascent.ts'
import { CURRENT_MAP_RULES, enemyForMapNode, MAP_ENEMY_BADGES, MAP_FLOORS, MAP_RULES, RULES_SIX_BADGES } from './ascent-map.ts'
import { BOSS_RELIC_CARDS, isBossRelic } from './boss-relic.ts'
import { ASCENT_SAVE_KEY, clearAscentSave, loadAscentSave, readAscentSave, writeAscentSave } from './ascent-save.ts'
import { Arena } from './arena.ts'
import { icon, pixelIcon } from './icons.ts'
import { GOLEM_COUNTER, GOLEM_PARRY } from './golem-parry.ts'
import type { BattleHit } from './arena.ts'
import { BattleAudio } from './battle-audio.ts'
import { battleGuideFor } from './battle-guide.ts'
import { oathDescription, PERK_TEXT, REWARD_TEXT } from './reward-copy.ts'
import { COMPANION_LINES, companionDieIndex } from './companion.ts'
import { enemyForFight } from './enemy-roster.ts'
import { firstBattlePlan, FirstRunGuide } from './first-run-guide.ts'
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
  allocationPower, assignDie, attackFor, chargedStrikePreview, combatSlots, DIE_COUNT, enemyIntentAt, incomingAttack, respondingIntent,
} from './combat.ts'
import type { CounterResult, Exchange, Gimmick, SlotTotals } from './combat.ts'
import { collectorBonus, offerPerks, START_PERKS } from './perks.ts'
import type { Parity } from './perks.ts'
import {
  bladeChargePreview, canReroll, canResolveYachtTurn, previewUnlockProgress, toggleYachtWedge, tuneYachtDie, yachtAllocationTotals,
  classifyYachtHand, emperorShieldActive, forecastYacht, resolveYachtTurn, yachtCounterRewards, yachtGimmick, yachtRerollCost,
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
  inventory: document.querySelector<HTMLElement>('.inventory-strip')!,
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
  firstRunAnchor: element('first-run-anchor'),
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
  hitOrderLabel: element('hit-order-label'),
  hitResults: element('hit-results'),
  parry: element('parry-cue'),
  unlockImpact: element('unlock-impact'),
  awakening: element('awakening'),
  newUnlock: element('new-unlock'),
  unlockHeading: element('unlock-heading'),
  unlockReveal: element('unlock-reveal'),
  ownedUnlocks: element('owned-unlocks'),
  gameOver: element('game-over'),
  gameOverTitle: element('game-over-title'),
  defeatFloor: element('defeat-floor'),
  climbAgain: element<HTMLButtonElement>('climb-again'),
  defeatLobby: element<HTMLButtonElement>('defeat-lobby'),
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
  guardExact: element('guard-exact'),
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

let guideTrigger: HTMLButtonElement | undefined
function openGuide(button: HTMLButtonElement, symbol?: string, name?: string) {
  if (button.disabled || ui.guide.open) return
  const rules = ascent ? ascent.route?.map.rules ?? MAP_RULES : CURRENT_MAP_RULES
  ui.guideEntries.innerHTML = battleGuideFor(rules).map(({ title, entries }) => `
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
  trip: { icon: 'stun', intro: '적 다음 공격 건너뜀', help: '적의 다음 공격을 한 번 건너뛰어요.' },
  armor: { icon: 'armor-break', value: '×1.5', intro: '갑옷 파괴 ×1.5', help: '다음 턴부터 공격 피해가 1.5배예요.' },
  reflect: { icon: 'reflect', intro: '큰 한 방 반사', help: '철추 피해를 적에게 돌려줘요.' },
  topple: { icon: 'knockdown', value: '×2', intro: '넘어짐(쉼·×2)', help: '다음 턴에 적이 쉬고 공격 피해가 2배예요.' },
  retreat: { icon: 'escort-exit', intro: '호위 퇴장', help: '호위가 물러나고 공격이 본체에 닿아요.' },
} satisfies Record<Gimmick, { icon: string; value?: string; intro: string; help: string }>

let ascent: Ascent | null = null
let chosenReward: Reward | undefined
let artifactOptions: ArtifactOptions = {}
let exchangeBusy = false
let stopDiceMotion: (() => void) | undefined
let stopPlacementMotion: (() => void) | undefined
let turnSignals = new AbortController()
const selected = new Set<number>()
const roulette = new CounterRoulette(ui.counterPanel, ui.counter)
const counterPanelHome = ui.counterPanel.parentElement!
const counterPanelNext = ui.counterPanel.nextElementSibling
const sound = new BattleAudio()
const systemMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
let settings = loadGameSettings()
const forkView = new ForkView(ui.fork, { health: ui.mapHealth, floor: ui.mapFloor }, enterFork)
const firstRun = new FirstRunGuide(icon, () => {
  if (!ascent) return
  if (ascent.battle.phase === 'counter') render()
  else renderFirstRun(ascent)
  resumeCounterOrFocus()
})

function reducedMotion() { return settings.reducedMotion ?? systemMotion.matches }
const feel = new FeelEffects(reducedMotion, () => animationSpeed())
function animationSpeed() { return settings.speed === 'fast' ? 2 : 1 }
function effectDuration(milliseconds: number) { return milliseconds / animationSpeed() }

function renderSettings() {
  const reduced = reducedMotion()
  document.documentElement.dataset.reducedMotion = String(reduced)
  document.documentElement.dataset.animationSpeed = settings.speed
  arena.setAnimation(animationSpeed(), reduced)
  if (reduced) {
    feel.clear()
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
    element('replay-first-run-status').textContent = ''
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
element('replay-first-run').addEventListener('click', () => {
  firstRun.replay()
  element('replay-first-run-status').textContent = '다음 새 등반에서 안내를 다시 봐요.'
})
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
for (const target of [ui.intent, element('pool-help')]) {
  target.addEventListener('click', () => showHelp(target))
}
ui.bladeMeter.addEventListener('click', (event) => {
  if (ui.assign.attack.disabled) showHelp(ui.bladeMeter)
  if (helpTarget === ui.bladeMeter && !holdHelp.hidden) event.stopPropagation()
})
window.addEventListener('resize', () => { holdHelp.hidden = true })

const arena = new Arena(element('arena'), ui.encounter, ui.intent, ui.inventory)

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
      if (!ascent) return
      if (!selected.delete(index)) selected.add(index)
      saveCurrent()
      refreshSelection(ascent)
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

const unlockConditions = element<HTMLDialogElement>('unlock-conditions')
const unlockExamples = element('unlock-examples')
const unlockResult = element('unlock-result')

function pips(face: number) {
  return `<span class="gimmick-die" data-face="${face}">${'<b></b>'.repeat(face)}</span>`
}

function showUnlockConditions(hand: Hand) {
  if (unlockConditions.open) return
  const triple = hand === 'triple'
  const name = triple ? '에고 주사위' : '재굴림 주사위'
  unlockConditions.setAttribute('aria-label', `${name} 해금 조건`)
  unlockExamples.innerHTML = (['attack', 'guard'] as const).map((slot) => {
    const exact = triple && slot === 'guard'
    const faces = triple ? [4, 4, 4] : slot === 'attack' ? [6, 5, 4] : [4, 6, 5]
    const label = `${slot === 'attack' ? '공격' : '방어'} 한 칸에 ${triple ? '같은 눈 셋' : '이어지는 눈 셋, 순서 무관'}. 예: ${faces.join('·')}.${exact ? ' 정확 방어도 맞춰야 해요.' : ''}`
    return `<div class="unlock-example" role="img" aria-label="${label}">
      <span class="unlock-example-slot" data-slot="${slot}" aria-hidden="true">
        ${icon(slot === 'attack' ? 'sword' : exact ? 'parry' : 'shield')}
        <span>${faces.map((face) => `<span class="unlock-example-die">${pips(face)}</span>`).join('')}</span>
      </span>${icon('next')}
    </div>`
  }).join('')
  unlockResult.innerHTML = triple
    ? `<span class="companion-tile unlock-result-ego" aria-hidden="true">${icon('companion-awake')}</span><strong>에고</strong>`
    : `<span class="unlock-result-reroll" aria-hidden="true"><span class="unlock-example-die">${pips(5)}</span>${icon('reroll')}</span><strong>재굴림</strong>`
  unlockConditions.showModal()
}

ui.lockedDie.addEventListener('click', () => showUnlockConditions('triple'))
ui.lockedDie.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  showUnlockConditions('triple')
})

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
  ui.lockedDie.setAttribute('aria-label', `에고 주사위 해금 조건${tripleHint}`)

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
  let exact = false
  if (planning && guard > 0) {
    if (canResolveYachtTurn(battle)) exact = resolveYachtTurn(battle).battle.phase === 'counter'
    else {
      const plan = forecastYacht(battle)
      exact = plan.counter && plan.damage < battle.playerHp && plan.dealt < battle.enemyHp
    }
  }
  ui.guardExact.hidden = !exact
  ui.assign.guard.setAttribute('aria-label', `방어 칸, 합계 ${guard}${guardHint}${exact ? ', 정확 방어' : ''}`)
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
  ui.extraReroll.disabled = !rerollLocked && (selected.size !== 1 || rerollable.length !== 1 || !battle.rerolled || !battle.extraRerollAvailable)
  const extra = Number(battle.extraRerollAvailable)
  const straight = pendingUnlock?.straight
  const sealedStraight = rerollLocked && straight?.blocked === 'seal'
  const rerollStatus = !rerollLocked ? '열림' : sealedStraight ? '봉인됨' : straight?.progress === 3 ? '준비' : '잠김'
  ui.extraReroll.innerHTML = rerollLocked
    ? `${icon(unlockInfo.straight.icon)}${icon(sealedStraight ? 'seal' : 'lock')}<span class="unlock-help">${icon('guide')}</span>`
    : `${icon(unlockInfo.straight.icon)}${extra}<span class="reroll-state">${rerollStatus}</span>`
  const straightHint = renderUnlockProgress(ui.extraReroll, rerollLocked && !sealedStraight ? straight : undefined)
  const rerollLabel = rerollLocked ? `재굴림 주사위 해금 조건, ${rerollStatus}${straightHint}` : `재굴림 열림, 이번 전투 ${extra}회 남음`
  ui.extraReroll.ariaHasPopup = rerollLocked ? 'dialog' : null
  if (rerollLocked) ui.extraReroll.setAttribute('aria-controls', unlockConditions.id)
  else ui.extraReroll.removeAttribute('aria-controls')
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
    <i>${clause.face === null ? icon('stacked-pair') : pips(clause.face)}</i>
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
          label = `${battle.rulesSix ? '공격 칸 피해로 적을 쓰러뜨리지 못하면 ' : ''}공격에 놓은 주사위마다 가시 피해 ${mechanic.value}를 받아요.`
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
const hitOrderDuration = 1500
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
  ui.hitResults.replaceChildren()
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
  const targetName = document.createElement('small')
  targetName.textContent = { player: '나', enemy: '적', escort: '호위' }[target]
  number.append(targetName, `−${damage}`)
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

function showParry(authored = false) {
  ui.parry.classList.toggle('sr-only', authored)
  ui.parry.hidden = false
  sound.play('perfect-block', authored ? .94 : 1, authored ? .32 : .19, authored ? undefined : effectDuration(120) / 1000)
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
  const outcome = forecastYacht(before, before.slots, awakenedDice ?? before.dice, yachtGimmick(before))
  const { opening, reflected: reflection, retaliation: thorns } = outcome
  const lateEnemyDamage = dealt - opening.dealt - reflection.dealt
  const lateEscortDamage = (escortDealt ?? 0) - opening.escortDealt - reflection.escortDealt
  const incomingHits = outcome.incoming.hits.slice(0, hitsTaken.length - Number(thorns > 0))
  const incoming = incomingHits.length
  const exact = after.phase === 'counter'
  const ordered = incoming > 1
  if (incoming && (dealt || escortDealt)) {
    const label = document.createElement('small')
    label.className = 'intent-attack-label'
    label.textContent = '적 공격'
    label.setAttribute('aria-hidden', 'true')
    ui.intent.append(label)
  } else if (opening.dealt >= before.enemyHp) {
    ui.intent.hidden = true
  }
  ui.hitOrderLabel.textContent = `${exchange.turn}턴 내 피해`
  let firstHit: HTMLLIElement | undefined
  const readHit = (index: number) => {
    if (!ordered) return
    const item = document.createElement('li')
    const label = index < incoming ? `${index + 1}타` : '가시'
    const damage = hitsTaken[index]
    const expected = incomingHits[index]
    const symbol = index >= incoming ? 'thorns' : damage ? 'heart' : 'shield'
    const preview = expected === undefined ? '' : ` · 예고 ${expected}`
    const reduced = expected !== undefined && expected !== damage ? `<span class="hit-before">${expected}→</span>` : ''
    item.setAttribute('aria-label', `${label}${preview} · ${damage ? `내 피해 ${damage}` : '막음, 내 피해 0'}`)
    item.innerHTML = `${icon(symbol)}<span aria-hidden="true">${reduced}${damage}</span>`
    item.dataset.result = damage ? 'damage' : 'blocked'
    firstHit ??= item
    ui.hitResults.append(item)
    ui.hitOrder.hidden = false
  }
  const start = performance.now()
  const at = async (time: number) => {
    const remaining = start + effectDuration(time) - performance.now()
    if (!reducedMotion() && remaining > 0) {
      await new Promise<void>((finish) => window.setTimeout(finish, remaining))
    }
  }
  const intent = respondingIntent(enemyIntentAt(before), totals.attack)
  const critical = intent.id === 'critical'
  const weak = before.weakenedStrikeTurn === before.turn
  const golemSingle = exact && incoming === 1 && ascent?.enemy.id === 'thorns'
  let golemParry = golemSingle && !dealt && arena.beginGolemParry(start)
  let parryOffset = 0
  type HitCue = { delay?: number; incoming?: boolean; final?: boolean; guarded?: boolean; ordered?: boolean; parry?: boolean }
  const emit = (hits: BattleHit[], contact: HitCue = {}) => {
    const material = () => {
      if (contact.parry) showParry(golemParry)
      else if (contact.guarded) sound.play('block')
      else if (contact.incoming && critical) sound.play('slam', weak ? 1.28 : .9, weak ? .15 : .28)
      else if (contact.ordered && !contact.final) sound.play('tap')
      else if (hits.length) sound.play('stone-hit', contact.ordered ? .85 : 1)
    }
    if (contact.delay) feel.after(effectDuration(contact.delay), material)
    else material()
    arena.contact(hits, contact)
    for (const hit of hits) showDamage(hit)
    if (hits.some(hit => hit.target !== 'player')) feel.after(effectDuration(105), () => sound.play('grit', 1, .085))
  }
  const heroHit = (damage: number, final = true): BattleHit[] => damage ? [{ target: 'player', damage, defeated: final && after.playerHp === 0 }] : []
  const renewed = exchange.heartRevived || after.phase === 'won' && before.bossRelic?.id === 'healing-scepter' && after.playerHp > before.playerHp - taken
  const updatePlayer = () => updateVital(ui.playerHp, ui.playerTotal, renewed ? Math.max(0, before.playerHp - taken) : after.playerHp)
  let visibleEnemyHp = before.enemyHp
  const hitEnemy = (damage: number) => {
    visibleEnemyHp -= damage
    emit([{ target: 'enemy', damage, defeated: visibleEnemyHp === 0 }])
    updateVital(ui.enemyHp, ui.enemyTotal, visibleEnemyHp)
  }
  ui.intent.classList.toggle('parry-in-progress', golemParry)
  if (!golemParry) {
    arena.playExchange(before, exchange, incoming, intent)
    if (opening.dealt || opening.escortDealt) sound.play('swish', 1, .09, effectDuration(opening.escortDealt ? 45 : 96) / 1000)
  }
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
  if (opening.dealt) {
    await at(96)
    hitEnemy(opening.dealt)
  }
  if (reflected && opening.dealt < before.enemyHp) {
    await at(incomingContact)
    showParry()
    if (reflection.escortDealt && before.escort) {
      hitEscort(reflection.escortDealt, before.escort.hp - opening.escortDealt - reflection.escortDealt)
    }
    if (reflection.dealt) hitEnemy(reflection.dealt)
  }
  if (golemSingle && dealt && !reducedMotion()) {
    parryOffset = 170
    await at(parryOffset)
    golemParry = arena.beginGolemParry(performance.now())
  }
  for (let index = 0; index < incoming; index++) {
    const time = golemParry ? parryOffset + GOLEM_PARRY.contact : incomingContact + index * repeatContact
    if (index) arena.queueShadow(start + effectDuration(time), true)
    await at(time)
    const damage = hitsTaken[index]
    const final = index === incoming - 1
    emit(heroHit(damage, final && !exchange.defeatedByThorns), { delay: reducedMotion() ? index * 40 : 0, incoming: true, ordered, final,
      guarded: damage === 0 && !(exact && final), parry: exact && final })
    readHit(index)
  }
  if (thorns) {
    await at(incoming ? incomingContact + (incoming - 1) * repeatContact + 48 : 96)
    const reflected = heroHit(thorns)
    arena.contact(reflected)
    for (const hit of reflected) showDamage(hit)
    sound.play('grit', .78)
    readHit(incoming)
  }
  if (thorns || incoming) updatePlayer()
  if (critical && before.erasedStrikeTurn === before.turn) {
    arena.settlePose(ascent?.enemy.id === 'boss' ? 'interrupted' : 'heavy-hit')
    sound.play('release')
  } else if (intent.id === 'charge' && after.enemyHp > 0 && (after.weakenedStrikeTurn || after.erasedStrikeTurn)) {
    arena.settlePose(ascent?.enemy.id === 'boss' ? 'interrupted' : 'heavy-hit')
    sound.play('release', .85)
  } else if (intent.id === 'knockdown' && after.enemyHp > 0) {
    arena.settlePose(ascent?.enemy.id === 'boss' ? 'get-up' : 'reload')
  }
  if (lateEscortDamage > 0) {
    const lastContact = incoming ? incomingContact + (incoming - 1) * repeatContact : 96
    if (!reducedMotion()) await at(lastContact + 70)
    hitEscort(lateEscortDamage, after.escort?.hp ?? 0)
  }
  if (lateEnemyDamage > 0) {
    const lastContact = incoming ? incomingContact + (incoming - 1) * repeatContact : reflected ? incomingContact : 96
    await at(lastContact + (lateEscortDamage ? 140 : 70))
    hitEnemy(lateEnemyDamage)
  }
  if (renewed) {
    if (!reducedMotion()) await wait(160)
    sound.play('unlock', exchange.heartRevived ? .54 : .72)
    updateVital(ui.playerHp, ui.playerTotal, after.playerHp)
    markVital(ui.playerHp.closest<HTMLElement>('.vital')!)
  }
  ui.feedback.textContent = `적 피해 ${dealt}, 내 피해 ${taken}${escortDealt ? `, 호위 피해 ${escortDealt}` : ''}${awakenedDice ? `, 각성 ${awakenedDice.join(', ')}` : ''}`
  if (ordered) window.setTimeout(() => {
    if (firstHit?.parentElement === ui.hitResults) {
      ui.hitOrder.hidden = true
      ui.hitResults.replaceChildren()
    }
  }, hitOrderDuration)
  if (exact) {
    if (before.bossRelic?.id === 'brake-crown' && !before.crownUsed) {
      ui.bossRelicSlot.classList.add('crown-ready')
    }
    if (golemParry) {
      await at(parryOffset + GOLEM_PARRY.landing)
      if (!reducedMotion()) sound.play('stone-hit', .84, .13)
      await at(parryOffset + GOLEM_PARRY.end)
    } else {
      await wait(parryDuration)
    }
    arena.holdFieldParry()
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
  if (room?.kind === 'rest') ui.rewardHeading.insertAdjacentHTML('beforeend', '<span class="rest-ember" aria-hidden="true"></span>')
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
    const pictogram = pixelIcon(symbol)
    card.innerHTML = isBossRelic(reward) ? `${pictogram}<strong>${name}</strong><small>${REWARD_CARDS[reward].value}</small>` : pictogram
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
    emptyStock.innerHTML = pixelIcon('lock')
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
      empty.innerHTML = pixelIcon('map-reward')
      ui.rewardCards.append(empty)
    }
  }
  renderRewardPreview(run)
}

ui.rewardCards.addEventListener('keydown', (event) => {
  if (!ui.rewardPanel.classList.contains('battle-reward') || !(event.target instanceof HTMLButtonElement)) return
  const cards = Array.from(ui.rewardCards.querySelectorAll<HTMLButtonElement>('button:enabled'))
  const index = cards.indexOf(event.target)
  if (index < 0) return
  const next = { ArrowDown: index + 1, ArrowRight: index + 1, ArrowUp: index - 1, ArrowLeft: index - 1,
    Home: 0, End: cards.length - 1 }[event.key]
  if (next === undefined) return
  event.preventDefault()
  cards[(next + cards.length) % cards.length].focus()
})

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

function teachOpening({ battle }: Ascent) {
  if (battle.phase === 'counter') {
    firstRun.teach({ id: 'defend', text: '딱 막았어요! 반격 룰렛을 돌려요.', symbol: 'wheel',
      anchor: ui.counter, marks: [ui.counter] })
    return
  }

  const { slots, outcome } = firstBattlePlan(battle)
  const misplaced = battle.slots.findIndex((slot, index) => slot !== null && slot !== slots[index])
  if (misplaced >= 0) {
    const from = diceButtons[misplaced]
    const slot = battle.slots[misplaced] === 'guard' ? '방어' : '공격'
    firstRun.teach({ id: 'correct', text: `${slot}에서 표시한 주사위를 빼요.`, symbol: 'return', anchor: ui.firstRunAnchor,
      marks: [from, ui.assign.pool], from, to: ui.dice.pool })
    return
  }

  const attack = slots.flatMap((slot, index) => slot === 'attack' && battle.slots[index] === null ? [diceButtons[index]] : [])
  const guard = slots.flatMap((slot, index) => slot === 'guard' && battle.slots[index] === null ? [diceButtons[index]] : [])
  const guardFirst = battle.turn > 1 && guard.length > 0
  if (attack.length && !guardFirst) {
    firstRun.teach({ id: 'attack', text: '표시한 주사위를 공격에 놓아요.', symbol: 'sword', anchor: ui.firstRunAnchor,
      marks: [ui.assign.attack, ...attack], from: attack[0], to: ui.assign.attack })
  } else if (guard.length) {
    const damage = outcome.incoming.totalDamage
    const text = outcome.counter ? `방어 ${damage} = 적 공격 ${damage} → 정확 방어` : '표시한 주사위를 방어에 놓아요.'
    firstRun.teach({ id: 'defend', text, symbol: 'shield', anchor: ui.firstRunAnchor,
      marks: [ui.intent, ui.assign.guard, ...guard], from: guard[0], to: ui.assign.guard })
  } else {
    const text = outcome.counter ? '턴을 끝내 반격 룰렛을 열어요.' : '턴 끝내기를 눌러요.'
    firstRun.teach({ id: 'end-turn', text, symbol: 'turn', anchor: ui.firstRunAnchor, marks: [ui.resolve] })
  }
}

function renderFirstRun(run: Ascent) {
  const { battle, route, unlocks } = run
  if (firstRun.includes(run)) {
    if (battle.phase === 'won' || battle.phase === 'lost') firstRun.complete()
    else if (route?.screen === 'battle' && (!ui.planning.hidden || !ui.counterPanel.hidden)) {
      teachOpening(run)
      return
    }
  }

  if (!ui.fork.hidden && availableMapNodes(run).length > 1) {
    firstRun.discover([{ id: 'fork', symbol: 'map-pin', text: '다음에 갈 길을 골라요.', anchor: element('fork-heading') }])
  } else if (!ui.rewardPanel.hidden) {
    const room = currentTreasureRoom(run)
    const anchor = ui.rewardHeading
    if (room?.kind === 'shop') {
      const text = route && route.map.rules >= 3 ? '동전으로 물건을 살 수 있어요.' : '필요한 물건을 골라요.'
      firstRun.discover([{ id: 'shop', symbol: 'map-shop', text, anchor }])
    } else if (room?.enemyId === 'chain-warden') {
      firstRun.discover([{ id: 'boss-relic', symbol: 'crown', text: '보스 유물 한 장을 골라요.', anchor }])
    } else if (route?.screen === 'reward' || (!route && battle.phase === 'won')) {
      firstRun.discover([{ id: 'reward', symbol: 'map-reward', text: '카드 한 장을 골라 확인해요.', anchor }])
    } else firstRun.clear()
  } else if (!ui.battle.hidden && !ui.planning.hidden) {
    const gimmick = yachtGimmick(battle)
    const hand = classifyYachtHand(battle, battle.dice)
    const condition = gimmick && `에 ${gimmick.face ?? '같은 눈 둘'} → ${gimmickEffects[gimmick.kind].intro}`
    firstRun.discover([
      ...(gimmick && condition ? [{ id: `gimmick-${gimmick.kind}`, symbol: gimmick.slot === 'guard' ? 'shield' : 'sword',
        text: condition, spoken: `${gimmick.slot === 'guard' ? '방어' : '공격'} 칸${condition}`, anchor: ui.encounter, beside: ui.inventory }] : []),
      ...(hand && !unlocks.includes(hand) ? [{ id: `unlock-${hand}`, symbol: 'lock', anchor: hand === 'triple' ? ui.lockedDie : ui.extraReroll,
        text: '잠긴 자리를 눌러 해금 조건을 봐요.' }] : []),
    ])
  } else firstRun.clear()
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
  const defeated = finished && phase === 'lost' && presentation === 'normal'
  const atEvent = presentation === 'normal' && !defeated && !atRewards && (between || finished)
  const atUnlock = presentation === 'unlock' && newUnlock !== null
  const inCombat = !atMap && !atEvent && !atUnlock && !atRewards && !defeated
  const showActions = presentation === 'normal' && inCombat
  const companionAwake = unlocks.includes('triple')
  ui.main.dataset.screen = defeated ? 'defeat' : atMap ? 'fork' : atRewards ? 'reward' : atEvent ? 'event' : atUnlock ? 'unlock' : 'battle'
  ui.lobby.hidden = true
  ui.masthead.hidden = defeated
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
  ui.encounter.hidden = !inCombat && !defeated
  ui.encounter.setAttribute('aria-label', defeated ? '돌바닥에 쓰러진 회귀자의 마지막 전장' : '전장')
  ui.fight.hidden = atMap || (!inCombat && !atRewards)
  const floor = route ? (route.node === null ? route.completed.length : route.map.byId[route.node].floor) : fight
  const floors = route ? MAP_FLOORS : FIGHT_COUNT
  ui.gameOver.hidden = !defeated
  if (defeated) ui.defeatFloor.textContent = `${floor}층에서 ${battle.lastExchange?.defeatedByThorns ? '가시에 찔려 ' : ''}쓰러졌습니다.`
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
    for (const node of availableMapNodes(ascent)) {
      const foe = enemyForMapNode(node, route!.map.rules)
      if (foe) arena.prime(foe.id)
    }
    renderFirstRun(ascent)
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
  ui.encounter.classList.toggle('boss-room', enemy.id === 'boss')
  if (battle.escort) updateEscortVital(battle.escort.hp)
  ui.newUnlock.hidden = !atUnlock
  showCompanionLine(ui.companionAwakenLine, atUnlock && newUnlock === 'triple' ? COMPANION_LINES.awaken : '')
  if (atUnlock) {
    const unlock = unlockInfo[newUnlock]
    ui.unlockReveal.classList.toggle('companion-reveal', newUnlock === 'triple')
    const revealLabel = newUnlock === 'triple' ? `${unlock.label} 깨어남` : `${unlock.label} 해금`
    if (newUnlock === 'triple') {
      ui.unlockHeading.innerHTML = `${icon(unlock.icon)}${unlock.label}`
      ui.unlockReveal.innerHTML = `<span class="companion-tile" aria-hidden="true">${icon(unlock.icon)}<i class="ego-shell left"></i><i class="ego-shell right"></i></span>`
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
  const fieldCounter = showActions && phase === 'counter'
  if (fieldCounter && ui.counterPanel.parentElement !== ui.encounter) ui.encounter.append(ui.counterPanel)
  if (!fieldCounter && ui.counterPanel.parentElement !== counterPanelHome) {
    counterPanelHome.insertBefore(ui.counterPanel, counterPanelNext)
  }
  ui.counterPanel.classList.toggle('counter-over-field', fieldCounter)
  ui.intent.classList.toggle('parry-in-progress', fieldCounter)
  roulette.setVisible(showActions && phase === 'counter' ? yachtCounterRewards(battle) : null, companionAwake)
  if (fieldCounter) {
    ui.counter.hidden = !firstRun.includes(ascent) || Boolean(battle.loot?.counter)
    if (battle.loot?.counter && ui.counterPanel.dataset.rollState !== 'locked') {
      void roulette.reveal(battle.loot.counter, false, () => {})
    }
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
  const wins = route?.completed.length ?? fight
  if (atRest) {
    ui.eventFloor.innerHTML = `<strong>${floor}/${floors}</strong><span>${icon('heart')}${playerHp}/${maxHp}</span>`
    ui.eventFloor.setAttribute('aria-label', `${floor}층 정비, 체력 ${playerHp}/${maxHp}`)
  } else {
    ui.eventFloor.innerHTML = between
      ? `<span>${floor}/${floors}</span>${icon('next')}<strong>${floor + 1}/${floors}</strong>` : `<strong>${wins}/${floors}</strong>`
    ui.eventFloor.setAttribute('aria-label', between ? `${floor}층에서 ${floor + 1}층으로` : `${floors}층 중 ${wins}층 통과`)
  }
  ui.ascentEvent.classList.toggle('finished', finished)
  ui.result.hidden = !atEvent || !finished
  ui.completionSeal.hidden = !atEvent || !finished || phase !== 'won'
  ui.next.hidden = !between || !atEvent
  ui.next.innerHTML = route ? `다음 층 ${icon('next')}` : `다음 전투 ${icon('next')}`
  ui.retry.hidden = !finished
  refreshDice(battle, totals, unlocks)
  const gimmick = ui.encounter.dataset.gimmick
  ui.encounter.classList.toggle('gimmick-intro', !ui.planning.hidden && !!gimmick &&
    !firstRun.includes(ascent) && firstRun.needsSpace(`gimmick-${gimmick}`))
  arena.refresh(battle, enemy.id, floor)
  if (rollTurn && !ui.planning.hidden && !reducedMotion()) {
    const ego = companionDieIndex(battle)
    stopDiceMotion = playDiceMotion(ui.encounter, battle.dice.map((face, index) => ({
      button: diceButtons[index], face, ego: index === ego,
    })), () => {
      stopDiceMotion = undefined
      diceButtons.forEach(die => die.dispatchEvent(new Event('die-landed')))
      if (document.activeElement === ui.planning) focusPhase()
    }, (cue, index, companion) => {
      if (cue === 'land') sound.play('dice-roll', 1 + index * .05, index === 0 ? .17 : .075, .052)
      if (cue === 'bounce') sound.play('rebound', 1 + index * .06, index === 0 ? .13 : .045)
      if (cue === 'seat') {
        if (index === 0) sound.play('seat', 1, .09)
        if (companion) sound.play('hum', 1, .08)
      }
    }, animationSpeed())
  } else if (rollTurn && !ui.planning.hidden) {
    sound.play('seat', 1, .09)
    if (battle.fourthDieUnlocked) sound.play('hum', 1, .065)
  }
  if (presentation === 'normal') renderFirstRun(ascent)
}

function refreshLobbyActions() {
  const { checkpoint, invalidMap } = readAscentSave()
  const hasSave = checkpoint !== null
  if (checkpoint) arena.prime(checkpoint.ascent.enemy.id)
  ui.continueAscent.hidden = !hasSave
  ui.saveNotice.hidden = !invalidMap
  ui.newAscent.classList.toggle('primary', !hasSave)
}

function resetPresentation() {
  firstRun.clear()
  turnSignals.abort()
  turnSignals = new AbortController()
  feel.clear()
  sound.clearEffects()
  stopDiceMotion?.()
  stopPlacementMotion?.()
  clearExchange()
}

function showLobby(focus = false) {
  resetPresentation()
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
  resetPresentation()
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
    firstRun.start(seed)
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
    <span class="perk-symbol">${pixelIcon(symbol)}</span>
    <span class="perk-name">${name}</span>
  `
  const explanation = document.createElement('span')
  explanation.className = 'perk-description'
  explanation.innerHTML = description
  button.append(explanation)
  button.setAttribute('aria-label', `${name}, ${explanation.textContent}`)
  return button
}

function refreshSelection(run: Ascent) {
  refreshDice(run.battle, yachtAllocationTotals(run.battle), run.unlocks)
  renderRewardStrip(run.battle, false)
  renderTreasureControls(run.battle, true)
}

function place(indices: readonly number[], zone: DropZone) {
  if (ui.guide.open || exchangeBusy || stopDiceMotion || !ascent || !indices.length || ascent.battle.phase !== 'assign' || ascent.battle.loot?.hourglass) return
  const slot = zone === 'pool' ? null : zone
  const before = ascent.battle
  let battle = before
  for (const index of indices) battle = assignDie(battle, index, slot)
  const moved = indices.filter((index) => battle.slots[index] !== before.slots[index])
  for (const i of moved) diceButtons[i].getAnimations().filter(a => a.id === 'reroll').forEach(a => a.cancel())
  const seat = () => {
    sound.play(slot ? 'dice-place' : 'seat', slot ? 1 : 1.25, slot ? .19 : .13)
    feel.pulse(ui.dice[zone], slot ? 2 : -2)
  }
  const scene = ui.planning.getBoundingClientRect()
  const ego = companionDieIndex(battle)
  const animated = !reducedMotion() ? moved.map((index) => ({
    button: diceButtons[index],
    face: battle.dice[index],
    ego: index === ego,
    from: dieCenter(diceButtons[index], scene),
  })) : []
  ascent = { ...ascent, battle }
  selected.clear()
  saveCurrent()
  if (moved.length) render()
  else refreshSelection(ascent)
  if (animated.length) {
    stopPlacementMotion = playPlacementMotion(ui.planning, animated, () => { stopPlacementMotion = undefined }, seat, animationSpeed())
  } else if (moved.length) seat()
  const guideTarget = ui.planning.querySelector<HTMLElement>('[data-first-run-target]:is(.die, #resolve)')
  const unassigned = battle.slots.indexOf(null)
  if (guideTarget) guideTarget.focus({ preventScroll: true })
  else if (unassigned < 0) ui.resolve.focus()
  else diceButtons[unassigned].focus()
}

function focusPhase() {
  if (!ascent) return
  if (!ui.gameOver.hidden) ui.gameOverTitle.focus()
  else if (!ui.fork.hidden) forkView.focusFirst()
  else if (!ui.rewardPanel.hidden) {
    const target = ui.rewardCards.querySelector<HTMLButtonElement>('[aria-pressed="true"]') ?? ui.rewardCards.querySelector('button:not(:disabled)') ?? ui.skipReward
    target.focus()
  }
  else if (ascent.battle.loot?.hourglass || ascent.battle.loot?.counter) ui.treasureControls.querySelector('button')?.focus()
  else if (ascent.battle.phase === 'counter') ui.counter.focus()
  else if (ascent.battle.phase === 'assign') {
    const guideTarget = ui.planning.querySelector<HTMLElement>('[data-first-run-target]:is(.die, #resolve)')
    const target = stopDiceMotion ? ui.planning : guideTarget ?? diceButtons[selected.values().next().value ?? 0]
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
  const before = ascent.battle
  const indices = [...selected].filter(index => canReroll(before, index))
  const seal = enemyIntentAt(before).mechanic
  const rerolled = rerollSelectedDice(ascent.battle, selected, extra)
  if (!rerolled) return
  ascent = { ...ascent, battle: rerolled.battle }
  saveCurrent()
  render()
  sound.play('dice-roll', 1.2, .13, effectDuration(120) / 1000)
  for (const index of indices) {
    const die = diceButtons[index]
    const animation = feel.animate(die, [{ transform: 'none' }, { transform: 'translateY(-5px) rotate(-15deg)' },
      { transform: 'translateY(-2px) rotate(10deg)' }, { transform: 'none' }], 125,
      () => {
        if (index === indices[0]) sound.play('rebound')
        if (seal?.kind === 'seal' && before.dice[index] !== seal.value && rerolled.battle.dice[index] === seal.value) {
          dieStatusCue(rerolled.battle, index, 'stamp')
        }
      })
    animation.id = 'reroll'
  }
  diceButtons[rerolled.focusIndex].focus()
}

ui.reroll.addEventListener('click', () => useReroll(false))
ui.extraReroll.addEventListener('click', () => {
  if (ascent && !ascent.unlocks.includes('straight')) showUnlockConditions('straight')
  else useReroll(true)
})
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
  const previous = ascent
  const room = currentTreasureRoom(previous)
  const selectedItem = ui.artifactOptions.querySelector<HTMLElement>('[data-option="replace"][aria-pressed="true"]')
    ?? ui.rewardCards.querySelector<HTMLElement>('[aria-pressed="true"]') ?? ui.confirmReward
  const seat = selectedItem.getBoundingClientRect()
  const replacement = artifactOptions.replace
  const next = takeAscentReward(ascent, choice, artifactOptions)
  if (next === ascent) return
  ascent = returnToMap(next)
  chosenReward = undefined
  artifactOptions = {}
  saveCurrent()
  render()
  if (choice !== 'skip') {
    const paid = (previous.route?.coins ?? 0) - (ascent.route?.coins ?? 0)
    if (paid > 0) {
      feel.pulse(ui.runCoins)
      sound.play('pay')
    }
    if (isArtifact(choice) && next.battle.loot?.equipped.includes(choice)) {
      const node = feel.layer(seat, 'socket', icon(REWARD_CARDS[replacement ?? choice].icon))
      const latch = () => {
        node.innerHTML = icon(REWARD_CARDS[choice].icon)
        feel.animate(node, [{ transform: 'translateY(-7px)' }, { transform: 'translateY(2px) scaleY(.89)' }], 48, () => {
          sound.play('latch')
          feel.animate(node, [{ transform: 'translateY(2px) scaleY(.89)' }, { transform: 'none', opacity: 1 }, { opacity: 0 }], 132,
            () => feel.release(node))
        })
      }
      if (replacement) {
        sound.play('tap', 1.4, .12)
        feel.animate(node, [{ transform: 'none' }, { transform: 'translateY(-5px)', opacity: .3 }], 65, latch)
      } else if (paid) feel.after(effectDuration(52), latch)
      else latch()
    }
    const healed = next.battle.playerHp - previous.battle.playerHp
    if (healed > 0) {
      const meter = feel.layer(ui.mapHealth.getBoundingClientRect(), 'mend')
      const length = 58 + Math.min(5, healed) * 24
      const fill = (hp: number) => 'inset(calc(100% - 3px) ' + (100 - 100 * hp / next.maxHp) + '% 0 0)'
      const duration = reducedMotion() ? Math.min(length, 85) : length
      sound.play('mend', 1.1, .15, effectDuration(duration) / 1000)
      feel.animate(meter, [{ clipPath: fill(previous.battle.playerHp) }, { clipPath: fill(next.battle.playerHp) }], length,
        () => feel.release(meter))
    }
    if (room?.event === 'pulley' && choice === 'whetstone') {
      const wheel = feel.layer(seat, 'pulley', '<i></i><b></b>')
      feel.animate(wheel.querySelector('i')!, [{ transform: 'rotate(16deg) scaleY(.65)' }, { transform: 'none' }], 42, () => {
        sound.play('pulley')
        feel.animate(wheel.querySelector('b')!, [{ rotate: '-22deg' }, { rotate: '70deg' }], 140, () => {
          sound.play('release')
          feel.release(wheel)
        })
      })
    }
  }
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
  const previous = ascent
  const before = ascent.battle
  const resolved = resolveAscentTurn(ascent)
  if (resolved === ascent) return
  const next = firstRun.opening(resolved, before.turn)
  turnSignals.abort()
  turnSignals = new AbortController()
  feel.clear()
  lockExchange(true)
  firstRun.clear()
  if (!before.stolenDie && next.battle.stolenDie) {
    const die = diceButtons[DIE_COUNT - 1]
    const stolen = feel.layer(die.getBoundingClientRect(), 'stolen', String(before.dice[DIE_COUNT - 1]))
    sound.play('swish', .8, .11)
    const enemyX = ui.encounter.getBoundingClientRect().left + parseFloat(ui.encounter.style.getPropertyValue('--enemy-x'))
    feel.animate(stolen, [{ transform: 'none' }, { transform: 'translate(' + (enemyX - die.getBoundingClientRect().left) * .28 + 'px,-26px)', opacity: 0 }], 165, () => feel.release(stolen))
  }
  selected.clear()
  clearExchange()
  ascent = next
  saveCurrent()

  const { phase, lastExchange } = next.battle
  try {
    if (lastExchange) await showExchange(before, next.battle, lastExchange)
    if (phase !== 'lost' && (next.battle.turn !== before.turn || next.newUnlock)) {
      await arena.finishExchange()
      for (const output of Object.values(damageOutput)) output.replaceChildren()
    }
    if (phase === 'lost') {
      if (!reducedMotion()) await wait(240)
      clearExchange()
    } else if (next.newUnlock) {
      if (next.newUnlock === 'triple') {
        feel.animate(ui.lockedDie, [{ boxShadow: 'inset 0 -2px #c4b48b' }, { boxShadow: 'inset 0 -8px #ffe7ab, 0 4px 9px #a49579' }], 220)
        sound.play('rise')
      }
      if (next.newUnlock === 'triple' && !reducedMotion()) {
        ui.unlockImpact.hidden = false
        arena.freeze(unlockImpactDuration)
        await wait(unlockImpactDuration)
        ui.unlockImpact.hidden = true
      } else if (lastExchange && (lastExchange.dealt || lastExchange.escortDealt || lastExchange.hitsTaken.some(Boolean))) {
        await wait(250)
      }
      render('unlock')
      if (next.newUnlock === 'triple' && !reducedMotion()) {
        // Reveal the first slice of the face and strike the opening chime together.
        for (const shell of Array.from(ui.unlockReveal.querySelectorAll<HTMLElement>('.ego-shell'))) {
          shell.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(' + (shell.classList.contains('left') ? '-110%' : '110%') + ')' }],
            { duration: effectDuration(190), easing: 'ease-out', fill: 'forwards' })
        }
      }
      sound.play('unlock')
      await wait(next.newUnlock === 'triple' ? companionAwakenDuration : unlockDuration)
    } else if (phase === 'won') {
      await wait(reducedMotion() ? 320 : damageDuration)
    }
  } finally {
    ui.intent.classList.remove('parry-in-progress')
    lockExchange(false)
    render('normal', next.battle.turn !== before.turn)
    if (before.turn !== next.battle.turn && !ui.planning.hidden) turnCues(before, true)
    finishCues(previous, next)
    resumeCounterOrFocus()
  }
})
function finishCues(previous: Ascent, next: Ascent) {
  if (next.battle.phase === 'lost') sound.play('defeat')
  if (next.battle.phase !== 'won') return
  sound.play('victory')
  if ((next.route?.coins ?? 0) > (previous.route?.coins ?? 0)) {
    const coin = ui.runCoins.querySelector<SVGElement>('svg')
    if (coin) feel.animate(coin, [{ transform: 'translateY(-4px)' }, { transform: 'none' }], 95,
      () => sound.play('coin'))
  }
  if (!ui.completionSeal.hidden) {
    feel.animate(ui.completionSeal, [{ transform: 'scale(1.1)' }, { transform: 'scale(.97)' }, { transform: 'none' }], 110,
      () => sound.play('engrave'))
  }
}

function dieStatusCue(b: YachtBattle, index: number, type: 'frost' | 'stamp' | 'return') {
  const die = diceButtons[index]
  const landed = () => {
    if (die.hidden || !die.isConnected || ui.planning.hidden || ascent?.battle.turn !== b.turn) return
    const node = feel.layer(die.getBoundingClientRect(), type)
    if (type !== 'return') {
      const mark = document.createElement('i')
      mark.className = 'die-contact-art'
      mark.style.backgroundImage = 'url(' + new URL('art/motion/effects.png', document.baseURI).href + ')'
      mark.style.backgroundPositionY = type === 'frost' ? '-23px' : '-46px'
      node.append(mark)
      if (!reducedMotion()) mark.animate([{ backgroundPositionX: '0px' }, { backgroundPositionX: '-128px' }],
        { duration: effectDuration(100), easing: 'steps(4,end)' })
    }
    const frames = type === 'frost' ? [{ clipPath: 'inset(75% 74% 0 0)' }, { clipPath: 'inset(0)' }]
      : [{ transform: 'translateY(-6px)', opacity: .3 }, { transform: 'none', opacity: 1 }]
    feel.animate(node, frames, 100, () => {
      sound.play(type === 'return' ? 'seat' : type)
      feel.release(node)
    })
  }
  // A die with an active entrance is represented by its moving face.
  // Apply the mark after the slot becomes visible; cancel if the turn is left.
  if (die.classList.contains('die-arriving')) die.addEventListener('die-landed', landed, { once: true, signal: turnSignals.signal })
  else landed()
}

function turnCues(before: YachtBattle | undefined, changedTurn: boolean) {
  if (!ascent || ui.planning.hidden || ui.encounter.hidden) return
  const b = ascent.battle
  const intent = enemyIntentAt(b)
  if (intent.id === 'charge') {
    sound.play('charge')
    arena.settlePose(ascent.enemy.id === 'boss' ? 'charge-set' : 'anticipate')
  } else if (intent.id === 'knockdown') arena.settlePose(ascent.enemy.id === 'boss' ? 'knee-down' : 'fall')
  if (before && !before.escort && b.escort) {
    // The summon has a visible result on the next plan. Remove the previous
    // damage label before the new escort HP and forecast share that space.
    ui.playerDamage.replaceChildren()
    feel.pulse(ui.escortGuard)
  }
  if (!changedTurn && !b.fixedDie && intent.mechanic?.kind !== 'seal') return
  if (b.fixedDie?.kind === 'freeze') dieStatusCue(b, b.fixedDie.index, 'frost')
  if (b.fixedDie?.kind === 'lock') dieStatusCue(b, b.fixedDie.index, 'stamp')
  const mechanic = intent.mechanic
  if (mechanic?.kind === 'seal') b.dice.forEach((value, index) => { if (value === mechanic.value) dieStatusCue(b, index, 'stamp') })
  if (before?.stolenDie && !b.stolenDie && b.dice.length > before.dice.length) dieStatusCue(b, DIE_COUNT - 1, 'return')
}

function resumeCounterOrFocus() {
  if (ascent?.battle.phase === 'counter' && !ascent.battle.loot?.counter && !firstRun.includes(ascent)) void playCounter()
  else focusPhase()
}

async function playCounter(choice?: CounterChoice) {
  if (ui.guide.open || exchangeBusy || !ascent || ascent.battle.phase !== 'counter' || roulette.busy || (!choice && ascent.battle.loot?.counter)) return
  const previous = ascent
  const spun = spinAscentCounter(ascent, choice)
  if (spun === ascent) return
  const before = previous.battle
  const checkpoint = firstRun.opening(spun, before.turn)
  const next = checkpoint.battle
  const pending = next.loot?.counter
  const reward = pending ?? next.lastExchange?.counter
  if (!reward) return
  firstRun.clear()

  try {
    await roulette.play(() => presentCounter(previous, checkpoint, reward, choice))
  } catch (error) {
    console.error('반격 연출을 완료하지 못했습니다.', error)
    ui.companionFlight.hidden = true
    roulette.setVisible(null)
    clearExchange()
  } finally {
    ascent = checkpoint
    render('normal', !pending && next.phase === 'assign')
    if (!pending) {
      if (next.turn !== before.turn && !ui.planning.hidden) turnCues(before, true)
      finishCues(previous, checkpoint)
    }
    focusPhase()
  }
}

async function presentCounter(previous: Ascent, checkpoint: Ascent, reward: CounterResult, choice?: CounterChoice) {
  saveCurrent(checkpoint)
  ui.counter.hidden = true
  const before = previous.battle
  const next = checkpoint.battle
  const dealt = before.enemyHp - next.enemyHp
  const escortDealt = (before.escort?.hp ?? 0) - (next.escort?.hp ?? 0)
  const companionJoint = reward.joint && previous.unlocks.includes('triple')
  ui.help.disabled = true
  ui.battleSettings.disabled = true
  ui.returnLobby.disabled = true
  ui.rewardStrip.querySelectorAll('button').forEach((button) => { button.disabled = true })
  ui.artifactStrip.querySelectorAll('button').forEach((button) => { button.disabled = true })
  ui.treasureControls.hidden = true

  const animate = !reducedMotion()
  if (next.perk?.kind === 'counter') renderActivePerk(next)
  if (!choice) {
    sound.play('roulette-engage', 1, .26)
    if (animate) sound.play('roulette-ratchet', animationSpeed(), .23)
    await roulette.reveal(reward, animate, () => {}, animationSpeed() * 1.24)
    sound.play('roulette-latch', 1, .37)
    await wait(520)
  }
  if (next.loot?.counter) return
  ui.counterPanel.hidden = true
  const choreographed = animate && !companionJoint && !escortDealt && dealt > 0 && arena.beginGolemCounter(next.enemyHp === 0)
  if (!choreographed) clearExchange()
  if (choreographed) {
    await wait(GOLEM_COUNTER.contact)
  } else if (companionJoint && animate) {
    const point = arena.flightTarget(escortDealt ? 'escort' : 'enemy')
    ui.companionFlight.style.setProperty('--flight-x', point.x + 'px')
    ui.companionFlight.style.setProperty('--flight-y', point.y + 'px')
    ui.companionFlight.style.setProperty('--flight-duration', `${effectDuration(companionFlightDuration)}ms`)
    ui.companionFlight.hidden = false
    await wait(companionImpactTime)
  } else if ((dealt || escortDealt) && animate) {
    arena.counterStrike()
    await wait(128)
  }
  if (escortDealt > 0) {
    const hit = { target: 'escort', damage: escortDealt, defeated: !next.escort } as const
    arena.contact([hit], { counter: true, joint: companionJoint })
    showDamage(hit)
    updateEscortVital(next.escort?.hp ?? 0)
    sound.play('stone-hit', companionJoint ? 1.32 : 1)
    if (dealt && animate) await wait(70)
  }
  if (dealt > 0) {
    const hit = { target: 'enemy', damage: dealt, defeated: next.enemyHp === 0 } as const
    if (!choreographed) arena.contact([hit], { counter: true, joint: companionJoint })
    showDamage(hit)
    if (choreographed) ui.feedback.textContent = `반격 피해 ${dealt}`
    sound.play('stone-hit', choreographed ? .80 : companionJoint ? 1.32 : 1, choreographed ? .31 : .19)
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
  await wait(choreographed ? GOLEM_COUNTER.end - GOLEM_COUNTER.contact : reducedMotion() || !(dealt || escortDealt) ? 320 : damageDuration)
  if (choreographed) clearExchange()
  arena.finishStrike()
}
ui.counter.addEventListener('click', () => void playCounter())
function enterFork(id: number) {
  if (ui.guide.open || exchangeBusy || ascent?.route?.screen !== 'map') return
  const door = ui.fork.querySelector<HTMLElement>('[data-node="' + id + '"] .fork-art')
  const rect = door?.getBoundingClientRect()
  const next = enterMapNode(ascent, id)
  if (next === ascent) return
  resetPresentation()
  ascent = firstRun.opening(next)
  saveCurrent()
  sound.play('step')
  render('normal', true)
  if (rect && door) {
    const doorWidth = Math.min(rect.width * .84, 152) - 13
    const inside = new DOMRect(rect.x + (rect.width - doorWidth) / 2, rect.y + 10, doorWidth, rect.height - 10)
    const overlay = feel.layer(inside, 'door', door.innerHTML)
    feel.animate(overlay, [{ opacity: .96 }, { opacity: .78, offset: .55 }, { opacity: 0 }], 125, () => feel.release(overlay))
  }
  const floor = ui.encounter.hidden ? ui.rewardHeading : ui.encounter
  const ground = floor.getBoundingClientRect()
  const dust = feel.layer(new DOMRect(ground.x + (ui.encounter.hidden ? ground.width / 2 : parseFloat(ui.encounter.style.getPropertyValue('--player-x')) || ground.width / 3),
    ground.y + (ui.encounter.hidden ? ground.height : parseFloat(ui.encounter.style.getPropertyValue('--ground')) || ground.height * .6), 14, 3), 'footstep')
  feel.animate(dust, [{ opacity: .8 }, { transform: 'scaleX(1.4)', opacity: 0 }], 96, () => feel.release(dust))
  if (ascent.route?.screen === 'rest') {
    const ember = ui.rewardHeading.querySelector<HTMLElement>('.rest-ember')
    sound.play('ember')
    if (ember) feel.animate(ember, [{ transform: 'scale(.7)' }, { transform: 'scale(1.22)' }, { transform: 'none' }], 180)
  }
  turnCues(undefined, false)
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
  focusPhase()
})
ui.retry.addEventListener('click', showPerks)
ui.climbAgain.addEventListener('click', showPerks)
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
  resumeCounterOrFocus()
})
ui.newAscent.addEventListener('click', () => {
  const { checkpoint, invalidMap } = readAscentSave()
  if (checkpoint || invalidMap) {
    confirmLobbyAction('새로 하기', '새 등반을 시작하면 저장된 등반을 덮어씁니다.', '새로 하기', showPerks)
  } else showPerks()
})
function returnToLobby() {
  if (exchangeBusy || roulette.busy) return
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
}
ui.returnLobby.addEventListener('click', returnToLobby)
ui.defeatLobby.addEventListener('click', returnToLobby)
window.addEventListener('storage', (event) => {
  if ((event.key === ASCENT_SAVE_KEY || event.key === null) && !ui.lobby.hidden) refreshLobbyActions()
})
renderSettings()
showLobby()
