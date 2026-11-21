import {
  adapt, adaptAndReroll, allAttack, allGuard, alwaysReroll, balanced,
  countTradeoffs, simulate,
} from '../src/simulate.ts'

const seeds = 512
const policies = { allAttack, allGuard, balanced, neverReroll: adapt, alwaysReroll, adaptAndReroll }
for (const [name, policy] of Object.entries(policies)) {
  const histories = Array.from({ length: seeds }, (_, seed) => simulate(seed, policy))
  const finals = histories.map((history) => history.at(-1))
  const completed = finals.filter((battle) => battle.phase === 'won' || battle.phase === 'lost')
  const plans = histories.flatMap((history) => history.filter((battle) =>
    battle.phase === 'assign' && !battle.slots.includes(null),
  ))
  const wins = finals.filter((battle) => battle.phase === 'won')
  console.log(JSON.stringify({
    policy: name,
    seeds,
    wins: wins.length,
    losses: completed.length - wins.length,
    incomplete: seeds - completed.length,
    awakened: finals.filter((battle) => battle.awakened).length,
    winsWithAwakening: wins.filter((battle) => battle.awakened).length,
    rouletteSpins: histories.reduce((sum, history) =>
      sum + history.filter((battle) => battle.phase === 'counter').length, 0),
    meanTurns: Number((completed.reduce((sum, battle) => sum + battle.turn, 0) / completed.length).toFixed(2)),
    turnsWithSeveralTradeoffs: plans.filter((battle) => countTradeoffs(battle) > 1).length,
    turnsObserved: plans.length,
  }))
}
