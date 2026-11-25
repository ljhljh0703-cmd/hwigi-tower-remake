interface RollDie {
  button: HTMLButtonElement
  face: number
  ego: boolean
}

const rollMs = 664
const resultMs = 300
const suctionMs = 118
const rollStep = 24
const suctionDelays = [0, 8, 3, 11]
const leans = [10, -7, 8, -11]

function transform(x: number, y: number, angle: number, sx = 1, sy = sx) {
  return 'translate(' + x + 'px,' + y + 'px) rotate(' + angle + 'deg) scale(' + sx + ',' + sy + ')'
}

function pose(offset: number, x: number, y: number, angle: number, sx = 1, sy = sx, easing = 'linear'): Keyframe {
  return { offset, transform: transform(x, y, angle, sx, sy), easing }
}

function rollPath(x: number, y: number, reach: number): Keyframe[] {
  return [
    { ...pose(0, x - 12, y - reach, -103, .72, .72, 'ease-out'), opacity: 0 },
    { ...pose(.12, x - 10, y - reach + 1, 17, .79), opacity: 1 },
    pose(.28, x - 8, y - reach * .73, 164, .85, .85, 'ease-in'),
    pose(.45, x - 4, y - 3, 322, 1.05, .92),
    pose(.5, x - 4, y - 3, 322, 1.05, .92, 'ease-out'),
    pose(.62, x - 2, y - 18, 452, .92, .92, 'ease-in'),
    pose(.76, x, y - 4, 580, 1.03, .94, 'ease-out'),
    pose(.87, x, y - 8, 657, .97, .97, 'ease-in'),
    pose(.96, x, y, 703, .99, .99, 'ease-out'),
    pose(1, x, y, 720),
  ]
}

function suctionPath(x: number, y: number, dy: number, lean: number): Keyframe[] {
  const drop = dy - y
  return [
    pose(0, x, y, 0, 1, 1, 'cubic-bezier(.48,0,.79,.67)'),
    pose(.22, x + lean * .45, y + drop * .1, lean * .52, .98, 1.02, 'cubic-bezier(.49,0,.79,.59)'),
    pose(.65, x + lean, y + drop * .7, lean, .71, 1.24, 'cubic-bezier(.27,0,.52,1)'),
    pose(.87, x, dy + 1, 0, .86, .81, 'ease-out'),
    pose(1, x, dy, 0),
  ]
}

function effect(className: string) {
  const element = document.createElement('span')
  element.className = className
  return element
}

function movingDie(kind: 'dice-tumble' | 'dice-echo', ego: boolean) {
  const wrapper = effect(kind)
  const face = effect(ego ? 'die-face ego-face' : 'die-face')
  wrapper.append(face)
  return { wrapper, face }
}

export function playDiceMotion(encounter: HTMLElement, dice: readonly RollDie[], done: () => void) {
  const scene = encounter.getBoundingClientRect()
  const destinations = dice.map(({ button }) => button.getBoundingClientRect())
  if (!dice.length || !scene.height || destinations.some(({ width }) => !width)) return

  const layer = effect('dice-motion')
  layer.setAttribute('aria-hidden', 'true')
  encounter.append(layer)
  const controller = new AbortController()
  const { signal } = controller
  const timers: number[] = []
  const tracks: Animation[] = []
  const clock = document.timeline.currentTime
  const arrivals = rollMs + (dice.length - 1) * rollStep + resultMs
  // The result row sits below the health cards, across the bottom edge of the arena.
  const y = scene.height
  const reach = Math.min(68, scene.height * .47)

  function run(target: HTMLElement, frames: Keyframe[], duration: number, delay: number, fill: FillMode) {
    const animation = target.animate(frames, { duration, delay, fill })
    animation.startTime = clock
    tracks.push(animation)
    return animation
  }

  function cleanUp() {
    if (signal.aborted) return
    controller.abort()
    for (const timer of timers) window.clearTimeout(timer)
    for (const animation of tracks) animation.cancel()
    layer.remove()
    for (const { button } of dice) button.classList.remove('die-arriving')
    done()
  }

  const finished = dice.map(({ button, face: value, ego }, index) => {
    const slot = destinations[index]
    const x = slot.left - scene.left + slot.width / 2
    const dy = slot.top - scene.top + slot.height / 2
    const delay = index * rollStep
    const arrive = arrivals + suctionDelays[index]
    const { wrapper, face } = movingDie('dice-tumble', ego)
    const shadow = effect('dice-roll-shadow')
    shadow.style.left = x + 'px'
    shadow.style.top = (y + 22) + 'px'
    layer.append(shadow, wrapper)
    button.classList.add('die-arriving')

    face.textContent = String((value + index) % 6 + 1)
    for (const [step, time] of [92, 177, 276, 386, 489, 610].entries()) {
      const shown = step === 5 ? value : (value + index + step + 2) % 6 + 1
      timers.push(window.setTimeout(() => { face.textContent = String(shown) }, delay + time))
    }
    run(wrapper, rollPath(x, y, reach), rollMs, delay, 'both')
    run(shadow, [
      { offset: 0, opacity: .12, transform: 'scaleX(.56)' },
      { offset: .45, opacity: .82, transform: 'scaleX(1.1)' },
      { offset: .62, opacity: .42, transform: 'scaleX(.72)' },
      { offset: .76, opacity: .78, transform: 'scaleX(1)' },
      { offset: .87, opacity: .62, transform: 'scaleX(.86)' },
      { offset: 1, opacity: .78, transform: 'scaleX(1)' },
    ], rollMs, delay, 'both')
    run(shadow, [{ opacity: .78 }, { opacity: 0 }], 48, arrive, 'forwards')
    for (const [contact, dx, dy, strength, duration] of [[.45, -5, 22, .84, 156], [.76, 4, 23, .47, 129]]) {
      const dust = effect('dice-roll-dust')
      dust.style.left = (x + dx) + 'px'
      dust.style.top = (y + dy) + 'px'
      layer.append(dust)
      run(dust, [
        { opacity: strength, transform: 'translateY(0) scale(.72)' },
        { opacity: 0, transform: 'translateY(-8px) scale(1.35)' },
      ], duration, Math.round(rollMs * contact) + delay, 'none')
    }

    const path = suctionPath(x, y, dy, leans[index])
    for (const [lag, strength] of [[32, .27], [16, .48]]) {
      const echo = movingDie('dice-echo', ego)
      layer.insertBefore(echo.wrapper, wrapper)
      const opacity = [0, strength * .58, strength, 0, 0]
      run(echo.wrapper, path.map((frame, i) => ({ ...frame, opacity: opacity[i] })), suctionMs, arrive + lag, 'both')
    }
    // The delayed track takes over the held roll pose only when suction starts.
    return run(wrapper, path, suctionMs, arrive, 'forwards').finished
  })
  void Promise.all(finished).then(cleanUp, cleanUp)

  window.addEventListener('resize', cleanUp, { signal })
  window.visualViewport?.addEventListener('resize', cleanUp, { signal })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cleanUp()
  }, { signal })
  return cleanUp
}
