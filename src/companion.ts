import type { YachtBattle } from './yacht-combat.ts'

export const COMPANION_LINES = {
  awaken: '다시, 여기.',
  sleep: '',
}

export function companionDieIndex(battle: YachtBattle) {
  // Theft removes an ordinary die, so the companion is still the last die in the row.
  return battle.phase === 'assign' && battle.fourthDieUnlocked && !battle.itemsSeven ? battle.dice.length - 1 : null
}
