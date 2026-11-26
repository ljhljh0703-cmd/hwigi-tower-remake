import { START_PERKS } from './perks.ts'
import type { Parity, StartPerk } from './perks.ts'
import { BANDAGE_HEAL, BUCKLE_MAX_SHORTFALL, BUCKLE_REDUCTION, WEIGHT_BONUS, WEDGE_BONUS } from './rewards.ts'
import type { Reward } from './rewards.ts'
import type { BossRelic } from './boss-relic.ts'
import { REST_HEAL } from './treasure.ts'

export const REWARD_TEXT: Readonly<Record<Exclude<Reward, BossRelic>, string>> = {
  bandage: `고르면 체력을 ${BANDAGE_HEAL} 회복해요.`,
  weight: `공격 칸에 홀수와 짝수를 함께 놓으면 피해 ${WEIGHT_BONUS}를 더 줘요. 하나당 전투마다 한 번이에요.`,
  buckle: `방어가 적의 공격보다 1~${BUCKLE_MAX_SHORTFALL} 모자라면 받는 피해를 최대 ${BUCKLE_REDUCTION} 줄여요. 하나당 전투마다 한 번이에요.`,
  rewind: '다시 굴린 뒤 공격에 4 이상인 주사위 하나만 놓으면 피해 2를 더 줘요. 하나당 전투마다 한 번이에요.',
  wedge: `눌러 두면 이번 공격에 ${WEDGE_BONUS}을 더해요. 하나당 전투마다 한 번이에요.`,
  tuning: '−1 또는 +1을 눌러 첫 번째 일반 주사위 눈을 한 번 바꿔요.',
  tongs: '눈이 봉인됐을 때, 다른 눈 두 개 이상으로 방어하면 피해를 최대 2 줄여요.',
  mantle: '적이 여러 번 때릴 때 공격에 한 개, 방어에 두 개 이상을 놓으면 받는 피해를 최대 2 줄여요.',
  knot: '주사위를 빼앗기면 매듭 하나를 써서, 피해 8을 주면 되찾을 수 있어요.',
  hook: '공격 칸의 주사위 하나로 호위병을 맞혀 호위병이 살아 있으면, 턴 끝에 피해 2를 더 줘요. 넘친 피해는 본체가 받아요.',
  coin: '서로 다른 눈 세 개로 적의 공격만큼 막으면, 룰렛 뒤에 적에게 피해 2를 더 줘요.',
  medicine: '고르면 체력을 3 회복해요.',
  kit: `고르면 체력을 ${REST_HEAL} 회복해요.`,
  whetstone: '다음 전투에서 적을 처음 맞히면 피해 2를 더 줘요.',
  lining: '다음 전투에서 적에게 처음 피해를 받을 때 최대 2를 줄여요.',
  emergency: '다음 전투에서 차례를 시작할 때 체력이 8 이하면, 처음 한 번 체력을 2 회복해요.',
  assist: '에고 주사위가 열렸다면 이 잔편을 켜고 첫 일반 주사위로 공격하세요. 적의 공격만큼 막으면 룰렛 뒤 피해 2를 더 줘요.',
  smash: '이 잔편을 켜고 첫 일반 주사위로 공격하면, 그 눈만큼 피해를 더 줘요. 최대 3이에요.',
  mirror: '룰렛 뒤 거울을 고르면, 그 피해를 미뤘다가 다음 차례 공격에 두 배(최대 12)로 더해요. 전투마다 한 번이에요.',
  overflow: '적이 때릴 때 방어가 남으면, 다음 차례에 적을 맞혀 남은 만큼(최대 6) 피해를 더 줘요. 전투마다 한 번이에요.',
  incomplete: '맞출 주사위 눈을 고르면, 일반 주사위 하나를 최대 2만큼 바꿀 수 있어요. 등반마다 한 번이에요.',
  'heart-die': '홀수나 짝수를 고르면 에고 주사위가 굴릴 때마다 그쪽 눈만 나와요.',
  hourglass: '다시 굴린 뒤 체력이 4 이상이면, 체력 2를 내고 주사위 두 개 각각 원래 눈과 새 눈 중 하나를 골라요. 전투마다 한 번이에요.',
  hammer: '적이 큰 공격을 준비할 때 망치를 누르고, 공격 칸을 망치 옆 숫자까지 채우면 다음 공격을 막아요. 전투마다 한 번이며 실패해도 횟수가 줄어요.',
  banner: '깃발을 켜고 공격하면 공격 칸에서 봉인되지 않은 가장 낮은 눈만큼 피해를 줄여요. 최대 4, 전투마다 한 번이에요.',
  horn: '에고 주사위를 공격에 놓고 적의 공격만큼 막으면, 8보다 작은 룰렛 피해를 8로 바꿀 수 있어요. 전투마다 한 번이에요.',
}

export function oathDescription(parity?: Parity) {
  const dice = parity === 'odd' ? '홀수 눈' : parity === 'even' ? '짝수 눈' : '시작할 때 고른 홀수나 짝수 눈'
  return `${dice}을 공격에 놓으면 주사위마다 피해 ${START_PERKS.oath.bonus}을 더 줘요.`
}

export const PERK_TEXT: Readonly<Record<StartPerk, string>> = {
  shield: `방어 합을 적의 공격과 맞출 때마다 공격 피해가 ${START_PERKS.shield.step}씩 올라요. 공격을 받을 때 합이 다르면 처음부터 쌓아요.`,
  blade: `공격에 넣은 눈을 ${START_PERKS.blade.threshold} 이상 모으면 다음 공격이 ${START_PERKS.blade.multiplier}배예요. 쓰거나 전투가 바뀌면 다시 모아요.`,
  collector: `같은 눈을 두 개 이상 넣은 칸이 강해져요. 같은 눈 둘·셋·넷이나 이어지는 셋을 처음 만들 때마다 보너스가 ${START_PERKS.collector.step}씩 올라요. 최대 ${START_PERKS.collector.maximum}까지예요.`,
  reroll: `다시 굴리기를 쓴 뒤 체력 ${START_PERKS.reroll.cost}을 내면 이번 차례에 한 번 더 굴려요.`,
  oath: oathDescription(),
  counter: `룰렛을 돌릴 때마다 아이콘 없는 칸에서 가장 작은 숫자가 ${START_PERKS.counter.step}씩 커져요.`,
}
