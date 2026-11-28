import { createHash } from 'node:crypto'
import * as ascent from '../src/ascent.ts'
import { BOSS_RELICS } from '../src/boss-relic.ts'
import { draw } from '../src/combat.ts'
import { ALL_META_FLOORS } from '../src/meta-progress.ts'
import { isMetaPerk } from '../src/meta-unlocks.ts'
import { offerPerks } from '../src/perks.ts'
import { forecastYacht, withEgoDie } from '../src/yacht-combat.ts'
import { pickSevenCounter, pickSevenTreasure, planSevenTurn, sevenRewardOptions } from '../exp/map/item-rules-policy.mjs'
import { weightedPerks } from '../exp/map/stage-three.mjs'

const { ascentFinished, availableMapNodes, beginMapAscent, chooseUpperAscent, enterMapNode,
  resolveAscentTurn, returnToMap, rewardOffers, spinAscentCounter, takeAscentReward } = ascent
const [route = 'safe', firstArg = '8192', countArg = '4096', unlocks = 'none', scope] = process.argv.slice(2)
const first = Number(firstArg)
const count = Number(countArg)
const pool = unlocks === 'all' ? ALL_META_FLOORS : []
const safe = ['event', 'shop', 'rest', 'fight', 'elite']
const priorities = route === 'elite' ? ['elite', ...safe.slice(0, -1)] : safe
const weighted = weightedPerks()
const upper = [true, false].map(piercing => ({
  piercing, won: 0, entrants: 0, finalCoins: 0,
  floors: Object.fromEntries(Array.from({ length: 7 }, (_, index) => [index + 13, { entered: 0, lost: 0 }])),
  rooms: {}, cards: {},
}))
const lower = { won: 0, floors: Array.from({ length: 12 }, () => ({ entered: 0, lost: 0, turns: 0 })) }
const fingerprint = createHash('sha256')

function noteCard(stats, card, event) {
  if (!stats || !card) return
  const row = stats.cards[card] ??= { offered: 0, selected: 0, triggered: 0 }
  row[event]++
}

function pickNode(run) {
  const nodes = availableMapNodes(run)
  return priorities.map(kind => nodes.find(node => node.kind === kind)).find(Boolean) ?? nodes[0]
}

function playRoom(run, node, phase) {
  let row
  if (phase) {
    phase.floors[node.floor].entered++
    row = phase.rooms[`${node.floor}:${node.kind}`] ??= {
      entered: 0, turns: 0, damage: 0, advanceTurn: 0, firstDefeats: 0, frontKills: 0,
      piercingAttacks: 0, piercedDamage: 0, exact: 0, counters: 0,
      ego: { attack: 0, guard: 0, rest: 0, extraDefeats: 0 }, coins: 0,
    }
    row.entered++
  } else lower.floors[node.floor - 1].entered++
  const wallet = run.route.coins ?? 0
  run = enterMapNode(run, node.id)
  if (phase && !phase.piercing && run.battle.formation && run.route.screen === 'battle') {
    run = { ...run, battle: { ...run.battle, formation: { ...run.battle.formation, stopAtFront: true } } }
  }
  let firstDefeat = false
  while (run.route.screen === 'battle') {
    const opening = run.battle
    if (opening.turn > 120) throw new Error(`미종료 ${run.seed}, ${node.floor}층`)
    const plan = planSevenTurn(opening, true, card => noteCard(phase, card, 'triggered'), run.unlocks)
    const next = resolveAscentTurn({ ...run, battle: plan })
    if (next.battle === plan) throw new Error(`확정 불가 ${run.seed}, ${node.floor}층`)
    run = next
    const exchange = run.battle.formationExchange
    const logDamage = contacts => {
      if (!row || !contacts?.length) return
      if (contacts[0].hp === 0) {
        row.frontKills++
        if (!firstDefeat) { firstDefeat = true; row.firstDefeats++; row.advanceTurn += opening.turn }
        if (contacts.length > 1) row.piercingAttacks++
      }
      row.piercedDamage += contacts.slice(1).reduce((sum, contact) => sum + contact.amount, 0)
    }
    if (row) {
      row.turns++
      row.damage += run.battle.lastExchange.hitsTaken.reduce((sum, damage) => sum + damage, 0)
      for (const card of run.battle.loot.triggered ?? []) noteCard(phase, card, 'triggered')
      logDamage(exchange?.direct)
      logDamage(exchange?.delayed)
      const ego = run.battle.lastExchange.ego
      if (ego) {
        row.ego[ego.slot]++
        const alone = forecastYacht(plan).upper.exchange.direct
        const combined = forecastYacht(withEgoDie(plan, ego)).upper.exchange.direct
        row.ego.extraDefeats += Math.max(0, combined.filter(hit => !hit.hp).length - alone.filter(hit => !hit.hp).length)
      }
    } else lower.floors[node.floor - 1].turns++
    if (run.battle.phase === 'counter') {
      if (row) row.exact++
      run = spinAscentCounter(run)
      if (run.battle.loot.counter) {
        let choice = pickSevenCounter(run.battle, true)
        if (choice === 'coin') {
          run = spinAscentCounter(run, choice)
          noteCard(phase, 'coin', 'triggered')
          choice = pickSevenCounter(run.battle, true)
        }
        if (choice === 'recover-reroll') noteCard(phase, 'counter-recover', 'triggered')
        run = spinAscentCounter(run, choice)
      }
      if (row) {
        row.counters++
        logDamage(run.battle.formationExchange?.counter)
        for (const card of run.battle.loot.triggered ?? []) noteCard(phase, card, 'triggered')
      }
    }
  }
  if (run.battle.phase === 'lost') {
    if (phase) phase.floors[node.floor].lost++
    else lower.floors[node.floor - 1].lost++
  }
  if (row) row.coins += Math.max(0, (run.route.coins ?? 0) - wallet)
  if (ascentFinished(run) || run.route.screen === 'upper-choice') return run
  for (const card of rewardOffers(run)) noteCard(phase, card, 'offered')
  do {
    const choice = node.enemyId === 'chain-warden' ? BOSS_RELICS[draw(run.seed, node.id, 94) % 4] : pickSevenTreasure(run)
    const next = takeAscentReward(run, choice, sevenRewardOptions(run, choice))
    if (next === run) throw new Error(`보상 실패 ${run.seed}, ${node.floor}층, ${choice}`)
    if (choice !== 'skip') noteCard(phase, choice, 'selected')
    run = next
  } while (run.route.screen === 'shop')
  return returnToMap(run)
}

for (let seed = first; seed < first + count; seed++) {
  const unlocked = offerPerks(seed, pool).find(isMetaPerk)
  const perk = unlocked && draw(seed, 0, 22) % 2 === 0 ? unlocked : weighted(seed)
  let run = beginMapAscent(seed, perk, draw(seed, 0, 21) % 2 ? 'odd' : 'even', 7, { generation: 0, pool, opened: [] }, true)
  while (!ascentFinished(run) && run.route.screen !== 'upper-choice') {
    const node = pickNode(run)
    run = playRoom(run, node)
    fingerprint.update(JSON.stringify([seed, node.id, run.battle, run.unlocks, run.route.shopReceipts, run.route.declinedEliteRewards]))
  }
  if (run.battle.phase !== 'won') continue
  lower.won++
  for (const phase of scope === 'lower' ? [] : upper) {
    phase.entrants++
    let branch = chooseUpperAscent(run, true)
    while (!ascentFinished(branch)) {
      const node = pickNode(branch)
      const coins = branch.route.coins
      branch = playRoom(branch, node, phase)
      if (branch.battle.phase === 'won' && ascentFinished(branch)) {
        phase.won++
        phase.finalCoins += coins
      }
    }
  }
}

process.stdout.write(JSON.stringify({ route, first, count, unlocks, lower: { ...lower, fingerprint: fingerprint.digest('hex') }, upper }) + '\n')
