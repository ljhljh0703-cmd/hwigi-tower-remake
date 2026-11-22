import { playAscent } from '../level.mjs'
import { enemyIntentAt } from '../../src/combat.ts'
import { ASCENT_ENEMIES, enemyForFight } from '../../src/enemy-roster.ts'
import { offerPerks, START_PERKS } from '../../src/perks.ts'

const [seedArgument, countArgument, thresholdArgument] = process.argv.slice(2).filter((argument) => !argument.startsWith('--'))
const firstSeed = Number(seedArgument ?? 8192)
const count = Number(countArgument ?? 4096)
const chargeIntents = ASCENT_ENEMIES.flat().flatMap((enemy) => enemy.intents)
  .filter((intent) => intent.chargeThreshold !== undefined)
if (thresholdArgument !== undefined) {
  const threshold = Number(thresholdArgument)
  if (!Number.isInteger(threshold) || threshold < 1) throw new Error('Expected a positive integer threshold')
  for (const intent of chargeIntents) intent.chargeThreshold = threshold
}
const perks = Object.keys(START_PERKS)
const trainingWins = new Map(perks.map((perk) => [
  perk, Array.from({ length: 512 }, (_, seed) => playAscent(seed, perk)).filter(({ wins }) => wins === 3).length,
]))

function pickPerk(seed) {
  const offers = offerPerks(seed)
  return offers.reduce((best, perk) => trainingWins.get(perk) > trainingWins.get(best) ? perk : best)
}

const byPair = new Map()
const byEnemy = new Map()
const mechanics = {
  thorns: 'thorns', lock: 'lock', freeze: 'freeze', rage: 'rage', reaction: 'reaction',
  vitality: 'vitality', seal: 'boss', steal: 'escort', escort: 'escort',
}

function active(battle, mechanic) {
  if (mechanic === 'lock' || mechanic === 'freeze') return battle.fixedDie?.kind === mechanic
  if (mechanic === 'steal') return Boolean(battle.stolenDie)
  if (mechanic === 'escort') return Boolean(battle.escort)
  return enemyIntentAt(battle).mechanic?.kind === mechanic
}

function distribution(turns) {
  const dice = turns.reduce((sum, battle) => sum + battle.slots.length, 0)
  const share = (slot) => turns.reduce((sum, battle) => sum + battle.slots.filter((assigned) => assigned === slot).length, 0) / dice
  return {
    turns: turns.length,
    attack: share('attack'),
    guard: share('guard'),
    escort: share('escort'),
    rerolled: turns.filter((battle) => battle.rerolled).length / turns.length,
  }
}

function winCounts(results) {
  return [0, 1, 2, 3].map((fight) => results.filter(({ wins }) => wins >= fight).length)
}

function summarizeCharges(runs, fight) {
  const turns = runs.flatMap((run) => run.charges.filter((charge) => !fight || charge.fight === fight))
  const reached = turns.filter((charge) => charge.broken).length
  const threeDice = turns.filter((charge) => charge.dice === 3)
  const qualifyingRuns = runs.filter((run) => run.charges.some((charge) => charge.broken && (!fight || charge.fight === fight)))
  return {
    turns: turns.length, reached,
    threeDice: threeDice.length, threeDiceReached: threeDice.filter((charge) => charge.broken).length,
    qualifyingRuns: qualifyingRuns.length, completed: qualifyingRuns.filter((run) => run.wins === 3).length,
  }
}

function summarizeUnlocks(runs) {
  return [true, false].map((triple) => {
    const group = runs.filter((run) => run.triple === triple)
    return { triple, runs: group.length, completed: group.filter((run) => run.wins === 3).length }
  })
}

const runs = Array.from({ length: count }, (_, index) => {
  const seed = firstSeed + index
  const perk = pickPerk(seed)
  const key = [enemyForFight(seed, 1).id, enemyForFight(seed, 2).id].join('/')
  const charges = []
  const result = playAscent(seed, perk, 'devil', (fight, battle, ascent) => {
    const id = ascent.enemy.id
    if (!byEnemy.has(id)) byEnemy.set(id, [])
    byEnemy.get(id).push(battle)
    if (enemyIntentAt(battle).chargeThreshold !== undefined) {
      charges.push({ fight, dice: battle.dice.length, broken: Boolean(ascent.battle.lastExchange?.chargeBroken) })
    }
  })
  const run = { ...result, seed, perk, charges }
  if (!byPair.has(key)) byPair.set(key, [])
  byPair.get(key).push(run)
  return run
})

console.log(JSON.stringify({ firstSeed, count, trainingWins: Object.fromEntries(trainingWins), wins: winCounts(runs) }))
console.log(JSON.stringify({
  chargeThreshold: chargeIntents[0]?.chargeThreshold, all: summarizeCharges(runs),
  elite: summarizeCharges(runs, 2), boss: summarizeCharges(runs, 3),
}))
console.log(JSON.stringify({ chargeInterruption: true, unlocks: summarizeUnlocks(runs) }))
if (process.argv.includes('--compare-unlock-gap')) {
  // Keep the same seed, perk and enemy moves in the interruption-off replay.
  for (const intent of chargeIntents) intent.chargeThreshold = Infinity
  const uninterrupted = runs.map(({ seed, perk }) => playAscent(seed, perk))
  console.log(JSON.stringify({ chargeInterruption: false, unlocks: summarizeUnlocks(uninterrupted) }))
}
for (const [pair, results] of [...byPair].sort()) {
  console.log(JSON.stringify({ pair, wins: winCounts(results) }))
}
for (const [mechanic, enemy] of Object.entries(mechanics)) {
  const turns = byEnemy.get(enemy) ?? []
  console.log(JSON.stringify({
    mechanic,
    on: distribution(turns.filter((battle) => active(battle, mechanic))),
    off: distribution(turns.filter((battle) => !active(battle, mechanic))),
  }))
}
