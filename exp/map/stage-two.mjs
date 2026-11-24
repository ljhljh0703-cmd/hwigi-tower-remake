import { pathToFileURL } from 'node:url'
import { planAscentTurn, playAscent } from '../level.mjs'
import {
  ascentFinished, availableMapNodes, beginMapAscent, enterMapNode, resolveAscentTurn, returnToMap,
  rewardOffers, spinAscentCounter, takeAscentReward,
} from '../../src/ascent.ts'
import { draw, enemyIntentAt } from '../../src/combat.ts'
import { currentTreasureRoom, treasureEnabled } from '../../src/map-treasure.ts'
import { pickOfferedPerk, START_PERKS } from '../../src/perks.ts'
import { ARTIFACTS, ARTIFACT_SLOTS, isArtifact } from '../../src/treasure.ts'
import { chooseHourglass, draftSeal, startHourglass, toggleArtifact, toggleShard } from '../../src/treasure-combat.ts'
import { canResolveYachtTurn, forecastYacht, tuneYachtDie, yachtAllocationTotals } from '../../src/yacht-combat.ts'
import { chooseAllocation } from '../../src/yacht-policy.ts'

const itemOrder = ['wedge', 'buckle', 'weight', 'mantle', 'tongs', 'rewind', 'coin', 'knot', 'hook', 'smash', 'assist', 'tuning']
const artifactOrder = ['hammer', 'banner', 'overflow', 'horn', 'heart-die', 'mirror', 'hourglass', 'incomplete']

function pickTreasure(run) {
  const offers = rewardOffers(run).filter((card) => treasureEnabled(run, card))
  const artifact = offers.find(isArtifact)
  const { playerHp, loot } = run.battle
  const room = currentTreasureRoom(run)
  if (room?.kind === 'rest' || room?.kind === 'event' || room?.kind === 'shop') {
    if (offers.includes('kit') && run.maxHp - playerHp >= 2) return 'kit'
    if (offers.includes('medicine')) return 'medicine'
    if (offers.includes('lining')) return 'lining'
    if (artifact && (room.kind === 'rest' || playerHp >= 7)) return artifact
    if (offers.includes('whetstone') && (room.kind === 'rest' || playerHp >= 9)) return 'whetstone'
    return 'skip'
  }
  if (offers.includes('bandage')) return 'bandage'
  if (artifact) {
    const weakest = artifactOrder.findLastIndex((id) => loot.equipped.includes(id))
    if (loot.equipped.length < ARTIFACT_SLOTS || artifactOrder.indexOf(artifact) < weakest) return artifact
  }
  return itemOrder.find((card) => offers.includes(card)) ?? offers.find((card) => !isArtifact(card)) ?? 'skip'
}

function optionsFor(run, choice) {
  const { loot, perk } = run.battle
  if (!isArtifact(choice)) return {}
  return {
    ...(loot.equipped.length === ARTIFACT_SLOTS && { replace: artifactOrder.findLast((id) => loot.equipped.includes(id)) }),
    ...(choice === 'heart-die' && { parity: perk?.kind === 'oath' ? perk.parity : 'odd' }),
    ...(choice === 'incomplete' && { hand: run.unlocks.includes('triple') ? 'straight' : 'triple' }),
  }
}

function planTreasureTurn(battle, policy) {
  let plan = planAscentTurn(battle, policy)
  const { loot } = plan
  const replan = (candidate) => ({ ...candidate, slots: chooseAllocation(candidate, policy) })
  const before = forecastYacht(plan)
  const normal = plan.dice.slice(0, plan.dice.length - Number(Boolean(plan.fourthDieUnlocked)))
  const low = normal.flatMap((face, index) => face <= 3 && index !== plan.fixedDie?.index ? [index] : []).slice(0, 2)
  if (loot.equipped.includes('hourglass') && plan.playerHp >= 9 && plan.rerolled && before.dealt < plan.enemyHp) {
    let next = startHourglass(plan, low)
    for (const die of next.loot.hourglass ?? []) next = chooseHourglass(next, die.index, die.rolled > die.original)
    if (next !== plan) plan = replan(next)
  }
  if (loot.equipped.includes('incomplete') && !loot.sealUsed) {
    const candidates = normal.flatMap((_, index) => [-2, -1, 1, 2].map((change) => draftSeal(plan, index, change)))
    const draft = candidates.filter((candidate) => candidate !== plan).map(replan).find((candidate) =>
      canResolveYachtTurn(candidate) && forecastYacht(candidate).damage < candidate.playerHp,
    )
    if (draft) plan = draft
  }
  const charge = enemyIntentAt(plan).chargeThreshold
  if (charge !== undefined && yachtAllocationTotals(plan).attack >= charge + 3) plan = toggleArtifact(plan, 'hammer')
  if (loot.equipped.includes('banner')) {
    const armed = toggleArtifact(plan, 'banner')
    if (armed !== plan && forecastYacht(armed).damage < forecastYacht(plan).damage) plan = armed
  }
  if (loot.shards.assist && forecastYacht(toggleShard(plan, 'assist')).loot.counterFlags?.assist) plan = toggleShard(plan, 'assist')
  else if (loot.shards.smash && forecastYacht(toggleShard(plan, 'smash')).loot.triggered?.includes('smash')) plan = toggleShard(plan, 'smash')
  else if (loot.shards.tuning) {
    const current = forecastYacht(plan)
    const better = [1, -1].map((change) => tuneYachtDie(plan, change)).filter((candidate) => candidate !== plan).map(replan).find((candidate) => {
      const result = forecastYacht(candidate)
      return !current.counter && result.counter && result.damage < candidate.playerHp || current.dealt < plan.enemyHp && result.dealt === plan.enemyHp && result.damage < candidate.playerHp
    })
    if (better) plan = better
  }
  return plan
}

export function playRulesTwo(seed, perk, policy, preferElite) {
  let run = beginMapAscent(seed, perk, draw(seed, 0, 21) % 2 ? 'odd' : 'even', 2)
  const entered = []
  let bossTurns = 0
  let totalTurns = 0
  let cancelled = 0
  let bossItems = 0
  let bossArtifacts = null
  const order = preferElite ? ['elite', 'event', 'shop', 'rest', 'fight'] : ['event', 'shop', 'rest', 'fight', 'elite']
  while (!ascentFinished(run)) {
    const nodes = availableMapNodes(run)
    const nextKind = order.find((kind) => nodes.some((node) => node.kind === kind))
    const node = nodes.find((candidate) => candidate.kind === nextKind) ?? nodes[0]
    run = enterMapNode(run, node.id)
    entered.push(node.floor)
    if (node.kind === 'boss') {
      bossItems = Object.values(run.battle.loot.items).reduce((sum, count) => sum + count, 0)
      bossArtifacts = [...run.battle.loot.equipped].sort()
    }
    while (run.route.screen === 'battle') {
      if (run.battle.turn > 120) throw new Error(`Unfinished fight: ${seed}, ${node.floor}, ${policy}`)
      const plan = planTreasureTurn(run.battle, policy)
      if (!canResolveYachtTurn(plan)) throw new Error(`Invalid plan: ${seed}, ${node.floor}, ${policy}`)
      const erased = plan.erasedStrikeTurn === plan.turn
      run = resolveAscentTurn({ ...run, battle: plan })
      if (erased) cancelled++
      if (run.battle.phase === 'counter') {
        run = spinAscentCounter(run)
        if (run.battle.loot.counter) {
          const rolled = run.battle.loot.counter
          const horn = !rolled.joint && rolled.damage < 8 && run.battle.loot.counterFlags?.horn && run.battle.enemyHp > rolled.damage
          const next = spinAscentCounter(run, horn ? 'horn' : 'mirror')
          run = next === run ? spinAscentCounter(run, 'now') : next
        }
      }
      totalTurns++
      if (node.kind === 'boss') bossTurns++
    }
    if (ascentFinished(run)) break
    const choice = pickTreasure(run)
    const next = takeAscentReward(run, choice, optionsFor(run, choice))
    if (next === run) throw new Error(`Invalid reward: ${seed}, ${node.floor}, ${choice}`)
    run = returnToMap(next)
  }
  return { completed: run.route.completed.length, entered, bossTurns, totalTurns, fights: run.fight, cancelled, bossItems, bossArtifacts }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scores = Object.fromEntries(Object.keys(START_PERKS).map((perk) => [
    perk, Array.from({ length: 256 }, (_, seed) => playAscent(seed, perk, undefined, 'guardFirst')).filter(({ wins }) => wins === 3).length,
  ]))
  const seeds = Array.from({ length: 1024 }, (_, index) => 8192 + index)
  for (const policy of ['guardFirst', 'adaptive']) for (const preferElite of [false, true]) {
    const runs = seeds.map((seed) => playRulesTwo(seed, pickOfferedPerk(seed, (perk) => scores[perk]), policy, preferElite))
    const clear = runs.filter(({ completed }) => completed === 12)
    const boss = runs.filter(({ bossTurns }) => bossTurns > 0)
    const mean = (group, key) => group.reduce((sum, run) => sum + run[key], 0) / group.length
    const pairs = ARTIFACTS.flatMap((first, index) => ARTIFACTS.slice(index + 1).map((second) => {
      const group = boss.filter(({ bossArtifacts }) => bossArtifacts.includes(first) && bossArtifacts.includes(second))
      return { first, second, entered: group.length, completed: group.filter(({ completed }) => completed === 12).length, bossTurns: mean(group, 'bossTurns') }
    })).filter(({ entered }) => entered)
    const floors = Array.from({ length: 12 }, (_, index) => ({ entered: runs.filter((run) => run.entered.includes(index + 1)).length, completed: runs.filter((run) => run.completed > index).length }))
    const slots = [0, 1, 2, 3].map((slot) => {
      const group = boss.filter(({ bossArtifacts }) => bossArtifacts.length === slot)
      return { slot, entered: group.length, completed: group.filter(({ completed }) => completed === 12).length, bossTurns: mean(group, 'bossTurns') }
    })
    console.log(JSON.stringify({ policy, preferElite, sample: seeds.length, floors, clearedFights: mean(clear, 'fights'), clearedTurns: mean(clear, 'totalTurns'), bossTurns: mean(boss, 'bossTurns'), bossItems: mean(boss, 'bossItems'), cancelled: runs.reduce((sum, run) => sum + run.cancelled, 0), slots, pairs }))
  }
}
