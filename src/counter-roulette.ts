import { COUNTER_REWARDS } from './combat.ts'
import type { CounterResult } from './combat.ts'

const degreesPerSlot = 360 / COUNTER_REWARDS.length

export class CounterRoulette {
  private readonly wheel: HTMLElement
  private readonly result: HTMLElement
  private readonly title: HTMLElement
  private readonly damage: HTMLElement
  private readonly labels: HTMLElement[]

  constructor(private readonly panel: HTMLElement, private readonly button: HTMLButtonElement) {
    this.wheel = panel.querySelector<HTMLElement>('#counter-wheel')!
    this.result = panel.querySelector<HTMLElement>('#counter-result')!
    this.title = panel.querySelector<HTMLElement>('#counter-title')!
    this.damage = panel.querySelector<HTMLElement>('#counter-damage')!

    this.labels = COUNTER_REWARDS.map((reward, index) => {
      const position = index * degreesPerSlot * Math.PI / 180
      const label = document.createElement('div')
      label.className = 'roulette-label'
      label.style.left = `${50 + Math.sin(position) * 34}%`
      label.style.top = `${50 - Math.cos(position) * 34}%`

      const text = document.createElement('span')
      text.textContent = reward.joint ? `${reward.damage}\n합공` : String(reward.damage)
      label.append(text)
      this.wheel.append(label)
      return label
    })
  }

  setVisible(visible: boolean) {
    if (visible && this.panel.hidden) {
      this.wheel.style.transform = ''
      this.wheel.style.removeProperty('--label-turn')
      this.result.hidden = true
      this.result.classList.remove('joint')
      this.title.textContent = ''
      this.damage.textContent = ''
      this.labels.forEach((label) => label.classList.remove('winner'))
      this.button.hidden = false
      this.button.disabled = false
      this.button.textContent = '반격 룰렛 돌리기'
    }
    this.panel.hidden = !visible
  }

  async reveal(reward: CounterResult, animate: boolean) {
    this.button.disabled = true
    this.button.textContent = '룰렛 도는 중…'
    const angle = 1080 + (360 - reward.slot * degreesPerSlot) % 360
    const rotate = `rotate(${angle}deg)`
    if (animate) {
      const spin = this.wheel.animate(
        [{ transform: 'rotate(0deg)' }, { transform: rotate }],
        { duration: 920, easing: 'cubic-bezier(.15,.65,.22,1)' },
      )
      try {
        await spin.finished
      } catch {
        // If the animation is interrupted, still reveal the already drawn reward.
      }
    }

    this.wheel.style.transform = rotate
    this.wheel.style.setProperty('--label-turn', `${-angle}deg`)
    this.labels[reward.slot].classList.add('winner')
    this.button.hidden = true
    this.result.hidden = false
    this.result.classList.toggle('joint', reward.joint)
    this.title.textContent = reward.joint ? '마타이오스와 합공' : '반격'
    this.damage.textContent = `${reward.damage} 피해`
  }
}
