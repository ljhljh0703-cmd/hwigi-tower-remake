import { START_PERKS } from './perks.ts'
import type { Parity, StartPerk } from './perks.ts'
import { BANDAGE_HEAL, BUCKLE_MAX_SHORTFALL, BUCKLE_REDUCTION, WEIGHT_BONUS, WEDGE_BONUS } from './rewards.ts'
import type { Reward } from './rewards.ts'
import type { BossRelic } from './boss-relic.ts'
import { REST_HEAL, TREASURE_CARDS } from './treasure.ts'
import type { Treasure } from './treasure.ts'
import { SEVEN_ITEM_VALUES } from './item-values.ts'
import { isMetaPerk, META_ARTIFACTS, META_PERKS } from './meta-unlocks.ts'

export const REWARD_TEXT: Readonly<Record<Exclude<Reward, BossRelic>, string>> = {
  scabbard: META_ARTIFACTS.scabbard.description,
  'adjacent-needle': META_ARTIFACTS['adjacent-needle'].description,
  'pip-ring': META_ARTIFACTS['pip-ring'].description,
  'blood-grip': META_ARTIFACTS['blood-grip'].description,
  'linked-cup': META_ARTIFACTS['linked-cup'].description,
  bandage: `고르면 체력을 ${BANDAGE_HEAL} 회복해요.`,
  weight: `공격에 홀수·짝수를 함께 놓으면 피해 ${WEIGHT_BONUS}를 더 줘요. 하나당 전투당 한 번이에요.`,
  buckle: `방어가 적 공격보다 1~${BUCKLE_MAX_SHORTFALL} 모자라면 피해를 최대 ${BUCKLE_REDUCTION} 줄여요. 하나당 전투당 한 번이에요.`,
  rewind: '재굴림 뒤 공격에 4 이상 주사위 하나만 놓으면 피해 2를 더 줘요. 하나당 전투당 한 번이에요.',
  wedge: `눌러 두면 이번 공격에 ${WEDGE_BONUS}을 더해요. 하나당 전투당 한 번이에요.`,
  tuning: '−1이나 +1을 눌러 첫 일반 주사위 눈을 한 번 바꿔요.',
  tongs: '봉인 시 다른 눈 둘 이상으로 방어하면 피해를 최대 2 줄여요.',
  mantle: '적 연타 때 공격에 하나·방어에 둘 이상 놓으면 피해를 최대 2 줄여요.',
  knot: '주사위를 빼앗기면 매듭 하나를 써서, 피해 8을 주면 되찾을 수 있어요.',
  hook: '주사위 하나로 호위병을 때려 살아남으면 턴 끝에 피해 2를 더 줘요. 넘친 피해는 본체가 받아요.',
  coin: '다른 눈 셋으로 적 공격만큼 막으면 룰렛 뒤 피해 2를 더 줘요.',
  medicine: '고르면 체력을 3 회복해요.',
  kit: `고르면 체력을 ${REST_HEAL} 회복해요.`,
  whetstone: '다음 전투 첫 적중 때 피해 2를 더 줘요.',
  lining: '다음 전투에서 처음 받는 피해를 최대 2 줄여요.',
  emergency: '다음 전투 턴 시작 시 체력이 8 이하면 처음 한 번 체력 2를 회복해요.',
  assist: '에고 주사위를 해금한 뒤 협공 잔편을 켜세요. 첫 일반 주사위로 공격하면서 정확 방어에 성공하면 룰렛 반격 뒤 피해 2를 더 줘요.',
  smash: '켜고 첫 일반 주사위로 공격하면 그 눈만큼 피해를 더 줘요. 최대 3이에요.',
  mirror: '룰렛 뒤 거울을 고르면 피해를 미뤄 다음 턴 공격에 두 배(최대 12)로 더해요. 전투당 한 번이에요.',
  overflow: '적 공격을 막고 방어가 남으면, 다음 턴 적중 시 남은 만큼(최대 6) 피해를 더 줘요. 전투당 한 번이에요.',
  incomplete: '맞출 눈을 고르면 일반 주사위 하나를 최대 2 바꿔요. 등반당 한 번이에요.',
  'heart-die': '홀수나 짝수를 고르면 에고 주사위에서 그쪽 눈만 나와요.',
  hourglass: '재굴림 뒤 체력이 4 이상이면 체력 2를 내고 주사위 둘의 원래 눈·새 눈 중 골라요. 전투당 한 번이에요.',
  hammer: '적이 큰 공격을 준비할 때 망치를 켜고 공격 칸을 표시 숫자까지 채우면 다음 공격을 막아요. 전투당 한 번, 실패해도 소모돼요.',
  banner: '깃발을 켜고 공격하면 공격 칸에서 봉인되지 않은 가장 낮은 눈만큼 피해를 줄여요. 최대 4, 전투마다 한 번이에요.',
  horn: '에고 주사위로 공격하고 적 공격만큼 막으면 8 미만 룰렛 피해를 8로 바꿔요. 전투당 한 번이에요.',
  'twin-mold': TREASURE_CARDS['twin-mold'].description,
  spacer: TREASURE_CARDS.spacer.description,
  'advance-knot': TREASURE_CARDS['advance-knot'].description,
  'reserve-gauge': TREASURE_CARDS['reserve-gauge'].description,
  'clash-seal': TREASURE_CARDS['clash-seal'].description,
  'die-latch': TREASURE_CARDS['die-latch'].description,
}

export const SEVEN_REWARD_VALUES: Readonly<Partial<Record<Treasure, string>>> = {
  weight: '+최고 눈', buckle: '−3', wedge: '+3', coin: '↻1', tuning: '±1', whetstone: `+${SEVEN_ITEM_VALUES.whetstonePips}/개`, lining: '−4',
  incomplete: '2→3', hourglass: '−2 · 1~6', banner: `최고 눈 ×${SEVEN_ITEM_VALUES.bannerMultiplier}`, horn: `→${SEVEN_ITEM_VALUES.hornDamage}`, bandage: '+5',
  mirror: `×${SEVEN_ITEM_VALUES.mirrorMultiplier} → ≤${SEVEN_ITEM_VALUES.mirrorCap}`,
  overflow: `≤${SEVEN_ITEM_VALUES.overflowCap} →`,
}

const SEVEN_REWARD_TEXT: Readonly<Partial<Record<Treasure, string>>> = {
  weight: '이번 턴 공격 칸의 가장 높은 눈을 한 번 더 더합니다.',
  buckle: '이번 턴 적 공격으로 받는 피해를 최대 3 줄입니다.',
  wedge: '공격 주사위를 놓은 턴의 공격 합이 3 오릅니다.',
  coin: '정확 방어 룰렛에서 첫 칸을 포기하고 한 번 더 돌립니다.',
  tuning: '고른 일반 주사위의 눈을 1 올리거나 내립니다.',
  whetstone: `다음 전투 첫 턴에 공격 주사위마다 공격 합이 ${SEVEN_ITEM_VALUES.whetstonePips} 오릅니다.`,
  lining: '다음 전투에서 처음 받는 적 공격 피해를 최대 4 줄입니다.',
  incomplete: '등반당 한 번, 공격 칸의 같은 눈 둘로 에고 주사위를 해금합니다.',
  hourglass: '전투당 한 번, 체력 2를 내고 일반 주사위 하나를 원하는 눈으로 맞춥니다.',
  banner: `전투당 한 번, 공격 칸의 가장 높은 눈의 ${SEVEN_ITEM_VALUES.bannerMultiplier}배를 방어 합에 더합니다.`,
  horn: `전투당 한 번, 낮은 일반 반격을 에고 합공 피해 ${SEVEN_ITEM_VALUES.hornDamage}로 바꿉니다.`,
  mirror: `전투당 한 번, 룰렛 피해를 미뤄 다음 턴 공격에 ${SEVEN_ITEM_VALUES.mirrorMultiplier}배(최대 ${SEVEN_ITEM_VALUES.mirrorCap})로 더합니다.`,
  overflow: `전투당 한 번, 초과 방어만큼(최대 ${SEVEN_ITEM_VALUES.overflowCap}) 다음 턴 공격 피해를 더합니다.`,
  bandage: '체력 14 이하에서 고르면 체력이 5 오릅니다.',
}

export function rewardText(id: Treasure, seven?: boolean) {
  return (seven && SEVEN_REWARD_TEXT[id]) || REWARD_TEXT[id]
}

export function oathDescription(parity?: Parity) {
  const dice = parity === 'odd' ? '홀수 눈' : parity === 'even' ? '짝수 눈' : '시작 시 고른 홀수·짝수 눈'
  return `${dice}을 공격에 놓으면 개당 피해 ${START_PERKS.oath.bonus}을 더 줘요.`
}

export const PERK_TEXT: Readonly<Record<keyof typeof START_PERKS, string>> = {
  shield: `방어 합을 적 공격에 맞출 때마다 공격 피해가 ${START_PERKS.shield.step}씩 올라요. 빗나가면 처음부터 쌓아요.`,
  blade: `공격 눈을 ${START_PERKS.blade.threshold} 이상 모으면 다음 공격이 ${START_PERKS.blade.multiplier}배예요. 쓰거나 전투가 끝나면 초기화돼요.`,
  collector: `같은 눈 둘 이상인 칸이 강해져요. 같은 눈 둘·셋·넷이나 연속 셋을 처음 만들 때마다 보너스가 ${START_PERKS.collector.step}씩 올라요. 최대 ${START_PERKS.collector.maximum}이에요.`,
  reroll: `재굴림 뒤 체력 ${START_PERKS.reroll.cost}을 내면 이번 턴에 한 번 더 굴려요.`,
  oath: oathDescription(),
  counter: `룰렛을 돌릴 때마다 아이콘 없는 칸의 최소 숫자가 ${START_PERKS.counter.step}씩 커져요.`,
}

export function perkText(perk: StartPerk, seven?: boolean) {
  if (isMetaPerk(perk)) return META_PERKS[perk].description
  if (seven && perk === 'shield') return `정확히 막으면 다음 공격 합이 ${SEVEN_ITEM_VALUES.shieldStock} 오릅니다.`
  if (seven && perk === 'collector') return '새 족보를 해금할 때마다 같은 눈이 둘 이상인 칸의 합이 1 오릅니다.'
  if (seven && perk === 'counter') return `룰렛을 돌릴 때마다 다음 룰렛부터 일반 칸 피해가 ${SEVEN_ITEM_VALUES.counterStep} 오릅니다(최대 +${SEVEN_ITEM_VALUES.counterLimit}).`
  return PERK_TEXT[perk]
}
