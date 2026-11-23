import { playAscent } from '../level.mjs'
import { rewardOffers } from '../../src/ascent.ts'
import { pickOfferedPerk, START_PERKS } from '../../src/perks.ts'
import { isRelic } from '../../src/rewards.ts'

const firstSeed = 8192
const sample = 4096
const trainingWins = Object.fromEntries(Object.keys(START_PERKS).map((perk) => [
  perk, Array.from({ length: 512 }, (_, seed) => playAscent(seed, perk, undefined, 'guardFirst'))
    .filter(({ wins }) => wins === 3).length,
]))
const seeds = Array.from({ length: sample }, (_, index) => firstSeed + index)
const perks = seeds.map((seed) => pickOfferedPerk(seed, (perk) => trainingWins[perk]))

for (const bot of ['guardFirst', 'adaptive']) {
  for (const hasRewards of [false, true]) {
    const choices = {}
    const choose = hasRewards ? (ascent) => {
      const offers = rewardOffers(ascent)
      const choice = offers.includes('bandage') ? 'bandage' : offers.find(isRelic) ?? 'skip'
      choices[choice] = (choices[choice] ?? 0) + 1
      return choice
    } : undefined
    const runs = seeds.map((seed, index) => playAscent(seed, perks[index], undefined, bot, true, choose))
    const floors = [0, 1, 2].map((index) => {
      const entrants = runs.filter(({ fightTurns }) => fightTurns.length > index)
      const wins = entrants.filter(({ wins }) => wins > index).length
      return { entered: entrants.length, wins, turns: entrants.reduce((sum, run) => sum + run.fightTurns[index], 0) / entrants.length }
    })
    console.log(JSON.stringify({ bot, hasRewards, sample, completed: floors[2].wins, floors, choices }))
  }
}
