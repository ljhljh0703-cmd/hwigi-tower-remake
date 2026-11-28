import {
  ascentFinished, availableMapNodes, beginMapAscent, enterMapNode, resolveAscentTurn, returnToMap,
  rewardOffers, spinAscentCounter, takeAscentReward,
} from '../src/ascent.ts'
import { BOSS_RELICS } from '../src/boss-relic.ts'
import { draw } from '../src/combat.ts'
import { offerPerks } from '../src/perks.ts'
import { isMetaPerk } from '../src/meta-unlocks.ts'
import { ALL_META_FLOORS } from '../src/meta-progress.ts'
import { treasureOffers } from '../src/map-treasure.ts'
import { canResolveYachtTurn, forecastYacht, previewYachtHand, withEgoDie, yachtAllocationTotals } from '../src/yacht-combat.ts'
import { pickSevenCounter, pickSevenTreasure, planSevenTurn, sevenRewardOptions } from '../exp/map/item-rules-policy.mjs'
import { optionsFor, pickTreasure, planTreasureTurn } from '../exp/map/stage-two.mjs'
import { weightedPerks } from '../exp/map/stage-three.mjs'

const prudent = ['event', 'shop', 'rest', 'fight', 'elite']
const challenge = ['elite', ...prudent.slice(0, -1)]
const choosePerk = weightedPerks()
const [route = 'safe', relic = 'mixed', first = '8192', count = '4096', version = '6', detail, unlocks = 'none', metaPicks = 'auto'] = process.argv.slice(2)
const rules = Number(version)
if (rules !== 6 && rules !== 7) throw new Error('규칙판은 6 또는 7이어야 합니다.')
if (!['none', 'all'].includes(unlocks) || unlocks === 'all' && rules !== 7) throw new Error('해금 후보는 규칙판 7에서 all 또는 none을 받습니다.')
if (!['auto', 'base', 'perk', 'artifact'].includes(metaPicks)) throw new Error('해금 선택은 auto, base, perk 또는 artifact입니다.')
const metaPool = unlocks === 'all' ? ALL_META_FLOORS : []
const aware = detail !== 'plain'
const order = route === 'elite' ? challenge : prudent
const floors = Array.from({ length: 12 }, (_, index) => ({ floor: index + 1, entered: 0, lost: 0, turns: 0 }))
const items = {}
const firstUnlocks = { triple: Array(12).fill(0), straight: Array(12).fill(0) }
const bosses = {}
const candidateLoss = {}
const bonusPerks = {}
let won = 0

for (let seed = Number(first); seed < Number(first) + Number(count); seed++) {
  const offeredPerks = offerPerks(seed, metaPool)
  const regularPerk = choosePerk(seed)
  const unlockedPerk = offeredPerks.find(isMetaPerk)
  const perk = unlockedPerk && (metaPicks === 'perk' || metaPicks === 'auto' && draw(seed, 0, 22) % 2 === 0) ? unlockedPerk : regularPerk
  const measured = detail ? { owned: new Set(), used: new Set() } : undefined
  const track = (id) => (items[id] ??= { offered: 0, selected: 0, pickedRuns: 0, usedRuns: 0, wonRuns: 0 })
  const compareCandidates = (room, regular, actual) => {
    const stats = (candidateLoss[room] ??= { visits: 0, baseOffers: 0, missing: 0, changed: 0, missingByCard: {} })
    const missing = regular.filter((id) => !actual.includes(id))
    stats.visits++
    stats.baseOffers += regular.length
    stats.missing += missing.length
    stats.changed += Number(missing.length > 0)
    for (const id of missing) stats.missingByCard[id] = (stats.missingByCard[id] ?? 0) + 1
  }
  if (measured) {
    for (const id of offeredPerks) track(id).offered++
    if (metaPool.length) compareCandidates('start', offerPerks(seed), offeredPerks)
    track(perk).selected++
    measured.owned.add(perk)
  }
  let run = beginMapAscent(seed, perk, draw(seed, 0, 21) % 2 ? 'odd' : 'even', rules,
    rules === 7 ? { generation: 0, pool: metaPool, opened: [] } : undefined)
  while (!ascentFinished(run)) {
    const nodes = availableMapNodes(run)
    const node = order.map((kind) => nodes.find((entry) => entry.kind === kind)).find(Boolean) ?? nodes[0]
    const stats = floors[node.floor - 1]
    stats.entered++
    run = enterMapNode(run, node.id)
    while (run.route.screen === 'battle') {
      if (run.battle.turn > 120) throw new Error(`미종료: ${seed}, ${node.floor}층`)
      const opening = run.battle
      const plan = rules === 7 ? planSevenTurn(opening, aware, (id) => measured?.used.add(id), run.unlocks) : planTreasureTurn(opening, 'guardFirst')
      if (!canResolveYachtTurn(plan)) throw new Error(`확정 불가: ${seed}, ${node.floor}층, ${plan.turn}턴`)
      const unlocking = !run.unlocks.includes('straight')
      run = resolveAscentTurn({ ...run, battle: plan })
      if (measured) {
        if (run.newUnlock) firstUnlocks[run.newUnlock][node.floor - 1]++
        if (perk === 'join-slots' && !measured.used.has(perk)) {
          const withoutPerk = { ...plan, perk: undefined }
          if (yachtAllocationTotals(plan).attack > yachtAllocationTotals(withoutPerk).attack ||
            run.newUnlock === 'straight' && previewYachtHand(withoutPerk)?.hand !== 'straight') measured.used.add(perk)
        }
        if ((perk === 'early-reroll' || perk === 'counter-recover') && unlocking &&
          !opening.extraRerollSpent && plan.extraRerollSpent) measured.used.add(perk)
        const ego = run.battle.lastExchange?.ego
        recordTurn(measured.used, opening, ego ? withEgoDie(plan, ego) : plan, run.battle)
      }
      stats.turns++
      if (run.battle.phase === 'counter') {
        run = spinAscentCounter(run)
        const pending = run.battle.loot.counter
        if (pending && rules === 7) {
          let choice = pickSevenCounter(run.battle, aware)
          if (choice === 'coin') {
            run = spinAscentCounter(run, choice)
            measured?.used.add('coin')
            choice = pickSevenCounter(run.battle, aware)
          }
          if (choice === 'recover-reroll') measured?.used.add('counter-recover')
          run = spinAscentCounter(run, choice)
        } else if (pending) {
          const horn = !pending.joint && pending.damage < 8 && run.battle.loot.counterFlags?.horn && run.battle.enemyHp > pending.damage
          const next = spinAscentCounter(run, horn ? 'horn' : 'mirror')
          run = next === run ? spinAscentCounter(run, 'now') : next
        }
        if (measured) {
          for (const id of run.battle.loot.triggered ?? []) measured.used.add(id)
          if (perk === 'counter') measured.used.add(perk)
          if (run.battle.lastExchange?.crownTriggered) measured.used.add('brake-crown')
          if (run.battle.bossRelic?.id === 'emperor-shield' && rules === 7 && run.battle.lastExchange?.counter) measured.used.add('emperor-shield')
          if (run.battle.playerHp > plan.playerHp && run.battle.bossRelic?.id === 'healing-scepter') measured.used.add('healing-scepter')
        }
      }
    }
    if (ascentFinished(run)) {
      if (run.battle.phase === 'won') won++
      else stats.lost++
      break
    }
    const choice = node.enemyId === 'chain-warden' ? (relic === 'mixed' ? BOSS_RELICS[draw(seed, node.id, 94) % 4] : relic)
      : rules === 7 ? pickSevenTreasure(run, metaPicks === 'auto' || metaPicks === 'artifact')
      : node.kind === 'elite' ? rewardOffers(run)[0] ?? 'skip' : pickTreasure(run)
    const next = takeAscentReward(run, choice, rules === 7 ? sevenRewardOptions(run, choice) : optionsFor(run, choice))
    if (next === run) throw new Error(`보상 실패: ${seed}, ${node.floor}층, ${choice}`)
    if (measured) {
      for (const id of rewardOffers(run)) track(id).offered++
      if (metaPool.length && (node.kind === 'elite' || node.kind === 'shop' || node.event === 'flag')) {
        compareCandidates(node.event ?? node.kind, treasureOffers({ ...run, meta: undefined }, node), rewardOffers(run))
      }
      if (choice !== 'skip') {
        track(choice).selected++
        measured.owned.add(choice)
        if (next.battle.playerHp > run.battle.playerHp) measured.used.add(choice)
      }
    }
    run = returnToMap(next)
  }
  if (measured) {
    if (unlockedPerk) {
      const row = (bonusPerks[unlockedPerk] ??= { offered: 0, chosen: 0, won: 0 })
      row.offered++
      row.chosen += Number(perk === unlockedPerk)
      row.won += Number(run.battle.phase === 'won')
    }
    for (const id of measured.owned) {
      track(id).pickedRuns++
      if (measured.used.has(id)) track(id).usedRuns++
      if (run.battle.phase === 'won') track(id).wonRuns++
    }
    if (run.battle.bossRelic) {
      const stats = (bosses[run.battle.bossRelic.id] ??= { picked: 0, won: 0 })
      stats.picked++
      stats.won += Number(run.battle.phase === 'won')
    }
  }
}

console.log(JSON.stringify({ route, relic, first: Number(first), count: Number(count), won, completion: won / Number(count), ...(rules === 7 && { unlocks, metaPicks }),
  floors: floors.map((entry) => ({ ...entry, rate: entry.lost / entry.entered, meanTurns: entry.turns / entry.entered })),
  ...(detail && { rules, policy: rules === 7 && aware ? 'items' : 'guardFirst', items, firstUnlocks, bosses, candidateLoss, bonusPerks }) }))

function recordTurn(used, opening, plan, after) {
  for (const id of after.loot.triggered ?? []) used.add(id)
  for (const [id, count] of Object.entries(opening.loot.consumables ?? {})) {
    if ((after.loot.consumables[id] ?? 0) < count) used.add(id)
  }
  for (const id of after.loot.spent) if (!opening.loot.spent.includes(id)) used.add(id)
  if (opening.fourthDieUnlocked && opening.loot.equipped.includes('heart-die')) used.add('heart-die')
  if (after.lastExchange.heartRevived) used.add('revived-heart')
  if (after.playerHp > plan.playerHp && after.bossRelic?.id === 'healing-scepter') used.add('healing-scepter')
  if (opening.bossRelic?.id === 'emperor-shield' && opening.turn === 1) {
    const withShield = forecastYacht(plan)
    const without = forecastYacht({ ...plan, bossRelic: undefined })
    if (withShield.incoming.totalDamage < without.incoming.totalDamage || withShield.damage < without.damage) used.add('emperor-shield')
  }
  switch (opening.perk?.kind) {
    case 'reverse-guard': if (!opening.perk.spent && after.perk.spent) used.add('reverse-guard'); break
    case 'charge-roll': if (plan.metaTurn?.chargeDie !== undefined && !opening.rerolled) used.add('charge-roll'); break
    case 'shield': if (opening.perk.bonus > 0 && plan.slots.includes('attack') || after.perk.bonus > opening.perk.bonus) used.add('shield'); break
    case 'blade': if (opening.perk.charge >= 12 && plan.slots.includes('attack')) used.add('blade'); break
    case 'collector': if (opening.perk.hands.length > 0 && ['attack', 'guard'].some((slot) => {
      const faces = plan.dice.filter((_, index) => plan.slots[index] === slot)
      return new Set(faces).size < faces.length
    })) used.add('collector'); break
    case 'reroll': if (plan.paidRerollSpent) used.add('reroll'); break
    case 'oath': if (plan.dice.some((face, index) => plan.slots[index] === 'attack' && face % 2 === Number(opening.perk.parity === 'odd'))) used.add('oath'); break
  }
}
