import type { MapRules } from './ascent-map.ts'
import type { AscentEnemyId } from './enemy-roster.ts'

export const TOWER_REGIONS = {
  halls: { range: [1, 4], name: '무너진 회랑', mood: '깨진 돌벽으로 막힌 작은 아치 문과 기둥의 붉은 표식만이 남은 서늘한 하층 회랑.' },
  vault: { range: [5, 8], name: '사슬의 석실', mood: '천장에 쇠사슬이 드리워지고 굵은 돌버팀목이 사방을 억누르는 어둡고 무거운 석실.' },
  sanctuary: { range: [9, 12], name: '각인의 성소', mood: '거대한 원형 돌무늬를 품은 높은 아치와 풍화된 붉은 흉터가 내려다보는 정상의 성소.' },
  stairs: { range: [13, 14], name: '좁은 계단', mood: '하층을 지나 경비 통로로 오르는 길.' },
  corridor: { range: [15, 17], name: '경비 통로', mood: '파수대가 전후로 길을 막고 있다.' },
  gate: { range: [18, 19], name: '격문', mood: '상층 끝에서 길을 닫고 있는 격문.' },
} as const

export const UPPER_ENEMIES = {
  dash: { name: '?', lineage: '탑의 산물', role: '돌진' },
  support: { name: '?', lineage: '갇힌 자', role: '지원' },
  shield: { name: '?', lineage: '파수', role: '방패' },
  guard: { name: '?', lineage: '파수', role: '호위' },
  gatekeeper: { name: '?', lineage: '갇힌 자', role: '보스' },
} as const

export function towerRegion(floor: number) {
  return Object.values(TOWER_REGIONS).find(({ range: [first, last] }) => first <= floor && floor <= last)
}

type CodexEnemyId = AscentEnemyId | 'escort-guard'
type Badge = { readonly icon: string; readonly label: string }
type EnemyEntry = {
  readonly name: string
  readonly title?: string
  readonly lineage: '탑의 산물' | '갇힌 자' | '파수'
  readonly lore: string
  readonly mechanic?: string
  readonly region: keyof typeof TOWER_REGIONS
  readonly icon: string
  readonly old?: Badge
  readonly six?: Badge
  readonly oldNameplate?: string
}

export const ENEMY_CODEX: Readonly<Record<string, EnemyEntry> & Record<CodexEnemyId, EnemyEntry>> = {
  thorns: {
    name: '돌짐승', lineage: '탑의 산물', region: 'halls', icon: 'thorns', old: { icon: 'thorns', label: '가시 골렘' },
    lore: '풍화된 등줄기에 날 선 바위 능선을 세운 채 앞발로 땅을 짚고 버티는 돌짐승.',
    mechanic: '살아남으면 공격 칸의 주사위마다 가시 피해를 돌려줍니다.',
  },
  lock: {
    name: '쇠아귀', lineage: '탑의 산물', region: 'halls', icon: 'lock', old: { icon: 'lock', label: '자물쇠' },
    lore: '낡은 각인판이 박힌 굽은 몸통에 거대한 집게 팔을 달아 쥔 것을 놓지 않는 괴수.',
    mechanic: '다음 턴 가장 낮은 눈 하나를 잠가 재굴림을 막습니다.',
  },
  freeze: {
    name: '서리 야수', lineage: '탑의 산물', region: 'halls', icon: 'sword',
    old: { icon: 'freeze', label: '얼림' }, six: { icon: 'sword', label: '엇걸음병' },
    lore: '회색 돌껍질 위로 푸른 겨울 서리 송곳이 돋아나 움직임마다 한기를 흩뿌리는 야수.',
    mechanic: '예고 중 공격에 1을 놓으면 적의 다음 공격을 끊습니다.',
  },
  rage: {
    name: '잿불 멧돼지', lineage: '탑의 산물', region: 'halls', icon: 'rage', old: { icon: 'rage', label: '격분' },
    lore: '짙은 잿빛 등 한가운데 꺼지지 않은 붉은 불씨를 품은 채 머리를 낮추고 들이받는 짐승.',
    mechanic: '격분을 예고한 턴에 다시 굴리면 공격이 강해집니다.',
  },
  'shield-soldier': {
    name: '방패지기', lineage: '파수', region: 'vault', icon: 'reaction', old: { icon: 'reaction', label: '방패병' },
    lore: '낡은 투구 아래 얼굴을 감추고 투박한 돌방패를 앞세워 좁은 길을 지키는 보초.',
    mechanic: '예고 중 공격에 같은 눈 둘을 놓으면 갑옷이 부서집니다.',
  },
  'seal-sentinel': {
    name: '비문 파수꾼', lineage: '파수', region: 'sanctuary', icon: 'knockdown',
    old: { icon: 'seal', label: '봉인 파수꾼' }, six: { icon: 'knockdown', label: '눈금 파수꾼' },
    lore: '어깨에 네모난 탑의 비문판을 진 채 무거운 주먹을 비틀어 내려찍는 거대한 돌 파수꾼.',
    mechanic: '예고 중 공격에 3을 놓으면 넘어져 다음 턴에 쉽니다.',
  },
  'iron-knight': {
    name: '무쇠 갑주', lineage: '갇힌 자', region: 'sanctuary', icon: 'charge', old: { icon: 'charge', label: '철갑 기사' },
    lore: '무기도 방패도 잃고 두꺼운 철판 속에 갇혀 빈 주먹으로만 내려찍는 굽은 갑주.',
    mechanic: '힘을 모은 뒤 치명 일격을 날리고, 넘어져 쉬는 턴이 있습니다.',
  },
  reaction: {
    name: '잊힌 기사', lineage: '갇힌 자', region: 'vault', icon: 'shield',
    old: { icon: 'reaction', label: '반응' }, six: { icon: 'shield', label: '갑주 강적' },
    lore: '빗금 그인 긴 방패 뒤에서 버티며 상대의 기세가 거세질수록 날카롭게 응수하는 기사.',
    mechanic: '예고 중 공격에 같은 눈 둘을 놓으면 갑옷이 부서집니다.',
  },
  vitality: {
    name: '바위 거인', lineage: '탑의 산물', region: 'vault', icon: 'treasure-hammer',
    old: { icon: 'vitality', label: '체력 비례 일격' }, six: { icon: 'treasure-hammer', label: '철추 강적' },
    lore: '양어깨가 절벽처럼 솟은 채 묵직한 돌주먹을 내리꽂는 늙고 거대한 바위 거인.',
    mechanic: '철추를 예고할 때 방어에 5를 놓으면 피해를 돌려줍니다.',
  },
  escort: {
    name: '가면 사제', lineage: '갇힌 자', region: 'sanctuary', icon: 'escort',
    old: { icon: 'escort', label: '호위와 주사위 빼앗기' }, six: { icon: 'escort', label: '호위 강적' },
    lore: '두 갈래 뿔두건과 잿빛 장포를 두르고 고리 지팡이로 옛 종을 불러내는 탑의 사제.',
    mechanic: '작은 시종을 부릅니다. 호위 중 공격에 2를 놓으면 시종이 물러납니다.',
  },
  'escort-guard': {
    name: '작은 시종', lineage: '갇힌 자', region: 'sanctuary', icon: 'escort', old: { icon: 'escort', label: '호위병' },
    lore: '낡은 두건과 둥근 방패로 몸을 웅크린 채 주인 앞을 끝까지 가로막는 충직한 시종.',
    mechanic: '공격을 대신 맞고, 살아 있는 동안 사제의 공격을 강화합니다.',
  },
  'chain-warden': {
    name: '청동 간수', title: '여섯째 층의 사슬 집행관', lineage: '파수', region: 'vault', icon: 'treasure-hammer',
    old: { icon: 'treasure-hammer', label: '쇠사슬 집행관' },
    lore: '푸른 녹이 슨 청동 갑주와 창살 가면 뒤에서 사슬 달린 쇳덩이를 휘두르는 중간층 간수.',
    mechanic: '철추를 예고할 때 방어에 5를 놓으면 피해를 돌려줍니다.',
  },
  boss: {
    name: '침묵의 황제', title: '열두째 층의 문지기', lineage: '파수', region: 'sanctuary', icon: 'charge',
    old: { icon: 'charge', label: '힘 모으는 보스' }, oldNameplate: '황제',
    lore: '왼쪽 어깨에 탑의 붉은 표식을 진 채 거대한 검과 돌기둥으로 정상 문을 지키는 옛 황제.',
    mechanic: '넘어뜨리기 예고 중 공격에 3을 놓으면 다음 턴에 쉽니다.',
  },
}

export function enemyBadge(id: CodexEnemyId, rules: MapRules): Badge {
  const enemy = ENEMY_CODEX[id]
  const historical = rules === 6 ? enemy.six ?? enemy.old : rules < 6 ? enemy.old : undefined
  return historical ?? { icon: enemy.icon, label: enemy.name }
}

export function enemyNameplate(id: CodexEnemyId, rules: MapRules) {
  return (rules < 7 && ENEMY_CODEX[id].oldNameplate) || enemyBadge(id, rules).label
}
