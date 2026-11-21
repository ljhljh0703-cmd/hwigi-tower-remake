import { draw } from './combat.ts'

export const START_PERKS = {
  reroll: { icon: '⟳×2', label: '턴당 다시 굴리기 2회' },
  face: { icon: '⚀→④', label: '첫 주사위의 1면을 4로' },
  pair: { icon: '⛨⛨ · ◎+1', label: '같은 눈 둘로 정확 방어하면 룰렛에 피해 5 칸 추가' },
  attack: { icon: '⚔︎+4', label: '매 전투 첫 턴에 공격하면 피해 +4' },
  wheel: { icon: '◎ 1→5', label: '일반 룰렛의 피해 1 칸을 5로' },
  health: { icon: '♥+6', label: '시작 체력 +6' },
} as const

export type StartPerk = keyof typeof START_PERKS

export function offerPerks(seed: number): readonly StartPerk[] {
  const remaining = Object.keys(START_PERKS) as StartPerk[]
  return Array.from({ length: 3 }, (_, index) =>
    remaining.splice(draw(seed, 0, index) % remaining.length, 1)[0],
  )
}
