import { FeelEffects } from './feel-effects.ts'
import {
  ascentFinished, availableMapNodes, beginMapAscent, canKeepEliteArtifacts, enterMapNode, FIGHT_COUNT, nextAscentFight, resolveAscentTurn,
  returnToMap, rewardOffers, spinAscentCounter, takeAscentReward,
} from './ascent.ts'
import type { Ascent } from './ascent.ts'
import { CURRENT_MAP_RULES, enemyForMapNode, MAP_FLOORS, MAP_RULES } from './ascent-map.ts'
import { perkDisplayName, rewardDisplayName } from './display-names.ts'
import { enemyBadge, enemyNameplate, ENEMY_CODEX, TOWER_REGIONS, towerRegion } from './enemy-codex.ts'
import { bossRelicText, isBossRelic, SEVEN_BOSS_RELICS, SEVEN_EMPEROR_SHIELD_CAP } from './boss-relic.ts'
import { ASCENT_SAVE_KEY, clearAscentSave, loadAscentSave, readAscentSave, writeAscentSave } from './ascent-save.ts'
import { Arena, battleImpactTier, heavyStrike } from './arena.ts'
import { fracture } from './body-fragments.ts'
import { impactMaterial } from './impact-material.ts'
import { icon, itemIcon, pixelIcon } from './icons.ts'
import { GOLEM_COUNTER, GOLEM_PARRY } from './golem-parry.ts'
import type { BattleHit } from './arena.ts'
import { BattleAudio } from './battle-audio.ts'
import { battleGuideFor } from './battle-guide.ts'
import { oathDescription, perkText, rewardText, sevenCardEffect, sevenItemEffect } from './reward-copy.ts'
import { COMPANION_LINES, companionDieIndex } from './companion.ts'
import { enemyForFight } from './enemy-roster.ts'
import { firstBattlePlan, FirstRunGuide } from './first-run-guide.ts'
import { loadGameSettings, saveGameSettings, toggleMute } from './game-settings.ts'
import type { GameSettings } from './game-settings.ts'
import { enemyPortrait, MAP_NODE_ICONS, ForkView } from './map-view.ts'
import { currentTreasureRoom, grantTreasure, healingFor, healingForRun, shopPrice, treasureCost, treasureEnabled } from './map-treasure.ts'
import { ARTIFACT_SLOTS, COMMON_CONSUMABLES, RARE_CONSUMABLES, ITEMS, PREPARATIONS, SHARDS, artifactReady, isArmedConsumable, isArtifact, isConsumable, itemUses, treasureRarity } from './treasure.ts'
import type { Artifact, ArtifactOptions, CounterChoice, Treasure } from './treasure.ts'
import { availableCounterChoices, cancelSeal, chooseHourglass, counterDamage, draftSeal, hornCounterDamage, mirrorCounterDamage, startHourglass, toggleArtifact, toggleShard } from './treasure-combat.ts'
import { adjustItemDie, canSelectItemDie, chooseReserveRoll, consumableReady, selectLatchDie, toggleConsumable } from './item-effects.ts'
import { ELITE_KEEP_COINS, relicReady, REWARD_CARDS, WEDGE_BONUS } from './rewards.ts'
import type { Reward, RewardChoice } from './rewards.ts'
import {
  allocationPower, assignDie, attackFor, chargedStrikePreview, combatSlots, DIE_COUNT, enemyIntentAt, incomingAttack, respondingIntent, splitEnemyDamage,
} from './combat.ts'
import type { CounterResult, Exchange, Gimmick, SlotTotals } from './combat.ts'
import { collectorBonus, offerPerks, START_PERK_CARDS, START_PERKS } from './perks.ts'
import type { Parity, StartPerk } from './perks.ts'
import { isMetaArtifact, META_ARTIFACTS, META_PERKS, META_VALUES } from './meta-unlocks.ts'
import { loadMetaProgress, markMetaOffers, META_CARD_COUNT, META_SAVE_KEY, openMetaStage, resetMetaProgress, resumeMetaRun, snapshotMeta, writeMetaProgress } from './meta-progress.ts'
import { metaGuideContent, metaRevealContent } from './meta-view.ts'
import { bloodDieFor, bloodHealing, canPlaceMetaDie, draftMetaDie, transferMetaPip } from './meta-combat.ts'
import {
  bladeChargePreview, canReroll, canResolveYachtTurn, canUseExtraReroll, displayedCounterRewards, previewUnlockProgress, toggleYachtWedge, tuneYachtDie, yachtAllocationTotals,
  classifyYachtHand, diceUnlockSignals, emperorShieldActive, forecastYacht, hasAutomaticEgo, rerollYachtDice, resolveYachtTurn,
  withEgoDie, yachtCounterSlot, yachtGimmick, yachtRerollCost,
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
  settingsVibration: element<HTMLButtonElement>('settings-vibration'),
  settingsSpeed: Array.from(document.querySelectorAll<HTMLInputElement>('input[name="animation-speed"]')),
  settingsMotion: element<HTMLButtonElement>('settings-motion'),
  settingsCounter: element<HTMLButtonElement>('settings-counter'),
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
  eliteCapacity: element('elite-capacity'),
  rewardCards: element('reward-cards'),
  rewardPreview: element('reward-preview'),
  confirmReward: element<HTMLButtonElement>('confirm-reward'),
  skipReward: element<HTMLButtonElement>('skip-reward'),
  rewardStrip: element('reward-strip'),
  artifactStrip: element('artifact-strip'),
  bossRelicSlot: element('boss-relic-slot'),
  artifactOptions: element('artifact-options'),
  treasureControls: element('treasure-controls'),
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
  guardGoal: element('guard-goal'),
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
  triple: { icon: 'companion-awake', value: '+1', label: '에고 주사위', chip: '에고', condition: '같은 눈' },
  straight: { icon: 'reroll-die', value: '1', label: '전투당 재굴림 주사위 1회', chip: '재굴림', condition: '이어지는 눈' },
} as const

const parityLabels = { odd: '홀', even: '짝' } as const
const parityIcons = { odd: 'die', even: 'die-even' } as const

let metaProgress = loadMetaProgress()
let guideTrigger: HTMLButtonElement | undefined
const metaLobby = element<HTMLButtonElement>('meta-lobby')
const metaGuide = element('guide-meta')
const diceGuide = element('guide-dice')
const enemyGuide = element('guide-enemies')
const guidePanels = { run: ui.guideEntries, dice: diceGuide, enemies: enemyGuide, meta: metaGuide }
type GuideTab = keyof typeof guidePanels
const guideTabs = Object.keys(guidePanels) as GuideTab[]

function showGuideTab(tab: GuideTab) {
  for (const name of guideTabs) {
    element(`guide-${name}-tab`).setAttribute('aria-selected', String(name === tab))
    guidePanels[name].hidden = name !== tab
  }
  if (tab === 'meta') {
    metaGuide.innerHTML = metaGuideContent(metaProgress.unlocked)
    metaGuide.scrollTop = 0
  } else if (tab === 'enemies') {
    enemyGuide.innerHTML = Object.entries(TOWER_REGIONS).map(([region, { name, mood, range: [first, last] }]) => `
      <section class="guide-section codex-region">
        <h3>${name} <small>${first}–${last}층</small></h3>
        <p>${mood}</p>
        <dl>${Object.entries(ENEMY_CODEX).filter(([, foe]) => foe.region === region).map(([id, foe]) => `
          <div class="guide-entry" data-enemy="${id}"><dt>${enemyPortrait(id, 'codex-portrait')}<strong>${foe.name}</strong></dt>
          <dd><small>${foe.lineage}${foe.title ? ` · ${foe.title}` : ''}</small>${foe.lore}
          ${foe.mechanic ? `<span class="codex-mechanic">${icon(foe.icon)}${foe.mechanic}</span>` : ''}</dd></div>`).join('')}</dl>
      </section>`).join('')
    enemyGuide.scrollTop = 0
  } else if (tab === 'dice') {
    const seven = !ascent || ascent.battle.itemsSeven
    diceGuide.innerHTML = unlockHands.map(hand => {
      const open = ascent?.unlocks.includes(hand) ?? false
      return `<section class="dice-guide-entry" data-hand="${hand}">
        <h3>${icon(unlockInfo[hand].icon)}${unlockNames[hand]}</h3>
        <span class="dice-guide-state">${icon(open ? 'unlock' : 'lock')}${open ? '열림' : '잠김'}</span>
        ${unlockPattern(hand)}
        <p>${seven && hand === 'triple' ? '이번 턴에 같은 눈 셋을 놓습니다. 칸은 나뉘어도 됩니다.' : unlockCondition(hand, seven)}</p><p>${hand === 'triple'
          ? seven ? '턴 끝에 에고가 스스로 굴립니다. 처치, 정확 방어, 새 해금을 차례로 살핀 뒤 남은 체력에 따라 자리를 고릅니다.' : '이번 등반 동안 주사위 하나를 더 굴립니다.'
          : '기본 재굴림을 쓴 뒤, 전투당 한 번 더 굴립니다.'}</p>
      </section>`
    }).join('')
    diceGuide.scrollTop = 0
  }
}

function openGuide(button: HTMLButtonElement, symbol?: string, name?: string) {
  if (button.disabled || ui.guide.open) return
  const rules = ascent ? ascent.route?.map.rules ?? MAP_RULES : CURRENT_MAP_RULES
  element('guide-enemies-tab').hidden = rules < 7
  ui.guideEntries.innerHTML = battleGuideFor(rules).map(({ title, entries }) => `
    <section class="guide-section">
      <h3>${title}</h3>
      <dl>${entries.map(([symbol, name, description]) => `
        <div class="guide-entry" data-guide-icon="${symbol}" data-guide-name="${name}">
          <dt>${itemIcon(symbol)}<strong>${name}</strong></dt>
          <dd>${description}</dd>
        </div>
      `).join('')}</dl>
    </section>
  `).join('')
  guideTrigger = button
  showGuideTab(button === metaLobby || symbol?.startsWith('meta-') ? 'meta' : 'run')
  ui.guide.showModal()
  ui.guideEntries.scrollTop = 0
  const entry = symbol && (name && ui.guideEntries.querySelector(`[data-guide-icon="${symbol}"][data-guide-name="${name}"]`) || ui.guideEntries.querySelector(`[data-guide-icon="${symbol}"]`))
  if (entry) ui.guideEntries.scrollTop = entry.getBoundingClientRect().top - ui.guideEntries.getBoundingClientRect().top - 12
}

for (const button of [ui.help, ui.lobbyGuide]) {
  button.addEventListener('click', () => openGuide(button))
}
metaLobby.addEventListener('click', () => openGuide(metaLobby))
for (const tab of guideTabs) element(`guide-${tab}-tab`).addEventListener('click', () => showGuideTab(tab))
ui.guide.addEventListener('click', (event) => {
  if (event.target === ui.guide) ui.guide.close()
})
ui.guide.addEventListener('close', () => guideTrigger?.focus())

const gimmickEffects = {
  trip: { icon: 'stun', intro: '적 다음 공격 건너뜀', help: '적의 다음 공격을 1회 건너뜁니다.' },
  armor: { icon: 'armor-break', value: '×1.5', intro: '갑옷 파괴 ×1.5', help: '다음 턴부터 공격 피해가 1.5배가 됩니다.' },
  reflect: { icon: 'reflect', intro: '큰 한 방 반사', help: '철추 피해를 적에게 돌려줍니다.' },
  topple: { icon: 'knockdown', value: '×2', intro: '넘어짐(쉼·×2)', help: '다음 턴에 적이 쉬고 공격 피해가 2배가 됩니다.' },
  retreat: { icon: 'escort-exit', intro: '호위 퇴장', help: '호위가 물러나고 공격이 본체에 닿습니다.' },
} satisfies Record<Gimmick, { icon: string; value?: string; intro: string; help: string }>

let ascent: Ascent | null = null
let chosenReward: Reward | undefined
let artifactOptions: ArtifactOptions = {}
let itemControl: 'tuning' | 'twin-mold' | 'hourglass' | 'die-latch' | 'pip-ring' | 'blood-grip' | 'linked-cup' | undefined
let dockItem: Reward | undefined
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
const forkView = new ForkView(ui.fork, enterFork)
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
    [ui.settingsCounter, settings.automaticCounter === true],
    [ui.settingsVibration, settings.vibration],
  ] as const
  for (const [button, checked] of switches) {
    button.setAttribute('aria-checked', String(checked))
    button.querySelector('strong')!.textContent = checked ? '켬' : '끔'
  }
  const unsupported = typeof navigator.vibrate !== 'function'
  ui.settingsVibration.disabled = unsupported
  if (unsupported) {
    ui.settingsVibration.setAttribute('aria-checked', 'false')
    ui.settingsVibration.querySelector('strong')!.textContent = '지원 안 됨'
  }
  ui.settingsVibration.setAttribute('aria-labelledby', unsupported
    ? 'settings-vibration-label vibration-state' : 'settings-vibration-label')
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
ui.settings.addEventListener('close', () => {
  if (ascent?.battle.phase === 'counter' && !roulette.busy) {
    render()
    resumeCounterOrFocus()
  }
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
ui.settingsCounter.addEventListener('click', () => updateSettings({ ...settings, automaticCounter: !settings.automaticCounter }))
ui.settingsVibration.addEventListener('click', () => updateSettings({ ...settings, vibration: !settings.vibration }))
element('replay-first-run').addEventListener('click', () => {
  firstRun.replay()
  element('replay-first-run-status').textContent = '다음 새 등반에서 안내를 다시 표시합니다.'
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

function noteMetaStage(run: Ascent, floor: number, finished = false) {
  const next = openMetaStage(run, metaProgress, floor, finished)
  if (next.progress !== metaProgress) {
    metaProgress = next.progress
    writeMetaProgress(metaProgress)
  }
  return next.run
}

function noteMetaVictory(run: Ascent) {
  return run.route?.screen === 'finished' && run.battle.phase === 'won' ? noteMetaStage(run, MAP_FLOORS, true) : run
}

function refreshMetaCount() {
  const count = `${metaProgress.unlocked.length * 2}/${META_CARD_COUNT}`
  metaLobby.querySelector('strong')!.textContent = count
  metaLobby.setAttribute('aria-label', `다음 등반 해금 ${count}`)
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

element('clear-meta').addEventListener('click', () => {
  confirmLobbyAction('영구 해금 기록을 지우겠습니까?', '다음 등반의 해금과 새 카드 표시 기록이 초기화됩니다.', '해금 기록 지우기', () => {
    metaProgress = resetMetaProgress(metaProgress)
    writeMetaProgress(metaProgress)
    if (ascent) {
      ascent = resumeMetaRun(ascent, metaProgress).run
      saveCurrent()
    }
    refreshMetaCount()
    ui.settings.close()
  })
})

ui.abandonAscent.addEventListener('click', () => {
  if (ascent?.battle.phase !== 'assign' && ascent?.battle.phase !== 'counter') return
  confirmLobbyAction('등반을 포기하겠습니까?', '포기하면 현재 등반 기록이 사라집니다.', '등반 포기', () => {
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
  const perk = target === ui.activePerk
  holdHelp.toggleAttribute('data-perk-help', perk)
  holdHelp.style.removeProperty('max-inline-size')
  holdHelp.hidden = false
  const bounds = target.getBoundingClientRect()
  const foe = ui.encounterName.getBoundingClientRect()
  const onRight = foe.left > innerWidth / 2
  if (perk && foe.width) holdHelp.style.maxInlineSize = `${onRight ? foe.left - 24 : innerWidth - foe.right - 24}px`
  const width = holdHelp.offsetWidth
  const height = holdHelp.offsetHeight
  const left = perk && foe.width ? onRight ? foe.left - width - 8 : foe.right + 8 : bounds.left + (bounds.width - width) / 2
  const top = perk ? ui.masthead.getBoundingClientRect().bottom + 4 : bounds.top > height + 16 ? bounds.top - height - 8 : bounds.bottom + 8
  holdHelp.style.left = `${Math.min(innerWidth - width - 16, Math.max(16, left))}px`
  holdHelp.style.top = `${Math.min(innerHeight - height - 16, top)}px`
}
const helpTargets = Array.from(document.querySelectorAll<HTMLElement>('[data-hold-help]'))
ui.activePerk.addEventListener('click', () => showHelp(ui.activePerk))
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
      if (ui.guide.open || exchangeBusy || stopDiceMotion || ascent?.battle.loot?.reserveRoll) return
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
const unlockRule = element('unlock-rule')
const unlockHands = ['triple', 'straight'] as const
const unlockNames = { triple: '에고 주사위', straight: '재굴림 주사위' } as const
const egoHover = element('ego-hover')
egoHover.addEventListener('click', () => { if (!exchangeBusy) showHelp(egoHover) })
const egoAwakeningNote = element('ego-awakening-note')
const egoPresence = element('ego-presence')
const egoPlacement = element('ego-placement')
const unlockDiscovery = element('unlock-discovery')
const unlockLessonKey = 'hwigi-tower.dice-lesson'
const presenceKey = 'hwigi-tower.ego-presence'
let presenceTimer = 0
let discoveryTimer = 0

function unlockPattern(hand: Hand, filled = 0) {
  const text = hand === 'triple' ? '같은 눈 셋' : '이어지는 눈 셋'
  const join = hand === 'triple' ? '=' : '›'
  const part = (index: number) => `<i data-filled="${index < filled}"></i>`
  return `<span class="unlock-pattern" role="img" aria-label="${text}">${part(0)}<b aria-hidden="true">${join}</b>${part(1)}<b aria-hidden="true">${join}</b>${part(2)}</span>`
}

function unlockCondition(hand: Hand, seven?: boolean) {
  if (hand === 'straight') return '한 칸에 이어지는 눈 셋 · 순서 무관'
  return seven ? '어떤 눈이든 같은 눈 셋 · 칸 무관 · 봉인된 눈 제외' : '같은 눈 셋 · 공격 또는 정확 방어'
}

function pips(face: number) {
  return `<span class="gimmick-die" data-face="${face}">${'<b></b>'.repeat(face)}</span>`
}

function showUnlockConditions(hand: Hand) {
  if (unlockConditions.open) return
  const name = unlockNames[hand]
  unlockConditions.setAttribute('aria-label', `${name} 해금 조건`)
  unlockExamples.dataset.hand = hand
  unlockExamples.innerHTML = unlockPattern(hand)
  unlockResult.innerHTML = `${icon(unlockInfo[hand].icon)}<strong>${name}</strong>`
  unlockRule.textContent = unlockCondition(hand, ascent?.battle.itemsSeven)
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

function storedUnlockCue(key: string) {
  try { return localStorage.getItem(key) } catch { return null }
}

function rememberUnlockCue(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* 안내는 현재 세션에서도 한 번만 표시한다. */ }
}

let lessonShown = storedUnlockCue(unlockLessonKey) === '1'
let presenceRun = storedUnlockCue(presenceKey)

function renderDiceUnlockCues(battle: YachtBattle, unlocks: readonly Hand[]) {
  const planning = !ui.planning.hidden && battle.phase === 'assign' && battle.itemsSeven === true
  ui.planning.toggleAttribute('data-unlock-cues', planning)
  const signals = planning ? diceUnlockSignals(battle) : undefined
  const anchors = { triple: ui.lockedDie, straight: ui.extraReroll }
  for (const hand of unlockHands) {
    const state = unlocks.includes(hand) ? undefined : signals?.[hand]
    const anchor = anchors[hand]
    anchor.querySelector('.unlock-chip')?.remove()
    if (state?.progress) {
      const ready = state.progress === 3
      const needed = state.needed.join(' 또는 ')
      const { condition, chip, icon: reward } = unlockInfo[hand]
      anchor.insertAdjacentHTML('beforeend', `<span class="unlock-chip" data-hand="${hand}" data-progress="${state.progress}">
        ${ready ? '조건 완성' : `${condition} 하나 더 <strong class="unlock-needed">${needed}</strong>`}
        <span aria-hidden="true">→</span><span class="unlock-reward-die" aria-hidden="true">${icon(reward)}</span>${chip}</span>`)
      anchor.setAttribute('aria-label', `${anchor.getAttribute('aria-label')}, ${ready ? '조건 완성' : `두 눈 맞음, 필요한 눈 ${needed}`}`)
    }
    diceButtons.forEach((button, index) => button.toggleAttribute(`data-unlock-${hand}`, state?.matching.has(index) ?? false))
    for (const slot of combatSlots) {
      ui.assign[slot].closest('.slot')?.toggleAttribute(`data-unlock-${hand}`,
        Boolean(state && [...state.complete].some(index => battle.slots[index] === slot)))
    }
  }
  if (!planning) {
    egoPresence.hidden = true
    delete ui.encounter.dataset.egoPresence
    unlockDiscovery.hidden = true
    return
  }
  const runKey = String(ascent?.seed)
  const closeHand = unlockHands.find(hand => !unlocks.includes(hand) && signals?.[hand].progress === 2)
  if (closeHand && presenceRun !== runKey) {
    presenceRun = runKey
    rememberUnlockCue(presenceKey, runKey)
    ui.encounter.dataset.egoPresence = closeHand
    showCompanionLine(egoPresence, '…그 눈이면.')
    window.clearTimeout(presenceTimer)
    presenceTimer = window.setTimeout(() => {
      egoPresence.hidden = true
      delete ui.encounter.dataset.egoPresence
    }, 1450)
  }
  if (closeHand && ascent?.fight === 1 && !lessonShown) {
    lessonShown = true
    rememberUnlockCue(unlockLessonKey, '1')
    unlockDiscovery.innerHTML = `<span class="discovery-diagram" data-hand="triple">${unlockPattern('triple')}
      ${icon('next')}${icon(unlockInfo.triple.icon)}</span>
      <strong>같은 눈 셋으로 에고 주사위가 깨어납니다.</strong>`
    unlockDiscovery.hidden = false
    window.clearTimeout(discoveryTimer)
    discoveryTimer = window.setTimeout(() => { unlockDiscovery.hidden = true }, 4200)
  }
}

function renderSlotTotal(total: HTMLElement, bonus: HTMLElement, value: number, added: number, itemsSeven?: boolean) {
  total.textContent = String(value)
  bonus.hidden = added === 0
  const adjustment = added ? `${added > 0 ? '+' : '−'}${Math.abs(added)}` : ''
  bonus.textContent = adjustment
  return added ? (itemsSeven ? `, 보정 ${adjustment} 포함` : `, 특전 보너스 ${added} 포함`) : ''
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
    const metaDie = bloodDieFor(battle) === index ? 'blood' : battle.metaTurn?.chargeDie === index ? 'charge'
      : battle.metaTurn?.reverseDie === index && battle.slots[index] === 'guard' ? 'reverse' : undefined
    if (metaDie) {
      button.dataset.metaDie = metaDie
      faceLabel += metaDie === 'charge' ? ', 공격 전용' : metaDie === 'blood' ? ', 턴 끝에 소모' : `, 방어 눈 ${7 - battle.dice[index]}`
    } else delete button.dataset.metaDie
    const name = isCompanion ? '에고 주사위' : `주사위 ${index + 1}`
    button.setAttribute('aria-label', `${name}, ${value}, ${place}${faceLabel}`)
    button.setAttribute('aria-pressed', String(picked))
    if (parent !== button.parentElement) parent.append(button)
  })

  for (const zone of combatSlots) {
    const row = ui.dice[zone]
    const used = row.querySelectorAll('.die:not([hidden])').length
    row.querySelectorAll<HTMLElement>('.die-seat').forEach((seat, index) => {
      seat.hidden = used + index >= battle.dice.length + Number(hasAutomaticEgo(battle))
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
  const attackHint = renderSlotTotal(ui.attackTotal, ui.attackBonus, attack, perkBonus, battle.itemsSeven)
  ui.wedgeBonus.hidden = !wedge
  ui.wedgeBonus.innerHTML = wedge ? `${icon('reward-wedge')}+${wedge}` : ''
  ui.attackMultiplier.hidden = !bladeReady
  ui.attackMultiplier.textContent = `×${START_PERKS.blade.multiplier}`
  const multiplierHint = bladeReady ? `, ${perkDisplayName('blade', battle.itemsSeven)} 준비, 공격 피해 ${START_PERKS.blade.multiplier}배` : ''
  const wedgeHint = wedge ? `, 쇠쐐기 보너스 ${wedge} 포함` : ''
  ui.assign.attack.setAttribute('aria-label', `공격 칸, 피해 ${attack}${attackHint}${multiplierHint}${wedgeHint}`)
  const guardHint = renderSlotTotal(ui.guardTotal, ui.guardBonus, guard, guard - withoutPerk.guard, battle.itemsSeven)
  let exact = false
  if (planning && guard > 0) {
    if (!hasAutomaticEgo(battle) && canResolveYachtTurn(battle)) exact = resolveYachtTurn(battle).battle.phase === 'counter'
    else {
      const plan = forecastYacht(battle)
      exact = plan.counter && plan.damage < battle.playerHp && plan.dealt < battle.enemyHp
    }
  }
  ui.guardExact.hidden = !exact
  const goal = planning ? forecastYacht(battle).incoming.totalDamage : 0
  ui.guardGoal.hidden = !planning
  ui.guardGoal.textContent = `/${goal}`
  ui.assign.guard.setAttribute('aria-label', `방어 칸, 합계 ${guard}, 방어 목표 ${goal}${guardHint}${exact ? ', 정확 방어' : ''}`)
  const canPlace = planning && selected.size > 0
  const rerollable = [...selected].filter((index) => canReroll(battle, index))
  ui.assign.pool.disabled = !canPlace || ![...selected].some((index) => battle.slots[index] !== null)
  ui.assign.pool.parentElement!.tabIndex = ui.assign.pool.disabled ? 0 : -1
  ui.assign.attack.disabled = !canPlace
  ui.assign.guard.disabled = !canPlace || [...selected].some((index) => !canPlaceMetaDie(battle, index, 'guard'))
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
  const hasStraight = unlocks.includes('straight')
  const perkReroll = !hasStraight && (battle.perk?.kind === 'early-reroll' || battle.perk?.kind === 'counter-recover') &&
    (battle.extraRerollAvailable || battle.extraRerollSpent)
  const rerollLocked = !hasStraight && !perkReroll
  ui.extraReroll.classList.toggle('unlock-hint', rerollLocked)
  ui.extraReroll.disabled = !planning || (!rerollLocked && (selected.size !== 1 || rerollable.length !== 1 || !canUseExtraReroll(battle)))
  const extra = Number(battle.extraRerollAvailable)
  const straight = pendingUnlock?.straight
  const sealedStraight = rerollLocked && straight?.blocked === 'seal'
  const rerollStatus = perkReroll ? '특전' : !rerollLocked ? '열림' : sealedStraight ? '봉인됨' : straight?.progress === 3 ? '준비' : '잠김'
  ui.extraReroll.innerHTML = rerollLocked
    ? `${icon(unlockInfo.straight.icon)}${icon(sealedStraight ? 'seal' : 'lock')}<span class="unlock-help">${icon('guide')}</span>`
    : `${icon(unlockInfo.straight.icon)}${extra}<span class="reroll-state">${rerollStatus}</span>`
  const straightHint = renderUnlockProgress(ui.extraReroll, rerollLocked && !sealedStraight ? straight : undefined)
  const rerollLabel = rerollLocked ? `재굴림 주사위 해금 조건, ${rerollStatus}${straightHint}`
    : `${perkReroll ? '특전 재굴림' : '재굴림 열림'}, 이번 전투 ${extra}회 남음`
  ui.extraReroll.ariaHasPopup = rerollLocked ? 'dialog' : null
  if (rerollLocked) ui.extraReroll.setAttribute('aria-controls', unlockConditions.id)
  else ui.extraReroll.removeAttribute('aria-controls')
  ui.extraReroll.setAttribute('aria-label', rerollLabel)
  ui.extraReroll.title = rerollLabel
  ui.resolve.disabled = !planning || !canResolveYachtTurn(battle)
  egoHover.hidden = ui.planning.hidden || !planning || !hasAutomaticEgo(battle)
  renderDiceUnlockCues(battle, unlocks)
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

const chargeStop = element('charge-stop')

function renderIntent(battle: YachtBattle, totals: SlotTotals, enemyId: Ascent['enemy']['id']) {
  const rules = ascent?.route?.map.rules ?? MAP_RULES
  const badge = enemyBadge(enemyId, rules)
  const escortName = enemyNameplate('escort-guard', rules)
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
  const display = (symbol: string, value: string, label: string, detail = badgeIcon, mode = '', equation = '') => {
    ui.intent.dataset.intent = mode
    const secondary = detail ? `<span class="intent-detail">${detail}</span>` : ''
    const priority = escort ? `<span class="intent-detail intent-escort" aria-hidden="true">${icon('sword')}${icon('next')}${icon('escort')}<span class="intent-escort-hp">${escort.hp}</span></span>` : ''
    ui.intent.innerHTML = `<span>${icon(symbol)}${equation ? `<small class="intent-equation">${equation}</small><span class="intent-equals" aria-hidden="true">=</span>` : ''}${value ? `<strong>${value}</strong>` : ''}</span>${secondary}${mark}${priority}`
    const condition = clause ? ` · ${clause.name} · ${clause.slot === 'attack' ? '공격' : '방어'} ${clause.face ?? '같은 눈 둘'}${ready ? ' · 성립' : ''}` : ''
    ui.intent.setAttribute('aria-label', `${badge.label} · ${label}${condition}${effect ? ` · ${effect.help}` : ''}`)
    if (escort) ui.intent.setAttribute('aria-description', `공격 대상 1순위 ${escortName} · 생존 시 적 공격 +${escort.bonus}`)
    else ui.intent.removeAttribute('aria-description')
  }
  const { phase } = battle
  chargeStop.hidden = true
  ui.intent.hidden = phase === 'won' || phase === 'lost'
  if (phase === 'counter') {
    display('parry', '', '정확히 막았습니다. 룰렛으로 반격할 수 있습니다.')
  } else if (phase === 'assign') {
    const intent = enemyIntentAt(battle)
    const attackingBattle = escort === battle.escort ? battle : { ...battle, escort }
    const charge = chargedStrikePreview(attackingBattle, totals, battle.loot?.armed?.includes('hammer'))
    if (charge) {
      const { threshold, totalDamage, hammerThreshold } = charge
      const goal = hammerThreshold ?? threshold
      const applied = Math.min(goal, totals.attack - splitEnemyDamage(attackingBattle, totals.attack).escortDealt)
      const remaining = goal - applied
      chargeStop.hidden = false
      chargeStop.dataset.ready = String(remaining === 0)
      chargeStop.style.setProperty('--charge-remaining', `${100 * remaining / goal}%`)
      chargeStop.setAttribute('aria-label', `힘 모으기 저지 피해 ${goal}, 남은 피해 ${remaining}`)
      chargeStop.innerHTML = `${icon(hammerThreshold ? 'treasure-hammer' : 'break-charge')}<span class="charge-track"></span><b>${goal}</b>`
      const nextAttack = `<span class="intent-next">${icon('next')}${icon('turn')}<b>${totalDamage}</b></span>`
      const condition = hammerThreshold
        ? `본체에 닿는 공격 피해가 ${hammerThreshold} 이상이면 망치가 다음 큰 공격을 막습니다.`
        : `본체에 닿는 공격 피해가 ${threshold} 이상이면 다음 큰 공격을 약하게 만듭니다.`
      display('charge', '0', `힘 모으기 · 이번 턴 피해 0 · 다음 턴 피해 ${totalDamage} · ${condition}`, nextAttack, 'charge')
      return
    }
    if (intent.damageTakenMultiplier !== undefined) {
      const multiplier = intent.damageTakenMultiplier
      display('knockdown', `×${multiplier}`, `적이 쓰러져 있어 이번 공격이 ${multiplier}배입니다.`)
      return
    }
    if (intent.damageTakenBonus !== undefined) {
      const bonus = intent.damageTakenBonus
      display('knockdown', `+${bonus}`, `적이 쓰러져 있어 이번 공격 피해가 ${bonus} 오릅니다.`)
      return
    }
    const mechanic = intent.mechanic
    const { hits, totalDamage } = incomingAttack(attackingBattle, totals)
    if (emperorShieldActive(battle) && hits.length) {
      const remaining = forecastYacht(battle).incoming
      display('shield', String(remaining.totalDamage), battle.itemsSeven
        ? `첫 턴 막고 남은 적 공격 피해를 최대 ${SEVEN_EMPEROR_SHIELD_CAP} 줄입니다.` : `황제의 방패 적용 · 남은 공격 ${remaining.totalDamage}`,
      battle.itemsSeven ? `${icon('shield')}−${SEVEN_EMPEROR_SHIELD_CAP}` : '',
      'attack', remaining.hits.length > 1 ? hitNumbers(remaining.hits) : '')
      return
    }
    if (intent.id === 'stunned') {
      display('stun', '0', '기절해 공격을 쉽니다.', '')
      return
    }
    if (intent.id === 'critical' && battle.erasedStrikeTurn === battle.turn) {
      display('treasure-hammer', '0', '망치가 적의 큰 공격을 막았습니다.')
      return
    }
    let label = ''
    let detail = badgeIcon
    if (mechanic) {
      switch (mechanic.kind) {
        case 'lock':
          detail = `${icon('lock')}1`
          label = '다음 턴 가장 낮은 주사위 하나를 잠급니다.'
          break
        case 'freeze':
          detail = `${icon('freeze')}1`
          label = '다음 턴 주사위 하나를 1로 얼립니다.'
          break
        case 'thorns':
          detail = `${icon('thorns')}${mechanic.value}`
          label = `${battle.rulesSix ? '공격 칸 피해로 적을 쓰러뜨리지 못하면 ' : ''}공격에 놓은 주사위마다 가시 피해 ${mechanic.value}를 받습니다.`
          break
        case 'rage':
          detail = `${icon('rage')}${mechanic.value}`
          label = `다시 굴리면 적 공격이 ${mechanic.value}만큼 세집니다.`
          break
        case 'reaction': {
          const alternate = hitNumbers(attackFor(battle, mechanic.alternate).hits)
          detail = `${icon('reaction')}${mechanic.value}`
          label = `공격 합이 ${mechanic.value} 이상이면 적 공격이 ${alternate}로 바뀝니다.`
          break
        }
        case 'vitality':
          detail = icon('vitality')
          label = '내 체력이 높을수록 적 공격이 세집니다.'
          break
        case 'seal':
          detail = `${icon('seal')}${mechanic.value}`
          label = `이번 턴 ${mechanic.value} 눈은 합계와 해금에서 제외됩니다.`
          break
        case 'steal':
          if (!battle.stolenDie) {
            detail = `${icon('steal')}1`
            label = '다음 턴부터 주사위 하나를 빼앗깁니다.'
          }
          break
        case 'escort':
          if (!battle.escort) {
            detail = `${icon('escort')}${mechanic.hp}`
            label = `${escortName} 소환 · 체력 ${mechanic.hp} · 생존 시 적 공격 +${mechanic.bonus}`
          }
          break
      }
    }
    const damage = hits.length ? hitNumbers(hits) : '0'
    const accessible = [hits.length ? `이번 턴 공격 ${totalDamage}${hits.length > 1 ? ` (${damage})` : ''}` : intent.name, label].filter(Boolean).join(' · ')
    display(hits.length ? (intent.id === 'critical' ? 'critical' : 'sword') : badge.icon,
      String(totalDamage), accessible, detail, hits.length ? 'attack' : '', hits.length > 1 ? damage : '')
  }
}

const damageDuration = 700
const hitOrderDuration = 1500
const chipDelay = 350
const parryDuration = 120
let guardCueTimer: number | undefined
const unlockImpactDuration = 300
const unlockDuration = 650
const companionAwakenDuration = 520
const companionFlightDuration = 500
const companionImpactTime = 350
const incomingContact = 152
const repeatContact = 248
const escortDefeatPause = 160
const damageOutput = { player: ui.playerDamage, enemy: ui.enemyDamage, escort: ui.escortDamage }
const parryFlash = element('parry-flash')

function clearDamage(keepFinisher = false) {
  for (const output of Object.values(damageOutput)) {
    if (keepFinisher && output.querySelector('[data-impact="finisher"]')) continue
    output.replaceChildren()
  }
}

function clearExchange() {
  clearDamage()
  ui.hitResults.replaceChildren()
  ui.hitOrder.hidden = true
  window.clearTimeout(guardCueTimer)
  ui.parry.hidden = true
  parryFlash.hidden = true
  ui.awakening.hidden = true
  arena.clearContact()
}

function showDamage(hit: BattleHit) {
  const { target, damage } = hit
  if (hit.defeated && target === 'enemy') {
    ui.intent.hidden = true
    chargeStop.hidden = true
  }
  const number = document.createElement('span')
  number.className = 'damage-number'
  number.dataset.impact = battleImpactTier(hit)
  if (target !== 'enemy') {
    const targetName = document.createElement('small')
    targetName.textContent = target === 'player' ? '나' : '호위'
    number.append(targetName)
  }
  number.append(`−${damage}`)
  const output = damageOutput[target]
  const hostileBreak = target === 'player' && ui.encounter.querySelector('.foe-damage > [data-impact="finisher"]')
  if (hit.defeated && target !== 'player' || hostileBreak) output.replaceChildren(number)
  else output.append(number)
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
  meter.toggleAttribute('data-empty', hp === 0)
  label.textContent = `${hp}/${max}`
  if (hp >= previous) return
  const trail = meter.nextElementSibling as HTMLElement
  trail.getAnimations().forEach((animation) => animation.cancel())
  if (hp === 0) return
  if (reducedMotion()) {
    markVital(meter.closest<HTMLElement>('.vital')!)
    return
  }
  trail.style.left = `${hp / max * 100}%`
  trail.animate([
    { width: `${(previous - hp) / max * 100}%` },
    { width: '0%' },
  ], { duration: effectDuration(140), delay: effectDuration(chipDelay), fill: 'backwards', easing: 'ease-out' })
}

function updateEscortVital(hp: number) {
  ui.escortGuardTotal.textContent = String(hp)
  const rules = ascent?.route?.map.rules ?? MAP_RULES
  const name = enemyNameplate('escort-guard', rules)
  const nameplate = element('escort-guard-name')
  nameplate.textContent = name
  nameplate.hidden = rules < 7 || hp === 0
  ui.escortGuardVital.setAttribute('aria-label', `${name} 체력 ${hp}`)
  if (hp === 0) {
    ui.intent.querySelector('.intent-escort')?.remove()
    ui.intent.removeAttribute('aria-description')
  } else {
    const previewHp = ui.intent.querySelector('.intent-escort-hp')
    if (previewHp) previewHp.textContent = String(hp)
  }
}

function showGuardCue(kind: 'ordinary' | 'exact', blocked = false, extra = 0) {
  window.clearTimeout(guardCueTimer)
  ui.parry.dataset.guard = kind
  ui.parry.setAttribute('aria-label', kind === 'exact' ? '정확 방어' : '방어')
  ui.parry.querySelector('use')?.setAttribute('href', kind === 'exact' ? '#icon-parry' : '#icon-shield')
  ui.parry.querySelector('.guard-amount')?.remove()
  if (blocked) {
    ui.parry.insertAdjacentHTML('beforeend', `<output class="guard-amount">0${extra > 0 ? `<small>+${extra}</small>` : ''}</output>`)
    ui.parry.setAttribute('aria-label', extra ? `방어 피해 0, 초과 방어 ${extra}` : '방어 피해 0')
  }
  ui.parry.hidden = false
  if (kind === 'ordinary') guardCueTimer = window.setTimeout(() => { ui.parry.hidden = true }, effectDuration(210))
}

function showParry(authored = false) {
  showGuardCue('exact')
  parryFlash.getAnimations().forEach((animation) => animation.cancel())
  parryFlash.hidden = false
  const opacity = reducedMotion() ? [.62, .62] : [.85, 0]
  const flash = parryFlash.animate(opacity.map((value) => ({ opacity: value })), { duration: effectDuration(155), fill: 'forwards' })
  void flash.finished.then(() => { parryFlash.hidden = true; flash.cancel() }, () => {})
  sound.play('perfect-block', authored ? .94 : 1, authored ? .32 : .19, authored ? undefined : effectDuration(120) / 1000)
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((finish) => window.setTimeout(finish, effectDuration(milliseconds)))
}

function weaponContact(hit: BattleHit, heavy = false, pitch = 1) {
  const surface = ascent && impactMaterial(ascent.enemy.id, hit.target)
  const crack = surface === 'ice' ? 'frost' : surface === 'brass' ? 'rebound' : 'grit'
  if (hit.defeated || heavy) {
    if (settings.vibration && !document.hidden) {
      try { navigator.vibrate?.(hit.defeated ? 52 : 24) } catch { /* Device policy can reject haptics. */ }
    }
    sound.play('slam', hit.defeated ? .7 : .82, hit.defeated ? .34 : .29, hit.defeated ? .19 : .14)
    if (hit.defeated) {
      sound.play(crack, .91, .32, .22)
      feel.after(effectDuration(reducedMotion() ? 100 : fracture.firstLanding), () => sound.play('seat', .75, .24, .15))
    } else sound.play('stone-hit', 1.16, .22, .095)
  } else sound.play('stone-hit', pitch)
}

async function showExchange(before: YachtBattle, after: YachtBattle, exchange: Exchange) {
  if (exchange.ego) before = withEgoDie(before, exchange.ego)
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
  let responseStart = start
  const at = async (time: number) => {
    const remaining = responseStart + effectDuration(time) - performance.now()
    if (!reducedMotion() && remaining > 0) {
      await new Promise<void>((finish) => window.setTimeout(finish, remaining))
    }
  }
  const intent = respondingIntent(enemyIntentAt(before), totals.attack)
  const critical = intent.id === 'critical'
  const weak = before.weakenedStrikeTurn === before.turn
  const golemSingle = exact && incoming === 1 && ascent?.enemy.id === 'thorns'
  if (golemSingle && before.itemsSeven) {
    ui.encounter.style.blockSize = `${ui.encounter.getBoundingClientRect().height}px`
  }
  let golemParry = golemSingle && !dealt && arena.beginGolemParry(start)
  let parryOffset = 0
  type HitCue = { delay?: number; incoming?: boolean; final?: boolean; guarded?: boolean; ordered?: boolean; parry?: boolean; heavy?: boolean }
  const emit = (hits: BattleHit[], contact: HitCue = {}) => {
    const material = () => {
      if (contact.parry) showParry(golemParry)
      else if (contact.guarded) sound.play('block')
      else if (contact.incoming && critical) sound.play('slam', weak ? 1.28 : .9, weak ? .15 : .28)
      else if (contact.ordered && !contact.final) sound.play('tap')
      else if (hits.length && hits[0].target !== 'player') weaponContact(hits[0], contact.heavy)
      else if (hits.length) sound.play('stone-hit', contact.ordered ? .85 : 1)
    }
    if (contact.delay) feel.after(effectDuration(contact.delay), material)
    else material()
    arena.contact(hits, contact)
    for (const hit of hits) showDamage(hit)
  }
  const heroHit = (damage: number, final = true): BattleHit[] => damage ? [{ target: 'player', damage, defeated: final && after.playerHp === 0 }] : []
  const renewed = exchange.heartRevived || after.phase === 'won' && before.bossRelic?.id === 'healing-scepter' && after.playerHp > before.playerHp - taken
  const updatePlayer = () => updatePlayerVital(renewed ? Math.max(0, before.playerHp - taken) : after.playerHp)
  let visiblePlayerHp = before.playerHp
  let visibleEnemyHp = before.enemyHp
  const hitEnemy = (damage: number, heavy = false) => {
    visibleEnemyHp -= damage
    emit([{ target: 'enemy', damage, defeated: visibleEnemyHp === 0 }], { heavy })
    updateVital(ui.enemyHp, ui.enemyTotal, visibleEnemyHp)
  }
  const heavyTarget = opening.escortDealt >= heavyStrike.threshold ? 'escort'
    : opening.dealt >= heavyStrike.threshold ? 'enemy' : undefined
  ui.intent.classList.toggle('parry-in-progress', golemParry)
  if (!golemParry) {
    arena.playExchange(before, exchange, incoming, intent)
    if (opening.dealt || opening.escortDealt) {
      if (!reducedMotion()) {
        const fade = [{ opacity: .37 }, { opacity: .37, offset: .74 }, { opacity: 1 }]
        ui.intent.animate(fade, effectDuration(148))
        if (!chargeStop.hidden) chargeStop.animate(fade, effectDuration(148))
      }
      if (reducedMotion() || heavyTarget !== (opening.escortDealt ? 'escort' : 'enemy')) {
        sound.play('swish', 1, .09, effectDuration(opening.escortDealt ? 45 : 96) / 1000)
      }
    }
  }
  ui.awakening.hidden = !awakenedDice
  ui.awakening.innerHTML = awakenedDice ? `${icon('die')}${awakenedDice.map((face) => `<span>${face}</span>`).join('')}` : ''
  ui.awakening.setAttribute('aria-label', awakenedDice ? `각성 ${awakenedDice.join(', ')}` : '')

  const hitEscort = (damage: number, hp: number, heavy = false) => {
    emit([{ target: 'escort', damage, defeated: hp === 0 }], { heavy })
    updateEscortVital(hp)
  }
  const windUp = (target: 'escort' | 'enemy', beat: number) => {
    if (heavyTarget !== target || reducedMotion()) return
    const now = performance.now()
    arena.windUpHeavy(target, now)
    feel.after(effectDuration(heavyStrike.approach - 60), () => sound.play('swish', 1, .13, effectDuration(60) / 1000))
    responseStart = now + effectDuration(heavyStrike.approach - beat)
    arena.scheduleResponse(responseStart + effectDuration(heavyStrike.hold + heavyStrike.follow))
  }
  const release = (target: 'escort' | 'enemy', beat: number) => {
    if (heavyTarget !== target || reducedMotion()) return
    responseStart = performance.now() + effectDuration(heavyStrike.hold + heavyStrike.follow - beat)
    arena.scheduleResponse(responseStart)
  }
  if (opening.escortDealt) windUp('escort', 45)
  else windUp('enemy', 96)
  if (retreat) {
    if (!reducedMotion()) await at(60)
    sound.play('dice-place', .72)
    updateEscortVital(0)
  }
  if (exchange.gimmick === 'armor' || exchange.gimmick === 'trip' || exchange.gimmick === 'topple') {
    if (!reducedMotion()) await at(75)
    sound.play(exchange.gimmick === 'armor' ? 'latch' : 'release', exchange.gimmick === 'armor' ? 1.33 : .82)
  }
  if (emperorShieldActive(before) && !reflected) sound.play('latch', .62)
  if (opening.escortDealt && before.escort) {
    if (!reducedMotion()) await at(45)
    hitEscort(opening.escortDealt, before.escort.hp - opening.escortDealt, heavyTarget === 'escort')
    release('escort', 45)
    windUp('enemy', 96)
  }
  if (opening.dealt) {
    await at(96)
    hitEnemy(opening.dealt, heavyTarget === 'enemy')
    release('enemy', 96)
  }
  if (incoming) arena.queueShadow(responseStart + effectDuration(incomingContact), false)
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
    if (index) arena.queueShadow(responseStart + effectDuration(time), true)
    await at(time)
    const damage = hitsTaken[index]
    const final = index === incoming - 1
    if (!exact && totals.guard > 0 && damage < incomingHits[index]) {
      const extra = final ? totals.guard - outcome.incoming.totalDamage : 0
      showGuardCue('ordinary', damage === 0, extra)
    }
    emit(heroHit(damage, final && !exchange.defeatedByThorns), { delay: reducedMotion() ? index * 40 : 0, incoming: true, ordered, final,
      guarded: damage === 0 && !(exact && final), parry: exact && final })
    // Only present intermediate contacts here. The final contact (including
    // thorns) uses the settled battle HP below, with its existing healing cue.
    if (damage && index + 1 < hitsTaken.length) {
      visiblePlayerHp = Math.max(0, visiblePlayerHp - damage)
      updatePlayerVital(visiblePlayerHp)
    }
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
    updatePlayerVital(after.playerHp)
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
    parryFlash.hidden = true
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
    meter.setAttribute('aria-label', `${perkDisplayName('blade', battle.itemsSeven)} 충전 ${meter.value}/${meter.max}`)
    ui.bladeMeter.classList.toggle('charged', meter.value >= meter.max)
    ui.bladeMeter.setAttribute('aria-label', `${perkDisplayName('blade', battle.itemsSeven)}. 다 차면 다음 공격 피해가 ${START_PERKS.blade.multiplier}배입니다.`)
  }
  ui.activePerk.hidden = !perk
  if (!perk) return
  const { icon: defaultSymbol } = START_PERK_CARDS[perk.kind]
  const name = perkDisplayName(perk.kind, battle.itemsSeven)
  const symbol = perk.kind === 'oath' ? parityIcons[perk.parity] : defaultSymbol
  let value: string
  switch (perk.kind) {
    case 'shield': value = `+${perk.bonus}`; break
    case 'blade': value = `${perk.charge}/${START_PERKS.blade.threshold}`; break
    case 'collector': value = `+${collectorBonus(perk.hands)}`; break
    case 'reroll': value = battle.paidRerollSpent ? '0' : '+1'; break
    case 'oath': value = `${parityLabels[perk.parity]} +${START_PERKS.oath.bonus}`; break
    case 'counter': value = `+${perk.growth}`; break
    case 'reverse-guard': value = perk.spent ? '0' : '1'; break
    case 'join-slots':
    case 'charge-roll':
    case 'counter-recover':
    case 'early-reroll': value = META_PERKS[perk.kind].value; break
  }
  const projected = blade && battle.phase === 'assign' && blade.nextCharge !== blade.charge
    ? `${blade.nextCharge}/${START_PERKS.blade.threshold}` : null
  ui.activePerk.classList.toggle('perk-ready', blade?.ready ?? false)
  const pips = blade?.pipsAdded ? `${icon('die')}+${blade.pipsAdded}` : ''
  const preview = projected ? `<small class="perk-preview">${pips} →${projected}</small>` : ''
  const previewLabel = projected
    ? `${blade?.pipsAdded ? `, 공격 눈 합 +${blade.pipsAdded}` : ''}, 배치 후 예상 ${projected}` : ''
  ui.activePerk.innerHTML = `${itemIcon(symbol)}<strong>${value}</strong>${preview}`
  const description = document.createElement('span')
  description.innerHTML = perkText(perk.kind, battle.itemsSeven)
  ui.activePerk.dataset.helpText = `${name} ${value} · ${description.textContent}`
  ui.activePerk.setAttribute('aria-label', `${name} ${value}${previewLabel}`)
  ui.activePerk.title = name
}

function showCompanionLine(output: HTMLElement, line: string) {
  output.textContent = line
  output.hidden = !line.trim()
  if (line && output === egoPresence) output.insertAdjacentHTML('afterbegin', icon('companion-awake'))
}

function rewardHealingLabel(run: Ascent, choice: Treasure) {
  const amount = healingForRun(run, choice)
  const original = healingFor(choice, currentTreasureRoom(run), run.route?.map.rules)
  return amount === original ? String(amount) : `${original}→${amount}`
}

function renderRewardPreview(run: Ascent) {
  ui.rewardCards.querySelectorAll('button').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.reward === chosenReward))
  })
  ui.confirmReward.disabled = !chosenReward || Boolean(run.battle.loot && !isBossRelic(chosenReward) && !grantTreasure(run, chosenReward, artifactOptions))
  const room = currentTreasureRoom(run)
  const shopping = room?.kind === 'shop' && (run.route?.map.rules ?? 0) >= 3
  const price = shopping && chosenReward && !isBossRelic(chosenReward) ? shopPrice(chosenReward, run.route?.map.rules) : 0
  ui.confirmReward.textContent = price ? `구매 · 동전 ${price}` : shopping ? '구매' : '확인'
  ui.rewardPreview.hidden = !chosenReward
  if (isArtifact(chosenReward)) renderArtifactOptions(run, chosenReward)
  else ui.artifactOptions.replaceChildren()
  ui.artifactOptions.hidden = !ui.artifactOptions.childElementCount
  if (!chosenReward) return

  const card = REWARD_CARDS[chosenReward]
  const name = rewardDisplayName(chosenReward, run.battle.itemsSeven)
  if (isBossRelic(chosenReward)) {
    ui.rewardPreview.innerHTML = `<strong>${name}</strong><span>${bossRelicText(chosenReward, run.battle.itemsSeven)}</span>`
    return
  }
  const heal = healingForRun(run, chosenReward, room)
  const cost = treasureCost(room, chosenReward)
  const effect = heal ? `고르면 체력을 ${rewardHealingLabel(run, chosenReward)} 회복합니다.` : rewardText(chosenReward, run.battle.itemsSeven)
  const gain = heal ? `${icon('heart')}+${heal}` : `${itemIcon(card.icon)}+1`
  const exchange = room?.kind === 'event' ? `<span class="reward-exchange"><span aria-label="얻음">얻음 ${gain}</span>${cost ? `<span aria-label="잃음">잃음 ${icon('heart')}−${cost}</span>` : ''}</span>` : ''
  ui.rewardPreview.innerHTML = `<strong>${name}</strong><span>${effect}</span>${exchange}`
}

function renderArtifactOptions(run: Ascent, artifact: Artifact) {
  const field = (option: keyof ArtifactOptions, title: string, values: readonly (readonly [string, string])[]) => `
    <div class="artifact-option"><strong>${title}</strong><div role="group" aria-label="${title}">${values.map(([value, label]) =>
      `<button type="button" data-option="${option}" data-value="${value}" aria-pressed="${artifactOptions[option] === value}">${label}</button>`).join('')}</div></div>`
  const equipped = run.battle.loot?.equipped ?? []
  ui.artifactOptions.innerHTML = [
    equipped.length === ARTIFACT_SLOTS ? field('replace', '교체할 유물', equipped.map((id) => [id, `${itemIcon(REWARD_CARDS[id].icon)}${rewardDisplayName(id, run.battle.itemsSeven)}`])) : '',
    artifact === 'heart-die' ? field('parity', '에고 주사위 눈', [['odd', '홀수'], ['even', '짝수']]) : '',
    artifact === 'incomplete' && !run.battle.itemsSeven ? field('hand', '맞출 주사위 눈', (['triple', 'straight'] as const).filter((id) => !run.unlocks.includes(id)).map((id) => [id, id === 'triple' ? '같은 눈 셋' : '이어지는 눈 셋'])) : '',
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
  const seven = run.battle.itemsSeven === true
  const eliteReward = room?.kind === 'elite' && (run.route?.map.rules ?? 0) >= 6
  const canKeep = canKeepEliteArtifacts(run)
  const equipped = run.battle.loot?.equipped ?? []
  ui.rewardPanel.classList.toggle('battle-reward', !atRoom)
  ui.rewardPanel.classList.toggle('boss-reward', bossReward)
  ui.rewardPanel.classList.toggle('boss-reward-seven', bossReward && seven)
  ui.rewardPanel.classList.toggle('elite-reward', eliteReward)
  const atShop = room?.kind === 'shop' && (run.route?.map.rules ?? 0) >= 3
  ui.rewardPanel.classList.toggle('multi-shop', Boolean(atShop && seven))
  const eventName = room?.event === 'medicine' ? '무너진 약상자' : room?.event === 'pulley' ? '녹슨 도르래' : '빈 깃대'
  ui.rewardHeading.innerHTML = bossReward ? '보스 유물 선택' : atRoom ? `${icon(MAP_NODE_ICONS[room.kind])} ${room.kind === 'event' ? eventName : room.kind === 'rest' ? '11층 휴식' : atShop ? '상인' : '장터 경유'}` : eliteReward && seven ? '강적 유물 선택' : '전투 보상'
  ui.eliteCapacity.hidden = !eliteReward && !(atShop && seven)
  if (!ui.eliteCapacity.hidden) ui.eliteCapacity.innerHTML = `${icon('map-reward')}유물 ${equipped.length}/${ARTIFACT_SLOTS}`
  if (room?.kind === 'rest') ui.rewardHeading.insertAdjacentHTML('beforeend', '<span class="rest-ember" aria-hidden="true"></span>')
  ui.skipReward.textContent = atRoom ? '떠나기' : '건너뛰기'
  ui.skipReward.hidden = bossReward || Boolean(eliteReward && offers.length && !canKeep)
  ui.skipReward.removeAttribute('aria-label')
  if (canKeep) {
    ui.skipReward.innerHTML = `<span>지금 유물 유지</span><small>${icon('ascent-coin')}+${ELITE_KEEP_COINS}</small>`
    ui.skipReward.setAttribute('aria-label', `지금 유물 유지 (받지 않음), 동전 +${ELITE_KEEP_COINS}`)
  }
  const eventContext = {
    medicine: '깨진 약상자에 약봉지와 천이 남아 있습니다.',
    pulley: '도르래를 당기면 돌 밑의 숫돌을 꺼낼 수 있습니다.',
    flag: '깃대에 묶인 유물을 풀려면 체력을 써야 합니다.',
  }
  ui.rewardContext.replaceChildren()
  if (room?.event) ui.rewardContext.textContent = eventContext[room.event]
  if (canKeep) {
    ui.artifactStrip.hidden = true
    ui.rewardContext.innerHTML = `<span class="elite-equipped" role="group" aria-label="장착 중인 유물 세 개">${equipped.map((id) => {
      const { icon: symbol } = REWARD_CARDS[id]
      return `<span>${itemIcon(symbol)}<strong>${rewardDisplayName(id, seven)}</strong></span>`
    }).join('')}</span>`
  }
  if (!run.route) {
    const next = enemyForFight(seed, fight + 1)
    const badge = enemyBadge(next.id, MAP_RULES)
    const charge = next.intents.some((intent) => intent.chargeThreshold !== undefined)
    ui.rewardContext.innerHTML = `<span title="다음 적: ${badge.label}" aria-label="다음 적: ${badge.label}" role="img">${icon(badge.icon)}${charge && badge.icon !== 'charge' ? icon('charge') : ''}</span>`
  }
  ui.rewardCards.replaceChildren(...offers.map((reward) => {
    const { icon: symbol } = REWARD_CARDS[reward]
    const name = rewardDisplayName(reward, seven)
    const card = document.createElement('button')
    card.type = 'button'
    card.className = 'reward-card'
    card.classList.toggle('artifact-card', isArtifact(reward))
    card.dataset.reward = reward
    card.setAttribute('aria-label', name)
    const pictogram = pixelIcon(symbol)
    if (isBossRelic(reward)) {
      const { benefit, cost } = SEVEN_BOSS_RELICS[reward]
      card.innerHTML = `${pictogram}<strong>${name}</strong><small>${seven ? `<span class="relic-benefit">${icon(benefit[0])}${benefit[1]}</span><span class="relic-cost">${icon(cost[0])}${cost[1]}</span>` : REWARD_CARDS[reward].value}</small>`
      if (seven) card.setAttribute('aria-label', `${name}, ${bossRelicText(reward, true)}`)
    } else if (seven) {
      const rarity = treasureRarity(reward)
      const isHeal = reward === 'bandage' || reward === 'kit' || reward === 'medicine'
      const value = isHeal ? `+${healingForRun(run, reward)}` : undefined
      const type = isMetaArtifact(reward) ? '해금 유물' : isArtifact(reward) ? '유물' : isHeal || isConsumable(reward) ? '일회용' : '준비'
      const grade = rarity === 'rare' ? '희귀' : '일반'
      card.classList.add('item-seven-card')
      card.dataset.rarity = rarity
      card.setAttribute('aria-description', `${type} · ${grade}`)
      card.innerHTML = `<span class="reward-type">${type}<span>${grade}</span></span>${pictogram}<strong>${name}</strong><small class="reward-effect">${sevenItemEffect(reward, value)}</small>`
    } else card.innerHTML = pictogram
    const description = (reward === 'kit' || reward === 'bandage' || reward === 'medicine') ? `체력 ${rewardHealingLabel(run, reward)} 회복`
      : (seven && sevenCardEffect(reward)) || inventoryDescription(reward, seven)
    const effectLine = document.createElement('small')
    effectLine.className = 'reward-effect-line'
    effectLine.textContent = description
    card.append(effectLine)
    card.addEventListener('click', () => {
      chosenReward = chosenReward === reward ? undefined : reward
      artifactOptions = {}
      renderRewardPreview(run)
      saveCurrent()
    })
    if (!atShop || isBossRelic(reward)) return card

    const price = shopPrice(reward, run.route?.map.rules)
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
  if (atShop && !seven && !offers.some(isArtifact)) {
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
type ItemAction = { label: string; apply?: () => void }
const itemActions = new Map<Reward, ItemAction>()
const dockActionSelector = '#treasure-controls [data-item-activate]'

function inventoryDescription(id: Reward, seven?: boolean) {
  return isBossRelic(id) ? bossRelicText(id, seven) : rewardText(id, seven)
}

function showInventoryInfo(id: Reward, effect?: string) {
  const seven = ascent?.battle.itemsSeven
  element('inventory-title').textContent = rewardDisplayName(id, seven)
  const description = inventoryDescription(id, seven)
  element('inventory-description').textContent = effect && !seven && !isBossRelic(id) ? `${description} ${effect}` : description
  inventoryDetail.showModal()
}

function inventoryChip(id: Reward, uses: number, capacity: number, disabled: boolean, action?: ItemAction, effect?: string) {
  const card = REWARD_CARDS[id]
  const seven = ascent?.battle.itemsSeven
  const name = rewardDisplayName(id, seven)
  const button = document.createElement('button')
  button.type = 'button'
  button.dataset.reward = id
  button.disabled = disabled
  button.classList.toggle('spent', capacity > 0 && uses === 0)
  button.setAttribute('aria-label', capacity ? `${name}, ${uses}회 남음` : name)
  if (action && ascent?.battle.phase === 'assign') {
    itemActions.set(id, action)
    button.setAttribute('aria-controls', 'treasure-controls')
    button.setAttribute('aria-expanded', String(dockItem === id))
    button.addEventListener('click', () => {
      if (!ascent || exchangeBusy) return
      if (seven && action.apply && (action.label !== '사용' || itemControl !== id)) {
        itemControl = undefined
        dockItem = id
        action.apply()
        return
      }
      dockItem = dockItem === id ? undefined : id
      itemControl = undefined
      refreshSelection(ascent)
      if (dockItem) (ui.treasureControls.querySelector<HTMLElement>('[data-item-activate]:enabled') ?? ui.treasureControls).focus({ preventScroll: true })
      else focusInventoryChip(id)
    })
  } else {
    button.setAttribute('aria-haspopup', 'dialog')
    button.addEventListener('click', () => showInventoryInfo(id, effect))
  }
  const dots = !seven && Array.from({ length: capacity }, (_, i) => `<i class="${i < uses ? 'filled' : ''}"></i>`).join('')
  const count = seven && capacity ? `<span class="item-count" aria-hidden="true">×${uses}</span>` : ''
  button.innerHTML = `${itemIcon(card.icon)}${count}${dots ? `<span class="use-dots" aria-hidden="true">${dots}</span>` : ''}`
  return button
}

function renderRewardStrip(battle: YachtBattle, disabled: boolean) {
  itemActions.clear()
  element('thumb-items').hidden = true
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
    const action = reward === 'wedge' ? { label: battle.wedgeArmed ? '끄기' : '켜기',
      apply: toggle ? () => updateTreasureBattle(battle, toggleYachtWedge(battle), dockActionSelector) : undefined }
      : reward === 'tuning' ? { label: '사용' } : undefined
    const button = inventoryChip(reward, Number(remaining), 1, disabled, action)
    if (toggle) button.setAttribute('aria-pressed', String(Boolean(battle.wedgeArmed)))
    return button
  }))
}

function focusInventoryChip(id: Reward) {
  const chip = ui.main.querySelector<HTMLButtonElement>(`:is(.inventory-strip, #thumb-items) [data-reward="${id}"]`)
  if (chip?.closest('#inventory-overflow')) setInventoryOverflow(true)
  chip?.focus({ preventScroll: true })
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
  const ready = battle.phase === 'assign' && !loot.hourglass && !loot.reserveRoll && !disabled
  const itemButtons = battle.itemsSeven ? [...COMMON_CONSUMABLES, ...RARE_CONSUMABLES]
    .filter((id) => (loot.consumables?.[id] ?? 0) > 0).map((id) => {
      const uses = loot.consumables?.[id] ?? 0
      const armed = loot.consumableArmed === id
      const selectable = ready && consumableReady(loot, id)
      const toggle = isArmedConsumable(id) && selectable && toggleConsumable(battle, id) !== battle
      const action = isArmedConsumable(id) ? { label: armed ? '끄기' : '켜기',
        apply: toggle ? () => updateTreasureBattle(battle, toggleConsumable(battle, id), dockActionSelector) : undefined }
        : id === 'tuning' || id === 'twin-mold' ? { label: '사용', apply: selectable ? () => openItemControl(id) : undefined } : undefined
      const button = inventoryChip(id, uses, Math.max(1, uses), disabled, action)
      if (isArmedConsumable(id)) button.setAttribute('aria-pressed', String(armed))
      return button
    }) : ITEMS.filter((id) => loot.items[id]).map((id) => {
    const uses = itemUses(loot, id)
    const wedge = ready && id === 'wedge' && uses > 0
    const button = inventoryChip(id, uses, loot.items[id]!, disabled, id === 'wedge' ? {
      label: battle.wedgeArmed ? '끄기' : '켜기',
      apply: wedge ? () => updateTreasureBattle(battle, toggleYachtWedge(battle), dockActionSelector) : undefined,
    } : undefined)
    if (wedge) button.setAttribute('aria-pressed', String(Boolean(battle.wedgeArmed)))
    return button
  })
  const shardButtons = SHARDS.filter((id) => loot.shards[id] || loot.triggered?.includes(id)).map((id) => {
    const clickable = ready && id !== 'tuning' && loot.shards[id] && !loot.tuned && !loot.sealDraft
    const count = loot.shards[id] ?? 0
    const button = inventoryChip(id, count, Math.max(count, 1), disabled, {
      label: id === 'tuning' ? '사용' : loot.shardArmed === id ? '끄기' : '켜기',
      apply: clickable ? () => updateTreasureBattle(battle, toggleShard(battle, id), dockActionSelector) : undefined,
    })
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
    const hourglass = !battle.itemsSeven && ready && id === 'hourglass' && startHourglass(battle, [...selected]) !== battle
    const pickDie = battle.itemsSeven && ready && available && (id === 'hourglass' && battle.playerHp > 2 ||
      id === 'die-latch' || id === 'pip-ring' || id === 'blood-grip' || id === 'linked-cup' && !battle.rerolled)
    const delay = id === 'mirror' ? loot.mirrorDamage : id === 'overflow' ? loot.overflowDamage : id === 'scabbard' ? loot.scabbard : undefined
    const on = loot.armed?.includes(id as 'banner' | 'hammer') ?? false
    const action = id === 'banner' || id === 'hammer' ? { label: on ? '끄기' : '켜기',
      apply: toggle ? () => updateTreasureBattle(battle, toggleArtifact(battle, id), dockActionSelector) : undefined }
      : id === 'hourglass' || id === 'die-latch' || id === 'pip-ring' || id === 'blood-grip' || id === 'linked-cup' ? { label: '사용',
        apply: pickDie ? () => openItemControl(id) : hourglass
          ? () => updateTreasureBattle(battle, startHourglass(battle, [...selected]), '#treasure-controls button', true) : undefined }
      : !battle.itemsSeven && id === 'incomplete' ? { label: '사용' } : undefined
    const button = inventoryChip(id, Number(available), id === 'heart-die' ? 0 : 1, disabled, action,
      delay ? `다음 공격에 피해 ${delay}를 더합니다.` : undefined)
    if (toggle) button.setAttribute('aria-pressed', String(on))
    if (battle.itemsSeven && delay) button.insertAdjacentHTML('beforeend', `<span class="item-count">→${delay}</span>`)
    if (id === 'die-latch' && loot.latchDraft !== undefined || id === 'blood-grip' && bloodDieFor(battle) !== undefined) button.setAttribute('aria-pressed', 'true')
    return button
  })
  for (const button of [...itemButtons, ...shardButtons, ...prepButtons, ...relicButtons]) {
    button.classList.toggle('triggered', loot.triggered?.some((id) => id === button.dataset.reward) ?? false)
  }
  if (battle.itemsSeven) {
    const thumb = element('thumb-items')
    const active = relicButtons.filter(button => itemActions.has(button.dataset.reward as Reward) ||
      ['banner', 'hourglass', 'die-latch', 'pip-ring', 'blood-grip', 'linked-cup'].includes(button.dataset.reward!))
    for (const button of [...itemButtons, ...active]) {
      const id = button.dataset.reward as Treasure
      button.dataset.itemKind = isArtifact(id) ? 'artifact' : 'consumable'
      button.insertAdjacentHTML('beforeend', `<small class="thumb-effect" aria-hidden="true">${sevenItemEffect(id, undefined, false)}</small>`)
    }
    thumb.hidden = battle.phase !== 'assign' || !itemButtons.length && !active.length
    thumb.replaceChildren(...itemButtons, ...active)
    ui.artifactStrip.replaceChildren(...relicButtons.filter(button => !active.includes(button)))
    ui.artifactStrip.hidden = !ui.artifactStrip.childElementCount
    ui.rewardStrip.replaceChildren(...prepButtons)
    ui.rewardStrip.classList.remove('treasure-items')
    ui.rewardStrip.hidden = !prepButtons.length
    return
  }
  ui.artifactStrip.replaceChildren(...relicButtons)
  ui.artifactStrip.hidden = !relicButtons.length

  const items = [...itemButtons, ...shardButtons, ...prepButtons]
  items.sort((first, second) => Number(second.getAttribute('aria-expanded') === 'true') - Number(first.getAttribute('aria-expanded') === 'true') ||
    Number(second.hasAttribute('aria-pressed')) - Number(first.hasAttribute('aria-pressed')))
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
  if (battle.itemsSeven) {
    const { benefit, cost } = SEVEN_BOSS_RELICS[relic.id]
    if (relic.id === 'emperor-shield' && battle.turn > 1) button.classList.remove('spent')
    button.classList.add('boss-relic-counted')
    button.insertAdjacentHTML('beforeend', `<span class="item-count" aria-hidden="true">${spent ? cost[1] : benefit[1]}</span>`)
  }
  ui.bossRelicSlot.replaceChildren(button)
}

function openItemControl(id: NonNullable<typeof itemControl>) {
  itemControl = id
  render()
  const target = ui.treasureControls.querySelector<HTMLButtonElement>('button[data-item-choice]') ?? diceButtons[selected.values().next().value ?? 0]
  target.focus({ preventScroll: true })
}

const treasureControlsHome = ui.treasureControls.parentElement!
const treasureControlsNext = ui.treasureControls.nextSibling

function renderTreasureControls(battle: YachtBattle, enabled: boolean) {
  ui.treasureControls.replaceChildren()
  ui.treasureControls.hidden = true
  ui.treasureControls.toggleAttribute('data-item-planning', battle.phase === 'assign')
  ui.treasureControls.toggleAttribute('data-item-counter', battle.phase === 'counter')
  const overlay = battle.itemsSeven && enabled && battle.phase === 'assign'
  ui.treasureControls.toggleAttribute('data-item-overlay', Boolean(overlay))
  if (overlay && ui.treasureControls.parentElement !== ui.encounter) ui.encounter.append(ui.treasureControls)
  else if (!overlay && ui.treasureControls.parentElement !== treasureControlsHome) treasureControlsHome.insertBefore(ui.treasureControls, treasureControlsNext)
  const { loot } = battle
  if (!enabled) return
  const control = (label: string, content: string, action: () => void, disabled = false) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute('aria-label', label)
    button.innerHTML = content
    button.disabled = disabled
    button.addEventListener('click', action)
    return button
  }
  const splitRoll = loot?.reserveRoll ?? loot?.hourglass
  const action = battle.phase === 'assign' && dockItem ? itemActions.get(dockItem) : undefined
  let dockLine: HTMLElement | undefined
  if (action && dockItem && !splitRoll) {
    const id = dockItem
    const card = REWARD_CARDS[id]
    const name = rewardDisplayName(id, battle.itemsSeven)
    dockLine = document.createElement('div')
    dockLine.className = 'item-dock-line'
    const summary = battle.itemsSeven && !isBossRelic(id) ? `<span class="dock-summary">${sevenItemEffect(id)}</span>` : ''
    const description = inventoryDescription(id, battle.itemsSeven)
    const effect = battle.itemsSeven ? description : description.match(/^.*?[.!?](?=\s|$)/u)?.[0] ?? description
    const info = control(`${name} 설명`, `${itemIcon(card.icon)}<span class="dock-description"><strong>${name}</strong>${summary}<span class="dock-effect"></span></span>`, () => showInventoryInfo(id))
    info.querySelector('.dock-effect')!.textContent = effect
    info.setAttribute('aria-description', effect)
    info.className = 'item-dock-info'
    dockLine.append(info)
    if (!battle.itemsSeven && id === 'tuning') {
      for (const change of [-1, 1] as const) {
        const next = tuneYachtDie(battle, change)
        const button = control(`첫 주사위 눈 ${change < 0 ? '−1' : '+1'}`, change < 0 ? '−1' : '+1',
          () => updateTreasureBattle(battle, next, '#resolve'), next === battle)
        button.dataset.itemActivate = ''
        dockLine.append(button)
      }
    } else if (!battle.itemsSeven && !itemControl && id !== 'incomplete') {
      const use = control(action.label, action.label, () => action.apply?.(), !action.apply)
      use.classList.add('primary')
      use.dataset.itemActivate = ''
      dockLine.append(use)
    }
    const close = control('아이템 조작 닫기', '×', () => {
      dockItem = undefined
      itemControl = undefined
      if (ascent) refreshSelection(ascent)
      focusInventoryChip(id)
    })
    close.className = 'item-dock-close'
    dockLine.append(close)
    ui.treasureControls.append(dockLine)
  }
  if (splitRoll) {
    const choose = loot?.reserveRoll ? chooseReserveRoll : chooseHourglass
    for (const entry of splitRoll) {
      const group = document.createElement('div')
      group.className = 'treasure-die-choice'
      group.setAttribute('role', 'group')
      group.setAttribute('aria-label', `주사위 ${entry.index + 1}`)
      group.innerHTML = `<span>${icon('die')}${entry.index + 1}</span>`
      group.append(control(`주사위 ${entry.index + 1} 원래 눈 ${entry.original}`, `${icon('return')}${entry.original}`, () => updateTreasureBattle(battle, choose(battle, entry.index, false), '#treasure-controls button')),
        control(`주사위 ${entry.index + 1} 새 눈 ${entry.rolled}`, `${icon('reroll')}${entry.rolled}`, () => updateTreasureBattle(battle, choose(battle, entry.index, true), '#treasure-controls button')))
      ui.treasureControls.append(group)
    }
  } else if (loot?.counter) {
    const choices = availableCounterChoices(battle)
    const damage = counterDamage(battle, loot.counter.damage)
    const apply = battle.itemsSeven ? `피해 ${damage} 주기` : '지금 룰렛 피해 주기'
    ui.treasureControls.append(control(apply, `${icon('wheel')}${battle.itemsSeven ? apply : damage}`, () => void playCounter('now')))
    if (choices.includes('coin')) ui.treasureControls.append(control(`${rewardDisplayName('coin', battle.itemsSeven)}${battle.itemsSeven ? '로' : '으로'} 룰렛 한 번 더 돌리기`, `${icon('treasure-coin')}↻1`, () => void playCounter('coin')))
    if (choices.includes('mirror') || !battle.itemsSeven && loot.equipped.includes('mirror')) ui.treasureControls.append(control(`${rewardDisplayName('mirror', battle.itemsSeven)}로 미루기`, `${icon('treasure-mirror')}→${mirrorCounterDamage(battle, damage)}`, () => void playCounter('mirror'), !choices.includes('mirror')))
    if (choices.includes('horn') || !battle.itemsSeven && loot.equipped.includes('horn')) ui.treasureControls.append(control(`${rewardDisplayName('horn', battle.itemsSeven)}로 합공`, `${icon('treasure-horn')}${counterDamage(battle, hornCounterDamage(battle))}`, () => void playCounter('horn'), !choices.includes('horn')))
    if (choices.includes('adjacent')) {
      const rewards = displayedCounterRewards(battle)
      const beside = rewards[(loot.counter.slot + 1) % rewards.length]
      ui.treasureControls.append(control(`${rewardDisplayName('adjacent-needle', true)}로 피해 ${beside.damage}`, `${itemIcon(META_ARTIFACTS['adjacent-needle'].icon)}→${beside.damage}`, () => void playCounter('adjacent')))
    }
    if (choices.includes('recover-reroll')) ui.treasureControls.append(control(`${perkDisplayName('counter-recover', true)}로 해금 재굴림 되찾기`,
      `${icon('wheel')}${Math.max(0, damage - META_VALUES.recoveryCost)} · ${icon('reroll-die')}+1`, () => void playCounter('recover-reroll')))
  } else if (battle.itemsSeven && loot && battle.phase === 'assign') {
    if (battle.perk?.kind === 'reverse-guard' && !battle.perk.spent && !itemControl) {
      const target = selected.size === 1 ? [...selected][0] : battle.metaTurn?.reverseDie
      if (target !== undefined) {
        const next = draftMetaDie(battle, 'reverse-guard', target)
        if (next !== battle) {
          const undo = battle.metaTurn?.reverseDie === target
          ui.treasureControls.append(control(`${perkDisplayName('reverse-guard', true)} ${undo ? '취소' : '사용'}`,
            `${itemIcon(META_PERKS['reverse-guard'].icon)}${undo ? icon('return') : `${battle.dice[target]}→${7 - battle.dice[target]}`}`,
            () => updateTreasureBattle(battle, next, '#resolve', true)))
        }
      }
    }
    const id = itemControl
    if (id) {
      const targets = [...selected].filter((index) => id === 'blood-grip' ? battle.slots[index] === 'attack' : canSelectItemDie(battle, index))
      const targetCount = id === 'twin-mold' || id === 'pip-ring' || id === 'linked-cup' ? 2 : 1
      const selection = `주사위 ${targets.length}/${targetCount} 선택`
      const info = dockLine?.querySelector('.item-dock-info')
      info?.querySelector('.dock-description')?.insertAdjacentHTML('beforeend', `<span class="item-selection">${selection}</span>`)
      if (info) info.setAttribute('aria-description', `${info.getAttribute('aria-description')} ${selection}`)
      const options = document.createElement('div')
      options.className = 'item-dock-options'
      options.dataset.item = id
      ui.treasureControls.append(options)
      if (targets.length !== targetCount) options.textContent = targetCount === 2 ? '주사위 두 개를 고르세요.' : '주사위를 고르세요.'
      const add = (label: string, display: string, next: YachtBattle) => {
        if (next === battle) return
        const button = control(label, display, () => {
          itemControl = undefined
          updateTreasureBattle(battle, next, '#resolve')
        })
        button.dataset.itemChoice = ''
        options.append(button)
      }
      if (targets.length === targetCount && selected.size === targetCount) {
        const [index, other] = targets
        if (id === 'tuning') for (const change of [-1, 1]) add(`조율 ${change}`, change < 0 ? '−1' : '+1', adjustItemDie(battle, index, id, change))
        if (id === 'hourglass') for (const face of [1, 2, 3, 4, 5, 6]) add(`눈 ${face}로 바꾸기, 체력 2 소모`, `${face}`, adjustItemDie(battle, index, id, face))
        if (id === 'twin-mold') for (const [to, from] of [[index, other], [other, index]]) {
          add(`주사위 ${to + 1}의 눈을 ${battle.dice[from]}(으)로 맞추기`, `${icon('die')}${to + 1}→${battle.dice[from]}`, adjustItemDie(battle, to, id, from))
        }
        if (id === 'die-latch') add(`주사위 ${index + 1}의 눈 ${battle.dice[index]} 유지`, `${icon('return')}${battle.dice[index]}`, selectLatchDie(battle, index))
        if (id === 'blood-grip') {
          const next = draftMetaDie(battle, id, index)
          const undo = bloodDieFor(battle) === index
          add(`${rewardDisplayName('blood-grip', true)} ${undo ? '취소' : '사용'}`,
            undo ? icon('return') : `${icon('healing')}+${bloodHealing(next, next.dice)}`, next)
        }
        if (id === 'pip-ring') for (const [from, to] of [[index, other], [other, index]]) {
          add(`주사위 ${from + 1}에서 주사위 ${to + 1}로 눈 1 옮기기`, `${from + 1}→${to + 1} · −1/+1`, transferMetaPip(battle, from, to))
        }
        if (id === 'linked-cup') add('두 주사위를 연속하는 눈으로 굴리기', `${icon('reroll')}2 · 1회`, rerollYachtDice(battle, targets, true))
      }
    } else if (loot.consumableArmed || loot.latchDraft !== undefined || loot.armed?.includes('banner')) {
      const armed = loot.consumableArmed ?? (loot.latchDraft !== undefined ? 'die-latch' : 'banner')
      const card = REWARD_CARDS[armed]
      const forecast = forecastYacht(battle)
      const applies = Boolean(forecast.loot?.triggered?.includes(armed))
      let effect: string | undefined
      if (armed === 'die-latch') effect = String(battle.dice[loot.latchDraft!])
      if (applies && armed === 'weight') effect = `+${Math.max(...battle.dice.filter((_, index) => battle.slots[index] === 'attack'))}`
      if (applies && armed === 'banner') effect = `+${yachtAllocationTotals(battle).guard - yachtAllocationTotals({ ...battle, loot: { ...loot, armed: [] } }).guard}`
      if (applies && armed === 'buckle') effect = `−${forecastYacht({ ...battle, loot: { ...loot, consumableArmed: undefined } }).damage - forecast.damage}`
      const inline = dockItem === armed && dockLine
      const status = `<span class="item-effect" data-applies="${applies}">${inline ? '' : itemIcon(card.icon)}<strong class="item-effect-value">${sevenItemEffect(armed, effect)}</strong><span class="item-effect-state">${applies ? icon('map-check') : ''}${applies ? '발동' : '대기'}</span></span>`
      if (inline) {
        const info = inline.querySelector('.item-dock-info')!
        info.setAttribute('aria-label', `${rewardDisplayName(armed, true)} 설명, ${applies ? '발동' : '대기'}`)
        info.querySelector('.dock-summary')!.outerHTML = status
      } else ui.treasureControls.insertAdjacentHTML('beforeend', status)
    }
  } else if (loot?.sealDraft) {
    ui.treasureControls.append(control('미완의 인장 조정 취소', `${icon('treasure-incomplete')}${icon('return')}`, () => updateTreasureBattle(battle, cancelSeal(battle), '#resolve')))
  } else if (battle.phase === 'assign' && dockItem === 'incomplete' && loot?.sealHand && !ascent?.unlocks.includes(loot.sealHand)) {
    const options = document.createElement('div')
    options.className = 'item-dock-options'
    ui.treasureControls.append(options)
    if (selected.size === 1) {
      const index = [...selected][0]
      for (const change of [-2, -1, 1, 2] as const) {
        const next = draftSeal(battle, index, change)
        if (next === battle) continue
        const number = change > 0 ? `+${change}` : `−${-change}`
        options.append(control(`미완의 인장 ${number}`, number, () => updateTreasureBattle(battle, next, '#treasure-controls button', true)))
      }
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

function updatePlayerVital(hp: number, max = ui.playerHp.max) {
  updateVital(ui.playerHp, ui.playerTotal, hp, max)
  renderHealth(hp, max)
}

function teachOpening({ battle }: Ascent) {
  if (battle.phase === 'counter') {
    if (ui.counter.hidden) {
      firstRun.clear()
      return
    }
    firstRun.teach({ id: 'defend', text: '정확히 막았습니다! 룰렛을 두 번 누르세요.', symbol: 'wheel',
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
    firstRun.teach({ id: 'attack', text: '표시한 주사위를 공격에 두세요.', symbol: 'sword', anchor: ui.firstRunAnchor,
      marks: [ui.assign.attack, ...attack], from: attack[0], to: ui.assign.attack })
  } else if (guard.length) {
    const damage = outcome.incoming.totalDamage
    const text = outcome.counter ? `방어 ${damage} = 적 공격 ${damage} → 정확 방어` : '표시한 주사위를 방어에 두세요.'
    firstRun.teach({ id: 'defend', text, symbol: 'shield', anchor: ui.firstRunAnchor,
      marks: [ui.intent, ui.assign.guard, ...guard], arrows: guard, to: ui.dice.guard, guardGoal: damage,
      headings: [ui.assign.attack.closest<HTMLElement>('.attack-heading')!, ui.assign.guard] })
  } else {
    const text = outcome.counter ? '턴을 끝내 반격 룰렛을 여세요.' : '턴 끝내기 누르세요.'
    firstRun.teach({ id: 'end-turn', text, symbol: 'turn', anchor: ui.firstRunAnchor, marks: [ui.resolve],
      guardGoal: outcome.counter ? outcome.incoming.totalDamage : undefined })
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
    firstRun.discover([{ id: 'fork', symbol: 'map-pin', text: '다음 길을 고르세요.', anchor: element('fork-heading') }])
  } else if (!ui.rewardPanel.hidden) {
    const room = currentTreasureRoom(run)
    const anchor = ui.rewardHeading
    if (room?.kind === 'shop') {
      const text = route && route.map.rules >= 3 ? '동전으로 물건을 사세요.' : '물건을 고르세요.'
      firstRun.discover([{ id: 'shop', symbol: 'map-shop', text, anchor, inFlow: true }])
    } else if (room?.enemyId === 'chain-warden') {
      firstRun.discover([{ id: 'boss-relic', symbol: 'crown', text: '보스 유물 1장을 고르세요.', anchor, inFlow: true }])
    } else if (route?.screen === 'reward' || (!route && battle.phase === 'won')) {
      const text = canKeepEliteArtifacts(run) ? '유물을 바꾸거나 그대로 유지하세요.' : '카드 1장을 골라 확인하세요.'
      firstRun.discover([{ id: 'reward', symbol: 'map-reward', text, anchor, inFlow: true }])
    } else firstRun.clear()
  } else if (!ui.battle.hidden && !ui.planning.hidden) {
    const gimmick = yachtGimmick(battle)
    const hand = classifyYachtHand(battle, battle.dice)
    const condition = gimmick && `${gimmick.slot === 'guard' ? '방어' : '공격'} ${gimmick.face ?? '같은 눈 둘'} → ${gimmickEffects[gimmick.kind].intro}`
    firstRun.discover([
      ...(gimmick && condition ? [{ id: `gimmick-${gimmick.kind}`, symbol: gimmick.slot === 'guard' ? 'shield' : 'sword',
        text: condition, anchor: ui.encounter, beside: ui.inventory, linger: true }] : []),
      ...(!battle.itemsSeven && hand && !unlocks.includes(hand) ? [{ id: `unlock-${hand}`, symbol: 'lock', anchor: hand === 'triple' ? ui.lockedDie : ui.extraReroll,
        text: '잠긴 자리를 눌러 조건을 보세요.' }] : []),
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
  if (presentation === 'normal' && phase !== 'counter') ui.encounter.style.removeProperty('block-size')
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
  ui.masthead.hidden = false
  ui.returnLobby.hidden = defeated
  ui.returnLobby.disabled = presentation !== 'normal'
  ui.returnLobby.setAttribute('aria-haspopup', 'dialog')
  ui.perks.hidden = true
  ui.battle.hidden = atMap
  ui.fork.hidden = !atMap
  ui.mapHealth.hidden = inCombat || defeated
  updatePlayerVital(playerHp, maxHp)
  ui.mapFloor.hidden = !atMap
  renderCoins(route?.coins)
  renderBossRelicSlot(battle, presentation !== 'normal')
  ui.encounter.hidden = !inCombat && !defeated
  ui.encounter.setAttribute('aria-label', defeated ? '돌바닥에 쓰러진 회귀자의 마지막 전장' : '전장')
  ui.fight.hidden = atMap
  const floor = route ? (route.node === null ? route.completed.length + Number(atMap) : route.map.byId[route.node].floor) : fight
  const floors = route ? MAP_FLOORS : FIGHT_COUNT
  ui.gameOver.hidden = !defeated
  if (defeated) ui.defeatFloor.textContent = `${floor}층에서 ${battle.lastExchange?.defeatedByThorns ? '가시에 찔려 ' : ''}쓰러졌습니다.`
  const reveal = element('meta-reveal')
  const opened = ascent.meta?.opened ?? []
  reveal.hidden = !finished || presentation !== 'normal' || !opened.length
  if (!reveal.hidden) {
    const anchor = defeated ? ui.gameOver.querySelector('.game-over-actions')! : ui.retry
    anchor.before(reveal)
    element('meta-reveal-list').innerHTML = metaRevealContent(opened)
  }
  const headerFloor = atMap ? ui.mapFloor : ui.fight
  headerFloor.textContent = `${floor}/${floors} 층`
  renderActivePerk(battle)
  ui.turn.hidden = !inCombat
  ui.help.hidden = !inCombat && !atMap
  ui.help.disabled = !showActions && !atMap
  ui.battleSettings.hidden = !inCombat
  ui.battleSettings.disabled = !showActions
  ui.soundToggle.hidden = atMap || defeated
  if (atMap) {
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
  ui.encounterName.hidden = ui.encounter.hidden
  ui.encounterName.textContent = enemyNameplate(enemy.id, route?.map.rules ?? MAP_RULES)
  renderIntent(battle, totals, enemy.id)
  renderEnemyStatus(battle)
  updateVital(ui.enemyHp, ui.enemyTotal, enemyHp, enemy.hp)
  ui.escortGuard.hidden = !battle.escort || enemyHp <= 0
  ui.encounter.classList.toggle('escort-room', enemy.id === 'escort')
  ui.encounter.classList.toggle('boss-room', enemy.id === 'boss')
  ui.enemyHp.closest('.vital')?.querySelector('label use')?.setAttribute('href', enemy.id === 'boss' ? '#icon-crown' : '#icon-heart')
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
  const fieldCounter = showActions && phase === 'counter'
  if (fieldCounter && ui.counterPanel.parentElement !== ui.encounter) ui.encounter.append(ui.counterPanel)
  if (!fieldCounter && ui.counterPanel.parentElement !== counterPanelHome) {
    counterPanelHome.insertBefore(ui.counterPanel, counterPanelNext)
  }
  ui.counterPanel.classList.toggle('counter-over-field', fieldCounter)
  ui.intent.classList.toggle('parry-in-progress', fieldCounter)
  roulette.setVisible(showActions && phase === 'counter' ? displayedCounterRewards(battle) : null, companionAwake)
  if (fieldCounter) {
    const automatic = settings.automaticCounter === true
    ui.counter.hidden = automatic || Boolean(battle.loot?.counter)
    roulette.setAutomatic(automatic)
    const comparison = element('counter-comparison')
    comparison.hidden = !battle.loot?.counterRecast
    if (battle.loot?.counterRecast) {
      const rewards = displayedCounterRewards(battle)
      const first = rewards[yachtCounterSlot(battle)].damage
      const second = rewards[yachtCounterSlot(battle, true)].damage
      comparison.textContent = `첫 ${first} · 다시 ${second} → ${Math.max(first, second)}`
    }
    if (battle.loot?.counter && ui.counterPanel.dataset.rollState !== 'locked') {
      void roulette.reveal({ ...battle.loot.counter, damage: counterDamage(battle, battle.loot.counter.damage) }, false, () => {})
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
  refreshMetaCount()
  const { checkpoint, invalidMap } = readAscentSave()
  const hasSave = checkpoint !== null
  if (checkpoint) arena.prime(checkpoint.ascent.enemy.id)
  ui.continueAscent.hidden = !hasSave
  ui.saveNotice.hidden = !invalidMap
  ui.newAscent.classList.toggle('primary', !hasSave)
}

function resetPresentation() {
  itemControl = undefined
  dockItem = undefined
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
  ui.bossRelicSlot.hidden = true
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
  ui.bossRelicSlot.hidden = true
  ui.rewardStrip.hidden = true
  ui.artifactStrip.hidden = true
  ui.returnLobby.disabled = false
  ui.returnLobby.hidden = false
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
  const snapshot = snapshotMeta(metaProgress)
  const offers = offerPerks(seed, snapshot.pool)
  const marks = markMetaOffers(metaProgress, offers)
  if (marks.progress !== metaProgress) {
    metaProgress = marks.progress
    writeMetaProgress(metaProgress)
  }
  const begin = (event: MouseEvent, perk: StartPerk, parity?: Parity) => {
    if (event.isTrusted) sound.activate()
    ascent = beginMapAscent(seed, perk, parity, CURRENT_MAP_RULES, snapshot)
    presenceRun = null
    rememberUnlockCue(presenceKey, '')
    firstRun.start(seed)
    saveCurrent()
    render()
    focusPhase()
  }
  const buttons = offers.map((perk) => {
    const card = START_PERK_CARDS[perk]
    const { icon: symbol } = card
    const button = perkButton(symbol, perkDisplayName(perk, true), perkText(perk, true))
    if ('value' in card) button.querySelector('.perk-name')!.insertAdjacentHTML('afterend', `<span class="meta-perk-value">${card.value}</span>`)
    if (marks.fresh.some((id) => id === perk)) {
      button.querySelector('.perk-name')!.insertAdjacentHTML('beforeend', '<small class="meta-new">새</small>')
      button.setAttribute('aria-label', `새 특전 · ${button.getAttribute('aria-label')}`)
    }
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
  if (ui.guide.open || exchangeBusy || stopDiceMotion || !ascent || !indices.length || ascent.battle.phase !== 'assign' ||
    ascent.battle.loot?.hourglass || ascent.battle.loot?.reserveRoll) return
  const slot = zone === 'pool' ? null : zone
  const before = ascent.battle
  let battle = before
  for (const index of indices) if (canPlaceMetaDie(battle, index, slot)) battle = assignDie(battle, index, slot)
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
  else if (ascent.battle.loot?.hourglass || ascent.battle.loot?.reserveRoll || ascent.battle.loot?.counter) ui.treasureControls.querySelector('button')?.focus()
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
  if (rerolled.battle.loot?.reserveRoll) ui.treasureControls.querySelector('button')?.focus()
  else diceButtons[rerolled.focusIndex].focus()
}

ui.reroll.addEventListener('click', () => useReroll(false))
ui.extraReroll.addEventListener('click', () => {
  if (ui.extraReroll.classList.contains('unlock-hint')) showUnlockConditions('straight')
  else useReroll(true)
})
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
  if (choice === 'keep-artifacts') {
    feel.pulse(ui.runCoins)
    sound.play('pay')
  } else if (choice !== 'skip') {
    const paid = (previous.route?.coins ?? 0) - (ascent.route?.coins ?? 0)
    if (paid > 0) {
      feel.pulse(ui.runCoins)
      sound.play('pay')
    }
    if (isArtifact(choice) && next.battle.loot?.equipped.includes(choice)) {
      const node = feel.layer(seat, 'socket', itemIcon(REWARD_CARDS[replacement ?? choice].icon))
      const latch = () => {
        node.innerHTML = itemIcon(REWARD_CARDS[choice].icon)
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
ui.skipReward.addEventListener('click', () => claimReward(ascent && canKeepEliteArtifacts(ascent) ? 'keep-artifacts' : 'skip'))
function lockExchange(locked: boolean) {
  exchangeBusy = locked
  ui.planning.inert = locked
  ui.treasureControls.inert = locked
  ui.rewardStrip.inert = locked
  ui.artifactStrip.inert = locked
  ui.bossRelicSlot.inert = locked
  if (!locked) return
  ui.resolve.disabled = true
  ui.help.disabled = true
  ui.battleSettings.disabled = true
  ui.returnLobby.disabled = true
}

async function showEgoPlacement(ego: NonNullable<Exchange['ego']>) {
  const { slot, face } = ego
  const center = (element: HTMLElement) => {
    const { x, y, width, height } = element.getBoundingClientRect()
    return { x: x + width / 2, y: y + height / 2 }
  }
  const origin = center(egoHover)
  const target = slot === 'rest' ? origin : center(ui.dice[slot].querySelector<HTMLElement>('.die-seat:not([hidden])') ?? ui.assign[slot])
  const label = { attack: '공격', guard: '방어', rest: '쉼' }[slot]
  const motion = !reducedMotion()
  const { x, y } = motion ? origin : target
  egoHover.hidden = true
  egoPlacement.dataset.slot = slot
  egoPlacement.style.left = `${x}px`
  egoPlacement.style.top = `${y}px`
  egoPlacement.innerHTML = `<strong>${face}</strong><small>에고 → ${label}</small>`
  egoPlacement.hidden = false
  sound.play('hum', 1, .065)
  if (motion) {
    const dx = target.x - origin.x
    const dy = target.y - origin.y
    egoPlacement.animate([
      { transform: 'translate(0, 0) rotate(-15deg)' },
      { transform: `translate(${dx * .46}px, ${dy * .46 - 26}px) rotate(13deg)`, offset: .46 },
      { transform: `translate(${dx}px, ${dy}px) rotate(0)` },
    ], { duration: effectDuration(400), easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'forwards' })
  }
  await wait(motion ? 400 : 130)
  egoPlacement.hidden = true
}

async function showUnlockAwakening(hand: Hand) {
  window.clearTimeout(presenceTimer)
  unlockDiscovery.hidden = true
  showCompanionLine(egoPresence, hand === 'triple' ? COMPANION_LINES.awaken : '…그 눈이면.')
  ui.encounter.dataset.egoPresence = hand
  if (hand === 'triple') {
    egoHover.hidden = false
    egoAwakeningNote.hidden = false
    egoHover.dataset.awakening = ''
    if (!reducedMotion()) {
      egoHover.animate([{ transform: 'translateY(-42px) rotate(-14deg)', opacity: .2 },
        { transform: 'translateY(2px) rotate(4deg)', offset: .76 },
        { transform: 'none', opacity: 1 }], { duration: effectDuration(420), easing: 'ease-out' })
    }
  }
  await wait(hand === 'triple' ? 1000 : reducedMotion() ? 275 : 530)
  egoAwakeningNote.hidden = true
  delete egoHover.dataset.awakening
  delete ui.encounter.dataset.egoPresence
  egoPresence.hidden = true
}

ui.resolve.addEventListener('click', async () => {
  if (ui.guide.open || exchangeBusy || !ascent) return
  const previous = ascent
  const before = ascent.battle
  const resolved = resolveAscentTurn(ascent)
  if (resolved === ascent) return
  window.clearTimeout(discoveryTimer)
  unlockDiscovery.hidden = true
  itemControl = undefined
  dockItem = undefined
  let next = resolved
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
  const { phase, lastExchange } = resolved.battle
  try {
    if (lastExchange?.ego) await showEgoPlacement(lastExchange.ego)
    next = firstRun.opening(noteMetaVictory(resolved), before.turn)
    ascent = next
    saveCurrent()
    if (lastExchange) await showExchange(before, next.battle, lastExchange)
    if (phase !== 'lost' && (next.battle.turn !== before.turn || next.newUnlock)) {
      await arena.finishExchange()
      clearDamage(Boolean(next.newUnlock) && reducedMotion())
    }
    if (phase === 'lost') {
      if (!reducedMotion()) await wait(240)
      clearExchange()
    } else if (next.newUnlock) {
      if (next.newUnlock === 'triple') {
        feel.animate(ui.lockedDie, [{ boxShadow: 'inset 0 -2px #c4b48b' }, { boxShadow: 'inset 0 -8px #ffe7ab, 0 4px 9px #a49579' }], 220)
        sound.play('rise')
      }
      if (before.itemsSeven) {
        await showUnlockAwakening(next.newUnlock)
      } else if (next.newUnlock === 'triple' && !reducedMotion()) {
        ui.unlockImpact.hidden = false
        arena.freeze(unlockImpactDuration)
        await wait(unlockImpactDuration)
        ui.unlockImpact.hidden = true
      } else if (lastExchange && (lastExchange.dealt || lastExchange.escortDealt || lastExchange.hitsTaken.some(Boolean))) {
        await wait(250)
      }
      clearDamage()
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
    egoPlacement.hidden = true
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
  if (ascent?.battle.phase === 'counter' && !ascent.battle.loot?.counter && settings.automaticCounter) void playCounter()
  else focusPhase()
}

async function playCounter(choice?: CounterChoice) {
  if (ui.guide.open || exchangeBusy || !ascent || ascent.battle.phase !== 'counter' || roulette.busy || (!choice && ascent.battle.loot?.counter)) return
  const previous = ascent
  const spun = spinAscentCounter(ascent, choice)
  if (spun === ascent) return
  const before = previous.battle
  let checkpoint = firstRun.opening(spun, before.turn)
  const next = checkpoint.battle
  const pending = next.loot?.counter
  const reward = pending ? { ...pending, damage: counterDamage(before, pending.damage) } : next.lastExchange?.counter
  if (!reward) return
  firstRun.clear()
  let committed = false
  const commit = () => {
    if (committed) return
    checkpoint = noteMetaVictory(checkpoint)
    saveCurrent(checkpoint)
    committed = true
  }

  try {
    await roulette.play(() => presentCounter(previous, checkpoint, reward, commit, choice))
  } catch (error) {
    console.error('반격 연출을 완료하지 못했습니다.', error)
    ui.companionFlight.hidden = true
    roulette.setVisible(null)
    clearExchange()
  } finally {
    commit()
    ascent = checkpoint
    render('normal', !pending && next.phase === 'assign')
    if (!pending) {
      if (next.turn !== before.turn && !ui.planning.hidden) turnCues(before, true)
      finishCues(previous, checkpoint)
    }
    focusPhase()
  }
}

async function presentCounter(previous: Ascent, checkpoint: Ascent, reward: CounterResult, commit: () => void, choice?: CounterChoice) {
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
  if (!choice || choice === 'coin') {
    element('counter-comparison').hidden = true
    sound.play('roulette-engage', 1, .26)
    const angle = settings.automaticCounter ? 0 : await roulette.waitForStop(animate, animationSpeed())
    if (animate) sound.play('roulette-ratchet', animationSpeed(), .23)
    const recast = choice === 'coin' ? yachtCounterSlot(before, true) : undefined
    const landed = recast === undefined ? reward : { slot: recast, ...displayedCounterRewards(before)[recast] }
    await roulette.reveal(landed, animate, () => {}, animationSpeed() * 1.24, angle)
    sound.play('roulette-latch', 1, .37)
    commit()
    await wait(520)
    if (landed.slot !== reward.slot) await roulette.reveal(reward, false, () => {})
  } else commit()
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
    arena.contact([hit], { joint: companionJoint })
    showDamage(hit)
    updateEscortVital(next.escort?.hp ?? 0)
    weaponContact(hit, false, companionJoint ? 1.32 : 1)
    if (dealt && animate) await wait(70)
  }
  if (dealt > 0) {
    const hit = { target: 'enemy', damage: dealt, defeated: next.enemyHp === 0 } as const
    if (choreographed) arena.landGolemCounter()
    else arena.contact([hit], { joint: companionJoint })
    showDamage(hit)
    if (choreographed) ui.feedback.textContent = `반격 피해 ${dealt}`
    if (choreographed && !hit.defeated) sound.play('stone-hit', .80, .31)
    else weaponContact(hit, false, companionJoint ? 1.32 : 1)
  }
  updateVital(ui.enemyHp, ui.enemyTotal, next.enemyHp)
  if (next.lastExchange?.crownTriggered) sound.play('latch', .66)
  if (next.phase === 'won' && next.playerHp > before.playerHp) {
    sound.play('unlock', .72)
    updatePlayerVital(next.playerHp)
    markVital(ui.playerHp.closest<HTMLElement>('.vital')!)
  }
  if (!ui.companionFlight.hidden) {
    await wait(companionFlightDuration - companionImpactTime)
    ui.companionFlight.hidden = true
  }
  await wait(next.enemyHp === 0 && !reducedMotion() ? fracture.end : choreographed ? GOLEM_COUNTER.end - GOLEM_COUNTER.contact : reducedMotion() || !(dealt || escortDealt) ? 320 : damageDuration)
  if (choreographed) clearExchange()
  arena.finishStrike()
}
function operateCounter() {
  if (!roulette.requestStop() && !ui.counter.hidden && !ui.counter.disabled) void playCounter()
}
ui.counter.addEventListener('click', operateCounter)
ui.counterPanel.querySelector('.roulette-stage')?.addEventListener('click', operateCounter)

const roomCover = element('room-transition')
const roomFloor = element('room-floor')
async function transitionToBattle(scene: HTMLElement, entrance: HTMLElement, show: () => void, ready: () => void, floor?: number) {
  if (!roomCover.hidden) return
  const reduced = reducedMotion()
  const approachMs = reduced ? 65 : 205
  const revealMs = reduced ? 85 : 180
  const bounds = scene.getBoundingClientRect()
  const door = entrance.getBoundingClientRect()
  const x = (bounds.left + bounds.width / 2 - door.left - door.width / 2) * .22
  const y = (bounds.top + bounds.height / 2 - door.top - door.height / 2) * .22
  ui.main.inert = true
  if (floor !== undefined) ui.fork.setAttribute('data-entering', '')
  roomCover.hidden = false
  const approach = reduced ? undefined : scene.animate([
    { transform: 'none' }, { transform: `translate(${x}px, ${y}px) scale(1.22)` },
  ], { duration: approachMs, easing: 'ease-in', fill: 'forwards' })
  const darken = roomCover.animate([{ opacity: 0 }, { opacity: 1 }], { duration: approachMs, easing: 'ease-in', fill: 'forwards' })
  try {
    await darken.finished.catch(() => {})
    if (floor !== undefined) {
      const region = ascent?.battle.itemsSeven ? towerRegion(floor) : undefined
      roomFloor.classList.toggle('room-floor-region', Boolean(region))
      roomFloor.textContent = region ? `${floor}층 — ${region.name}` : `${floor}층`
      roomFloor.hidden = false
      const floorTitle = roomFloor.animate([{ opacity: .7 }, { offset: .2, opacity: 1 }, { opacity: 1 }],
        { duration: region ? reduced ? 380 : 620 : reduced ? 70 : 95 })
      await floorTitle.finished.catch(() => {})
      roomFloor.hidden = true
    }
    show()
    const reveal = roomCover.animate([{ opacity: 1 }, { opacity: 0 }], { duration: revealMs, easing: 'ease-out', fill: 'forwards' })
    darken.cancel()
    await reveal.finished.catch(() => {})
    reveal.cancel()
  } finally {
    approach?.cancel()
    darken.cancel()
    roomCover.hidden = true
    roomFloor.hidden = true
    ui.fork.removeAttribute('data-entering')
    ui.main.inert = false
  }
  ready()
}

function enterFork(id: number) {
  if (!roomCover.hidden || ui.guide.open || exchangeBusy || ascent?.route?.screen !== 'map') return
  const next = enterMapNode(ascent, id)
  if (next === ascent) return
  resetPresentation()
  ascent = firstRun.opening(noteMetaStage(next, next.route!.map.byId[id].floor))
  saveCurrent()
  sound.play('step')
  const room = ui.fork.querySelector<HTMLElement>('.fork-room')!
  const entrance = room.querySelector<HTMLElement>(`[data-node="${id}"] .fork-art`)
  if (next.route && entrance && (next.route.screen === 'battle' || next.battle.itemsSeven)) {
    void transitionToBattle(room, entrance, showEnteredRoom, focusPhase, next.route.map.byId[id].floor)
  } else {
    showEnteredRoom()
    focusPhase()
  }
}

function showEnteredRoom() {
  render('normal', true)
  const floor = ui.encounter.hidden ? ui.rewardHeading : ui.encounter
  const ground = floor.getBoundingClientRect()
  const dust = feel.layer(new DOMRect(ground.x + (ui.encounter.hidden ? ground.width / 2 : parseFloat(ui.encounter.style.getPropertyValue('--player-x')) || ground.width / 3),
    ground.y + (ui.encounter.hidden ? ground.height : parseFloat(ui.encounter.style.getPropertyValue('--ground')) || ground.height * .6), 14, 3), 'footstep')
  feel.animate(dust, [{ opacity: .8 }, { transform: 'scaleX(1.4)', opacity: 0 }], 96, () => feel.release(dust))
  if (ascent?.route?.screen === 'rest') {
    const ember = ui.rewardHeading.querySelector<HTMLElement>('.rest-ember')
    sound.play('ember')
    if (ember) feel.animate(ember, [{ transform: 'scale(.7)' }, { transform: 'scale(1.22)' }, { transform: 'none' }], 180)
  }
  turnCues(undefined, false)
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
  if (!roomCover.hidden) return
  const checkpoint = loadAscentSave()
  if (!checkpoint) {
    showLobby(true)
    return
  }
  const resumed = resumeMetaRun(checkpoint.ascent, metaProgress)
  if (resumed.progress !== metaProgress) {
    metaProgress = resumed.progress
    writeMetaProgress(metaProgress)
  }
  ascent = returnToMap(resumed.run)
  chosenReward = checkpoint.rewardPreview
  artifactOptions = checkpoint.artifactOptions ?? {}
  selected.clear()
  for (const index of checkpoint.selected) selected.add(index)
  if (event.isTrusted) sound.activate()
  if (ascent.route?.screen === 'battle' || (!ascent.route && ascent.battle.phase !== 'won')) {
    void transitionToBattle(ui.lobby.querySelector<HTMLElement>('.lobby-scene')!, ui.continueAscent, () => render(), resumeCounterOrFocus)
  } else {
    render()
    resumeCounterOrFocus()
  }
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
      confirmLobbyAction('로비로 가겠습니까?', '결과 화면을 닫습니다.', '나가기', () => showLobby(true))
    } else {
      confirmLobbyAction('저장하고 나가겠습니까?', '로비에서 이어할 수 있습니다.', '저장하고 나가기', () => {
        saveCurrent()
        showLobby(true)
      })
    }
  }
}
ui.returnLobby.addEventListener('click', returnToLobby)
ui.defeatLobby.addEventListener('click', returnToLobby)
window.addEventListener('storage', (event) => {
  if (event.key === META_SAVE_KEY || event.key === null) {
    metaProgress = loadMetaProgress()
    refreshMetaCount()
    if (ui.guide.open && !metaGuide.hidden) showGuideTab('meta')
  }
  if ((event.key === ASCENT_SAVE_KEY || event.key === null) && !ui.lobby.hidden) refreshLobbyActions()
})
renderSettings()
showLobby()
