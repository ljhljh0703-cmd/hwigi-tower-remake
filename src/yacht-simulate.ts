import { PLAYER_HP } from './combat.ts'
import {
  rerollYachtDice, resolveYachtTurn, spendExtraReroll, spinYachtCounter, startYachtBattle,
} from './yacht-combat.ts'
import type { Hand, UsedHand, YachtBattle } from './yacht-combat.ts'
import { chooseAllocation, chooseReroll, countYachtTradeoffs } from './yacht-policy.ts'
import type { YachtPolicy } from './yacht-policy.ts'

export const yachtVariants = {
  baseline: [],
  triple: ['triple'],
  straight: ['straight'],
  both: ['triple', 'straight'],
} as const satisfies Record<string, readonly Hand[]>

interface YachtTurn {
  readonly diceCount: number
  readonly guards: number
  readonly tradeoffs: number
  readonly roulette: boolean
  readonly hand: UsedHand | null
}

interface YachtFight {
  readonly start: YachtBattle
  readonly end: YachtBattle
  readonly turns: readonly YachtTurn[]
}

interface Unlock extends UsedHand {
  readonly fight: 1 | 2
}

function fightEnemy(start: YachtBattle, policy: YachtPolicy): YachtFight {
  let battle = start
  const turns: YachtTurn[] = []
  while (turns.length < 30 && battle.phase === 'assign') {
    battle = rerollYachtDice(battle, chooseReroll(battle, policy, false))
    if (battle.rerolled && battle.extraRerollAvailable) {
      const [index] = chooseReroll(battle, policy, true)
      if (index !== undefined) battle = spendExtraReroll(battle, index)
    }
    const slots = chooseAllocation(battle, policy)
    const tradeoffs = countYachtTradeoffs(battle)
    const resolved = resolveYachtTurn({ ...battle, slots })
    const roulette = resolved.battle.phase === 'counter'
    turns.push({
      diceCount: battle.dice.length,
      guards: slots.filter((slot) => slot === 'guard').length,
      tradeoffs,
      roulette,
      hand: resolved.hand,
    })
    battle = roulette ? spinYachtCounter(resolved.battle) : resolved.battle
  }
  return { start, end: battle, turns }
}

// The legacy two-fight experiment applies unlocks between fights to preserve its original comparison.
// The live ascent applies unlocks during the fight in resolveAscentTurn.
export function simulateLegacyYacht(seed: number, enabled: readonly Hand[], policy: YachtPolicy) {
  const first = fightEnemy(startYachtBattle(seed, PLAYER_HP, false, false), policy)
  const unlocks = new Map<Hand, Unlock>()
  const recordUnlocks = (fight: 1 | 2, battle: YachtFight) => {
    for (const { hand } of battle.turns) {
      if (hand && enabled.includes(hand.hand) && !unlocks.has(hand.hand)) {
        unlocks.set(hand.hand, { ...hand, fight })
      }
    }
  }
  recordUnlocks(1, first)

  if (first.end.phase !== 'won') return { first, second: null, unlocks: [...unlocks.values()] }
  const secondSeed = (seed ^ 0x9e3779b9) >>> 0
  const second = fightEnemy(startYachtBattle(secondSeed, first.end.playerHp, unlocks.has('triple'), unlocks.has('straight')), policy)
  recordUnlocks(2, second)
  return { first, second, unlocks: [...unlocks.values()] }
}
