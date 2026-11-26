import { CURRENT_MAP_RULES } from './ascent-map.ts'
import type { MapRules } from './ascent-map.ts'
import { BOSS_RELIC_CARDS, isBossRelic } from './boss-relic.ts'
import type { Reward } from './rewards.ts'
import { oathDescription, PERK_TEXT, REWARD_TEXT } from './reward-copy.ts'
import { REWARD_CARDS } from './rewards.ts'
import { TREASURE_CARDS } from './treasure.ts'

type GuideEntry = readonly [icon: string, name: string, description: string]
type VersionedEntry = readonly [...GuideEntry, options?: {
  readonly legacyOnly?: boolean
  readonly legacyName?: string
  readonly legacyDescription?: string
}]

interface GuideSection<Entry = GuideEntry> {
  readonly title: string
  readonly entries: readonly Entry[]
}

const legacyOnly = { legacyOnly: true }

function rewardEntry(key: Reward): VersionedEntry {
  const { icon, name } = REWARD_CARDS[key]
  if (key === 'tongs' || key === 'knot') return [icon, name, REWARD_TEXT[key], legacyOnly]
  if (key === 'banner') return [icon, name, '깃발을 켜고 공격하면 공격 칸의 가장 낮은 눈만큼 피해를 줄여요. 최대 4, 전투마다 한 번이에요.',
    { legacyDescription: REWARD_TEXT[key] }]
  return [icon, name, isBossRelic(key) ? BOSS_RELIC_CARDS[key].description : REWARD_TEXT[key]]
}

const BATTLE_GUIDE: readonly GuideSection<VersionedEntry>[] = [
  {
    title: '다음 층',
    entries: [
      ['sword', '일반 전투', '주사위를 공격 칸에 배치해 적을 공격해요.'],
      ['map-elite', '강적', '일반 전투보다 강한 적과 싸워요. 이기면 전리품을 골라요.'],
      ['map-event', '이벤트', '체력과 보상을 보고 행동을 골라요. 떠나면 효과 없이 지나가요.'],
      ['map-shop', '상인', '치료 도구는 2동전, 유물은 4동전에 살 수 있어요. 한 번만 구매할 수 있어요. 이전 등반의 장터는 경유해요.'],
      ['ascent-coin', '동전', '일반 전투 승리 시 1개, 강적 승리 시 2개를 얻어요. 이번 등반 상인에게 써요.'],
      ['map-rest', '고정 휴식', '11층에서 보스전을 준비해요. 치료 도구나 다음 전투용 숫돌을 골라요.'],
      ['map-boss', '보스', '6층 쇠사슬 집행관과 12층 문지기예요. 힘 모으기에 대비하고 12층에서 승리하면 완주 인장을 받아요.',
        { legacyDescription: '12층 문지기예요. 힘 모으기와 봉인에 대비하고 승리하면 완주 인장을 받아요.' }],
      ['map-pin', '갈림길', '보상 후 다음 층 길을 골라요. 시작·휴식·보스 앞에서는 길이 하나뿐이에요.'],
      ['map-check', '완료한 층', '등반 결과에 통과한 층 수를 표시해요.'],
      ['map-reward', '전리품', '보스 전 전투에서 이기면 전리품을 고르거나 건너뛰어요.'],
    ],
  },
  { title: '아이템과 유물', entries: (Object.keys(TREASURE_CARDS) as (keyof typeof TREASURE_CARDS)[]).map(rewardEntry) },
  {
    title: '적 기믹',
    entries: [
      ['thorns', '가시', '공격 칸 주사위마다 표시 피해를 받아요. 방어를 무시하며 적을 쓰러뜨려도 발동해요.'],
      ['lock', '자물쇠', '다음 턴 가장 낮은 눈 주사위 하나를 잠가요. 배치할 수 있으나 다시 굴릴 수 없어요.'],
      ['freeze', '얼림 · 눈송이', '다음 턴 두 번째 주사위를 눈 1로 얼려요. 얼어 있는 동안 다시 굴릴 수 없어요.', legacyOnly],
      ['rage', '격분', '이 턴에 다시 굴리면 적 공격 피해가 표시만큼 한 번 늘어나요.'],
      ['reaction', '반응', '공격 칸의 합이 표시된 기준 이상이면 적이 옆에 예고된 공격으로 바꿔요.', legacyOnly],
      ['vitality', '체력 비례', '적이 내 현재 체력에 비례해 공격해요. 최소 4 피해를 예고해요.', legacyOnly],
      ['seal', '봉인', '이 턴에는 표시된 눈을 칸에 놓아도 0으로 계산해요. 봉인된 눈은 해금 조건에도 포함되지 않아요.', legacyOnly],
      ['steal', '빼앗기', '다음 턴부터 주사위 하나를 빼앗겨요. 본체에 표시 피해를 주거나 적이 힘을 모으면 돌아와요.', legacyOnly],
      ['escort', '호위병', '칼·화살표 뒤 숫자는 호위병의 남은 체력이에요. 공격·반격은 호위병이 먼저 맞고 넘친 피해가 본체에 닿아요. 살아 있는 동안 적 공격 피해가 3 늘어나요.'],
    ],
  },
  {
    title: '적 공격 예고',
    entries: [
      ['sword', '한 방 · 연타', '한 방은 1회, 연타는 표시 횟수만큼 때려요. 방어 합이 연타 총피해와 같으면 정확히 막아 반격 룰렛을 돌려요.'],
      ['charge', '힘 모으기', '적이 이번 턴을 쉬고 다음 턴 치명 일격을 준비해요. 큰 숫자가 다음 일격 피해예요.'],
      ['break-charge', '힘 모으기 끊기', '공격 칸의 본체 피해가 표시 숫자 이상이면 다음 치명 일격 피해가 절반으로 줄어들어요.'],
      ['critical', '치명 일격', '적이 표시 피해를 한 번에 줘요. 앞 턴에 힘 모으기를 끊었다면 줄어든 값이 떠요.'],
      ['knockdown', '넉다운', '적이 공격을 쉬고 표시 배율로 피해를 받아요. 큰 칼과 겹치면 더 큰 배율만 적용돼요.'],
    ],
  },
  {
    title: '칸과 전투 표시',
    entries: [
      ['sword', '공격 칸', '큰 숫자는 보너스 포함 피해, 작은 +숫자는 보너스예요. 큰 칼로 공격 옆에 ×2가 뜨면 피해가 두 배가 돼요.'],
      ['shield', '방어 칸', '방어 칸 눈과 보너스 합으로 적 공격을 막아요.'],
      ['parry', '정확히 막기', '방어 합이 적 총공격과 같으면 정확히 막아요. 적이 살아 있으면 반격 룰렛을 돌려요.'],
      ['wheel', '반격 룰렛', '정확히 막은 뒤 룰렛을 돌려 걸린 숫자만큼 피해를 줘요.'],
      ['joint', '합공', '합공 칸도 표시 숫자만큼 피해를 줘요. 에고 주사위가 잠들면 자물쇠가 뜨고, 깨어 있으면 적에게 날아가요.'],
      ['heart', '체력', '앞 숫자는 남은 체력, 뒤 숫자는 최대 체력이에요. 체력이 0이 되면 등반이 끝나요.'],
      ['die', '주사위 자리 · 각성', '미배치 주사위 자리예요. 위기에서 각성하면 바뀐 눈이 전장에 나타나요.'],
      ['reroll', '다시 굴리기', '턴당 1회, 고른 주사위를 함께 다시 굴려요. 눈이 낮아져도 그대로 써요.'],
      ['return', '되돌리기', '배치한 주사위를 되돌려요.', { legacyName: '되돌리기 · 회수',
        legacyDescription: '배치한 주사위를 되돌려요. 빼앗긴 주사위 숫자는 되찾는 데 필요한 피해예요.' }],
      ['turn', '턴', '현재 전투의 턴 번호예요.'],
      ['next', '다음', '주사위를 모두 놓은 뒤 턴을 끝내거나, 승리 후 다음 층으로 가요.'],
      ['retry', '다시 등반', '결과 화면에서 누르면 시작 특전 선택으로 돌아가요.'],
      ['guide', '도감', '전투 아이콘과 해금 조건을 봐요. 닫으면 이전 화면으로 돌아가요.'],
      ['settings', '설정', '소리·연출 속도·움직임을 조절해요. 전투 중 등반을 포기할 수 있어요.'],
      ['lobby', '로비', '로비로 돌아가요. 진행 중인 등반은 저장돼요.'],
    ],
  },
  {
    title: '주사위 해금',
    entries: [
      ['companion-sleep', '에고 주사위', '처음엔 잠들어 있어요. 같은 눈 셋으로 깨어나 이번 등반 동안 함께 굴리고, 합공 시 적에게 날아가요. 등반 후 다시 잠들어요.'],
      ['triple', '같은 눈 셋', '공격 칸이나 정확 방어 칸에 같은 눈 셋이 들어가면 깨어나요. 다른 주사위가 섞여도 인정돼요.'],
      ['companion-awake', '깨어난 에고 주사위', '남색 테두리와 눈 표식이 붙어요. 일반 주사위처럼 굴리고 배치해요.'],
      ['straight', '이어지는 눈 셋 · 재굴림 주사위', '같은 칸에 이어지는 눈 셋을 놓으면 재굴림이 열려요. 6·5·4처럼 거꾸로 놓거나 다시 굴린 눈도 돼요.',
        { legacyDescription: '같은 칸에 이어지는 눈 셋을 놓으면 재굴림이 열려요. 6·5·4처럼 거꾸로 놓거나 다시 굴린 눈도 돼요. 봉인된 눈은 빠져요.' }],
      ['reroll-die', '해금 재굴림', '기본 재굴림 뒤 주사위 하나만 고르면 쓸 수 있어요. 해금 후 전투당 1회 사용해요.'],
      ['unlock', '해금', '한 칸에 조건에 맞는 눈이 둘이면 잠긴 자리가 약하게, 해금 조건을 채우면 밝게 빛나요. 방패는 에고 주사위에 정확한 방어가 필요하다는 뜻이에요.',
        { legacyDescription: '한 칸에 조건에 맞는 눈이 둘이면 잠긴 자리가 약하게, 해금 조건을 채우면 밝게 빛나요. 방패는 에고 주사위에 정확한 방어가 필요하다는 뜻이에요. 봉인 아이콘이 뜨면 필요한 눈이 막힌 거예요.' }],
    ],
  },
  {
    title: '소리',
    entries: [
      ['sound-on', '소리 켜짐', '배경음과 효과음을 작은 음량으로 켜요. 게임 시작이나 소리 켜기부터 재생돼요.'],
      ['sound-off', '소리 꺼짐', '배경음과 효과음을 모두 꺼요. 상단 스피커 버튼으로 다시 켜요.'],
    ],
  },
  {
    title: '상단 특전 표시',
    entries: [
      ['parry', '방패 저금', PERK_TEXT.shield],
      ['sword', '큰 칼', PERK_TEXT.blade],
      ['pair', '족보 수집가', PERK_TEXT.collector],
      ['devil-die', '악마의 재굴림', PERK_TEXT.reroll],
      ['die', '홀수 서약', oathDescription('odd')],
      ['die-even', '짝수 서약', oathDescription('even')],
      ['wheel', '역습 표식', PERK_TEXT.counter],
    ],
  },
  {
    title: '적의 빈틈',
    entries: [
      ['stun', '발목 걸기', '공격에 1을 놓으면 적의 다음 공격을 끊어요.'],
      ['armor-break', '갑옷 벗기기', '공격에 같은 눈 둘을 놓으면 다음 턴부터 공격 피해가 1.5배예요.'],
      ['stacked-pair', '같은 눈 쌍', '같은 눈 셋도 쌍으로 쳐요.'],
      ['reflect', '되돌아온 철추', '방어에 5를 놓으면 예고된 철추 피해를 되돌려 줘요. 반사 시 룰렛은 열리지 않아요.'],
      ['knockdown', '넘어뜨리기', '공격에 3을 놓으면 적이 다음 턴 쉬고 공격 칸 피해를 두 배로 받아요.'],
      ['escort-exit', '호위 퇴각', '호위가 살아 있을 때 공격에 2를 놓으면 호위가 물러나고 바로 본체를 때려요.'],
    ],
  },
  {
    title: '전투 보상',
    entries: [
      ...(Object.keys(REWARD_CARDS) as Reward[]).map(rewardEntry),
      ['completion-seal', '완주 인장', '탑의 문지기를 쓰러뜨리면 결과 화면에 완주 인장이 떠요.'],
    ],
  },
]

export function battleGuideFor(rules: MapRules = CURRENT_MAP_RULES): readonly GuideSection[] {
  const legacy = rules <= 5
  return BATTLE_GUIDE.map(({ title, entries }) => ({
    title,
    entries: entries.flatMap(([symbol, name, description, options]): GuideEntry[] => {
      if (!legacy && options?.legacyOnly) return []
      return [[symbol, (legacy && options?.legacyName) || name, (legacy && options?.legacyDescription) || description]]
    }),
  }))
}
