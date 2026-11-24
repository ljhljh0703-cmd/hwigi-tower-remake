import { playAscent } from '../level.mjs'
import { FIGHT_COUNT, rewardOffers } from '../../src/ascent.ts'
import { enemyForFight } from '../../src/enemy-roster.ts'
import { pickOfferedPerk, START_PERKS } from '../../src/perks.ts'
import { isRelic, RELICS } from '../../src/rewards.ts'

const firstSeed = 8192
const sample = 4096
const boss = enemyForFight(0, FIGHT_COUNT)
const bossHealths = process.argv.length > 2 ? process.argv.slice(2).map(Number) : [boss.hp]
if (bossHealths.some((hp) => !Number.isSafeInteger(hp) || hp <= 0)) throw new Error('Boss HP must be a positive integer')

// Keep the starting perk weights fixed to the original 84-HP study.
boss.hp = 84
const trainingWins = Object.fromEntries(Object.keys(START_PERKS).map((perk) => [
  perk, Array.from({ length: 512 }, (_, seed) => playAscent(seed, perk, undefined, 'guardFirst'))
    .filter(({ wins }) => wins === 3).length,
]))
const seeds = Array.from({ length: sample }, (_, index) => firstSeed + index)
const perks = seeds.map((seed) => pickOfferedPerk(seed, (perk) => trainingWins[perk]))

function measure(bossHp, bot) {
  for (const hasRewards of [false, true]) {
    const choices = {}
    const activations = Object.fromEntries(RELICS.map((relic) => [relic, { held: 0, activated: 0 }]))
    const observe = hasRewards ? (_fight, _planning, ascent, opening) => {
      for (const relic of opening.rewards?.relics ?? []) {
        if (opening.turn === 1) activations[relic].held++
        if (!opening.rewards.spent.includes(relic) && ascent.battle.rewards.spent.includes(relic)) {
          activations[relic].activated++
        }
      }
    } : undefined
    const choose = hasRewards ? (ascent) => {
      const offers = rewardOffers(ascent)
      const choice = offers.includes('bandage') ? 'bandage' : offers.find(isRelic) ?? 'skip'
      choices[choice] = (choices[choice] ?? 0) + 1
      return choice
    } : undefined
    const runs = seeds.map((seed, index) => playAscent(seed, perks[index], observe, bot, true, choose))
    const floors = [0, 1, 2].map((index) => {
      const entrants = runs.filter(({ fightTurns }) => fightTurns.length > index)
      const wins = entrants.filter(({ wins }) => wins > index).length
      return { entered: entrants.length, wins, turns: entrants.reduce((sum, run) => sum + run.fightTurns[index], 0) / entrants.length }
    })
    console.log(JSON.stringify({ bossHp, bot, hasRewards, sample, completed: floors[2].wins, floors, choices, ...(hasRewards && { activations }) }))
  }
}

for (const bossHp of bossHealths) {
  boss.hp = bossHp
  for (const bot of ['guardFirst', 'adaptive']) measure(bossHp, bot)
}
