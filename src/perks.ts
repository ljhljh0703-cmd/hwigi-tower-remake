import { COUNTER_REWARDS, draw } from './combat.ts'
import type { CounterReward } from './combat.ts'

export const START_PERKS = {
  shield: { step: 5, name: '방패 저금', icon: 'parry' },
  blade: { threshold: 15, multiplier: 2, name: '큰 칼', icon: 'sword' },
  collector: { initial: 0, step: 1, name: '족보 수집가', icon: 'pair' },
  reroll: { cost: 1, name: '악마의 재굴림', icon: 'devil-die' },
  oath: { bonus: 3, name: '홀짝 서약', icon: 'die' },
  counter: { step: 5, name: '역습 표식', icon: 'wheel' },
} as const

export type StartPerk = keyof typeof START_PERKS
export type Parity = 'odd' | 'even'
export type CollectedHand = 'pair' | 'triple' | 'four' | 'straight'

export type PerkState =
  | { readonly kind: 'shield'; readonly bonus: number }
  | { readonly kind: 'blade'; readonly charge: number }
  | { readonly kind: 'collector'; readonly hands: readonly CollectedHand[] }
  | { readonly kind: 'reroll' }
  | { readonly kind: 'oath'; readonly parity: Parity }
  | { readonly kind: 'counter'; readonly rewards: readonly CounterReward[]; readonly growth: number }

export function startPerk(perk: StartPerk | undefined, parity: Parity = 'odd'): PerkState | undefined {
  switch (perk) {
    case 'shield': return { kind: perk, bonus: 0 }
    case 'blade': return { kind: perk, charge: 0 }
    case 'collector': return { kind: perk, hands: [] }
    case 'reroll': return { kind: perk }
    case 'oath': return { kind: perk, parity }
    case 'counter': return { kind: perk, rewards: COUNTER_REWARDS, growth: 0 }
  }
}

export function collectorBonus(hands: readonly CollectedHand[]): number {
  return START_PERKS.collector.initial + hands.length * START_PERKS.collector.step
}

export function offerPerks(seed: number): readonly StartPerk[] {
  const remaining = Object.keys(START_PERKS) as StartPerk[]
  return Array.from({ length: 3 }, (_, index) =>
    remaining.splice(draw(seed, 0, index) % remaining.length, 1)[0],
  )
}

export function pickOfferedPerk(seed: number, completion: (perk: StartPerk) => number): StartPerk {
  const offers = offerPerks(seed)
  const weights = offers.map(completion)
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let ticket = draw(seed, 0, 20) / 0x100000000 * (total || offers.length)
  for (const [index, perk] of offers.entries()) {
    ticket -= total ? weights[index] : 1
    if (ticket < 0) return perk
  }
  return offers[offers.length - 1]
}
