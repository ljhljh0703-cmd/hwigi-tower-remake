import { playAscent } from '../level.mjs'
import { enemyIntentAt } from '../../src/combat.ts'
import { enemyForFight } from '../../src/enemy-roster.ts'
import { offerPerks, START_PERKS } from '../../src/perks.ts'

const firstSeed = Number(process.argv[2] ?? 8192)
const count = Number(process.argv[3] ?? 4096)
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

const runs = Array.from({ length: count }, (_, index) => {
  const seed = firstSeed + index
  const key = [enemyForFight(seed, 1).id, enemyForFight(seed, 2).id].join('/')
  const run = playAscent(seed, pickPerk(seed), 'devil', (_fight, battle, ascent) => {
    const id = ascent.enemy.id
    if (!byEnemy.has(id)) byEnemy.set(id, [])
    byEnemy.get(id).push(battle)
  })
  if (!byPair.has(key)) byPair.set(key, [])
  byPair.get(key).push(run)
  return run
})

console.log(JSON.stringify({ firstSeed, count, trainingWins: Object.fromEntries(trainingWins), wins: winCounts(runs) }))
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
