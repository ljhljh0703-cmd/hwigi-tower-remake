// Observe the release build's real draw calls. The mask uses the exact source
// alpha, quarter turns and camera transform. Transparent sprite padding is excluded.
export function observeBreak() {
  const arena = document.querySelector('#arena canvas')
  const ctx = arena.getContext('2d')
  const paint = ctx.drawImage.bind(ctx)
  const draws = []
  let under, masonry, field
  const clear = ctx.clearRect.bind(ctx)
  ctx.clearRect = (...args) => {
    draws.length = 0
    under = undefined
    masonry = field = undefined
    clear(...args)
  }
  ctx.drawImage = (image, ...args) => {
    const chamber = image.src?.includes('/ui/backgrounds/')
    if (!chamber && masonry && !field) field = ctx.getImageData(0, 0, arena.width, arena.height).data
    if (image instanceof HTMLCanvasElement) {
      under ??= ctx.getImageData(0, 0, arena.width, arena.height).data
      draws.push({ image, args, matrix: ctx.getTransform() })
    }
    paint(image, ...args)
    if (chamber && args[1] > 100) masonry = ctx.getImageData(0, 0, arena.width, arena.height).data
  }
  const hits = []
  const firstSound = window.effectTimes.length
  const hp = document.querySelector('#player-hp')
  const meter = Object.getOwnPropertyDescriptor(HTMLMeterElement.prototype, 'value')
  const hpChanges = []
  Object.defineProperty(hp, 'value', { ...meter, set(value) {
    if (value !== this.value) hpChanges.push({ from: this.value, to: value, at: performance.now() })
    meter.set.call(this, value)
  } })
  new MutationObserver(changes => {
    for (const change of changes) for (const node of change.addedNodes) {
      if (node.classList?.contains('damage-number')) hits.push({
        target: change.target.id, damage: node.textContent, at: performance.now(),
      })
    }
  }).observe(document.querySelector('.encounter'), { subtree: true, childList: true })

  const linear = Array.from({ length: 256 }, (_, i) => {
    const c = i / 255
    return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4
  })
  const luma = (data, i) => .2126 * linear[data[i]] + .7152 * linear[data[i + 1]] + .0722 * linear[data[i + 2]]
  window.readBreak = () => {
    // CSS animations use the compositor's clock. Sample them at the same
    // elapsed battle time as the canvas, also when inspecting an older build.
    const numbers = [...document.querySelectorAll('.damage-number')]
    for (const number of numbers) for (const animation of number.getAnimations()) {
      animation.pause()
      const hit = hits.findLast(event => event.target === number.parentElement.id && event.damage === number.textContent)
      if (hit) animation.currentTime = performance.now() - hit.at
    }
    const box = arena.getBoundingClientRect()
    const visible = selector => [...document.querySelectorAll(selector)].map(el => el.getBoundingClientRect()).filter(r => r.width && r.height)
    const numberRects = visible('.damage-number')
    const hud = [...document.querySelectorAll('.vital, #intent, #charge-stop, #planning button, #hit-order, #parry-cue')]
      .map(el => ({ id: el.id || el.parentElement.className, rect: el.getBoundingClientRect() })).filter(({ rect }) => rect.width && rect.height)
    const coveredHud = {}
    const mask = document.createElement('canvas')
    mask.width = arena.width
    mask.height = arena.height
    const m = mask.getContext('2d', { willReadFrequently: true })
    m.imageSmoothingEnabled = false
    let clipped = 0
    for (const { matrix, image, args } of draws) {
      m.setTransform(matrix)
      m.drawImage(image, ...args)
      // Every piece canvas is cropped to the occupied pixels, including its bevel.
      const [x, y, w, h] = args
      for (const [dx, dy] of [[x,y], [x+w,y], [x,y+h], [x+w,y+h]]) {
        const p = matrix.transformPoint({ x: dx, y: dy })
        if (p.x < -.01 || p.x > arena.width + .01 || p.y < -.01 || p.y > arena.height + .01) clipped++
      }
    }
    const ink = m.getImageData(0, 0, mask.width, mask.height).data
    const actual = ctx.getImageData(0, 0, mask.width, mask.height).data
    const occupied = new Uint8Array(mask.width * mask.height)
    let covered = 0, coveredByNumber = 0, area = 0, strong = 0, hash = 0, close = 0, opaque = 0, darkened = 0
    const inside = (rects, x, y) => rects.some(r => r.left <= x && x < r.right && r.top <= y && y < r.bottom)
    for (let p = 0; p < occupied.length; p++) {
      const i = p * 4
      if (field && masonry && masonry[i] - field[i] > 20) darkened++
      if (ink[p * 4 + 3] < 128) continue
      const x = box.left + (p % mask.width + .5) * box.width / mask.width
      const y = box.top + (Math.floor(p / mask.width) + .5) * box.height / mask.height
      coveredByNumber += Number(inside(numberRects, x, y))
      const occluder = hud.find(({ rect: r }) => r.left <= x && x < r.right && r.top <= y && y < r.bottom)
      if (occluder) {
        covered++
        coveredHud[occluder.id] = (coveredHud[occluder.id] ?? 0) + 1
      }
      const fore = luma(actual, p * 4), back = luma(under, p * 4)
      const contrast = (Math.max(fore, back) + .05) / (Math.min(fore, back) + .05)
      occupied[p] = contrast >= 2 ? 2 : 1
      strong += Number(contrast >= 2)
      area++
      if (ink[i + 3] >= 225) {
        opaque++
        const difference = .2126 * (ink[i] - under[i]) + .7152 * (ink[i + 1] - under[i + 1]) + .0722 * (ink[i + 2] - under[i + 2])
        close += Number(Math.abs(difference) <= 20)
      }
      hash = (Math.imul(hash, 31) + p) | 0
    }
    // Count disconnected, visibly modelled shapes in the composite, not submissions to drawImage.
    let distinct = 0
    for (let p = 0; p < occupied.length; p++) {
      if (!occupied[p]) continue
      const queue = [p]
      let high = Number(occupied[p] === 2)
      occupied[p] = 0
      for (let i = 0; i < queue.length; i++) {
        const q = queue[i]
        for (const next of [q - 1, q + 1, q - mask.width, q + mask.width]) {
          if (!occupied[next] || Math.abs(next % mask.width - q % mask.width) > 1) continue
          high += Number(occupied[next] === 2)
          occupied[next] = 0
          queue.push(next)
        }
      }
      if (queue.length >= 12 * (mask.width / box.width) ** 2 && high / queue.length >= .2) distinct++
    }
    const cardInsets = numbers.filter(el => el.closest('.vital') || el.dataset.impact === 'finisher' && el.parentElement.id !== 'player-damage').map(el => {
      const vital = el.closest('.combatant').querySelector('.vital')
      const card = vital?.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      const peer = vital?.querySelector('label, #escort-guard-total')?.getBoundingClientRect()
      return { text: el.textContent, right: card ? card.right - r.right : null,
        inset: card ? Math.min(r.left - card.left, card.right - r.right) : null,
        inside: card && r.top >= card.top && r.bottom <= card.bottom && r.left >= 0 && r.right <= innerWidth,
        peerOverlap: peer && r.top < peer.bottom && r.bottom > peer.top && r.left < peer.right && r.right > peer.left,
        opacity: +getComputedStyle(el).opacity }
    })
    const outsideCard = cardInsets.some(c => !c.inside || c.inset < 4 || c.peerOverlap || c.opacity < .9)
    const cards = visible('.combatant .vital').sort((a, b) => a.left - b.left)
    const cardGap = Math.min(...cards.slice(1).map((r, i) => r.left - cards[i].right))
    const hpInsets = [...document.querySelectorAll('#player-total, #enemy-total, #escort-guard-total')]
      .filter(el => el.getBoundingClientRect().width).map(el => {
        const card = el.closest('.vital').getBoundingClientRect(), r = el.getBoundingClientRect()
        return Math.min(r.left - card.left, card.right - r.right)
      })
    const otherCues = visible('#parry-cue, #hit-order, #intent')
    const numberBehindCue = numberRects.some(n => otherCues.some(r =>
      n.left < r.right && n.right > r.left && n.top < r.bottom && n.bottom > r.top))
    return { area, distinct, strongFraction: area ? +(strong / area).toFixed(3) : 0, covered, coveredByNumber,
      nearBackgroundPercent: opaque ? +(100 * close / opaque).toFixed(1) : null,
      obscuredMasonryPercent: field && masonry ? +(100 * darkened / occupied.length).toFixed(1) : null,
      clipped, hash, outsideCard, cardInsets, cardGap, hpInsets, numberBehindCue, coveredHud,
      hp: hp.value, hpLabel: document.querySelector('#player-total').textContent,
      mapHp: document.querySelector('#map-health').getAttribute('aria-label'),
      hpChanges: hpChanges.slice(), hits: hits.slice(), effects: window.effectTimes.slice(firstSound) }
  }
}

// Capture the same composited patch twice. A DOM box with invisible or
// same-colour text will have no contrasting glyph pixels in the difference.
export async function glyphInk(page, target) {
  const number = page.locator('#' + target + ' .damage-number').last()
  if (!await number.count()) return 0
  const rect = await number.boundingBox()
  if (!rect) return 0
  const clip = { x: Math.floor(rect.x), y: Math.floor(rect.y),
    width: Math.ceil(rect.x + rect.width) - Math.floor(rect.x), height: Math.ceil(rect.y + rect.height) - Math.floor(rect.y) }
  const shown = await page.screenshot({ clip, scale: 'css' })
  const hidden = await page.screenshot({ clip, scale: 'css', style: '#' + target + ' .damage-number { visibility: hidden !important }' })
  return page.evaluate(async ([shown, hidden]) => {
    async function decode(base64) {
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
      const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')
      ctx.drawImage(bitmap, 0, 0)
      return ctx.getImageData(0, 0, bitmap.width, bitmap.height).data
    }
    const [a, b] = await Promise.all([decode(shown), decode(hidden)])
    let ink = 0
    for (let i = 0; i < a.length; i += 4) {
      const brighter = .2126 * (a[i] - b[i]) + .7152 * (a[i + 1] - b[i + 1]) + .0722 * (a[i + 2] - b[i + 2])
      if (brighter >= 60) ink++
    }
    return ink
  }, [shown.toString('base64'), hidden.toString('base64')])
}
