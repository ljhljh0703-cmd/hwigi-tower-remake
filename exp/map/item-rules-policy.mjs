import { rewardOffers } from '../../src/ascent.ts'
import { draw } from '../../src/combat.ts'
import { currentTreasureRoom, treasureEnabled } from '../../src/map-treasure.ts'
import { adjustItemDie, canSelectItemDie, chooseReserveRoll, selectLatchDie, toggleConsumable } from '../../src/item-effects.ts'
import { artifactReady, ARTIFACT_SLOTS, isArtifact } from '../../src/treasure.ts'
import { isMetaArtifact, META_VALUES } from '../../src/meta-unlocks.ts'
import { bloodHealing, draftMetaDie, transferMetaPip } from '../../src/meta-combat.ts'
import { availableCounterChoices, counterDamage, mirrorCounterDamage, toggleArtifact } from '../../src/treasure-combat.ts'
import { displayedCounterRewards, forecastYacht, nextYachtReroll, previewYachtHand, rerollYachtDice, spendExtraReroll } from '../../src/yacht-combat.ts'
import { chooseAllocation, chooseReroll } from '../../src/yacht-policy.ts'
import { planAscentTurn } from '../level.mjs'

const consumableOrder = ['clash-seal', 'weight', 'tuning', 'buckle', 'spacer', 'wedge', 'advance-knot', 'twin-mold', 'reserve-gauge', 'coin']
const artifactOrder = ['incomplete', 'banner', 'hourglass', 'horn', 'overflow', 'mirror', 'scabbard', 'pip-ring',
  'linked-cup', 'adjacent-needle', 'blood-grip', 'die-latch', 'heart-die']

export function sevenRewardOptions(run, choice) {
  const { loot, perk } = run.battle
  if (!isArtifact(choice)) return {}
  return {
    ...(loot.equipped.length === ARTIFACT_SLOTS && { replace: artifactOrder.findLast((id) => loot.equipped.includes(id)) }),
    ...(choice === 'heart-die' && { parity: perk?.kind === 'oath' ? perk.parity : 'even' }),
  }
}

export function pickSevenTreasure(run, considerUnlocked = true) {
  const offers = rewardOffers(run).filter((id) => treasureEnabled(run, id))
  const room = currentTreasureRoom(run)
  const regular = offers.find((id) => isArtifact(id) && !isMetaArtifact(id))
  const unlocked = considerUnlocked ? offers.find(isMetaArtifact) : undefined
  const artifact = unlocked && (!regular || artifactOrder.indexOf(unlocked) < artifactOrder.indexOf(regular)) ? unlocked : regular
  if (room.kind === 'elite') return artifact ?? offers[0] ?? 'skip'
  if (offers.includes('bandage')) return 'bandage'
  if (offers.includes('kit') && run.maxHp - run.battle.playerHp >= 2) return 'kit'
  if (offers.includes('medicine')) return 'medicine'
  if (offers.includes('lining')) return 'lining'
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
  const healing = Math.min(22 - battle.playerHp + damage, bloodHealing(battle, battle.dice))
  if (dealt >= battle.enemyHp) return 130 + battle.playerHp - damage + healing
  const roulette = counter ? displayedCounterRewards(battle).reduce((sum, card) => sum + card.damage, 0) / 6 : 0
  const hand = previewYachtHand(battle)?.hand
  const unlock = hand === 'triple' && !battle.fourthDieUnlocked ? 14
    : hand === 'straight' && !battle.extraRerollAvailable && !battle.extraRerollSpent ? 5 : 0
  return dealt + escortDealt * .8 + roulette + unlock + Number(chargeBroken) * 4 - damage * 4 + (battle.playerHp + healing) * 1.2
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

function planChargeRoll(battle) {
  const reroll = nextYachtReroll(battle)
  if (reroll?.kind !== 'basic' || reroll.cost >= battle.playerHp) return battle
  const current = bestLayout(battle)
  if (forecastYacht(current).dealt >= battle.enemyHp) return battle
  let best = score(current)
  let target
  for (const [index, face] of battle.dice.entries()) {
    if (face >= META_VALUES.chargeMin || !canSelectItemDie(battle, index)) continue
    const dice = battle.dice.map((value, i) => index === i ? META_VALUES.chargeMin : value)
    const hypothetical = { ...battle, dice, playerHp: battle.playerHp - reroll.cost, metaTurn: { chargeDie: index } }
    const rating = score(bestLayout(hypothetical))
    if (rating > best) {
      best = rating
      target = index
    }
  }
  if (target !== undefined) return rerollYachtDice(battle, [target])
  const batch = chooseReroll(battle, 'guardFirst', false)
  return batch.length > 1 ? rerollYachtDice(battle, batch) : battle
}

export function planSevenTurn(opening, aware, recordUse) {
  if (!aware) return planAscentTurn(opening, 'guardFirst')
  let start = opening.loot.consumables['reserve-gauge'] && opening.dice.filter((face) => face < 4).length >= 2
    ? toggleConsumable(opening, 'reserve-gauge') : opening
  if (start.perk?.kind === 'early-reroll' && start.extraRerollAvailable) {
    const current = bestLayout(start)
    const forecast = forecastYacht(current)
    const low = start.dice.reduce((best, face, index) => face <= 3 && canSelectItemDie(start, index) &&
      (!forecast.counter || current.slots[index] === 'attack') && (best === undefined || face < start.dice[best]) ? index : best, undefined)
    if (low !== undefined && forecast.dealt < start.enemyHp) {
      const next = spendExtraReroll(start, low)
      if (next !== start) recordUse?.('early-reroll')
      start = next
    }
  }
  if (artifactReady(start.loot, 'linked-cup')) {
    const low = start.dice.flatMap((face, index) => face <= 3 && canSelectItemDie(start, index) ? [index] : []).slice(0, 2)
    if (low.length === 2) start = rerollYachtDice(start, low, true)
  }
  if (start.perk?.kind === 'charge-roll' && !start.rerolled) start = planChargeRoll(start)
  const joined = start.perk?.kind === 'join-slots' ? bestLayout(start) : undefined
  const holdStraight = joined && previewYachtHand(joined)?.hand === 'straight' &&
    forecastYacht(joined).damage === 0 && joined.slots.includes('attack') && joined.slots.includes('guard')
  let plan = holdStraight ? joined
    : start.perk?.kind === 'charge-roll' && !start.rerolled ? { ...start, slots: chooseAllocation(start, 'guardFirst') }
    : spendReserveChoices(planAscentTurn(start, 'guardFirst'))
  const kind = start.perk?.kind
  const spentExtra = plan.extraRerollSpent && !opening.extraRerollSpent
  if (kind === 'join-slots' || kind === 'charge-roll' && plan.metaTurn?.chargeDie !== undefined ||
    (kind === 'early-reroll' || kind === 'counter-recover') && spentExtra) {
    const alternative = bestLayout(plan)
    const joins = kind !== 'join-slots' || previewYachtHand(alternative)?.hand === 'straight' &&
      previewYachtHand({ ...alternative, perk: undefined })?.hand !== 'straight'
    if (joins && score(alternative) > score(plan)) plan = alternative
  }
  // Evaluate only visible dice and cancel an armed item that did not participate in the basic roll.
  if (plan.loot.consumableArmed === 'reserve-gauge') plan = { ...plan, loot: { ...plan.loot, consumableArmed: undefined } }
  const base = plan
  let bestScore = score(base)
  const consider = (candidate, threshold = 1, usesEffect) => {
    if (candidate === base) return
    const layout = bestLayout(candidate)
    if (usesEffect && !usesEffect(layout)) return
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
    if (artifactReady(base.loot, 'pip-ring')) for (const target of indices) consider(transferMetaPip(base, index, target))
  }
  if (base.perk?.kind === 'reverse-guard' && !base.perk.spent) {
    for (const index of indices) {
      const slots = base.slots.map((slot, i) => i === index ? 'guard' : slot)
      consider(draftMetaDie({ ...base, slots }, 'reverse-guard', index), 0, (layout) => layout.slots[index] === 'guard')
    }
  }
  if (artifactReady(base.loot, 'blood-grip') && base.playerHp < 20) {
    for (const index of indices) if (base.slots[index] === 'attack') {
      consider(draftMetaDie(base, 'blood-grip', index), 0, (layout) => layout.slots[index] === 'attack')
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
  if (choices.includes('adjacent')) {
    const rewards = displayedCounterRewards(battle)
    if (rewards[(battle.loot.counter.slot + 1) % rewards.length].damage > damage) return 'adjacent'
  }
  if (choices.includes('recover-reroll') && (battle.turn <= 3 || remaining - damage >= 8)) return 'recover-reroll'
  if (choices.includes('mirror') && mirrorCounterDamage(battle, damage) >= damage + 3) return 'mirror'
  return 'now'
}
