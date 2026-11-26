import { draw } from './combat.ts'
import { canSelectItemDie, spendSevenArtifact } from './item-effects.ts'
import { META_VALUES } from './meta-unlocks.ts'
import { artifactReady } from './treasure.ts'
import type { YachtBattle } from './yacht-combat.ts'

export interface MetaTurn {
  readonly reverseDie?: number
  readonly bloodDie?: number
  readonly chargeDie?: number
}

export function canPlaceMetaDie(battle: YachtBattle, index: number, slot: YachtBattle['slots'][number]) {
  return battle.metaTurn?.chargeDie !== index || slot !== 'guard'
}

export function draftMetaDie(battle: YachtBattle, kind: 'reverse-guard' | 'blood-grip', index: number): YachtBattle {
  if (battle.phase !== 'assign' || !battle.itemsSeven || battle.loot?.reserveRoll ||
    !Number.isInteger(index) || index < 0 || index >= battle.dice.length) return battle
  const { perk, loot, slots, metaTurn } = battle
  const reverse = kind === 'reverse-guard'
  if (reverse ? perk?.kind !== kind || perk.spent || slots[index] !== 'guard'
    : !loot || !artifactReady(loot, kind) || slots[index] !== 'attack' || metaTurn?.chargeDie === index) return battle
  const key = reverse ? 'reverseDie' : 'bloodDie'
  return { ...battle, metaTurn: { ...metaTurn, [key]: metaTurn?.[key] === index ? undefined : index } }
}

export function bloodDieFor(battle: YachtBattle, slots = battle.slots) {
  const index = battle.metaTurn?.bloodDie
  return index !== undefined && slots[index] === 'attack' ? index : undefined
}

export function metaAllocationSlots(battle: YachtBattle, slots = battle.slots): YachtBattle['slots'] {
  const blood = bloodDieFor(battle, slots)
  return blood === undefined ? slots : slots.map((slot, index) => index === blood ? null : slot)
}

export function bloodHealing(battle: YachtBattle, dice: readonly number[]) {
  const index = bloodDieFor(battle)
  if (index === undefined) return 0
  const amount = Math.min(META_VALUES.bloodCap, dice[index])
  return battle.bossRelic?.id === 'revived-heart' ? Math.floor(amount / 2) : amount
}

export function transferMetaPip(battle: YachtBattle, source: number, target: number): YachtBattle {
  const { loot, dice } = battle
  if (!loot || !artifactReady(loot, 'pip-ring') || source === target || !canSelectItemDie(battle, source) ||
    !canSelectItemDie(battle, target) || dice[source] <= 1 || dice[target] >= 6) return battle
  return { ...battle, dice: dice.map((face, index) => face + Number(index === target) - Number(index === source)),
    loot: spendSevenArtifact(loot, 'pip-ring') }
}

export function linkedFaces(battle: YachtBattle) {
  const low = 1 + draw(battle.seed, battle.turn, 110) % 5
  return (draw(battle.seed, battle.turn, 111) & 1) === 0 ? [low, low + 1] : [low + 1, low]
}
