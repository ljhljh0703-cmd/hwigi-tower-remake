export const RELICS = ['weight', 'buckle', 'rewind', 'wedge'] as const
export type Relic = (typeof RELICS)[number]
export type Reward = Relic | 'bandage' | 'tuning'
export type RewardChoice = Reward | 'skip'

export interface CombatRewards {
  readonly relics: readonly Relic[]
  readonly spent: readonly Relic[]
  readonly tuning?: 'ready' | 'spent'
}

export const BANDAGE_THRESHOLD = 14
export const BANDAGE_HEAL = 2
export const WEIGHT_BONUS = 2
export const BUCKLE_REDUCTION = 2
export const BUCKLE_MAX_SHORTFALL = 3
export const WEDGE_BONUS = 3

export const REWARD_CARDS = {
  bandage: { name: '약초 붕대', icon: 'reward-bandage', value: `+${BANDAGE_HEAL}`, description: `체력이 ${BANDAGE_THRESHOLD} 이하이면 이 카드를 골랐을 때 체력을 ${BANDAGE_HEAL} 회복합니다.` },
  weight: { name: '저울추', icon: 'reward-weight', value: `+${WEIGHT_BONUS}`, description: `전투당 한 번, 공격 칸에 홀수 눈과 짝수 눈이 하나 이상씩 있으면 턴 끝에 본체에 추가 피해 ${WEIGHT_BONUS}를 줍니다. 봉인된 눈은 세지 않습니다.` },
  buckle: { name: '받침 버클', icon: 'reward-buckle', value: `−${BUCKLE_REDUCTION}`, description: `전투당 한 번, 방어 합이 적의 예고 피해보다 1~${BUCKLE_MAX_SHORTFALL} 낮으면 그 공격에서 잃는 체력을 최대 ${BUCKLE_REDUCTION} 줄입니다.` },
  rewind: { name: '되감기 핀', icon: 'reward-rewind', value: '+2', description: '전투당 한 번, 재굴림한 턴에 본체를 눈 4 이상의 주사위 한 개로 공격하면 턴 끝에 추가 피해 2를 줍니다.' },
  wedge: { name: '쇠쐐기', icon: 'reward-wedge', value: `+${WEDGE_BONUS}`, description: `전투당 한 번, 주사위 배치 중 쇠쐐기를 켜면 이번 턴 공격 합에 ${WEDGE_BONUS}을 더합니다. 턴을 끝내기 전에 다시 누르면 취소합니다.` },
  tuning: { name: '조율 잔편', icon: 'reward-tuning', value: '±1', description: '등반 중 한 번, 턴 확정 전에 첫 번째 일반 주사위의 눈을 1 올리거나 내립니다. 눈은 1부터 6까지입니다.' },
} as const satisfies Record<Reward, { name: string; icon: string; value: string; description: string }>

export function isRelic(value: unknown): value is Relic {
  return RELICS.some((relic) => relic === value)
}

export function relicReady(rewards: CombatRewards | undefined, relic: Relic): boolean {
  return Boolean(rewards?.relics.includes(relic) && !rewards.spent.includes(relic))
}

export function isReward(value: unknown): value is Reward {
  return value === 'tuning' || value === 'bandage' || isRelic(value)
}
