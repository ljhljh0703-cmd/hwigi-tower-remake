// Observe the shipping Web Audio graph and the actual WAAPI presentation clock.
export function observeDice() {
  const bytes = new WeakMap()
  const buffers = new WeakMap()
  const read = Response.prototype.arrayBuffer
  Response.prototype.arrayBuffer = async function (...args) {
    const data = await read.apply(this, args)
    bytes.set(data, this.url.split('/').pop())
    return data
  }
  const decode = BaseAudioContext.prototype.decodeAudioData
  BaseAudioContext.prototype.decodeAudioData = async function (data, ...args) {
    const buffer = await decode.call(this, data, ...args)
    buffers.set(buffer, bytes.get(data))
    return buffer
  }
  const log = window.diceProbe = { sounds: [], rolls: [], rerolls: [], ego: [], taps: [], ready: [] }
  document.addEventListener('die-landed', event => {
    if (event.target.id !== 'die-0') return
    queueMicrotask(() => log.ready.push({ at: performance.now(), focus: document.activeElement.id,
      dice: [...document.querySelectorAll('#pool-dice button:not([hidden]) .die-face')].map(e => Number(e.textContent)) }))
  }, true)
  document.addEventListener('click', event => {
    const button = event.target.closest('button')
    if (button) log.taps.push({ button: button.id || button.getAttribute('aria-label'), at: performance.now() })
  }, true)
  const start = AudioBufferSourceNode.prototype.start
  AudioBufferSourceNode.prototype.start = function (...args) {
    const result = start.apply(this, args)
    log.sounds.push({ name: buffers.get(this.buffer), rate: this.playbackRate.value,
      at: performance.now(), frame: document.timeline.currentTime, audioTime: this.context.currentTime,
      filled: document.querySelectorAll('#unlock-reveal i[data-filled="true"]').length })
    return result
  }
  const observed = new WeakSet()
  function sample(frame) {
    for (const die of document.querySelectorAll('.encounter .dice-tumble')) {
      const track = die.getAnimations().find(a => a.effect.getKeyframes().length === 10)
      if (!track || observed.has(track) || track.startTime === null) continue
      observed.add(track)
      const { duration, delay } = track.effect.getTiming()
      const start = track.startTime + delay
      const contact = die.parentNode.querySelectorAll('.dice-roll-dust')[log.rolls.filter(r => r.clock === track.startTime).length * 2]
      const record = { clock: track.startTime, start, duration, land: start + duration * .45, bounce: start + duration * .76, frames: {} }
      log.rolls.push(record)
      const dust = contact && [contact, contact.nextElementSibling]
      function watch(time) {
        if (!die.isConnected) return
        for (const [index, phase] of ['land', 'bounce'].entries()) {
          if (dust?.[index] && !record.frames[phase] && Number(getComputedStyle(dust[index]).opacity) > .01) record.frames[phase] = time
        }
        if (!record.frames.bounce) requestAnimationFrame(watch)
      }
      watch(frame)
    }
    for (const button of document.querySelectorAll('button[data-reroll-from]')) {
      const track = button.getAnimations().find(a => a.effect.getKeyframes().length === 4)
      if (track && !observed.has(track)) {
        observed.add(track)
        log.rerolls.push({ from: button.dataset.rerollFrom, to: button.querySelector('.die-face').textContent,
          index: button.getAttribute('aria-label'), start: track.startTime, duration: track.effect.getTiming().duration })
      }
    }
    const ego = document.querySelector('#ego-placement:not([hidden])')
    if (ego) {
      const flight = ego.getAnimations()[0]
      if (flight && !observed.has(flight)) {
        observed.add(flight)
        log.ego.push({ slot: ego.dataset.slot, face: Number(ego.querySelector('strong').textContent), at: frame })
      }
    }
    requestAnimationFrame(sample)
  }
  requestAnimationFrame(sample)
}

export async function startSeedSeven(page, url) {
  await page.goto(new URL('?seed=7', url).href)
  await page.locator('#new-ascent').tap()
  await page.locator('#perk-choices button').first().tap()
}

export async function rollStraight(page) {
  await page.locator('#fork-options button').tap()
  const pool = page.locator('#pool-dice button:not([hidden])')
  await pool.first().waitFor()
  await page.locator('.die-arriving').first().waitFor({ state: 'hidden' })
  await pool.nth(0).tap()
  await pool.nth(1).tap()
  await page.locator('#reroll').tap()
  await page.waitForTimeout(220)
  for (const button of await pool.all()) await button.tap()
  await page.locator('#assign-guard').tap()
  await page.locator('.die-placing').first().waitFor({ state: 'detached' })
  await page.evaluate(() => {
    const panel = document.querySelector('#new-unlock')
    const observer = new MutationObserver(() => {
      if (panel.open) {
        window.straightShown = true
        observer.disconnect()
      }
    })
    observer.observe(panel, { attributeFilter: ['open'] })
  })
  await page.locator('#resolve').tap()
  await page.waitForFunction(() => window.straightShown)
  await page.locator('#unlock-reveal .unlock-pattern i:last-of-type[data-filled=true]').waitFor()
  await page.locator('#confirm-unlock').tap()
  await page.locator('#new-unlock').waitFor({ state: 'hidden' })
  await page.locator('.die-arriving').first().waitFor({ state: 'detached' })
}
