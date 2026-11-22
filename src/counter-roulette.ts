import type { CounterResult, CounterReward } from './combat.ts'

const shades = ['#383838', '#464646', '#383838', '#464646', '#595959', '#4b4b4b', '#464646']

export class CounterRoulette {
  private readonly wheel: HTMLElement
  private readonly result: HTMLElement
  private readonly damage: HTMLElement
  private readonly stage: HTMLElement
  private labels: HTMLElement[] = []
  private degreesPerSlot = 0

  constructor(private readonly panel: HTMLElement, private readonly button: HTMLButtonElement) {
    this.wheel = panel.querySelector<HTMLElement>('#counter-wheel')!
    this.result = panel.querySelector<HTMLElement>('#counter-result')!
    this.damage = panel.querySelector<HTMLElement>('#counter-damage')!
    this.stage = panel.querySelector<HTMLElement>('.roulette-stage')!
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
      text.textContent = reward.joint ? `${reward.damage}\n⚔︎⚔︎` : String(reward.damage)
      label.append(text)
      return label
    })
    this.wheel.replaceChildren(...this.labels)
    const segments = rewards.map((_, index) =>
      `${shades[index % shades.length]} ${index * this.degreesPerSlot}deg ${(index + 1) * this.degreesPerSlot}deg`,
    )
    this.wheel.style.background = `conic-gradient(from -${this.degreesPerSlot / 2}deg, ${segments.join(', ')})`
    const labels = rewards.map(({ damage, joint }) => joint ? `합공 ${damage}` : String(damage))
    this.stage.setAttribute('aria-label', `반격 피해 ${labels.join(', ')}`)
  }

  setVisible(rewards: readonly CounterReward[] | null) {
    if (rewards && this.panel.hidden) {
      this.setRewards(rewards)
      this.wheel.style.transform = ''
      this.wheel.style.removeProperty('--label-turn')
      this.result.hidden = true
      this.result.classList.remove('joint')
      this.damage.textContent = ''
      this.button.hidden = false
      this.button.disabled = false
      this.button.textContent = '반격 룰렛 돌리기'
    }
    this.panel.hidden = !rewards
  }

  async reveal(reward: CounterResult, animate: boolean) {
    this.button.disabled = true
    this.button.textContent = '룰렛 도는 중…'
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
    this.button.hidden = true
    this.result.hidden = false
    this.result.classList.toggle('joint', reward.joint)
    this.damage.textContent = `${reward.joint ? '⚔︎⚔︎' : '◎'} ${reward.damage}`
  }
}
