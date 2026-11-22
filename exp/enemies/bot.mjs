import { playAscent } from '../level.mjs'
import { enemyIntentAt } from '../../src/combat.ts'
import { ASCENT_ENEMIES, enemyForFight } from '../../src/enemy-roster.ts'
import { pickOfferedPerk, START_PERKS } from '../../src/perks.ts'
import { yachtAllocationTotals } from '../../src/yacht-combat.ts'

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
const trainingWins = Object.fromEntries(perks.map((perk) => [
  perk, Array.from({ length: 512 }, (_, seed) => playAscent(seed, perk, undefined, 'guardFirst'))
    .filter(({ wins }) => wins === 3).length,
]))

function pickPerk(seed) {
  return pickOfferedPerk(seed, (perk) => trainingWins[perk])
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

function summarizeLengths(runs) {
  return [0, 1, 2].map((index) => {
    const turns = runs.filter((run) => run.fightTurns.length > index)
      .map((run) => run.fightTurns[index]).sort((a, b) => a - b)
    const wins = runs.filter((run) => run.wins > index)
    return {
      entered: turns.length, mean: turns.reduce((sum, turn) => sum + turn, 0) / turns.length,
      p95: turns[Math.ceil(turns.length * 0.95) - 1], max: turns.at(-1),
      winMean: wins.reduce((sum, run) => sum + run.fightTurns[index], 0) / wins.length,
    }
  })
}

function summarizeEnemies(runs, fight) {
  return ASCENT_ENEMIES[fight - 1].map(({ id }) => {
    const group = runs.filter((run) => run.wins >= fight - 1 && enemyForFight(run.seed, fight).id === id)
    return { id, entered: group.length, wins: group.filter((run) => run.wins >= fight).length }
  })
}

function summarizeCharges(runs, fight) {
  const turns = runs.flatMap((run) => run.charges.filter((charge) => !fight || charge.fight === fight))
  const reached = turns.filter((charge) => charge.broken).length
  const threeDice = turns.filter((charge) => charge.dice === 3)
  const qualifyingRuns = runs.filter((run) => run.charges.some((charge) => charge.broken && (!fight || charge.fight === fight)))
  const ready = threeDice.filter((charge) => charge.opening >= charge.threshold)
  const short = threeDice.filter((charge) => charge.opening < charge.threshold)
  const attempts = short.filter((charge) => charge.rerolled)
  return {
    turns: turns.length, reached,
    threeDice: threeDice.length, threeDiceReached: threeDice.filter((charge) => charge.broken).length,
    qualifyingRuns: qualifyingRuns.length, completed: qualifyingRuns.filter((run) => run.wins === 3).length,
    ready: ready.length, readyRerolled: ready.filter((charge) => charge.rerolled).length,
    short: short.length, attempts: attempts.length, attemptsReached: attempts.filter((charge) => charge.broken).length,
    attemptsLower: attempts.filter((charge) => charge.after < charge.opening).length,
  }
}

function summarizeUnlocks(runs) {
  return [true, false].map((triple) => {
    const group = runs.filter((run) => run.triple === triple)
    return { triple, runs: group.length, completed: group.filter((run) => run.wins === 3).length }
  })
}

function attackSum(battle) {
  return yachtAllocationTotals(battle, battle.dice.map(() => 'attack')).attack
}

function measure(runs) {
  const wins = winCounts(runs)
  const survivors = runs.filter((run) => run.wins >= 1).map((run) => run.firstWinHp).sort((a, b) => a - b)
  const hpSum = survivors.reduce((sum, hp) => sum + hp, 0)
  const middle = (survivors.length - 1) / 2
  return {
    wins, firstFightMeanHp: hpSum / runs.length, winnerMeanHp: hpSum / survivors.length,
    eliteMedianHp: (survivors[Math.floor(middle)] + survivors[Math.ceil(middle)]) / 2,
    lengths: summarizeLengths(runs),
  }
}

function runPolicy(policy, perkAware = true) {
  const runs = Array.from({ length: count }, (_, index) => {
    const seed = firstSeed + index
    const perk = pickPerk(seed)
    const charges = []
    let firstWinHp = 0
    const result = playAscent(seed, perk, (fight, battle, ascent, opening) => {
      if (fight === 1 && ascent.battle.phase === 'won') firstWinHp = ascent.battle.playerHp
      if (policy === 'adaptive') {
        const id = ascent.enemy.id
        if (!byEnemy.has(id)) byEnemy.set(id, [])
        byEnemy.get(id).push(battle)
      }
      const threshold = enemyIntentAt(battle).chargeThreshold
      if (threshold !== undefined) {
        charges.push({
          fight, threshold, dice: battle.dice.length, opening: attackSum(opening), after: attackSum(battle),
          rerolled: battle.rerolled, broken: Boolean(ascent.battle.lastExchange?.chargeBroken),
        })
      }
    }, policy, perkAware)
    const run = { ...result, seed, perk, charges, firstWinHp }
    if (policy === 'adaptive') {
      const key = [enemyForFight(seed, 1).id, enemyForFight(seed, 2).id].join('/')
      if (!byPair.has(key)) byPair.set(key, [])
      byPair.get(key).push(run)
    }
    return run
  })
  console.log(JSON.stringify({
    policy, perkAware, firstSeed, count, trainingWins, ...measure(runs),
    picked: Object.fromEntries(perks.map((perk) => [perk, runs.filter((run) => run.perk === perk).length])),
    minions: summarizeEnemies(runs, 1), elites: summarizeEnemies(runs, 2),
  }))
  console.log(JSON.stringify({
    policy, perkAware, chargeThreshold: chargeIntents[0]?.chargeThreshold, all: summarizeCharges(runs),
    elite: summarizeCharges(runs, 2), boss: summarizeCharges(runs, 3),
  }))
  return runs
}

if (process.argv.includes('--compare-perks')) {
  for (const [policy, perkAware] of [['guardFirst', false], ['guardFirst', true], ['adaptive', true]]) {
    for (const perk of [undefined, ...perks]) {
      const runs = Array.from({ length: count }, (_, index) => {
        let firstWinHp = 0
        const result = playAscent(firstSeed + index, perk, (fight, _battle, ascent) => {
          if (fight === 1 && ascent.battle.phase === 'won') firstWinHp = ascent.battle.playerHp
        }, policy, perkAware)
        return { ...result, firstWinHp }
      })
      console.log(JSON.stringify({ policy, perkAware, perk: perk ?? null, firstSeed, count, ...measure(runs) }))
    }
  }
}

const runs = runPolicy('adaptive')
runPolicy('guardFirst')
if (process.argv.includes('--compare-perks')) runPolicy('guardFirst', false)
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
