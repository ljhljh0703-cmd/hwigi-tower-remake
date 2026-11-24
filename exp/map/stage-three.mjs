import { pathToFileURL } from 'node:url'
import { planAscentTurn, playAscent } from '../level.mjs'
import {
  ascentFinished, availableMapNodes, beginMapAscent, enterMapNode, resolveAscentTurn, returnToMap,
  rewardOffers, spinAscentCounter, takeAscentReward,
} from '../../src/ascent.ts'
import { draw } from '../../src/combat.ts'
import { pickOfferedPerk, START_PERKS } from '../../src/perks.ts'
import { ARTIFACTS, isArtifact } from '../../src/treasure.ts'
import { canResolveYachtTurn } from '../../src/yacht-combat.ts'
import { optionsFor, pickTreasure, planTreasureTurn } from './stage-two.mjs'

const safeOrder = ['event', 'shop', 'rest', 'fight', 'elite']
const eliteOrder = ['elite', 'event', 'shop', 'rest', 'fight']

export function playRulesThree(seed, perk, policy, preferElite, record) {
  const parity = draw(seed, 0, 21) % 2 ? 'odd' : 'even'
  let run = beginMapAscent(seed, perk, parity, 3)
  const path = []
  const offered = {}
  const choices = {}
  const shop = {}
  let bossTurns = 0
  let bossHp = 0
  let bossItems = 0
  let bossArtifacts = []
  let cancelled = 0
  let totalTurns = 0
  const order = preferElite ? eliteOrder : safeOrder
  while (!ascentFinished(run)) {
    const nodes = availableMapNodes(run)
    const nextKind = order.find((kind) => nodes.some((node) => node.kind === kind))
    const node = nodes.find((candidate) => candidate.kind === nextKind) ?? nodes[0]
    run = enterMapNode(run, node.id)
    path.push(node.id)
    record?.({ type: 'map', node })
    if (node.kind === 'boss') {
      bossHp = run.battle.playerHp
      bossItems = Object.values(run.battle.loot.items).reduce((sum, count) => sum + count, 0)
      bossArtifacts = [...run.battle.loot.equipped].sort()
    }
    while (run.route.screen === 'battle') {
      if (run.battle.turn > 120) throw new Error(`Unfinished fight: ${seed}, ${node.floor}, ${policy}`)
      const rolls = []
      const plan = record
        ? planAscentTurn(run.battle, policy, true, (indices, extra) => rolls.push({ indices, extra }))
        : planTreasureTurn(run.battle, policy)
      if (!canResolveYachtTurn(plan)) throw new Error(`Invalid plan: ${seed}, ${node.floor}, ${policy}`)
      if (plan.erasedStrikeTurn === plan.turn) cancelled++
      record?.({ type: 'turn', rolls, plan, node })
      run = resolveAscentTurn({ ...run, battle: plan })
      if (run.battle.phase === 'counter') {
        record?.({ type: 'counter' })
        run = spinAscentCounter(run)
        if (run.battle.loot.counter) {
          const rolled = run.battle.loot.counter
          const horn = !rolled.joint && rolled.damage < 8 && run.battle.loot.counterFlags?.horn && run.battle.enemyHp > rolled.damage
          const preferred = horn ? 'horn' : 'mirror'
          const next = spinAscentCounter(run, preferred)
          const choice = next === run ? 'now' : preferred
          record?.({ type: 'counter', choice })
          run = choice === 'now' ? spinAscentCounter(run, choice) : next
        }
      }
      totalTurns++
      if (node.kind === 'boss') bossTurns++
    }
    if (ascentFinished(run)) break
    const choice = pickTreasure(run)
    const options = optionsFor(run, choice)
    for (const card of rewardOffers(run)) offered[card] = (offered[card] ?? 0) + 1
    choices[choice] = (choices[choice] ?? 0) + 1
    if (node.kind === 'shop') {
      const group = isArtifact(choice) ? 'artifact' : choice
      shop[group] = (shop[group] ?? 0) + 1
    }
    const next = takeAscentReward(run, choice, options)
    if (next === run) throw new Error(`Invalid reward: ${seed}, ${node.floor}, ${choice}`)
    record?.({ type: 'reward', choice, options, node })
    run = returnToMap(next)
  }
  return { seed, perk, parity, path, completed: run.route.completed.length, totalTurns, bossTurns, bossHp, bossItems, bossArtifacts, cancelled, offered, choices, shop }
}

export function weightedPerks() {
  const scores = Object.fromEntries(Object.keys(START_PERKS).map((perk) => [
    perk, Array.from({ length: 256 }, (_, seed) => playAscent(seed, perk, undefined, 'guardFirst')).filter(({ wins }) => wins === 3).length,
  ]))
  return (seed) => pickOfferedPerk(seed, (perk) => scores[perk])
}

function totals(runs, field) {
  const counts = {}
  for (const run of runs) for (const [key, count] of Object.entries(run[field])) counts[key] = (counts[key] ?? 0) + count
  return counts
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pickPerk = weightedPerks()
  const seeds = Array.from({ length: 4096 }, (_, index) => 8192 + index)
  for (const policy of ['guardFirst', 'adaptive']) for (const preferElite of [false, true]) {
    if (process.argv[2] && process.argv[2] !== policy) continue
    const runs = seeds.map((seed) => playRulesThree(seed, pickPerk(seed), policy, preferElite))
    const boss = runs.filter(({ bossTurns }) => bossTurns)
    const mean = (group, key) => group.reduce((sum, run) => sum + run[key], 0) / group.length
    const floors = Array.from({ length: 12 }, (_, index) => ({
      entered: runs.filter(({ path }) => path.length > index).length,
      completed: runs.filter(({ completed }) => completed > index).length,
    }))
    const countBoss = (match) => {
      const group = boss.filter(match)
      return [group.length, group.filter(({ completed }) => completed === 12).length]
    }
    const slots = [0, 1, 2, 3].map((slot) => countBoss(({ bossArtifacts }) => bossArtifacts.length === slot))
    const pairs = ARTIFACTS.flatMap((first, index) => ARTIFACTS.slice(index + 1).map((second) => [
      first, second, ...countBoss(({ bossArtifacts }) => bossArtifacts.includes(first) && bossArtifacts.includes(second)),
    ])).filter(([, , entered]) => entered)
    console.log(JSON.stringify({
      policy, preferElite, sample: seeds.length, floors, bossTurns: mean(boss, 'bossTurns'), bossHp: mean(boss, 'bossHp'),
      bossItems: mean(boss, 'bossItems'), cancelled: runs.reduce((sum, run) => sum + run.cancelled, 0),
      offered: totals(runs, 'offered'), choices: totals(runs, 'choices'), shop: totals(runs, 'shop'), slots, pairs,
    }))
  }
}
