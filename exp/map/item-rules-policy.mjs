import { rewardOffers } from '../../src/ascent.ts'
import { draw } from '../../src/combat.ts'
import { currentTreasureRoom, treasureEnabled } from '../../src/map-treasure.ts'
import { adjustItemDie, canSelectItemDie, chooseReserveRoll, selectLatchDie, toggleConsumable } from '../../src/item-effects.ts'
import { ARTIFACT_SLOTS, isArtifact } from '../../src/treasure.ts'
import { availableCounterChoices, counterDamage, mirrorCounterDamage, toggleArtifact } from '../../src/treasure-combat.ts'
import { displayedCounterRewards, forecastYacht, previewYachtHand } from '../../src/yacht-combat.ts'
import { chooseAllocation } from '../../src/yacht-policy.ts'
import { planAscentTurn } from '../level.mjs'

const consumableOrder = ['clash-seal', 'weight', 'tuning', 'buckle', 'spacer', 'wedge', 'advance-knot', 'twin-mold', 'reserve-gauge', 'coin']
const artifactOrder = ['incomplete', 'banner', 'hourglass', 'horn', 'overflow', 'mirror', 'die-latch', 'heart-die']

export function sevenRewardOptions(run, choice) {
  const { loot, perk } = run.battle
  if (!isArtifact(choice)) return {}
  return {
    ...(loot.equipped.length === ARTIFACT_SLOTS && { replace: artifactOrder.findLast((id) => loot.equipped.includes(id)) }),
    ...(choice === 'heart-die' && { parity: perk?.kind === 'oath' ? perk.parity : 'even' }),
  }
}

export function pickSevenTreasure(run) {
  const offers = rewardOffers(run).filter((id) => treasureEnabled(run, id))
  const room = currentTreasureRoom(run)
  if (room.kind === 'elite') return offers[0] ?? 'skip'
  if (offers.includes('bandage')) return 'bandage'
  if (offers.includes('kit') && run.maxHp - run.battle.playerHp >= 2) return 'kit'
  if (offers.includes('medicine')) return 'medicine'
  if (offers.includes('lining')) return 'lining'
  const artifact = offers.find(isArtifact)
  if (artifact && (run.battle.loot.equipped.length < ARTIFACT_SLOTS || artifactOrder.indexOf(artifact) < artifactOrder.indexOf(sevenRewardOptions(run, artifact).replace)) &&
    (room.kind !== 'event' || run.battle.playerHp > 7)) return artifact
  if (offers.includes('whetstone') && (room.kind === 'rest' || run.battle.playerHp >= 9)) return 'whetstone'
  const { loot, perk } = run.battle
  const sampleTools = draw(run.seed, room.id, 105) % 3 === 0
  if (sampleTools && offers.includes('reserve-gauge') && !loot.consumables['reserve-gauge']) return 'reserve-gauge'
  if (sampleTools && offers.includes('coin') && !loot.consumables.coin && (perk?.kind === 'shield' || perk?.kind === 'counter')) return 'coin'
  return consumableOrder.find((id) => offers.includes(id)) ?? 'skip'
}

function score(battle) {
  const { dealt, damage, counter, escortDealt, chargeBroken } = forecastYacht(battle)
  if (damage >= battle.playerHp && (battle.bossRelic?.id !== 'revived-heart' || battle.bossRelic.heartUsed)) return dealt - 1000
  if (dealt >= battle.enemyHp) return 130 + battle.playerHp - damage
  const roulette = counter ? displayedCounterRewards(battle).reduce((sum, card) => sum + card.damage, 0) / 6 : 0
  const hand = previewYachtHand(battle)?.hand
  const unlock = hand === 'triple' && !battle.fourthDieUnlocked ? 14
    : hand === 'straight' && !battle.extraRerollAvailable && !battle.extraRerollSpent ? 5 : 0
  return dealt + escortDealt * .8 + roulette + unlock + Number(chargeBroken) * 4 - damage * 4 + battle.playerHp * 1.2
}

function bestLayout(battle) {
  const guardFirst = { ...battle, slots: chooseAllocation(battle, 'guardFirst') }
  const adaptive = { ...battle, slots: chooseAllocation(battle, 'adaptive') }
  return score(adaptive) > score(guardFirst) ? adaptive : guardFirst
}

function spendReserveChoices(battle) {
  if (!battle.loot.reserveRoll) return battle
  const options = [...battle.loot.reserveRoll]
  let candidates = [battle]
  for (const { index } of options) candidates = candidates.flatMap((entry) => [chooseReserveRoll(entry, index, false), chooseReserveRoll(entry, index, true)])
  return candidates.map(bestLayout).reduce((best, candidate) => score(candidate) > score(best) ? candidate : best)
}

export function planSevenTurn(opening, aware) {
  if (!aware) return planAscentTurn(opening, 'guardFirst')
  const start = opening.loot.consumables['reserve-gauge'] && opening.dice.filter((face) => face < 4).length >= 2
    ? toggleConsumable(opening, 'reserve-gauge') : opening
  let plan = spendReserveChoices(planAscentTurn(start, 'guardFirst'))
  // Evaluate only visible dice and cancel an armed item that did not participate in the basic roll.
  if (plan.loot.consumableArmed === 'reserve-gauge') plan = { ...plan, loot: { ...plan.loot, consumableArmed: undefined } }
  const base = plan
  let bestScore = score(base)
  const consider = (candidate, threshold = 1) => {
    if (candidate === base) return
    const layout = bestLayout(candidate)
    const armed = candidate.loot.consumableArmed ?? candidate.loot.armed?.[0]
    if (armed && !forecastYacht(layout).loot.triggered?.includes(armed)) return
    const improved = score(layout) - threshold
    if (improved > bestScore) {
      bestScore = improved
      plan = layout
    }
  }
  for (const id of ['weight', 'buckle', 'wedge', 'spacer', 'advance-knot', 'clash-seal']) {
    if (base.loot.consumables[id]) consider(toggleConsumable(base, id))
  }
  const indices = base.dice.flatMap((_, index) => canSelectItemDie(base, index) ? [index] : [])
  for (const index of indices) {
    if (base.loot.consumables.tuning) for (const change of [-1, 1]) consider(adjustItemDie(base, index, 'tuning', change))
    if (base.loot.consumables['twin-mold']) for (const source of indices) consider(adjustItemDie(base, index, 'twin-mold', source))
    if (base.loot.equipped.includes('hourglass') && !base.loot.spent.includes('hourglass') && base.playerHp > 5) {
      for (const face of [1, 2, 3, 4, 5, 6]) consider(adjustItemDie(base, index, 'hourglass', face), 2)
    }
  }
  if (base.loot.equipped.includes('banner')) consider(toggleArtifact(base, 'banner'))
  const result = forecastYacht(plan)
  if (plan.loot.equipped.includes('die-latch') && !plan.loot.spent.includes('die-latch') && result.dealt < plan.enemyHp) {
    const best = indices.reduce((index, other) => index === undefined || plan.dice[other] > plan.dice[index] ? other : index, undefined)
    if (best !== undefined && plan.dice[best] >= 5) plan = selectLatchDie(plan, best)
  }
  return plan
}

export function pickSevenCounter(battle, aware) {
  if (!aware) return 'now'
  const choices = availableCounterChoices(battle)
  const damage = counterDamage(battle, battle.loot.counter.damage)
  const remaining = battle.enemyHp + (battle.escort?.hp ?? 0)
  if (damage >= remaining) return 'now'
  if (choices.includes('horn')) return 'horn'
  if (choices.includes('coin') && damage <= counterDamage(battle, 4)) return 'coin'
  if (choices.includes('mirror') && mirrorCounterDamage(battle, damage) >= damage + 3) return 'mirror'
  return 'now'
}
