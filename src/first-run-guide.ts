import { openTurn } from './combat.ts'
import type { Ascent } from './ascent.ts'

export const FIRST_RUN_KEY = 'hwigi-tower.first-run-guide'
const openingSeed = 7210
const noteDuration = 1500

interface Progress {
  complete: boolean
  run?: number
  seen: string[]
}

interface Note {
  id: string
  symbol: string
  text: string
  anchor: HTMLElement
  below?: boolean
}

interface Lesson extends Note {
  marks: readonly HTMLElement[]
  from?: HTMLElement
  to?: HTMLElement
}

function readProgress(): Progress {
  try {
    const saved = JSON.parse(localStorage.getItem(FIRST_RUN_KEY) ?? 'null')
    return {
      complete: saved?.complete === true,
      run: Number.isInteger(saved?.run) ? saved.run : undefined,
      seen: Array.isArray(saved?.seen) ? saved.seen.filter((id: unknown) => typeof id === 'string') : [],
    }
  } catch {
    return { complete: false, seen: [] }
  }
}

export class FirstRunGuide {
  private progress = readProgress()
  private note = document.querySelector<HTMLElement>('#first-run-note')!
  private line = document.querySelector<HTMLElement>('#first-run-line')!
  private pointer = document.querySelector<HTMLElement>('#first-run-point')!
  private status = document.querySelector<HTMLElement>('#first-run-status')!
  private skipButton = document.querySelector<HTMLButtonElement>('#skip-first-run')!
  private active?: Note
  private lesson?: Lesson
  private available: readonly Note[] = []
  private timer = 0

  constructor(private icon: (symbol: string) => string, private onSkip: () => void) {
    this.skipButton.addEventListener('click', () => this.skip())
    document.addEventListener('pointerdown', (event) => {
      if (!this.active || !event.isPrimary || event.button !== 0) return
      if (!this.lesson) this.clear()
      else if (event.target instanceof Element &&
        !event.target.closest('button, dialog, [data-dice-zone], [data-hold-help]')) this.skip()
    }, { capture: true })
    document.addEventListener('keydown', (event) => {
      if (document.querySelector('dialog[open]')) return
      if (event.key === 'Escape' && this.lesson) this.skip()
      else if (!this.lesson && this.active && ['Escape', 'Enter', ' '].includes(event.key)) this.clear()
    })
    window.addEventListener('resize', this.position)
    window.addEventListener('scroll', this.position, { passive: true })
  }

  private save() {
    try { localStorage.setItem(FIRST_RUN_KEY, JSON.stringify(this.progress)) } catch { /* 현재 화면에서는 계속 적용한다. */ }
  }

  start(seed: number) {
    if (this.progress.complete) return
    this.progress.run = seed
    this.save()
  }

  includes(run: Ascent) {
    return !this.progress.complete && this.progress.run === run.seed && run.fight === 1 &&
      run.route?.map.byId[run.route.node ?? -1]?.floor === 1
  }

  opening(run: Ascent, previousTurn = 0): Ascent {
    const { battle } = run
    if (!this.includes(run) || battle.phase !== 'assign' || battle.turn === previousTurn || battle.turn > 2) return run
    // 안내 첫 굴림에만 별도 시드를 쓰고 지도, 재굴림, 보상에는 등반 시드를 쓴다.
    const { dice } = openTurn(openingSeed, battle.turn)
    return { ...run, battle: { ...battle, dice: battle.dice.map((face, index) =>
      index === battle.fixedDie?.index ? face : dice[index] ?? face) } }
  }

  complete() {
    this.progress.complete = true
    delete this.progress.run
    this.save()
    this.clear()
  }

  replay() {
    this.progress.complete = false
    delete this.progress.run
    this.save()
    this.clear()
  }

  private skip() {
    this.complete()
    this.onSkip()
  }

  clear() {
    window.clearTimeout(this.timer)
    for (const mark of this.lesson?.marks ?? []) delete mark.dataset.firstRunTarget
    this.lesson = undefined
    this.active = undefined
    this.available = []
    this.note.hidden = true
    this.pointer.hidden = true
    this.status.textContent = ''
  }

  teach(lesson: Lesson) {
    window.clearTimeout(this.timer)
    for (const mark of this.lesson?.marks ?? []) delete mark.dataset.firstRunTarget
    this.lesson = lesson
    for (const mark of lesson.marks) mark.dataset.firstRunTarget = ''
    this.show(lesson)
  }

  discover(notes: readonly Note[]) {
    if (this.lesson) this.clear()
    if (this.active && notes.some(({ id }) => id === this.active?.id)) {
      this.available = notes
      this.position()
      return
    }
    if (this.active) this.clear()
    const next = notes.find(({ id }) => !this.progress.seen.includes(id))
    if (!next) return
    this.progress.seen.push(next.id)
    this.save()
    this.show(next)
    this.available = notes
    this.timer = window.setTimeout(() => {
      const available = this.available
      this.clear()
      this.discover(available)
    }, noteDuration)
  }

  private show(note: Note) {
    this.active = note
    this.skipButton.hidden = !this.lesson
    this.note.dataset.guide = note.id
    this.line.innerHTML = `${this.icon(note.symbol)}<span>${note.text}</span>`
    if (this.status.textContent !== note.text) this.status.textContent = note.text
    this.note.hidden = false
    this.position()
  }

  private position = () => {
    if (!this.active) return
    const { anchor, below } = this.active
    const box = anchor.getBoundingClientRect()
    const { offsetWidth: width, offsetHeight: height } = this.note
    const placeBelow = below || box.top < height + 12
    const top = placeBelow ? box.bottom + 7 : box.top - height - 7
    this.note.dataset.below = String(Boolean(placeBelow))
    this.note.style.top = `${Math.max(4, Math.min(top, window.innerHeight - height - 4))}px`
    this.note.style.left = `${Math.max(6, Math.min(box.left + (box.width - width) / 2, window.innerWidth - width - 6))}px`

    const { from, to } = this.lesson ?? {}
    this.pointer.hidden = !from || !to
    if (!from || !to) return
    const source = from.getBoundingClientRect()
    const target = to.getBoundingClientRect()
    const x = source.left + source.width / 2
    const y = source.bottom - 2
    const dx = target.left + target.width / 2 - x
    const dy = target.top + target.height / 2 - y
    const length = Math.hypot(dx, dy)
    this.pointer.style.left = `${x}px`
    this.pointer.style.top = `${y}px`
    this.pointer.style.setProperty('--point-x', `${dx * .82}px`)
    this.pointer.style.setProperty('--point-y', `${dy * .82}px`)
    this.pointer.style.setProperty('--point-length', `${length * .82}px`)
    this.pointer.style.setProperty('--point-angle', `${Math.atan2(dy, dx)}rad`)
  }
}
