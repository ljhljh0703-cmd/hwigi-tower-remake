import { draw } from './combat.ts'

const devilFaceBonus = 1
const faceReplacement = 5
const pairDamage = 23
const pairSlots = 4
const attackDamage = 2
const wheelDamage = 9
const healthBonus = 2

export const START_PERKS = {
  reroll: {
    rollsPerCost: 3, faceBonus: devilFaceBonus, faceCap: 6,
    icon: `⛧+${devilFaceBonus}`, label: '악마의 주사위',
  },
  face: {
    replacement: faceReplacement, icon: `⚀→${'①②③④⑤⑥'[faceReplacement - 1]}`,
    label: `첫 주사위의 1면을 ${faceReplacement}로`,
  },
  pair: {
    reward: { damage: pairDamage, joint: false }, slots: pairSlots,
    icon: `⛨⛨ · ◎+${pairSlots}`, label: `같은 눈 둘로 정확 방어하면 룰렛에 피해 ${pairDamage} 칸 ${pairSlots}개 추가`,
  },
  attack: { damage: attackDamage, icon: `⚔︎+${attackDamage}`, label: `매 전투 첫 턴에 공격하면 피해 +${attackDamage}` },
  wheel: {
    reward: { damage: wheelDamage, joint: false }, icon: `◎ 1→${wheelDamage}`,
    label: `일반 룰렛의 피해 1 칸을 ${wheelDamage}로`,
  },
  health: { bonus: healthBonus, icon: `♥+${healthBonus}`, label: `시작 체력 +${healthBonus}` },
} as const

export type StartPerk = keyof typeof START_PERKS

export function offerPerks(seed: number): readonly StartPerk[] {
  const remaining = Object.keys(START_PERKS) as StartPerk[]
  return Array.from({ length: 3 }, (_, index) =>
    remaining.splice(draw(seed, 0, index) % remaining.length, 1)[0],
  )
}
