import { COUNTER_REWARDS, draw } from './combat.ts'
import type { CounterReward } from './combat.ts'
import { isMetaPerk, META_PERKS, META_STAGES } from './meta-unlocks.ts'
import type { MetaFloor, MetaPerk } from './meta-unlocks.ts'

export const START_PERKS = {
  shield: { step: 8, name: '방패 저금', icon: 'parry' },
  blade: { threshold: 12, multiplier: 2, name: '큰 칼', icon: 'sword' },
  collector: { initial: 0, step: 1, maximum: 2, name: '족보 수집가', icon: 'pair' },
  reroll: { cost: 1, name: '악마의 재굴림', icon: 'devil-die' },
  oath: { bonus: 1, name: '홀짝 서약', icon: 'die' },
  counter: { step: 7, name: '역습 표식', icon: 'wheel' },
} as const

export const START_PERK_CARDS = { ...START_PERKS, ...META_PERKS }
export type StartPerk = keyof typeof START_PERK_CARDS
export type Parity = 'odd' | 'even'
export type CollectedHand = 'pair' | 'triple' | 'four' | 'straight'

export type PerkState =
  | { readonly kind: 'shield'; readonly bonus: number }
  | { readonly kind: 'blade'; readonly charge: number }
  | { readonly kind: 'collector'; readonly hands: readonly CollectedHand[] }
  | { readonly kind: 'reroll' }
  | { readonly kind: 'oath'; readonly parity: Parity }
  | { readonly kind: 'counter'; readonly rewards: readonly CounterReward[]; readonly growth: number }
  | { readonly kind: 'reverse-guard'; readonly spent?: true }
  | { readonly kind: Exclude<MetaPerk, 'reverse-guard'> }

export function startPerk(perk: StartPerk | undefined, parity: Parity = 'odd'): PerkState | undefined {
  switch (perk) {
    case 'shield': return { kind: perk, bonus: 0 }
    case 'blade': return { kind: perk, charge: 0 }
    case 'collector': return { kind: perk, hands: [] }
    case 'reroll': return { kind: perk }
    case 'oath': return { kind: perk, parity }
    case 'counter': return { kind: perk, rewards: COUNTER_REWARDS, growth: 0 }
  }
  return isMetaPerk(perk) ? { kind: perk } : undefined
}

export function collectorBonus(hands: readonly CollectedHand[]): number {
  const { initial, step, maximum } = START_PERKS.collector
  return Math.min(maximum, initial + hands.length * step)
}

export function offerPerks(seed: number, pool: readonly MetaFloor[] = []): readonly StartPerk[] {
  const remaining = Object.keys(START_PERKS) as (keyof typeof START_PERKS)[]
  const regular = Array.from({ length: 3 }, (_, index) =>
    remaining.splice(draw(seed, 0, index) % remaining.length, 1)[0],
  )
  const unlocked = META_STAGES.filter(({ floor }) => pool.includes(floor))
  if (!unlocked.length) return regular
  return [...regular, unlocked[draw(seed, 0, 19) % unlocked.length].perk]
}

export function pickOfferedPerk(seed: number, completion: (perk: StartPerk) => number, pool?: readonly MetaFloor[]): StartPerk {
  const offers = offerPerks(seed, pool)
  const weights = offers.map(completion)
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let ticket = draw(seed, 0, 20) / 0x100000000 * (total || offers.length)
  for (const [index, perk] of offers.entries()) {
    ticket -= total ? weights[index] : 1
    if (ticket < 0) return perk
  }
  return offers[offers.length - 1]
}
