import type { Slot } from './combat.ts'
import { canReroll, rerollYachtDice, spendExtraReroll } from './yacht-combat.ts'
import type { YachtBattle } from './yacht-combat.ts'

export function rerollSelectedDice(battle: YachtBattle, selected: Set<number>, extra: boolean) {
  const indices = [...selected].filter((index) => canReroll(battle, index))
  if (!indices.length || (extra && selected.size !== 1)) return null
  const rerolled = extra ? spendExtraReroll(battle, indices[0]) : rerollYachtDice(battle, indices)
  if (rerolled === battle) return null
  selected.clear()
  return { battle: rerolled, focusIndex: indices[0] }
}

export type DropZone = 'pool' | Slot

interface DiceInput {
  select: () => void
  lift: () => { indices: number[]; faces: string; companion?: boolean }
  drop: (indices: number[], zone: DropZone) => void
}

interface Drag {
  pointerId: number
  x: number
  y: number
  payload?: ReturnType<DiceInput['lift']>
  preview?: HTMLDivElement
  target: HTMLElement | null
}

function zoneAt(event: PointerEvent): HTMLElement | null {
  return document.elementFromPoint(event.clientX, event.clientY)
    ?.closest<HTMLElement>('[data-dice-zone]') ?? null
}

export function bindDiceInput(button: HTMLButtonElement, input: DiceInput) {
  let drag: Drag | undefined

  function finish() {
    drag?.target?.classList.remove('drop-active')
    drag?.preview?.remove()
    drag = undefined
  }

  button.addEventListener('click', (event) => {
    // Keyboard and assistive clicks do not have a pointing device.
    if (event.detail === 0 && (!(event instanceof PointerEvent) || !event.pointerType)) {
      input.select()
    }
  })

  button.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0) return
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, target: null }
    button.setPointerCapture(event.pointerId)
  })

  button.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return
    if (!drag.preview) {
      const distance = Math.hypot(event.clientX - drag.x, event.clientY - drag.y)
      if (distance < 7) return

      drag.payload = input.lift()
      drag.preview = document.createElement('div')
      drag.preview.className = 'dice-drag-preview'
      drag.preview.classList.toggle('companion-die', Boolean(drag.payload.companion))
      drag.preview.setAttribute('aria-hidden', 'true')
      drag.preview.textContent = drag.payload.faces
      document.body.append(drag.preview)
    }
    const left = Math.min(event.clientX + 10, window.innerWidth - drag.preview.offsetWidth - 4)
    const top = Math.min(event.clientY + 10, window.innerHeight - drag.preview.offsetHeight - 4)
    drag.preview.style.left = `${Math.max(4, left)}px`
    drag.preview.style.top = `${Math.max(4, top)}px`

    const target = zoneAt(event)
    if (target !== drag.target) {
      drag.target?.classList.remove('drop-active')
      drag.target = target
      target?.classList.add('drop-active')
    }
  })

  button.addEventListener('pointerup', (event) => {
    if (drag?.pointerId !== event.pointerId) return
    const payload = drag.payload
    const hit = document.elementFromPoint(event.clientX, event.clientY)
    const zone = hit?.closest<HTMLElement>('[data-dice-zone]')?.dataset.diceZone
    finish()
    if (payload && (zone === 'pool' || zone === 'attack' || zone === 'guard' || zone === 'escort')) {
      input.drop(payload.indices, zone)
    } else if (!payload && button.contains(hit)) {
      input.select()
    }
  })

  for (const type of ['pointercancel', 'lostpointercapture'] as const) {
    button.addEventListener(type, (event) => {
      if (drag?.pointerId === event.pointerId) finish()
    })
  }
}
