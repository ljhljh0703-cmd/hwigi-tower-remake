export const BOSS_RELICS = ['revived-heart', 'emperor-shield', 'brake-crown', 'healing-scepter'] as const
export type BossRelic = (typeof BOSS_RELICS)[number]
export interface BossRelicState {
  readonly id: BossRelic
  readonly heartUsed?: true
}

export const HEART_REVIVAL_HP = 9
export const EMPEROR_SHIELD_CAP = 7
export const SEVEN_HEART_REVIVAL_HP = 10
export const SEVEN_EMPEROR_SHIELD_CAP = 8
export const SEVEN_EMPEROR_COUNTER_RATIO = 0.5
export const SEVEN_CROWN_DAMAGE_BONUS = 10
export const SEVEN_SCEPTER_HEAL = 6
export const SEVEN_SCEPTER_REROLL_COST = 1

export const BOSS_RELIC_CARDS = {
  'revived-heart': { name: '되살아난 심장', icon: 'heart', value: '등반당 1회', description: `치명상을 입으면 체력 ${HEART_REVIVAL_HP}로 살아납니다. 적 체력과 턴 결산은 이어집니다.` },
  'emperor-shield': { name: '황제의 방패', icon: 'shield', value: `첫 턴 · −${EMPEROR_SHIELD_CAP}`, description: `첫 턴 적 공격을 최대 ${EMPEROR_SHIELD_CAP} 줄입니다. 이 턴은 정확 방어 룰렛이 열리지 않습니다.` },
  'brake-crown': { name: '제동 왕관', icon: 'crown', value: '전투당 1회', description: '첫 정확 방어 룰렛 뒤 적은 다음 턴 공격을 쉬고 공격 칸 피해를 두 배로 받습니다.' },
  'healing-scepter': { name: '회복 왕홀', icon: 'scepter', value: '획득 · 승리', description: '획득 즉시, 그리고 일반·강적 승리마다 보상 전에 체력을 모두 회복합니다.' },
} satisfies Record<BossRelic, { name: string; icon: string; value: string; description: string }>

export const SEVEN_BOSS_RELICS = {
  'revived-heart': { benefit: ['heart', String(SEVEN_HEART_REVIVAL_HP)], cost: ['healing', '½'], description: `첫 치명상에 체력 ${SEVEN_HEART_REVIVAL_HP}로 되살아나고 다른 회복량은 절반이 됩니다.` },
  'emperor-shield': { benefit: ['shield', `−${SEVEN_EMPEROR_SHIELD_CAP}`], cost: ['wheel', '½'], description: `첫 턴 적 공격 피해를 최대 ${SEVEN_EMPEROR_SHIELD_CAP} 줄이고 룰렛 피해는 절반이 됩니다.` },
  'brake-crown': { benefit: ['knockdown', `+${SEVEN_CROWN_DAMAGE_BONUS}`], cost: ['wheel', '0'], description: `전투 첫 룰렛 피해를 포기하고 적을 넘어뜨려 다음 턴 공격 피해를 ${SEVEN_CROWN_DAMAGE_BONUS} 더 줍니다.` },
  'healing-scepter': { benefit: ['healing', `+${SEVEN_SCEPTER_HEAL}`],
    cost: ['reroll', `1턴 ♡−${SEVEN_SCEPTER_REROLL_COST}`], description: `획득과 일반·강적 승리 시 체력 ${SEVEN_SCEPTER_HEAL}을 회복하고, 전투 첫 턴 기본 재굴림 시 체력 ${SEVEN_SCEPTER_REROLL_COST}을 소모합니다.` },
} satisfies Record<BossRelic, { benefit: [string, string]; cost: [string, string]; description: string }>

export function bossRelicText(id: BossRelic, seven?: boolean) {
  return seven ? SEVEN_BOSS_RELICS[id].description : BOSS_RELIC_CARDS[id].description
}

export function isBossRelic(value: unknown): value is BossRelic {
  return BOSS_RELICS.some((id) => id === value)
}
