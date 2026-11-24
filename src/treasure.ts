import type { CounterResult } from './combat.ts'
import type { Parity } from './perks.ts'

export const ITEMS = ['weight', 'buckle', 'rewind', 'wedge', 'tongs', 'mantle', 'knot', 'hook', 'coin'] as const
export const PREPARATIONS = ['whetstone', 'lining', 'emergency'] as const
export const SHARDS = ['tuning', 'assist', 'smash'] as const
export const ARTIFACTS = ['mirror', 'overflow', 'incomplete', 'heart-die', 'hourglass', 'hammer', 'banner', 'horn'] as const
export const ARTIFACT_SLOTS = 3

export type Item = (typeof ITEMS)[number]
export type Preparation = (typeof PREPARATIONS)[number]
export type Shard = (typeof SHARDS)[number]
export type Artifact = (typeof ARTIFACTS)[number]
export type Treasure = Item | Preparation | Shard | Artifact | 'bandage' | 'medicine' | 'kit'
export type HandChoice = 'triple' | 'straight'
export type CounterChoice = 'now' | 'mirror' | 'horn'
export type Counts<T extends string> = Readonly<Partial<Record<T, number>>>

export interface ArtifactOptions {
  readonly replace?: Artifact
  readonly parity?: Parity
  readonly hand?: HandChoice
}

export interface TreasureState {
  readonly items: Counts<Item>
  readonly spentItems: Counts<Item>
  readonly prep: Counts<Preparation>
  readonly prepared: Counts<Preparation>
  readonly shards: Counts<Shard>
  readonly equipped: readonly Artifact[]
  readonly acquired: readonly Artifact[]
  readonly spent: readonly Artifact[]
  readonly heartParity?: Parity
  readonly sealHand?: HandChoice
  readonly sealUsed?: true
  readonly armed?: readonly ('hammer' | 'banner')[]
  readonly shardArmed?: 'assist' | 'smash'
  readonly tuned?: true
  readonly sealDraft?: { readonly index: number; readonly before: number }
  readonly hourglass?: readonly { readonly index: number; readonly original: number; readonly rolled: number }[]
  readonly mirrorDamage?: number
  readonly overflowDamage?: number
  readonly counter?: CounterResult
  readonly counterFlags?: { readonly coin: boolean; readonly assist: boolean; readonly horn: boolean }
  readonly triggered?: readonly Treasure[]
}

export const emptyTreasure: TreasureState = { items: {}, spentItems: {}, prep: {}, prepared: {}, shards: {}, equipped: [], acquired: [], spent: [] }

export function isArtifact(value: unknown): value is Artifact { return ARTIFACTS.some((id) => id === value) }
export function isItem(value: unknown): value is Item { return ITEMS.some((id) => id === value) }
export function isPreparation(value: unknown): value is Preparation { return PREPARATIONS.some((id) => id === value) }
export function isShard(value: unknown): value is Shard { return SHARDS.some((id) => id === value) }
export function itemUses(state: TreasureState, item: Item): number { return (state.items[item] ?? 0) - (state.spentItems[item] ?? 0) }
export function artifactReady(state: TreasureState, artifact: Artifact): boolean { return state.equipped.includes(artifact) && !state.spent.includes(artifact) }

export function changeCount<T extends string>(counts: Counts<T>, id: T, delta: 1 | -1): Counts<T> {
  const count = (counts[id] ?? 0) + delta
  if (count) return { ...counts, [id]: count }
  const next = { ...counts }
  delete next[id]
  return next
}

export function equipArtifact(state: TreasureState, artifact: Artifact, options: ArtifactOptions): TreasureState | null {
  if (state.acquired.includes(artifact)) return null
  const full = state.equipped.length === ARTIFACT_SLOTS
  if (full ? !options.replace || !state.equipped.includes(options.replace) : options.replace !== undefined) return null
  if (artifact === 'heart-die' && options.parity !== 'odd' && options.parity !== 'even') return null
  if (artifact === 'incomplete' && options.hand !== 'triple' && options.hand !== 'straight') return null
  const equipped = full ? state.equipped.map((id) => id === options.replace ? artifact : id) : [...state.equipped, artifact]
  return {
    ...state, equipped, acquired: [...state.acquired, artifact],
    ...(artifact === 'heart-die' && { heartParity: options.parity }),
    ...(artifact === 'incomplete' && { sealHand: options.hand }),
  }
}

export function nextTreasureBattle(state: TreasureState): TreasureState {
  const { items, prep, shards, equipped, acquired, heartParity, sealHand, sealUsed } = state
  return {
    items, prep: {}, prepared: prep, shards, equipped, acquired, spent: [], spentItems: {},
    ...(heartParity && { heartParity }), ...(sealHand && { sealHand }), ...(sealUsed && { sealUsed }),
  }
}

export const TREASURE_CARDS = {
  tongs: { name: '봉인집게', icon: 'treasure-tongs', value: '−2', description: '봉인 턴에 봉인되지 않은 주사위 두 개 이상으로 방어하면 적 공격으로 잃는 체력을 최대 2 줄입니다.' },
  mantle: { name: '분할 망토', icon: 'treasure-mantle', value: '−2', description: '연타를 맞는 턴에 공격 주사위 한 개와 방어 주사위 두 개 이상을 쓰면 적 공격으로 잃는 체력을 최대 2 줄입니다.' },
  knot: { name: '회수 매듭', icon: 'treasure-knot', value: '10→8', description: '주사위를 빼앗길 때 한 개를 써서 그 주사위를 되찾는 피해 문턱을 10에서 8로 내립니다.' },
  hook: { name: '호위 갈고리', icon: 'treasure-hook', value: '+2', description: '주사위 한 개로 호위에게 피해를 주면 턴 끝에 살아 있는 호위에게 피해 2를 더 줍니다.' },
  coin: { name: '새긴 동전', icon: 'treasure-coin', value: '+2', description: '서로 다른 눈 세 개로 정확히 막으면 룰렛 뒤 살아 있는 본체에 피해 2를 더 줍니다.' },
  medicine: { name: '약봉지', icon: 'reward-bandage', value: '+3', description: '확정하면 체력을 3 회복합니다. 체력이 가득 차 있으면 사용할 수 없습니다.' },
  kit: { name: '치료 도구', icon: 'reward-bandage', value: '+4', description: '확정하면 체력을 4 회복합니다. 최대 체력을 넘길 수 없습니다.' },
  whetstone: { name: '숫돌', icon: 'treasure-whetstone', value: '+2', description: '다음 전투에서 살아 있는 본체에 처음 피해를 주는 턴 끝에 피해 2를 더 줍니다. 남은 수량은 그 전투가 끝날 때 사라집니다.' },
  lining: { name: '덧댄 천', icon: 'treasure-mantle', value: '−2', description: '다음 전투에서 처음 적 공격으로 잃는 체력을 최대 2 줄입니다. 남은 수량은 그 전투가 끝날 때 사라집니다.' },
  emergency: { name: '응급 천', icon: 'treasure-emergency', value: '+2', description: '다음 전투에서 체력 8 이하인 첫 배치 시작에 체력을 2 회복합니다. 남은 수량은 그 전투가 끝날 때 사라집니다.' },
  assist: { name: '협공 잔편', icon: 'treasure-assist', value: '+2', description: '켜 둔 턴에 동료가 깨어 있고 첫 일반 주사위로 공격하면서 정확히 막으면, 룰렛 뒤 살아 있는 본체에 피해 2를 더 줍니다.' },
  smash: { name: '강타 잔편', icon: 'treasure-smash', value: '≤3', description: '켜 둔 턴에 첫 일반 주사위로 본체를 공격하면 턴 끝에 그 눈만큼 피해를 더 줍니다. 추가 피해는 최대 3입니다.' },
  mirror: { name: '반전 거울', icon: 'treasure-mirror', value: '×2 →', description: '전투당 한 번, 정확히 막아 얻은 룰렛 피해를 미뤄 다음 턴 첫 유효 본체 공격 뒤 두 배로 줄 수 있습니다. 미룬 피해는 최대 12이며 다음 턴에 공격하지 않으면 사라집니다.' },
  overflow: { name: '넘침 방패', icon: 'treasure-overflow', value: '≤6 →', description: '전투당 한 번, 적이 실제로 공격한 턴의 초과 방어 합을 최대 6까지 저장합니다. 바로 다음 턴에 본체를 공격하면 저장한 값만큼 피해를 더 줍니다.' },
  incomplete: { name: '미완의 인장', icon: 'treasure-incomplete', value: '±2 · 1회', description: '아직 열지 않은 족보 하나를 고릅니다. 등반당 한 번, 일반 주사위의 눈을 최대 2 바꿔 공격이나 정확 방어에서 그 족보를 완성합니다.' },
  'heart-die': { name: '양면 심장', icon: 'treasure-heart-die', value: '1·3·5 / 2·4·6', description: '획득할 때 홀수 또는 짝수를 고릅니다. 장착하는 동안 동료의 첫 굴림과 재굴림은 고른 쪽의 세 눈에서 같은 확률로 나옵니다.' },
  hourglass: { name: '빚진 모래시계', icon: 'treasure-hourglass', value: '−2 · 2개', description: '전투당 한 번, 기본 재굴림 뒤 체력 2를 내고 일반 주사위 두 개를 새로 굴립니다. 두 주사위 각각 원래 눈과 새 눈 중 하나를 고릅니다.' },
  hammer: { name: '금 가르는 망치', icon: 'treasure-hammer', value: '12→15 · 0', description: '전투당 한 번, 힘 모으기 턴에 켜고 평소보다 3 높은 문턱을 넘으면 다음 치명 일격을 없앱니다. 켠 채 턴을 확정하면 실패해도 소모됩니다.' },
  banner: { name: '양날 깃발', icon: 'treasure-banner', value: '≤4 −', description: '전투당 한 번, 켠 턴에 공격에 놓은 가장 낮은 유효 눈만큼 적 공격으로 잃는 체력을 줄입니다. 최대 4이며 실제 피해를 줄일 때만 소모됩니다.' },
  horn: { name: '교대의 뿔', icon: 'treasure-horn', value: '→8 · 1회', description: '전투당 한 번, 동료 주사위로 본체를 공격하며 정확히 막으면 룰렛 일반 피해를 동료 합공 피해 8로 바꿀 수 있습니다.' },
} as const

export function isNewTreasure(value: unknown): value is keyof typeof TREASURE_CARDS {
  return typeof value === 'string' && Object.hasOwn(TREASURE_CARDS, value)
}
