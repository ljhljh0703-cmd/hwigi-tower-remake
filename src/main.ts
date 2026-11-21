import Phaser from 'phaser'
import {
  ACTIONS, DEFAULT_SEED, ENEMY_HP, INTENTS, PLAYER_HP, startBattle, takeTurn,
} from './combat.ts'
import type { Action } from './combat.ts'
import './style.css'

const ui = {
  turn: document.querySelector<HTMLParagraphElement>('#turn')!,
  intent: document.querySelector<HTMLParagraphElement>('#intent')!,
  playerHp: document.querySelector<HTMLMeterElement>('#player-hp')!,
  enemyHp: document.querySelector<HTMLMeterElement>('#enemy-hp')!,
  playerTotal: document.querySelector<HTMLSpanElement>('#player-total')!,
  enemyTotal: document.querySelector<HTMLSpanElement>('#enemy-total')!,
  feedback: document.querySelector<HTMLParagraphElement>('#feedback')!,
  actions: document.querySelector<HTMLDivElement>('#actions')!,
  retry: document.querySelector<HTMLButtonElement>('#retry')!,
}

const seedParam = new URLSearchParams(window.location.search).get('seed')
const seed = seedParam && /^\d{1,10}$/.test(seedParam) && Number(seedParam) <= 0xffffffff
  ? Number(seedParam)
  : DEFAULT_SEED
let battle = startBattle(seed)

class Arena extends Phaser.Scene {
  private player?: Phaser.GameObjects.Rectangle
  private enemy?: Phaser.GameObjects.Rectangle

  create() {
    this.enemy = this.add.rectangle(180, 44, 64, 58, 0x838383).setStrokeStyle(1, 0xb3b3b3)
    this.player = this.add.rectangle(180, 137, 40, 42, 0xcecece)
    this.refresh()
  }

  refresh() {
    this.player?.setVisible(battle.playerHp > 0)
    this.enemy?.setVisible(battle.enemyHp > 0)
  }
}

const arena = new Arena()
new Phaser.Game({
  type: Phaser.CANVAS,
  backgroundColor: '#292929',
  parent: 'arena',
  width: 360,
  height: 170,
  scene: arena,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  audio: { noAudio: true },
})

function render() {
  const { playerHp, enemyHp, intent, turn, outcome, lastExchange } = battle
  const fighting = outcome === 'fighting'
  ui.turn.textContent = `${turn}턴`
  ui.intent.textContent = fighting
    ? `다음 수 · ${INTENTS[intent].label} ${INTENTS[intent].damage} 피해`
    : outcome === 'won' ? '승리' : `패배 · 적 체력 ${enemyHp} 남음`

  ui.playerHp.value = playerHp
  ui.enemyHp.value = enemyHp
  ui.playerTotal.textContent = `${playerHp}/${PLAYER_HP}`
  ui.enemyTotal.textContent = `${enemyHp}/${ENEMY_HP}`

  if (!lastExchange) {
    ui.feedback.textContent = '적의 다음 수를 보고 행동을 고르세요.'
  } else {
    const move = INTENTS[lastExchange.intent].label
    const result = `적에게 ${lastExchange.dealt} 피해 · 내가 ${lastExchange.taken} 피해`
    ui.feedback.textContent = fighting ? `${move}에 대응 · ${result}` : `${ui.intent.textContent} · ${result}`
  }

  ui.actions.hidden = !fighting
  ui.retry.hidden = fighting
  arena.refresh()
}

function choose(action: Action) {
  battle = takeTurn(battle, action)
  render()
  if (battle.outcome !== 'fighting') ui.retry.focus()
}

for (const action of ACTIONS) {
  document.querySelector<HTMLButtonElement>(`#${action}`)!.addEventListener('click', () => choose(action))
}
ui.retry.addEventListener('click', () => {
  battle = startBattle(seed)
  render()
  document.querySelector<HTMLButtonElement>('#attack')!.focus()
})
render()
