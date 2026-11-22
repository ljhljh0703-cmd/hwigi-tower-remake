import { pathToFileURL } from 'node:url'
import { beginAscent, FIGHT_COUNT, nextAscentFight, resolveAscentTurn } from '../src/ascent.ts'
import { DIE_COUNT, intentOf } from '../src/combat.ts'
import { offerPerks, START_PERKS } from '../src/perks.ts'
import {
  forecastYacht, rerollYachtDice, spendExtraReroll, spinYachtCounter, yachtRerollCost,
} from '../src/yacht-combat.ts'
import { chooseAllocation, chooseReroll, countYachtTradeoffs } from '../src/yacht-policy.ts'

const policy = 'adaptive'
const seeds = Array.from({ length: 512 }, (_, seed) => seed)
const perks = Object.keys(START_PERKS)
const hpReserveAfterPayment = 2

function wantsReroll(battle) {
  return forecastYacht(battle, battle.dice.map(() => 'attack')).dealt < battle.enemyHp
}

export function playAscent(seed, perk, variant = 'devil', observeTurn) {
  let ascent = beginAscent(seed, perk)
  let wins = 0
  let extraRolls = 0
  let paidHp = 0
  let fourDieTurns = 0
  let fewChoices = 0
  let finishingTurns = 0
  let nonFinishingFewChoices = 0
  const tripleLandmarks = []
  const fightTurns = []

  for (let fight = 1; fight <= FIGHT_COUNT; fight++) {
    let usedFreeBatch = false
    fightTurns.push(0)
    for (let turn = 0; turn < 30 && ascent.battle.phase === 'assign'; turn++) {
      fightTurns[fight - 1]++
      let battle = ascent.battle
      if (wantsReroll(battle)) battle = rerollYachtDice(battle, chooseReroll(battle, policy, false))
      if (battle.extraRerollAvailable && battle.rerolled && wantsReroll(battle)) {
        const [index] = chooseReroll(battle, policy, true)
        if (index !== undefined) battle = spendExtraReroll(battle, index)
      }

      if (perk === 'reroll' && battle.rerolled && variant === 'free-per-fight' && !usedFreeBatch && wantsReroll(battle)) {
        const indices = chooseReroll(battle, policy, false)
        if (indices.length > 0) {
          // Waive the first paid batch's HP cost while keeping its dice draws and face bonus.
          battle = rerollYachtDice({ ...battle, playerHp: battle.playerHp + 1 }, indices)
          usedFreeBatch = true
          extraRolls++
        }
      }
      if (perk === 'reroll' && variant === 'devil' && battle.rerolled) {
        let cost = yachtRerollCost(battle)
        while (battle.playerHp - cost >= hpReserveAfterPayment && wantsReroll(battle)) {
          const indices = chooseReroll(battle, policy, false)
          if (indices.length === 0) break
          battle = rerollYachtDice(battle, indices)
          extraRolls++
          paidHp += cost
          cost = yachtRerollCost(battle)
        }
      }

      const slots = chooseAllocation(battle, policy)
      if (battle.dice.length > DIE_COUNT) {
        const canFinish = forecastYacht(battle, slots).dealt === battle.enemyHp
        fourDieTurns++
        finishingTurns += Number(canFinish)
        if (countYachtTradeoffs(battle) <= 1) {
          fewChoices++
          nonFinishingFewChoices += Number(!canFinish)
        }
      }
      const planning = { ...battle, slots }
      const resolved = resolveAscentTurn({ ...ascent, battle: planning })
      const remainingFights = FIGHT_COUNT - fight + Number(resolved.battle.phase !== 'won')
      if (!ascent.unlocks.includes('triple') && resolved.battle.phase !== 'lost' && remainingFights > 0) {
        tripleLandmarks.push({
          fight, turn: battle.turn, remainingFights, acquired: resolved.newUnlock === 'triple',
        })
      }
      ascent = { ...resolved, battle: spinYachtCounter(resolved.battle) }
      observeTurn?.(fight, planning, ascent)
    }
    if (ascent.battle.phase === 'lost') break
    if (ascent.battle.phase !== 'won') throw new Error(`Unfinished fight: ${seed}, ${perk}, ${fight}`)
    wins++
    ascent = nextAscentFight(ascent)
  }
  const defeat = ascent.battle.phase === 'lost'
    ? {
      fight: ascent.fight, turn: ascent.battle.turn, intent: intentOf(ascent.battle),
      buffed: ascent.battle.enemyAttackBuff > 0,
    }
    : null
  return {
    wins, fightTurns, triple: ascent.unlocks.includes('triple'), tripleLandmarks,
    extraRolls, paidHp, fourDieTurns, fewChoices, finishingTurns, nonFinishingFewChoices, defeat,
  }
}

function summarize(runs) {
  const fightWins = [1, 2, 3].map((fight) => runs.filter(({ wins }) => wins >= fight).length)
  const fightLengths = fightWins.map((won, index) => {
    const entered = runs.filter(({ fightTurns }) => fightTurns.length > index)
    const winningTurns = entered.reduce((sum, run) => sum + (run.wins > index ? run.fightTurns[index] : 0), 0)
    const totalTurns = entered.reduce((sum, run) => sum + run.fightTurns[index], 0)
    return { entered: entered.length, won, winningTurns, totalTurns }
  })
  const cohorts = [true, false].map((triple) => {
    const group = runs.filter((run) => run.triple === triple)
    return { triple, runs: group.length, completed: group.filter(({ wins }) => wins === FIGHT_COUNT).length }
  })
  const sum = (field) => runs.reduce((total, run) => total + run[field], 0)
  return {
    runs: runs.length, fightWins, fightLengths, cohorts,
    extraRolls: sum('extraRolls'), paidHp: sum('paidHp'),
    fourDieTurns: sum('fourDieTurns'), fewChoices: sum('fewChoices'), finishingTurns: sum('finishingTurns'),
    nonFinishingFewChoices: sum('nonFinishingFewChoices'),
  }
}

function summarizeNoTripleDefeats(runs) {
  const counts = new Map()
  for (const { triple, defeat } of runs) {
    if (triple || !defeat) continue
    const { fight, turn, intent, buffed } = defeat
    const key = `${fight}/${turn}/${intent}`
    const row = counts.get(key) ?? { fight, turn, intent, losses: 0, buffedLosses: 0 }
    row.losses++
    row.buffedLosses += Number(buffed)
    counts.set(key, row)
  }
  return [...counts.values()].sort((a, b) => a.fight - b.fight || a.turn - b.turn)
}

function summarizeAfterTriple(runs) {
  const landmarks = new Map()
  for (const { tripleLandmarks, wins } of runs) {
    const completed = Number(wins === FIGHT_COUNT)
    for (const { fight, turn, remainingFights, acquired } of tripleLandmarks) {
      const key = `${fight}/${turn}/${remainingFights}`
      if (!landmarks.has(key)) {
        landmarks.set(key, {
          remainingFights, acquired: 0, acquiredCompleted: 0, controls: 0, controlsCompleted: 0,
        })
      }
      const counts = landmarks.get(key)
      if (acquired) {
        counts.acquired++
        counts.acquiredCompleted += completed
      } else {
        counts.controls++
        counts.controlsCompleted += completed
      }
    }
  }
  return Array.from({ length: FIGHT_COUNT }, (_, index) => {
    const remainingFights = FIGHT_COUNT - index
    const summary = {
      remainingFights, acquired: 0, acquiredCompleted: 0, controls: 0, controlsCompleted: 0,
      weightedControlsCompleted: 0, unmatchedAcquired: 0,
    }
    for (const counts of landmarks.values()) {
      if (counts.remainingFights !== remainingFights || !counts.acquired) continue
      if (!counts.controls) {
        summary.unmatchedAcquired += counts.acquired
        continue
      }
      for (const field of ['acquired', 'acquiredCompleted', 'controls', 'controlsCompleted']) {
        summary[field] += counts[field]
      }
      // A control can appear at more than one landmark. Weight each landmark by its number of unlocks.
      summary.weightedControlsCompleted += counts.acquired * counts.controlsCompleted / counts.controls
    }
    return summary
  })
}

export function runLevelStudy(sample = seeds) {
  const results = new Map(perks.map((perk) => {
    const runs = sample.map((seed) => playAscent(seed, perk))
    return [perk, { runs, summary: summarize(runs), offered: 0, picked: 0 }]
  }))

  const selected = sample.map((seed, index) => {
    let best
    let bestScore = -1
    for (const perk of offerPerks(seed)) {
      const result = results.get(perk)
      result.offered++
      // Rank by completions on all other seeds, keeping offer order on ties.
      const score = result.summary.fightWins[2] - Number(result.runs[index].wins === FIGHT_COUNT)
      if (score > bestScore) {
        bestScore = score
        best = result
      }
    }
    best.picked++
    return best.runs[index]
  })

  const alternative = sample.map((seed) => playAscent(seed, 'reroll', 'free-per-fight'))
  return {
    baseline: summarize(sample.map((seed) => playAscent(seed))),
    perks: [...results].map(([perk, { summary, offered, picked }]) => ({ perk, ...summary, offered, picked })),
    selected: summarize(selected),
    noTripleDefeats: summarizeNoTripleDefeats(selected),
    afterTriple: summarizeAfterTriple(selected),
    alternative: summarize(alternative),
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { baseline, perks, selected, noTripleDefeats, afterTriple, alternative } = runLevelStudy()
  console.log(JSON.stringify({ perk: null, ...baseline }))
  for (const perk of perks) console.log(JSON.stringify(perk))
  console.log(JSON.stringify({ chooser: 'leave-one-seed-out', ...selected }))
  console.log(JSON.stringify({ noTripleDefeats }))
  console.log(JSON.stringify({ afterTriple }))
  console.log(JSON.stringify({ variant: 'free-per-fight', ...alternative }))
}
