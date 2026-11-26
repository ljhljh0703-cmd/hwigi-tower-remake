import { isNewTreasure, TREASURE_CARDS } from './treasure.ts'
import type { Treasure } from './treasure.ts'
import { BOSS_RELIC_CARDS, isBossRelic } from './boss-relic.ts'
import type { BossRelic } from './boss-relic.ts'

export const RELICS = ['weight', 'buckle', 'rewind', 'wedge'] as const
export type Relic = (typeof RELICS)[number]
export type LegacyReward = Relic | 'bandage' | 'tuning'
export type Reward = Treasure | BossRelic
export type RewardChoice = Reward | 'skip' | 'keep-artifacts'
export const ELITE_KEEP_COINS = 2

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
  ...TREASURE_CARDS,
  ...BOSS_RELIC_CARDS,
  bandage: { name: '약초 붕대', icon: 'reward-bandage', value: `+${BANDAGE_HEAL}`, description: `체력이 ${BANDAGE_THRESHOLD} 이하일 때 고르면 체력을 ${BANDAGE_HEAL} 회복합니다.` },
  weight: { name: '저울추', icon: 'reward-weight', value: `+${WEIGHT_BONUS}`, description: `공격 칸에 봉인되지 않은 홀수 눈과 짝수 눈이 하나 이상씩 있으면 턴 끝에 본체에 추가 피해 ${WEIGHT_BONUS}를 줍니다. 한 개마다 전투당 한 번 발동합니다.` },
  buckle: { name: '받침 버클', icon: 'reward-buckle', value: `−${BUCKLE_REDUCTION}`, description: `방어 합이 예고 피해보다 1~${BUCKLE_MAX_SHORTFALL} 낮으면 받는 피해를 최대 ${BUCKLE_REDUCTION} 줄입니다. 개당 전투당 1회 발동합니다.` },
  rewind: { name: '되감기 핀', icon: 'reward-rewind', value: '+2', description: '재굴림 턴에 눈 4 이상 주사위 하나로 본체를 공격하면 턴 끝에 피해 2를 더 줍니다. 개당 전투당 1회 발동합니다.' },
  wedge: { name: '쇠쐐기', icon: 'reward-wedge', value: `+${WEDGE_BONUS}`, description: `배치 중 켜면 공격 합에 ${WEDGE_BONUS}을 더합니다. 확정 전 다시 눌러 취소하며, 확정 시 개당 전투당 1회 소모됩니다.` },
  tuning: { name: '조율 잔편', icon: 'reward-tuning', value: '±1', description: '하나를 써서 턴 확정 전 첫 일반 주사위 눈을 1 올리거나 내립니다. 눈은 1~6입니다.' },
} as const satisfies Record<Reward, { name: string; icon: string; value: string; description: string }>

export function isRelic(value: unknown): value is Relic {
  return RELICS.some((relic) => relic === value)
}

export function relicReady(rewards: CombatRewards | undefined, relic: Relic): boolean {
  return Boolean(rewards?.relics.includes(relic) && !rewards.spent.includes(relic))
}

export function isLegacyReward(value: unknown): value is LegacyReward {
  return value === 'tuning' || value === 'bandage' || isRelic(value)
}

export function isReward(value: unknown): value is Reward { return isLegacyReward(value) || isNewTreasure(value) || isBossRelic(value) }
