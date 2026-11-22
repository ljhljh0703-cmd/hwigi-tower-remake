import type { CounterResult, CounterReward } from './combat.ts'

export class CounterRoulette {
  private readonly wheel: HTMLElement
  private readonly result: HTMLElement
  private readonly damage: HTMLElement
  private readonly stage: HTMLElement
  private readonly action: HTMLElement
  private labels: HTMLElement[] = []
  private degreesPerSlot = 0

  constructor(private readonly panel: HTMLElement, private readonly button: HTMLButtonElement) {
    this.wheel = panel.querySelector<HTMLElement>('#counter-wheel')!
    this.result = panel.querySelector<HTMLElement>('#counter-result')!
    this.damage = panel.querySelector<HTMLElement>('#counter-damage')!
    this.stage = panel.querySelector<HTMLElement>('.roulette-stage')!
    this.action = button.querySelector<HTMLElement>('#counter-action')!
  }

  private setRewards(rewards: readonly CounterReward[]) {
    this.degreesPerSlot = 360 / rewards.length
    this.labels = rewards.map((reward, index) => {
      const position = index * this.degreesPerSlot * Math.PI / 180
      const label = document.createElement('div')
      label.className = 'roulette-label'
      label.style.left = `${50 + Math.sin(position) * 34}%`
      label.style.top = `${50 - Math.cos(position) * 34}%`

      const text = document.createElement('span')
      text.textContent = String(reward.damage)
      if (reward.joint) {
        text.insertAdjacentHTML('beforeend', '<svg class="icon" aria-hidden="true"><use href="#icon-joint"/></svg>')
      }
      label.append(text)
      return label
    })
    this.wheel.replaceChildren(...this.labels)
    this.paintSegments()
    const labels = rewards.map(({ damage, joint }) => joint ? `합공 ${damage}` : String(damage))
    this.stage.setAttribute('aria-label', `반격 피해 ${labels.join(', ')}`)
  }

  private paintSegments(winner?: number) {
    const segments = this.labels.map((_, index) => {
      const start = index * this.degreesPerSlot
      const end = start + this.degreesPerSlot
      const shade = index === winner ? 'var(--rust)' : 'var(--stone-bed)'
      return `var(--stone-edge) ${start - 0.45}deg ${start + 0.45}deg, ${shade} ${start + 0.45}deg ${end - 0.45}deg`
    })
    this.wheel.style.background = `conic-gradient(from -${this.degreesPerSlot / 2}deg, ${segments.join(', ')}, var(--stone-edge) 359.55deg)`
  }

  setVisible(rewards: readonly CounterReward[] | null) {
    if (rewards && this.panel.hidden) {
      this.setRewards(rewards)
      this.wheel.style.transform = ''
      this.wheel.style.removeProperty('--label-turn')
      this.result.hidden = true
      this.damage.textContent = ''
      this.button.hidden = false
      this.button.disabled = false
      this.action.textContent = '반격 룰렛'
    }
    this.panel.hidden = !rewards
  }

  async reveal(reward: CounterResult, animate: boolean) {
    this.button.disabled = true
    this.action.textContent = '회전 중'
    const angle = 1080 + (360 - reward.slot * this.degreesPerSlot) % 360
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
    this.paintSegments(reward.slot)
    this.button.hidden = true
    this.result.hidden = false
    this.result.querySelector('use')!.setAttribute('href', reward.joint ? '#icon-joint' : '#icon-sword')
    this.result.setAttribute('aria-label', `${reward.joint ? '합공' : '반격'} 피해 ${reward.damage}`)
    this.damage.textContent = String(reward.damage)
  }
}
