import type { CounterResult, CounterReward } from './combat.ts'

export class CounterRoulette {
  private readonly panel: HTMLElement
  private readonly button: HTMLButtonElement
  private readonly wheel: HTMLElement
  private readonly result: HTMLElement
  private readonly damage: HTMLElement
  private readonly stage: HTMLElement
  private readonly action: HTMLElement
  private readonly medallion: HTMLElement
  private labels: HTMLElement[] = []
  private degreesPerSlot = 0
  private spin?: Animation
  private companionAwake = false
  private playing = false

  constructor(panel: HTMLElement, button: HTMLButtonElement) {
    this.panel = panel
    this.button = button
    this.wheel = panel.querySelector<HTMLElement>('#counter-wheel')!
    this.result = panel.querySelector<HTMLElement>('#counter-result')!
    this.damage = panel.querySelector<HTMLElement>('#counter-damage')!
    this.stage = panel.querySelector<HTMLElement>('.roulette-stage')!
    this.action = button.querySelector<HTMLElement>('#counter-action')!
    this.medallion = panel.querySelector<HTMLElement>('#counter-medallion')!
  }

  get busy() { return this.playing }

  async play(present: () => Promise<void>) {
    if (this.playing) return
    this.playing = true
    try {
      await present()
    } finally {
      this.playing = false
    }
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
        label.classList.toggle('locked', !this.companionAwake)
        const icon = this.companionAwake ? 'joint' : 'lock'
        text.insertAdjacentHTML('beforeend', `<svg class="icon" aria-hidden="true"><use href="#icon-${icon}"/></svg>`)
      }
      label.append(text)
      return label
    })
    this.wheel.replaceChildren(...this.labels)
    this.paintSegments()
    const labels = rewards.map(({ damage, joint }) => joint
      ? `피해 ${damage}${this.companionAwake ? ' 합공' : ', 합공 동작 잠김'}` : String(damage))
    this.stage.setAttribute('aria-label', `반격 피해 ${labels.join(', ')}`)
  }

  private paintSegments(winner?: number) {
    const segments = this.labels.map((_, index) => {
      const start = index * this.degreesPerSlot
      const end = start + this.degreesPerSlot
      const shade = index === winner ? 'var(--wheel-winner, var(--rust))'
        : index % 2 === 0 ? 'var(--wheel-face, var(--stone-bed))' : 'var(--wheel-inset, var(--stone-bed))'
      return `var(--wheel-divider, var(--stone-edge)) ${start - 0.45}deg ${start + 0.45}deg, ${shade} ${start + 0.45}deg ${end - 0.45}deg`
    })
    this.wheel.style.backgroundImage = `conic-gradient(from -${this.degreesPerSlot / 2}deg, ${segments.join(', ')}, var(--wheel-divider, var(--stone-edge)) 359.55deg)`
  }

  setVisible(rewards: readonly CounterReward[] | null, companionAwake = false) {
    this.companionAwake = companionAwake
    if (rewards && this.panel.hidden) {
      this.setRewards(rewards)
      this.wheel.style.transform = ''
      this.wheel.style.removeProperty('--label-turn')
      this.result.hidden = true
      this.damage.textContent = ''
      this.medallion.textContent = ''
      delete this.panel.dataset.rollState
      this.button.hidden = false
      this.button.disabled = false
      this.action.textContent = '반격 룰렛'
    }
    this.panel.hidden = !rewards
  }

  finishMotion() {
    this.spin?.finish()
  }

  async reveal(reward: CounterResult, animate: boolean, onTick: () => void, speed = 1) {
    this.button.disabled = true
    this.action.textContent = '회전 중'
    const onField = this.panel.classList.contains('counter-over-field')
    const angle = 1080 + (360 - reward.slot * this.degreesPerSlot) % 360
    const rotate = `rotate(${angle}deg)`
    if (animate) {
      this.panel.dataset.rollState = 'spinning'
      const spin = this.wheel.animate(
        [{ transform: 'rotate(0deg)' }, { transform: rotate }],
        { duration: 920 / speed, easing: 'cubic-bezier(.15,.65,.22,1)' },
      )
      this.spin = spin
      let frame = 0
      let lastSlot = 0
      let lastTick = -Infinity
      const tick = (now: number) => {
        const progress = spin.effect?.getComputedTiming().progress ?? 0
        const slot = Math.floor(angle * progress / this.degreesPerSlot + .5)
        if (slot !== lastSlot && now - lastTick >= 65) {
          onTick()
          lastTick = now
        }
        lastSlot = slot
        frame = requestAnimationFrame(tick)
      }
      if (!onField) frame = requestAnimationFrame(tick)
      try {
        await spin.finished
      } catch {
        // 회전이 중단돼도 이미 뽑은 결과를 표시한다.
      } finally {
        cancelAnimationFrame(frame)
        this.spin = undefined
      }
    }

    this.wheel.style.transform = rotate
    this.wheel.style.setProperty('--label-turn', `${-angle}deg`)
    this.labels[reward.slot].classList.add('winner')
    this.paintSegments(reward.slot)
    this.button.hidden = true
    this.result.hidden = false
    if (animate) this.panel.querySelector('.roulette-pointer')?.animate(
      [{ rotate: '-9deg' }, { rotate: '4deg' }, { rotate: '0deg' }], { duration: 95 / speed })

    const joint = reward.joint && this.companionAwake
    this.result.querySelector('use')!.setAttribute('href', joint ? '#icon-joint' : '#icon-sword')
    this.result.setAttribute('aria-label', `${joint ? '합공' : '반격'} 피해 ${reward.damage}`)
    this.damage.textContent = String(reward.damage)
    this.medallion.textContent = String(reward.damage)
    this.panel.dataset.rollState = 'locked'
  }
}
