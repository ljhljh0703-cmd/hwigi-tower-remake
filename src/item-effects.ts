import { DIE_COUNT, dieFaceForSlot, enemyIntentAt, splitEnemyDamage } from './combat.ts'
import type { forecast, SlotTotals } from './combat.ts'
import { SEVEN_EMPEROR_SHIELD_CAP } from './boss-relic.ts'
import { SEVEN_ITEM_VALUES } from './item-values.ts'
import { META_VALUES } from './meta-unlocks.ts'
import { artifactReady, changeCount } from './treasure.ts'
import type { ArmedConsumable, Artifact, Consumable, Treasure, TreasureState } from './treasure.ts'
import type { YachtBattle } from './yacht-combat.ts'

export function consumableReady(loot: TreasureState | undefined, id: Consumable) {
  return Boolean(!loot?.consumableUsed && loot?.consumables?.[id])
}

function trigger(loot: TreasureState, id: Treasure): TreasureState {
  return { ...loot, triggered: [...(loot.triggered ?? []), id] }
}

export function spendConsumable(loot: TreasureState, id: Consumable): TreasureState {
  return trigger({ ...loot, consumables: changeCount(loot.consumables!, id, -1), consumableArmed: undefined, consumableUsed: true }, id)
}

export function spendSevenArtifact(loot: TreasureState, id: Artifact): TreasureState {
  return trigger({ ...loot, spent: [...loot.spent, id] }, id)
}

export function canSelectItemDie(battle: YachtBattle, index: number) {
  return battle.itemsSeven === true && battle.phase === 'assign' && !battle.loot?.reserveRoll && Number.isInteger(index) && index >= 0 &&
    index < Math.min(battle.dice.length, DIE_COUNT - Number(Boolean(battle.stolenDie))) && index !== battle.fixedDie?.index
}

export function toggleConsumable(battle: YachtBattle, id: ArmedConsumable): YachtBattle {
  const { loot } = battle
  if (!battle.itemsSeven || battle.phase !== 'assign' || !loot || !consumableReady(loot, id) || loot.reserveRoll) return battle
  if (id === 'reserve-gauge' && battle.rerolled) return battle
  return { ...battle, loot: { ...loot, consumableArmed: loot.consumableArmed === id ? undefined : id } }
}

export function adjustItemDie(battle: YachtBattle, index: number, id: 'tuning' | 'twin-mold' | 'hourglass', option: number): YachtBattle {
  const { loot } = battle
  if (!loot || !canSelectItemDie(battle, index)) return battle
  const hourglass = id === 'hourglass'
  if (hourglass ? !artifactReady(loot, id) || battle.playerHp <= 2 : !consumableReady(loot, id)) return battle
  if (id === 'tuning' && option !== -1 && option !== 1) return battle
  if (id === 'twin-mold' && (!canSelectItemDie(battle, option) || index === option)) return battle
  const face = id === 'tuning' ? battle.dice[index] + option : id === 'twin-mold' ? battle.dice[option] : option
  if (!Number.isInteger(face) || face < 1 || face > 6 || face === battle.dice[index]) return battle
  const dice = battle.dice.map((value, position) => position === index ? face : value)
  return { ...battle, dice, playerHp: battle.playerHp - (hourglass ? 2 : 0), loot: hourglass ? spendSevenArtifact(loot, id) : spendConsumable(loot, id) }
}

export function selectLatchDie(battle: YachtBattle, index: number): YachtBattle {
  const { loot } = battle
  if (!loot || !canSelectItemDie(battle, index) || !artifactReady(loot, 'die-latch')) return battle
  return { ...battle, loot: { ...loot, latchDraft: loot.latchDraft === index ? undefined : index } }
}

export function startReserveRoll(before: YachtBattle, rolled: YachtBattle, selected: ReadonlySet<number>): YachtBattle {
  const { loot } = before
  if (!loot || loot.consumableArmed !== 'reserve-gauge' || !consumableReady(loot, 'reserve-gauge')) return rolled
  const reserveRoll = before.dice.flatMap((original, index) => selected.has(index) && canSelectItemDie(before, index)
    ? [{ index, original, rolled: rolled.dice[index] }] : [])
  if (!reserveRoll.length) return rolled
  const dice = rolled.dice.map((face, index) => reserveRoll.find((die) => die.index === index)?.original ?? face)
  return { ...rolled, dice, loot: { ...spendConsumable(loot, 'reserve-gauge'), reserveRoll } }
}

export function chooseReserveRoll(battle: YachtBattle, index: number, useNew: boolean): YachtBattle {
  const { loot } = battle
  const die = loot?.reserveRoll?.find((definition) => definition.index === index)
  if (battle.phase !== 'assign' || !loot || !die) return battle
  const reserveRoll = loot.reserveRoll!.filter((entry) => entry.index !== index)
  const dice = battle.dice.map((face, position) => useNew && position === index ? die.rolled : face)
  return { ...battle, dice, loot: { ...loot, reserveRoll: reserveRoll.length ? reserveRoll : undefined } }
}

function hasPair(faces: readonly number[]) {
  return new Set(faces).size < faces.length
}

export function hasIncompletePair(battle: YachtBattle, dice = battle.dice) {
  const { loot } = battle
  if (!battle.itemsSeven || battle.fourthDieUnlocked || !loot?.equipped.includes('incomplete') || loot.sealUsed) return false
  const mechanic = enemyIntentAt(battle).mechanic
  return hasPair(dice.filter((face, index) => battle.slots[index] === 'attack' && face === battle.dice[index] && dieFaceForSlot(face, 'attack', mechanic) > 0))
}

export function boostSevenAllocation(battle: YachtBattle, totals: SlotTotals, slots: YachtBattle['slots'], dice: readonly number[]) {
  const { loot } = battle
  const mechanic = enemyIntentAt(battle).mechanic
  const attack = dice.flatMap((face, index) => slots[index] === 'attack' && dieFaceForSlot(face, 'attack', mechanic) > 0 ? [face] : [])
  const highest = Math.max(0, ...attack)
  const armed = loot?.consumableArmed
  const whetstone = battle.turn === 1 && Boolean(loot?.prepared.whetstone) ? SEVEN_ITEM_VALUES.whetstonePips * attack.length : 0
  const banner = loot?.armed?.includes('banner') ? highest * SEVEN_ITEM_VALUES.bannerMultiplier : 0
  let item: ArmedConsumable | undefined
  let bonus = 0
  if (armed === 'weight' && highest) {
    item = armed
    bonus = highest
  } else if (armed === 'advance-knot' && highest && !slots.includes('guard')) {
    item = armed
    bonus = 6
  } else if (armed === 'clash-seal' && hasPair(attack)) item = armed
  else if (armed === 'wedge' && highest) item = armed
  return { totals: { attack: totals.attack + bonus + whetstone, guard: totals.guard + banner }, item, banner, whetstone }
}

type SevenAllocation = { totals: SlotTotals; item?: ArmedConsumable; banner?: number; whetstone?: number; scabbard?: number }

export function forecastSevenTreasure(battle: YachtBattle, base: ReturnType<typeof forecast>, allocation: SevenAllocation, emperor: boolean) {
  const { triggered: _triggered, mirrorDamage, overflowDamage, ...inventory } = battle.loot!
  let loot: TreasureState = inventory
  let { hits, damage } = base
  let inflicted = { dealt: base.dealt, escortDealt: base.escortDealt }
  const block = (amount: number) => {
    if (base.dealt >= battle.enemyHp) return false
    let remaining = amount
    const before = damage
    hits = hits.map((hit, index) => {
      const saved = index < base.incoming.hits.length ? Math.min(remaining, hit) : 0
      remaining -= saved
      damage -= saved
      return hit - saved
    })
    return damage < before
  }
  if (emperor) block(SEVEN_EMPEROR_SHIELD_CAP)
  if (loot.prepared.lining && block(4)) loot = trigger({ ...loot, prepared: changeCount(loot.prepared, 'lining', -1) }, 'lining')
  const item = allocation.item ?? (loot.consumableArmed === 'buckle' && block(3) ? 'buckle' : undefined)
  if (item) loot = spendConsumable(loot, item)
  if (allocation.banner) loot = spendSevenArtifact(loot, 'banner')
  const carried = allocation.scabbard ?? 0
  if (carried) loot = trigger({ ...loot, scabbard: undefined }, 'scabbard')
  if (loot.equipped.includes('scabbard') && base.dealt >= battle.enemyHp) {
    const excess = allocation.totals.attack - carried - battle.enemyHp - (battle.escort?.hp ?? 0)
    if (excess > 0) loot = { ...loot, scabbard: Math.min(META_VALUES.scabbardCap, excess) }
  }
  if (battle.turn === 1 && loot.prepared.whetstone) {
    const { whetstone: _spent, ...prepared } = loot.prepared
    loot = { ...loot, prepared }
    if (allocation.whetstone) loot = trigger(loot, 'whetstone')
  }
  if (damage < battle.playerHp && base.dealt < battle.enemyHp) {
    const delayed = Math.max(mirrorDamage ?? 0, overflowDamage ?? 0)
    if (delayed && allocation.totals.attack > 0 && (base.dealt > 0 || base.escortDealt > 0)) {
      inflicted = splitEnemyDamage(battle, delayed, inflicted)
      loot = trigger(loot, delayed === mirrorDamage ? 'mirror' : 'overflow')
    }
    if (inflicted.dealt < battle.enemyHp) {
      if (base.incoming.totalDamage > 0 && allocation.totals.guard > base.incoming.totalDamage && artifactReady(loot, 'overflow')) {
        const surplus = allocation.totals.guard - base.incoming.totalDamage
        loot = { ...spendSevenArtifact(loot, 'overflow'), overflowDamage: Math.min(SEVEN_ITEM_VALUES.overflowCap, surplus) }
      }
      if (loot.latchDraft !== undefined && canSelectItemDie(battle, loot.latchDraft)) {
        loot = { ...spendSevenArtifact(loot, 'die-latch'), latched: { index: loot.latchDraft, face: battle.dice[loot.latchDraft] } }
      }
    }
  }
  return { ...base, ...inflicted, hits, damage, loot }
}
