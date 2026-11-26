import manifest from '../art-source/enemy-motion/manifest.json' with { type: 'json' }
import type { EnemyIntent } from './combat.ts'

interface AtlasCell { id: string; rect: number[]; bounds: number[]; candidateContact?: number[] }
interface Sheet { id: string; pivot: number[]; frames: AtlasCell[] }
const motionSheets = new Map<string, Sheet>(manifest.sheets.map(sheet => [sheet.id, sheet]))
export type MotionFrame = { sheet: string; pose: string }
export const frame = (sheet: string, pose: string): MotionFrame => ({ sheet, pose })

const chainWardenBounds = {
  idle: [15, 16, 24, 27],
  charge: [10, 16, 28, 27],
  attack: [1, 0, 39, 44],
  hit: [0, 0, 38, 43],
}

const chainWardenPoses: Readonly<Record<string, keyof typeof chainWardenBounds>> = {
  ready: 'idle', follow: 'idle',
  anticipate: 'charge', approach: 'charge', reload: 'charge',
  contact: 'attack', 'repeat-contact': 'attack', 'special-contact': 'attack',
  hit: 'hit', 'heavy-hit': 'hit', fall: 'hit', down: 'hit',
}

export function atlasCell({ sheet, pose }: MotionFrame) {
  if (sheet === 'freeze' && pose === 'ready') {
    const cell: AtlasCell = { id: pose, rect: [0, 0, 48, 33], bounds: [14, 11, 28, 18] }
    return { atlas: { pivot: [34, 29] }, cell, art: 'freeze-ready' }
  }
  if (sheet === 'chain-warden') {
    const id = chainWardenPoses[pose]
    const cell: AtlasCell = { id, rect: [0, 0, 40, 44], bounds: chainWardenBounds[id] }
    return { atlas: { pivot: [29, 42] }, cell, art: `chain-warden-${id}` }
  }
  const atlas = motionSheets.get(sheet)!
  const cell = atlas.frames.find(candidate => candidate.id === pose)
  if (!cell) throw new Error('Unknown motion frame ' + sheet + '/' + pose)
  return { atlas, cell, art: 'motion/' + sheet }
}

export function readyFrame(name: string, intent: EnemyIntent, erased: boolean): MotionFrame {
  if (name === 'boss') {
    if (erased) return frame('boss-special', 'interrupted')
    if (intent.id === 'charge') return frame('boss-special', 'charge-peak')
    if (intent.id === 'critical') return frame('boss-special', 'charge-set')
    if (intent.id === 'knockdown') return frame('boss-special', 'knockdown')
    if (intent.mechanic?.kind === 'seal') return frame('boss-special', 'seal-set')
  }
  if (intent.id === 'knockdown') return frame(name, 'fall')
  if (erased) return frame(name, 'heavy-hit')
  if (name === 'chain-warden' && (intent.gimmick === 'reflect' || intent.id === 'critical')) return frame(name, 'anticipate')
  return frame(name, intent.id === 'charge' ? 'anticipate' : 'ready')
}

export function attackFrame(name: string, intent: EnemyIntent, repeated: boolean, weakened: boolean,
  stage: 'anticipate' | 'approach' | 'contact' | 'follow'): MotionFrame {
  if (name === 'boss' && (intent.id === 'critical' || intent.mechanic?.kind === 'seal')) {
    const poses = intent.id === 'critical'
      ? ['charge-set', 'charge-peak', 'charge-contact', weakened ? 'knee-down' : 'get-up']
      : ['seal-set', 'seal-set', 'seal-contact', 'seal-recover']
    return frame('boss-special', poses[['anticipate', 'approach', 'contact', 'follow'].indexOf(stage)])
  }
  if (stage === 'anticipate' && repeated) return frame(name, 'reload')
  if (stage !== 'contact') return frame(name, stage)
  const special = intent.id === 'critical' || ['seal', 'escort', 'vitality'].includes(intent.mechanic?.kind ?? '')
  return frame(name, special ? 'special-contact' : repeated ? 'repeat-contact' : 'contact')
}

export function hurtFrame(name: string, damage: number, defeated: boolean, age: number) {
  if (defeated && age >= 149) return name === 'boss' ? frame('boss-special', 'defeated') : frame(name, 'down')
  if (defeated && age >= 53) return frame(name, 'fall')
  return frame(name, damage >= 5 && age >= 45 ? 'heavy-hit' : 'hit')
}
