import { pathToFileURL } from 'node:url'
import {
  ascentFinished, availableMapNodes, beginMapAscent, enterMapNode, resolveAscentTurn,
  returnToMap, rewardOffers, spinAscentCounter, takeAscentReward,
} from '../../src/ascent.ts'
import { MAP_FLOORS } from '../../src/ascent-map.ts'
import { draw } from '../../src/combat.ts'
import { pickOfferedPerk, START_PERKS } from '../../src/perks.ts'
import { isRelic } from '../../src/rewards.ts'
import { planAscentTurn, playAscent } from '../level.mjs'

const rewardOrder = ['bandage', 'buckle', 'wedge', 'weight', 'rewind', 'tuning']

export function playMapAscent(seed, perk, { policy = 'guardFirst', preferElite = false, reverse = false, observe } = {}) {
  let run = beginMapAscent(seed, perk, draw(seed, 0, 21) % 2 ? 'odd' : 'even')
  const entrants = []
  let turns = 0
  while (!ascentFinished(run)) {
    const available = availableMapNodes(run)
    const kind = preferElite ? 'elite' : 'fight'
    const preferred = available.filter((node) => node.kind === kind)
    const eligible = preferred.length ? preferred : available
    const node = reverse ? eligible.at(-1) : eligible[0]
    run = enterMapNode(run, node.id)
    observe?.({ type: 'enter', node })
    entrants.push(node.floor)
    if (run.route.screen === 'rest') {
      run = returnToMap(run)
      observe?.({ type: 'map' })
      continue
    }
    while (run.route.screen === 'battle') {
      if (run.battle.turn > 120) throw new Error(`Unfinished fight: ${seed}, ${node.floor}, ${policy}`)
      const rolls = []
      const plan = planAscentTurn(run.battle, policy, true, observe && ((indices, extra) => rolls.push({ indices, extra })))
      const resolved = resolveAscentTurn({ ...run, battle: plan })
      const counter = resolved.battle.phase === 'counter'
      run = counter ? spinAscentCounter(resolved) : resolved
      turns++
      observe?.({ type: 'turn', rolls, slots: plan.slots, arm: plan.wedgeArmed, counter, hp: run.battle.playerHp })
    }
    if (run.route.screen === 'reward') {
      const offers = rewardOffers(run)
      const held = run.battle.rewards?.relics.length ?? 0
      const choice = rewardOrder.find((reward) => offers.includes(reward) && (!isRelic(reward) || held < 3)) ?? 'skip'
      observe?.({ type: 'reward', offers, choice })
      run = returnToMap(takeAscentReward(run, choice))
      observe?.({ type: 'map' })
    }
  }
  return { floors: run.route.completed.length, path: run.route.completed, entrants, turns, fights: run.fight }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scores = Object.fromEntries(Object.keys(START_PERKS).map((perk) => [
    perk, Array.from({ length: 256 }, (_, seed) => playAscent(seed, perk, undefined, 'guardFirst')).filter(({ wins }) => wins === 3).length,
  ]))
  const runs = Array.from({ length: 1024 }, (_, index) => {
    const seed = 8192 + index
    return playMapAscent(seed, pickOfferedPerk(seed, (perk) => scores[perk]))
  })
  const floors = Array.from({ length: MAP_FLOORS }, (_, index) => ({
    floor: index + 1,
    entered: runs.filter(({ entrants }) => entrants.includes(index + 1)).length,
    completed: runs.filter(({ floors }) => floors > index).length,
  }))
  const clears = runs.filter((run) => run.floors === MAP_FLOORS)
  const mean = (field) => clears.reduce((total, run) => total + run[field], 0) / clears.length
  console.log(JSON.stringify({ sample: runs.length, floors, clearedFights: mean('fights'), clearedTurns: mean('turns') }, null, 2))
}
