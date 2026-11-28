// Run from the game root. Arguments: build directory, output label, viewport width.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFile, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { chromium } from 'playwright'
import { preview } from 'vite'
import { observeDice, rollStraight, startSeedSeven } from '../../smoke/dice-sound-probe.mjs'

const [build, label, size] = process.argv.slice(2)
const width = Number(size)
assert.ok(build && ['before', 'after'].includes(label) && [320, 390].includes(width))
const height = width === 320 ? 568 : 844
const output = resolve('docs/dice-roll-sound')
const prefix = label + '-' + width + 'x' + height
const tempRoot = await realpath(tmpdir())
const temp = await mkdtemp(join(tempRoot, 'tower-dice-'))
const server = await preview({ build: { outDir: resolve(build) }, base: '/game/', preview: { host: '127.0.0.1', port: 0 } })
const url = 'http://127.0.0.1:' + server.httpServer.address().port + '/game/'
const browser = await chromium.launch({ channel: process.env.HWIGI_SMOKE_CHANNEL || undefined, args: ['--disable-gpu'] })
try {
  const page = await browser.newPage({ viewport: { width, height }, isMobile: true, hasTouch: true })
  page.on('pageerror', e => { throw e })
  await page.addInitScript(observeDice)
  await page.addInitScript(() => {
    localStorage.setItem('hwigi-tower.first-run-guide', JSON.stringify({ complete: true, seen: [] }))
    // Tap the two final game buses before the device. The recording worklet
    // has no output and timestamps every PCM block in original sample frames.
    const buses = []
    const connect = AudioNode.prototype.connect
    AudioNode.prototype.connect = function (dest, ...args) {
      if (dest === this.context.destination) {
        buses.push(this)
        window.gameAudio = this.context
      }
      return connect.call(this, dest, ...args)
    }
    window.recordMix = async () => {
      const ctx = window.gameAudio
      const code = `registerProcessor('mix-tap', class extends AudioWorkletProcessor {
        process(inputs) {
          const [channels] = inputs
          if (channels.length) {
            if (!this.block) {
              this.block = new Int16Array(2048)
              this.offset = 0
              this.frame = currentFrame
            }
            for (let i = 0; i < channels[0].length; i++) {
              const mono = channels.reduce((sum, ch) => sum + ch[i], 0) / channels.length
              this.block[this.offset++] = Math.round(Math.max(-1, Math.min(1, mono)) * 32767)
            }
            if (this.offset === this.block.length) {
              this.port.postMessage({ frame: this.frame, data: this.block }, [this.block.buffer])
              this.block = null
            }
          }
          return true
        }
      })`
      const script = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
      await ctx.audioWorklet.addModule(script)
      URL.revokeObjectURL(script)
      const node = new AudioWorkletNode(ctx, 'mix-tap', { numberOfOutputs: 0 })
      for (const bus of buses) connect.call(bus, node)
      const chunks = []
      node.port.onmessage = ({ data }) => chunks.push(data)
      window.finishMix = () => {
        const { contextTime, performanceTime } = ctx.getOutputTimestamp()
        const first = chunks[0].frame
        const last = chunks.at(-1)
        const pcm = new Int16Array(last.frame + last.data.length - first)
        for (const { frame, data } of chunks) pcm.set(data, frame - first)
        const bytes = new Uint8Array(pcm.buffer)
        let binary = ''
        for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768))
        return { data: btoa(binary), sampleRate: ctx.sampleRate,
          start: performanceTime + (first / ctx.sampleRate - contextTime) * 1000 }
      }
    }
  })
  // Warm the browser's local asset/font cache identically for both builds.
  await startSeedSeven(page, url)
  await page.locator('#enter-room').tap()
  await page.locator('#pool-dice button:not([hidden])').first().waitFor()
  await page.evaluate(() => localStorage.clear())
  await startSeedSeven(page, url)
  await page.evaluate(() => window.recordMix())
  const cdp = await page.context().newCDPSession(page)
  const frames = []
  const origin = await page.evaluate(() => performance.timeOrigin)
  cdp.on('Page.screencastFrame', packet => {
    frames.push({ data: packet.data, at: packet.metadata.timestamp * 1000 - origin })
    void cdp.send('Page.screencastFrameAck', { sessionId: packet.sessionId })
  })
  await cdp.send('Page.startScreencast', { format: 'png', maxWidth: width, maxHeight: height, everyNthFrame: 2 })
  await page.waitForTimeout(200)
  await rollStraight(page)
  await page.waitForTimeout(200)
  await cdp.send('Page.stopScreencast')
  const { mix, log, save, focus, browserVersion } = await page.evaluate(() => ({
    mix: window.finishMix(), log: window.diceProbe, save: JSON.parse(localStorage.getItem('hwigi-tower.ascent')).ascent,
    focus: document.activeElement.getAttribute('aria-label'), browserVersion: navigator.userAgent,
  }))
  assert.equal(save.seed, 7)
  assert.deepEqual(save.unlocks, ['straight'])
  assert.equal(save.battle.turn, 2)
  assert.equal(log.rolls.length, 6)
  const audio = Buffer.from(mix.data, 'base64')
  frames.sort((a, b) => a.at - b.at)
  const first = frames.findIndex(f => f.at >= mix.start)
  assert.ok(first >= 0)
  const clip = frames.slice(first)
  const start = clip[0].at
  const end = clip.at(-1).at + 34
  const count = Math.round((end - start) * mix.sampleRate / 1000)
  const pcm = Buffer.alloc(count * 2)
  audio.copy(pcm, 0, Math.round((start - mix.start) * mix.sampleRate / 1000) * 2)
  assert.ok(pcm.some(Boolean))
  await writeFile(join(temp, 'mix.pcm'), pcm)
  const concat = []
  for (const [index, frame] of clip.entries()) {
    const name = index + '.png'
    await writeFile(join(temp, name), Buffer.from(frame.data, 'base64'))
    concat.push("file '" + name + "'", 'option framerate 1000', 'duration ' + (((clip[index + 1]?.at ?? end) - frame.at) / 1000).toFixed(6))
  }
  concat.push("file '" + (clip.length - 1) + ".png'", 'option framerate 1000')
  await writeFile(join(temp, 'frames.txt'), concat.join('\n') + '\n')
  const result = spawnSync(process.env.FFMPEG || 'ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'frames.txt',
    '-f', 's16le', '-ar', String(mix.sampleRate), '-ac', '1', '-i', 'mix.pcm', '-vf', 'fps=30', '-c:v', 'libx264', '-crf', '16',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', join(temp, 'take.mp4')], { cwd: temp, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || String(result.error))
  const effects = log.sounds.filter(s => /^(die-|dice-|seat|rebound|unlock|hum)/.test(s.name))
  assert.equal(effects.filter(e => e.name === 'dice-place.mp3').length, 1, 'manual placement')
  assert.equal(effects.filter(e => e.name === 'seat.wav').length, 2, 'one automatic seat per turn')
  const expected = label === 'after' ? { 'die-corner.wav': 6, 'die-rebound.wav': 3, 'die-note.wav': 3, 'unlock.mp3': 0 }
    : { 'dice-roll.mp3': 7, 'rebound.wav': 7, 'unlock.mp3': 1 }
  for (const [name, count] of Object.entries(expected)) assert.equal(effects.filter(e => e.name === name).length, count, name)
  const phase = (t) => Math.round(t - start)
  const round = (v) => Math.round(v * 10) / 10
  const rolls = log.rolls.map(r => ({ startMs: phase(r.start), duration: r.duration,
    firstDustMs: phase(r.frames.land), secondDustMs: phase(r.frames.bounce) }))
  const sounds = effects.map(e => ({ name: e.name, rate: round(e.rate * 100) / 100, ms: phase(e.at), filled: e.filled }))
  const samples = []
  assert.deepEqual(log.ready.map(r => r.dice), [[1, 1, 1], [5, 1, 2]])
  for (const [i, r] of log.rolls.entries()) {
    const index = i % 3
    for (const part of ['land', 'bounce']) {
      if (label === 'after' && part === 'bounce' && index !== 0) continue
      const asset = part === 'land' ? (label === 'before' ? 'dice-roll.mp3' : 'die-corner.wav') : (label === 'before' ? 'rebound.wav' : 'die-rebound.wav')
      const sound = effects.filter(e => e.name === asset && e.at >= r.clock && e.at < r.clock + r.duration + 100)[index]
      const paint = r.frames[part]
      assert.ok(Number.isFinite(paint) && sound, JSON.stringify({ index, part, r, sounds }))
      assert.ok(Math.abs(sound.at - r[part]) < 55 && Math.abs(sound.at - paint) < 40,
        'Rejected off-time ' + part + ' in roll ' + i + ': ' + JSON.stringify({ paint, sound, expected: r[part] }))
      samples.push({ turn: i < 3 ? 1 : 2, die: index + 1, part, idealMs: phase(r[part]), paintMs: phase(paint), audioCallMs: phase(sound.at),
        audioMinusPaintMs: round(sound.at - paint) })
    }
  }
  for (const turn of [1, 2]) {
    const contacts = samples.filter(s => s.turn === turn && s.part === 'land')
    assert.ok(contacts.slice(1).every((s, i) => s.audioCallMs - contacts[i].audioCallMs >= 8))
    const bounce = samples.find(s => s.turn === turn && s.part === 'bounce')
    assert.ok(Math.abs(bounce.audioCallMs - contacts[0].audioCallMs - 206) < 40)
  }
  if (label === 'after') {
    const notes = effects.filter(e => e.name === 'die-note.wav')
    assert.deepEqual(notes.map(e => e.filled), [1, 2, 3])
    assert.ok(notes.slice(1).every((n, i) => Math.abs(n.at - notes[i].at - 100) < 35))
    const moments = { settled: log.rolls[2].start + 760, bonus: notes[1].at + 20 }
    for (const [name, at] of Object.entries(moments)) {
      const frame = clip.find(f => f.at >= at)
      await writeFile(join(output, width + 'x' + height + '-' + name + '.png'), Buffer.from(frame.data, 'base64'))
    }
  }
  let peak = 0
  for (let i = 0; i < pcm.length; i += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i)))
  await writeFile(join(output, prefix + '.json'), JSON.stringify({ seed: save.seed, browserVersion, width, height, frames: clip.length,
    durationMs: phase(end), sampleRate: mix.sampleRate, peakDbFS: round(20 * Math.log10(peak / 32768)),
    finalDice: save.battle.dice, finalFocus: focus, unlocks: save.unlocks, rolls, sounds, samples,
    ready: log.ready.map((r, i) => ({ dice: r.dice, focus: r.focus, msFromThrow: round(r.at - log.rolls[3 * i].clock) })),
    taps: log.taps.filter(t => t.at >= start).map(t => ({ button: t.button, ms: phase(t.at) })) }, null, 2) + '\n')
  await copyFile(join(temp, 'take.mp4'), join(output, prefix + '.mp4'))
  console.log(prefix, clip.length + ' frames', rolls, samples)
} finally {
  await browser.close()
  await server.close()
  const path = await realpath(temp)
  if (dirname(path) === tempRoot && basename(path).startsWith('tower-dice-')) await rm(path, { recursive: true })
}
