import { beginAscent, FIGHT_COUNT, nextAscentFight, resolveAscentTurn } from '../src/ascent.ts'
import { assignDie } from '../src/combat.ts'
import { offerPerks, START_PERKS } from '../src/perks.ts'
import {
  rerollYachtDice, spendExtraReroll, spinYachtCounter,
} from '../src/yacht-combat.ts'
import { chooseAllocation, chooseReroll } from '../src/yacht-policy.ts'

const policy = 'adaptive'
const seeds = Array.from({ length: 512 }, (_, seed) => seed)
const perks = Object.keys(START_PERKS)

function playTurn(ascent) {
  let { battle } = ascent
  while (true) {
    const indices = chooseReroll(battle, policy, false)
    const rerolled = rerollYachtDice(battle, indices)
    if (rerolled === battle) break
    battle = rerolled
  }
  if (battle.extraRerollAvailable && battle.rerolled) {
    const [index] = chooseReroll(battle, policy, true)
    if (index !== undefined) battle = spendExtraReroll(battle, index)
  }
  for (const [index, slot] of chooseAllocation(battle, policy).entries()) {
    battle = assignDie(battle, index, slot)
  }
  const resolved = resolveAscentTurn({ ...ascent, battle })
  return { ...resolved, battle: spinYachtCounter(resolved.battle) }
}

function playAscent(seed, perk) {
  let ascent = beginAscent(seed, perk)
  for (let fight = 1; fight <= FIGHT_COUNT; fight++) {
    for (let turn = 0; turn < 30 && ascent.battle.phase === 'assign'; turn++) {
      ascent = playTurn(ascent)
    }
    if (ascent.battle.phase === 'lost') return fight - 1
    if (ascent.battle.phase !== 'won') throw new Error(`Unfinished fight: ${seed}, ${perk}, ${fight}`)
    ascent = nextAscentFight(ascent)
  }
  return FIGHT_COUNT
}

const results = new Map(perks.map((perk) => {
  const wins = seeds.map((seed) => playAscent(seed, perk))
  const fightWins = [1, 2, 3].map((fight) => wins.filter((count) => count >= fight).length)
  return [perk, { wins, fightWins, offered: 0, picked: 0 }]
}))

let completed = 0
for (const seed of seeds) {
  let best
  let bestScore = -1
  for (const perk of offerPerks(seed)) {
    const result = results.get(perk)
    result.offered++
    // Rank by completions on the other 511 seeds. Keep offer order on ties.
    const score = result.fightWins[2] - Number(result.wins[seed] === FIGHT_COUNT)
    if (score > bestScore) {
      bestScore = score
      best = result
    }
  }
  best.picked++
  completed += Number(best.wins[seed] === FIGHT_COUNT)
}

for (const [perk, { fightWins, offered, picked }] of results) {
  console.log(JSON.stringify({ perk, seeds: seeds.length, fightWins, offered, picked }))
}
console.log(JSON.stringify({ chooser: 'leave-one-seed-out', seeds: seeds.length, completed }))
