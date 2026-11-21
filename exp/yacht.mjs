import { yachtPolicies } from '../src/yacht-policy.ts'
import { simulateYacht, yachtVariants } from '../src/yacht-simulate.ts'

const seeds = 512
const emptyTurnCounts = () => ({ total: 0, guardThree: 0, atMostOneChoice: 0 })

for (const [variant, enabled] of Object.entries(yachtVariants)) {
  for (const policy of yachtPolicies) {
    const counts = {
      variant, policy, seeds,
      firstWins: 0,
      secondEntered: 0,
      secondWins: 0,
      incompleteFights: 0,
      unlocks: { triple: { attack: 0, guard: 0 }, straight: { attack: 0, guard: 0 } },
      secondPowers: { fourthDie: 0, extraReroll: 0, both: 0 },
      turns: { 3: emptyTurnCounts(), 4: emptyTurnCounts() },
      rouletteSpins: 0,
    }
    for (let seed = 0; seed < seeds; seed += 1) {
      const { first, second, unlocks } = simulateYacht(seed, enabled, policy)
      if (first.end.phase === 'won') counts.firstWins += 1
      if (second) {
        counts.secondEntered += 1
        if (second.end.phase === 'won') counts.secondWins += 1
        const fourthDie = second.start.dice.length === 4
        const extraReroll = second.start.extraRerollAvailable
        if (fourthDie) counts.secondPowers.fourthDie += 1
        if (extraReroll) counts.secondPowers.extraReroll += 1
        if (fourthDie && extraReroll) counts.secondPowers.both += 1
      }
      for (const { hand, slot } of unlocks) counts.unlocks[hand][slot] += 1
      for (const fight of second ? [first, second] : [first]) {
        if (fight.end.phase === 'assign') counts.incompleteFights += 1
        for (const turn of fight.turns) {
          const group = counts.turns[turn.diceCount]
          group.total += 1
          if (turn.guards === 3) group.guardThree += 1
          if (turn.tradeoffs <= 1) group.atMostOneChoice += 1
          if (turn.roulette) counts.rouletteSpins += 1
        }
      }
    }
    console.log(JSON.stringify(counts))
  }
}
