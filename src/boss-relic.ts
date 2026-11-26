export const BOSS_RELICS = ['revived-heart', 'emperor-shield', 'brake-crown', 'healing-scepter'] as const
export type BossRelic = (typeof BOSS_RELICS)[number]
export interface BossRelicState {
  readonly id: BossRelic
  readonly heartUsed?: true
}

export const HEART_REVIVAL_HP = 9
export const EMPEROR_SHIELD_CAP = 7

export const BOSS_RELIC_CARDS = {
  'revived-heart': { name: '되살아난 심장', icon: 'heart', value: '등반당 1회', description: `패배할 피해를 받으면 체력 ${HEART_REVIVAL_HP}로 일어납니다. 적 체력과 턴 결산은 이어집니다.` },
  'emperor-shield': { name: '황제의 방패', icon: 'shield', value: `첫 턴 · −${EMPEROR_SHIELD_CAP}`, description: `첫 턴에 적의 공격을 최대 ${EMPEROR_SHIELD_CAP} 줄입니다. 이 턴에는 정확 방어 룰렛이 열리지 않습니다.` },
  'brake-crown': { name: '제동 왕관', icon: 'crown', value: '전투당 1회', description: '첫 정확 방어 룰렛을 마치면 적이 다음 턴에 공격을 쉬고 공격 칸 피해를 두 배로 받습니다.' },
  'healing-scepter': { name: '회복 왕홀', icon: 'scepter', value: '획득 · 승리', description: '획득 즉시 체력을 모두 회복합니다. 이후 일반 적과 강적을 이길 때마다 보상 전에 체력을 모두 회복합니다.' },
} satisfies Record<BossRelic, { name: string; icon: string; value: string; description: string }>

export function isBossRelic(value: unknown): value is BossRelic {
  return BOSS_RELICS.some((id) => id === value)
}
