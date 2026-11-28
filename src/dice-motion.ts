interface RollDie {
  button: HTMLButtonElement
  face: number
  ego: boolean
}

interface Point {
  x: number
  y: number
}

interface PlacedDie extends RollDie {
  from: Point
}

type Animate = (target: HTMLElement, frames: Keyframe[], duration: number, delay: number, fill: FillMode) => Animation

const rollMs = 664
const resultMs = 300
const suctionMs = 118
const rollStep = 24
const suctionDelays = [0, 8, 3, 11]
const leans = [10, -7, 8, -11]
// Screen-space coordinates of the lowest corner of the rotating 44px face.
function groundContact(offset: number, dx: number, angle: number, sx: number, sy: number) {
  const radians = angle * Math.PI / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const cx = 22 * sx * Math.sign(sin)
  const cy = 22 * sy * Math.sign(cos)
  return { offset, dx, angle, sx, sy, centerY: 22 - (cx * sin + cy * cos), cornerX: dx + cx * cos - cy * sin }
}

const land = groundContact(.45, -4, 322, 1.05, .92)
const bounce = groundContact(.76, 0, 580, 1.03, .94)

function transform(x: number, y: number, angle: number, sx = 1, sy = sx) {
  return 'translate(' + x + 'px,' + y + 'px) rotate(' + angle + 'deg) scale(' + sx + ',' + sy + ')'
}

function pose(offset: number, x: number, y: number, angle: number, sx = 1, sy = sx, easing = 'linear'): Keyframe {
  return { offset, transform: transform(x, y, angle, sx, sy), easing }
}

function rollPath(x: number, y: number, reach: number): Keyframe[] {
  const contact = (c: typeof land, at = c.offset, easing = 'linear') =>
    pose(at, x + c.dx, y + c.centerY, c.angle, c.sx, c.sy, easing)
  return [
    { ...pose(0, x - 12, y - reach, -103, .72, .72, 'ease-out'), opacity: 0 },
    { ...pose(.12, x - 10, y - reach + 1, 17, .79), opacity: 1 },
    pose(.28, x - 8, y - reach * .73, 164, .85, .85, 'ease-in'),
    contact(land),
    contact(land, .5, 'ease-out'),
    pose(.62, x - 2, y - 23, 452, .92, .92, 'ease-in'),
    contact(bounce, bounce.offset, 'ease-out'),
    pose(.87, x, y - 8, 657, .97, .97, 'ease-in'),
    pose(.96, x, y, 703, .99, .99, 'ease-out'),
    pose(1, x, y, 720),
  ]
}

function suctionPath({ x, y }: Point, to: Point, lean: number): Keyframe[] {
  const dx = to.x - x
  const dy = to.y - y
  return [
    pose(0, x, y, 0, 1, 1, 'cubic-bezier(.48,0,.79,.67)'),
    pose(.22, x + dx * .1 + lean * .45, y + dy * .1, lean * .52, .98, 1.02, 'cubic-bezier(.49,0,.79,.59)'),
    pose(.65, x + dx * .7 + lean, y + dy * .7, lean, .71, 1.24, 'cubic-bezier(.27,0,.52,1)'),
    pose(.87, to.x, to.y + 1, 0, .86, .81, 'ease-out'),
    pose(1, to.x, to.y, 0),
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

function playSuction(wrapper: HTMLElement, ego: boolean, path: Keyframe[], delay: number, run: Animate, fill: FillMode = 'forwards') {
  for (const [lag, strength] of [[32, .27], [16, .48]]) {
    const echo = movingDie('dice-echo', ego)
    wrapper.before(echo.wrapper)
    const opacity = [0, strength * .58, strength, 0, 0]
    run(echo.wrapper, path.map((frame, i) => ({ ...frame, opacity: opacity[i] })), suctionMs, delay + lag, 'both')
  }
  return run(wrapper, path, suctionMs, delay, fill).finished
}

export function dieCenter(button: HTMLButtonElement, scene: DOMRect): Point {
  const { left, top, width, height } = button.getBoundingClientRect()
  return { x: left - scene.left + width / 2, y: top - scene.top + height / 2 }
}

function timeline(speed: number, signal: AbortSignal, done: () => void) {
  const tracks: Animation[] = []
  const clock = performance.now()
  const markers: { at: number; group?: string; action: (onTime: boolean) => void }[] = []
  let previousFrame = clock
  let frameRequest = 0
  let closed = false

  function run(target: HTMLElement, frames: Keyframe[], duration: number, delay: number, fill: FillMode) {
    const animation = target.animate(frames, { duration: duration / speed, delay: delay / speed, fill })
    animation.startTime = clock
    tracks.push(animation)
    return animation
  }

  function cleanUp() {
    if (closed) return
    closed = true
    cancelAnimationFrame(frameRequest)
    markers.length = 0
    signal.removeEventListener('abort', cleanUp)
    for (const animation of tracks) animation.cancel()
    done()
  }

  signal.addEventListener('abort', cleanUp, { once: true })
  // rAF uses the same document timeline as the keyframes above. Catch the
  // picture up in order, but after a long frame only sound a current contact.
  function tick(frame: number) {
    frameRequest = 0
    if (closed || signal.aborted || document.hidden) return
    const now = performance.now()
    const longFrame = now - previousFrame > 50
    previousFrame = frame
    while (markers.length && markers[0].at <= frame) {
      const marker = markers.shift()!
      // Several dice may have landed while this thread was blocked. Only the
      // latest still-visible contact of that kind can speak on the return frame.
      const superseded = longFrame && marker.group && markers.some(m => m.group === marker.group && m.at <= frame)
      marker.action(!superseded && now - marker.at <= 64 / speed)
    }
    if (markers.length) frameRequest = requestAnimationFrame(tick)
  }
  function cue(time: number, action: (onTime: boolean) => void, group?: string) {
    markers.push({ at: clock + time / speed, action, group })
    markers.sort((a, b) => a.at - b.at)
    if (!frameRequest) frameRequest = requestAnimationFrame(tick)
  }
  function finish() {
    // A seat and the end of suction can fall in the same display frame.
    cancelAnimationFrame(frameRequest)
    tick(Number(document.timeline.currentTime))
    cleanUp()
  }
  return { run, cue, finish, cleanUp }
}

function createMotion(parent: HTMLElement, dice: readonly RollDie[], motionClass: string, done: () => void, speed: number, signal: AbortSignal) {
  const layer = effect('dice-motion')
  layer.setAttribute('aria-hidden', 'true')
  parent.append(layer)
  return { layer, ...timeline(speed, signal, () => {
    layer.remove()
    for (const { button } of dice) button.classList.remove(motionClass)
    done()
  }) }
}

export function playPlacementMotion(planning: HTMLElement, dice: readonly PlacedDie[], done: () => void, onSeat: () => void, speed: number, signal: AbortSignal) {
  const scene = planning.getBoundingClientRect()
  const destinations = dice.map(({ button }) => dieCenter(button, scene))
  const { layer, run, cue, finish, cleanUp } = createMotion(planning, dice, 'die-placing', done, speed, signal)
  cue(suctionMs * .87, onTime => { if (onTime) onSeat() })
  const finished = dice.map(({ button, face: value, ego, from }, index) => {
    const { wrapper, face } = movingDie('dice-tumble', ego)
    face.textContent = String(value)
    layer.append(wrapper)
    button.classList.add('die-placing')
    const path = suctionPath(from, destinations[index], leans[index])
    return playSuction(wrapper, ego, path, suctionDelays[index], run, 'both')
  })
  void Promise.all(finished).then(finish, cleanUp)
  return cleanUp
}

export function playDiceMotion(encounter: HTMLElement, dice: readonly RollDie[], done: () => void,
  onContact: (type: 'land' | 'bounce' | 'seat', index: number, ego: boolean) => void, speed: number, signal: AbortSignal) {
  const scene = encounter.getBoundingClientRect()
  const destinations = dice.map(({ button }) => button.getBoundingClientRect())
  if (!dice.length || !scene.height || destinations.some(({ width }) => !width)) return

  const { layer, run, cue, finish, cleanUp } = createMotion(encounter, dice, 'die-arriving', done, speed, signal)
  const arrivals = rollMs + (dice.length - 1) * rollStep + resultMs
  // The result row sits below the health cards, across the bottom edge of the arena.
  const y = scene.height
  const reach = Math.min(68, scene.height * .47)

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
      cue(delay + time, () => { face.textContent = String(shown) })
    }
    run(wrapper, rollPath(x, y, reach), rollMs, delay, 'both')
    run(shadow, [
      { offset: 0, opacity: .12, transform: 'translateX(-12px) scaleX(.56)' },
      { offset: land.offset, opacity: .82, transform: 'translateX(-4px) scaleX(1.1)' },
      { offset: .62, opacity: .42, transform: 'translateX(-2px) scaleX(.72)' },
      { offset: bounce.offset, opacity: .78, transform: 'scaleX(1)' },
      { offset: .87, opacity: .62, transform: 'scaleX(.86)' },
      { offset: 1, opacity: .78, transform: 'scaleX(1)' },
    ], rollMs, delay, 'both')
    run(shadow, [{ opacity: .78 }, { opacity: 0 }], 48, arrive, 'forwards')
    for (const contact of [land, bounce]) {
      const first = contact === land
      const dust = effect(first ? 'dice-roll-dust' : 'dice-roll-dust small')
      dust.style.left = (x + contact.cornerX) + 'px'
      dust.style.top = (y + 22) + 'px'
      layer.append(dust)
      run(dust, [
        { opacity: first ? .84 : .47, transform: 'scale(.72)' },
        { opacity: 0, transform: 'translateY(-8px) scale(1.35)' },
      ], first ? 156 : 129, rollMs * contact.offset + delay, 'none')
    }

    for (const [time, type] of [[delay + rollMs * land.offset, 'land'], [delay + rollMs * bounce.offset, 'bounce'], [arrive + suctionMs * .87, 'seat']] as const) {
      cue(time, onTime => { if (onTime) onContact(type, index, ego) }, type === 'land' ? type : undefined)
    }
    const path = suctionPath({ x, y }, { x, y: dy }, leans[index])
    // The delayed track takes over the held roll pose only when suction starts.
    return playSuction(wrapper, ego, path, arrive, run)
  })
  void Promise.all(finished).then(finish, cleanUp)

  return cleanUp
}

export function playRerollMotion(dice: readonly { button: HTMLButtonElement; from: number }[],
  speed: number, signal: AbortSignal, onContact: () => void, done: () => void) {
  const { run, cleanUp } = timeline(speed, signal, () => {
    for (const { button } of dice) delete button.dataset.rerollFrom
    done()
  })
  const tracks = dice.map(({ button, from }) => {
    button.dataset.rerollFrom = String(from)
    return run(button, [pose(0, 0, 0, 0), pose(.42, 0, -7, -20),
      pose(.75, 0, -3, 12), pose(1, 0, 0, 0)], 125, 0, 'none').finished
  })
  void Promise.all(tracks).then(() => {
    cleanUp()
    if (!signal.aborted && !document.hidden) onContact()
  }, cleanUp)
  return cleanUp
}

export function playStraightPhrase(chip: HTMLElement, speed: number, signal: AbortSignal, note: (pitch: number) => void) {
  const cells = Array.from(chip.querySelectorAll<HTMLElement>('i'))
  for (const cell of cells) cell.dataset.filled = 'false'
  const { cue, cleanUp } = timeline(speed, signal, () => {
    for (const cell of cells) cell.dataset.filled = 'true'
  })
  for (const [index, pitch] of [.79, 1, 1.27].entries()) {
    const beat = (onTime: boolean) => {
      cells[index].dataset.filled = 'true'
      if (onTime) note(pitch)
      if (index === 2) cleanUp()
    }
    if (index === 0) beat(true)
    else cue(index * 100, beat, 'note')
  }
}
