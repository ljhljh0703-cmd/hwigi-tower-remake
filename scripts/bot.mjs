import { attackOnly, readIntent, simulate } from '../src/simulate.ts'

const seeds = 256
for (const [name, policy] of Object.entries({ readIntent, attackOnly })) {
  const finals = Array.from({ length: seeds }, (_, seed) => simulate(seed, policy).at(-1))
  const turns = finals.map((battle) => battle.turn)
  console.log(JSON.stringify({
    policy: name,
    seeds,
    wins: finals.filter((battle) => battle.outcome === 'won').length,
    losses: finals.filter((battle) => battle.outcome === 'lost').length,
    shortest: Math.min(...turns),
    longest: Math.max(...turns),
  }))
}
