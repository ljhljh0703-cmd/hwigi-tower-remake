import {
  ascentFinished, availableMapNodes, beginMapAscent, enterMapNode, resolveAscentTurn, returnToMap,
  rewardOffers, spinAscentCounter, takeAscentReward,
} from '../src/ascent.ts'
import { BOSS_RELICS } from '../src/boss-relic.ts'
import { draw } from '../src/combat.ts'
import { optionsFor, pickTreasure, planTreasureTurn } from '../exp/map/stage-two.mjs'
import { weightedPerks } from '../exp/map/stage-three.mjs'

const prudent = ['event', 'shop', 'rest', 'fight', 'elite']
const challenge = ['elite', ...prudent.slice(0, -1)]
const choosePerk = weightedPerks()
const [route = 'safe', relic = 'mixed', first = '8192', count = '4096'] = process.argv.slice(2)
const order = route === 'elite' ? challenge : prudent
const floors = Array.from({ length: 12 }, (_, index) => ({ floor: index + 1, entered: 0, lost: 0, turns: 0 }))
let won = 0

for (let seed = Number(first); seed < Number(first) + Number(count); seed++) {
  let run = beginMapAscent(seed, choosePerk(seed), draw(seed, 0, 21) % 2 ? 'odd' : 'even', 6)
  while (!ascentFinished(run)) {
    const nodes = availableMapNodes(run)
    const node = order.map((kind) => nodes.find((entry) => entry.kind === kind)).find(Boolean) ?? nodes[0]
    const stats = floors[node.floor - 1]
    stats.entered++
    run = enterMapNode(run, node.id)
    while (run.route.screen === 'battle') {
      if (run.battle.turn > 120) throw new Error(`미종료: ${seed}, ${node.floor}층`)
      run = resolveAscentTurn({ ...run, battle: planTreasureTurn(run.battle, 'guardFirst') })
      stats.turns++
      if (run.battle.phase === 'counter') {
        run = spinAscentCounter(run)
        const pending = run.battle.loot.counter
        if (pending) {
          const horn = !pending.joint && pending.damage < 8 && run.battle.loot.counterFlags?.horn && run.battle.enemyHp > pending.damage
          const next = spinAscentCounter(run, horn ? 'horn' : 'mirror')
          run = next === run ? spinAscentCounter(run, 'now') : next
        }
      }
    }
    if (ascentFinished(run)) {
      if (run.battle.phase === 'won') won++
      else stats.lost++
      break
    }
    const choice = node.enemyId === 'chain-warden' ? (relic === 'mixed' ? BOSS_RELICS[draw(seed, node.id, 94) % 4] : relic)
      : node.kind === 'elite' ? rewardOffers(run)[0] ?? 'skip' : pickTreasure(run)
    const next = takeAscentReward(run, choice, optionsFor(run, choice))
    if (next === run) throw new Error(`보상 실패: ${seed}, ${node.floor}층, ${choice}`)
    run = returnToMap(next)
  }
}

console.log(JSON.stringify({ route, relic, first: Number(first), count: Number(count), won, completion: won / Number(count),
  floors: floors.map((entry) => ({ ...entry, rate: entry.lost / entry.entered, meanTurns: entry.turns / entry.entered })) }))
