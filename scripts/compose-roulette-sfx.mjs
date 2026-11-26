import { writeFile } from 'node:fs/promises'

const rate = 44100
const tau = Math.PI * 2
const pulse = (t, hz, decay, bend = 0) =>
  Math.sin(tau * (hz * t + bend * (1 - Math.exp(-24 * t)) / 24)) * Math.exp(-t / decay)
const click = (t, decay) => Math.exp(-t / decay)

async function render(name, duration, seed, voice, peak) {
  const length = Math.round(rate * duration)
  const samples = new Float64Array(length)
  let previous = 0
  let noise = 0
  for (let i = 0; i < length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const raw = seed / 2147483648 - 1
    noise += (raw - noise) * .24
    const grain = noise - previous * .34
    previous = grain
    const t = i / rate
    const tail = Math.min(1, (duration - t) / .016)
    samples[i] = Math.tanh(voice(t, grain)) * tail
  }
  const gain = peak / samples.reduce((max, x) => Math.max(max, Math.abs(x)), 0)
  const wav = Buffer.alloc(44 + length * 2)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(wav.length - 8, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(rate, 24)
  wav.writeUInt32LE(rate * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(length * 2, 40)
  for (let i = 0; i < length; i++) wav.writeInt16LE(Math.round(samples[i] * gain * 32767), 44 + i * 2)
  await writeFile(new URL('../public/sfx/' + name + '.wav', import.meta.url), wav)
}

// Stone seat, iron teeth, and the returning pawl have separate transients.
await render('roulette-engage', .205, 73, (t, grain) =>
  .68 * pulse(t, 91, .062, 55) + .36 * pulse(t, 232, .035)
  + .15 * pulse(t, 561, .055) + .42 * grain * click(t, .012), .76)

const roll = .742
const teeth = [.04, .09, .15, .23, .32, .43, .57, .75, .92]
await render('roulette-ratchet', roll, 913, (t, grain) => {
  const index = teeth.findLastIndex((position) => t >= position * roll)
  if (index < 0) return 0
  const age = t - teeth[index] * roll
  const pitch = 1.16 - .27 * teeth[index]
  return .61 * pulse(age, 912 * pitch, .009, 140) + .39 * pulse(age, 1461 * pitch, .008)
    + .50 * grain * click(age, .007)
    + (age < .013 ? 0 : .27 * pulse(age - .013, 406 * pitch, .010))
}, .69)

await render('roulette-latch', .300, 867, (t, grain) => {
  const pawl = t - .016
  return .77 * pulse(t, 113, .058, 81) + .50 * pulse(t, 367, .037)
    + .42 * grain * click(t, .008)
    + (pawl < 0 ? 0 : .54 * pulse(pawl, 588, .068) + .24 * pulse(pawl, 944, .073) + .18 * pulse(pawl, 1431, .045))
}, .87)
