// Original one-shot Foley for stone, metal, wood and cloth. All samples are
// synthesized here; the seed only controls the texture of the exported WAV.
import { writeFileSync } from 'node:fs'

const rate = 24000
// frequency, end frequency, noise mix, length in seconds, high partial, decay
const recipes = {
  swish: [440, 1700, .88, .064, .05, 3],
  grit: [1040, 460, .94, .075, .04, 5],
  block: [238, 95, .24, .078, .19, 7],
  tap: [610, 230, .25, .047, .15, 6],
  charge: [105, 172, .6, .22, .24, 3],
  slam: [190, 55, .20, .22, .38, 5],
  release: [245, 118, .39, .068, .2, 6],
  rebound: [780, 370, .12, .046, .21, 6],
  seat: [460, 280, .14, .048, .1, 6],
  hum: [540, 720, .01, .12, .43, 3],
  latch: [428, 166, .29, .095, .65, 6],
  coin: [1440, 1310, .015, .14, .64, 4],
  pay: [1240, 670, .08, .088, .54, 6],
  mend: [390, 640, .005, .16, .23, 3],
  frost: [2000, 910, .65, .061, .22, 8],
  stamp: [330, 100, .32, .058, .14, 7],
  rise: [170, 420, .025, .25, .3, 2],
  step: [145, 72, .54, .082, .06, 6],
  pulley: [370, 560, .22, .15, .75, 3],
  ember: [790, 200, .84, .075, .03, 7],
  engrave: [570, 420, .13, .14, .7, 4],
}
for (const [name, [from, to, noise, duration, partial, decay]] of Object.entries(recipes)) {
  const count = Math.round(rate * duration)
  const wav = Buffer.alloc(44 + count * 2)
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
  wav.writeUInt32LE(count * 2, 40)
  let seed = 37, phase = 0, previous = 0
  for (let i = 0; i < count; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const t = i / count
    const random = seed / 2 ** 31 - 1
    phase += 2 * Math.PI * (from + (to - from) * t) / rate
    const envelope = Math.min(1, i / 26, (count - i) / 128) * Math.exp(-decay * t)
    const tone = Math.sin(phase) + partial * Math.sin(phase * 2.71)
    const sample = ((random - previous * .55) * noise + tone * (1 - noise)) * envelope
    wav.writeInt16LE(Math.round(16000 * sample), 44 + i * 2)
    previous = random
  }
  writeFileSync(new URL('../public/sfx/' + name + '.wav', import.meta.url), wav)
}
