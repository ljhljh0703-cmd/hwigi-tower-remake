import type { CounterResult } from './combat.ts'
import type { Parity } from './perks.ts'
import { isMetaArtifact, META_ARTIFACTS } from './meta-unlocks.ts'
import type { MetaArtifact } from './meta-unlocks.ts'

export const ITEMS = ['weight', 'buckle', 'rewind', 'wedge', 'tongs', 'mantle', 'knot', 'hook', 'coin'] as const
export const PREPARATIONS = ['whetstone', 'lining', 'emergency'] as const
export const SHARDS = ['tuning', 'assist', 'smash'] as const
export const ARTIFACTS = ['mirror', 'overflow', 'incomplete', 'heart-die', 'hourglass', 'hammer', 'banner', 'horn'] as const
export const COMMON_CONSUMABLES = ['weight', 'buckle', 'wedge', 'coin', 'tuning', 'twin-mold', 'spacer', 'advance-knot'] as const
export const RARE_CONSUMABLES = ['reserve-gauge', 'clash-seal'] as const
export const COMMON_ARTIFACTS = ['mirror', 'overflow', 'banner', 'horn', 'die-latch'] as const
export const RARE_ARTIFACTS = ['incomplete', 'heart-die', 'hourglass'] as const
export const NEW_TREASURES = ['twin-mold', 'spacer', 'advance-knot', 'reserve-gauge', 'clash-seal', 'die-latch'] as const
export const ARTIFACT_SLOTS = 3
export const REST_HEAL = 5

export type Item = (typeof ITEMS)[number]
export type Preparation = (typeof PREPARATIONS)[number]
export type Shard = (typeof SHARDS)[number]
export type Artifact = (typeof ARTIFACTS)[number] | (typeof COMMON_ARTIFACTS)[number] | MetaArtifact
export type Consumable = (typeof COMMON_CONSUMABLES)[number] | (typeof RARE_CONSUMABLES)[number]
export type ArmedConsumable = Exclude<Consumable, 'coin' | 'tuning' | 'twin-mold'>
export type Treasure = Item | Preparation | Shard | Artifact | Consumable | 'bandage' | 'medicine' | 'kit'
export type HandChoice = 'triple' | 'straight'
export type CounterChoice = 'now' | 'mirror' | 'horn' | 'coin' | 'adjacent' | 'recover-reroll'
export type Counts<T extends string> = Readonly<Partial<Record<T, number>>>
export type PendingDie = { readonly index: number; readonly original: number; readonly rolled: number }

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
  readonly hourglass?: readonly PendingDie[]
  readonly mirrorDamage?: number
  readonly overflowDamage?: number
  readonly counter?: CounterResult
  readonly counterFlags?: { readonly coin: boolean; readonly assist: boolean; readonly horn: boolean }
  readonly triggered?: readonly Treasure[]
  readonly consumables?: Counts<Consumable>
  readonly consumableArmed?: ArmedConsumable
  readonly consumableUsed?: true
  readonly reserveRoll?: readonly PendingDie[]
  readonly latchDraft?: number
  readonly latched?: { readonly index: number; readonly face: number }
  readonly counterRecast?: true
  readonly scabbard?: number
}

export const emptyTreasure: TreasureState = { items: {}, spentItems: {}, prep: {}, prepared: {}, shards: {}, equipped: [], acquired: [], spent: [] }

export function isArtifact(value: unknown): value is Artifact { return isMetaArtifact(value) || value === 'die-latch' || ARTIFACTS.some((id) => id === value) }
export function isItem(value: unknown): value is Item { return ITEMS.some((id) => id === value) }
export function isPreparation(value: unknown): value is Preparation { return PREPARATIONS.some((id) => id === value) }
export function isShard(value: unknown): value is Shard { return SHARDS.some((id) => id === value) }
export function isConsumable(value: unknown): value is Consumable {
  return COMMON_CONSUMABLES.some((id) => id === value) || RARE_CONSUMABLES.some((id) => id === value)
}

export function isArmedConsumable(value: unknown): value is ArmedConsumable {
  return isConsumable(value) && value !== 'coin' && value !== 'tuning' && value !== 'twin-mold'
}

export function isSevenTreasure(value: unknown): value is Treasure {
  return isMetaArtifact(value) || isConsumable(value) || COMMON_ARTIFACTS.some((id) => id === value) || RARE_ARTIFACTS.some((id) => id === value) ||
    value === 'bandage' || value === 'medicine' || value === 'kit' || value === 'whetstone' || value === 'lining'
}

export function isNewTreasureId(value: unknown) { return isMetaArtifact(value) || NEW_TREASURES.some((id) => id === value) }

export function treasureRarity(value: Treasure): 'common' | 'rare' | undefined {
  if (value === 'linked-cup' || RARE_ARTIFACTS.some((id) => id === value) || RARE_CONSUMABLES.some((id) => id === value)) return 'rare'
  if (isSevenTreasure(value)) return 'common'
}
export function itemUses(state: TreasureState, item: Item): number { return (state.items[item] ?? 0) - (state.spentItems[item] ?? 0) }
export function artifactReady(state: TreasureState, artifact: Artifact): boolean { return state.equipped.includes(artifact) && !state.spent.includes(artifact) }

export function changeCount<T extends string>(counts: Counts<T>, id: T, delta: 1 | -1): Counts<T> {
  const count = (counts[id] ?? 0) + delta
  if (count) return { ...counts, [id]: count }
  const next = { ...counts }
  delete next[id]
  return next
}

export function equipArtifact(state: TreasureState, artifact: Artifact, options: ArtifactOptions, allowReequip = false): TreasureState | null {
  if (state.equipped.includes(artifact) || !allowReequip && state.acquired.includes(artifact)) return null
  const full = state.equipped.length === ARTIFACT_SLOTS
  if (full ? !options.replace || !state.equipped.includes(options.replace) : options.replace !== undefined) return null
  if (artifact === 'heart-die' && options.parity !== 'odd' && options.parity !== 'even') return null
  if (artifact === 'incomplete' && !state.consumables && options.hand !== 'triple' && options.hand !== 'straight') return null
  const equipped = full ? state.equipped.map((id) => id === options.replace ? artifact : id) : [...state.equipped, artifact]
  return {
    ...state, equipped, acquired: state.acquired.includes(artifact) ? state.acquired : [...state.acquired, artifact],
    ...(artifact === 'heart-die' && { heartParity: options.parity }),
    ...(artifact === 'incomplete' && !state.consumables && { sealHand: options.hand }),
    ...(options.replace === 'scabbard' && { scabbard: undefined }),
  }
}

export function nextTreasureBattle(state: TreasureState): TreasureState {
  const { items, prep, shards, equipped, acquired, heartParity, sealHand, sealUsed, consumables } = state
  return {
    items, prep: {}, prepared: prep, shards, equipped, acquired, spent: [], spentItems: {},
    ...(consumables && { consumables }),
    ...(state.scabbard && equipped.includes('scabbard') && { scabbard: state.scabbard }),
    ...(heartParity && { heartParity }), ...(sealHand && { sealHand }), ...(sealUsed && { sealUsed }),
  }
}

export const TREASURE_CARDS = {
  ...META_ARTIFACTS,
  tongs: { name: '봉인집게', icon: 'treasure-tongs', value: '−2', description: '봉인 턴에 봉인되지 않은 주사위 두 개 이상으로 방어하면 적 공격으로 잃는 체력을 최대 2 줄입니다.' },
  mantle: { name: '분할 망토', icon: 'treasure-mantle', value: '−2', description: '연타 턴에 공격 1개·방어 2개 이상을 쓰면 받는 피해를 최대 2 줄입니다.' },
  knot: { name: '회수 매듭', icon: 'treasure-knot', value: '10→8', description: '주사위를 빼앗길 때 하나를 써서 되찾는 피해 기준을 10에서 8로 낮춥니다.' },
  hook: { name: '호위 갈고리', icon: 'treasure-hook', value: '+2', description: '주사위 하나로 호위병을 때려 살아남으면 턴 끝에 피해 2를 더 줍니다. 넘친 피해는 본체에 들어갑니다.' },
  coin: { name: '새긴 동전', icon: 'treasure-coin', value: '+2', description: '다른 눈 셋으로 정확히 막으면 룰렛 뒤 살아 있는 본체에 피해 2를 더 줍니다.' },
  medicine: { name: '약봉지', icon: 'reward-bandage', value: '+3', description: '확정 시 체력을 3 회복합니다. 체력이 가득 차면 쓸 수 없습니다.' },
  kit: { name: '치료 도구', icon: 'reward-bandage', value: `+${REST_HEAL}`, description: `확정 시 체력을 ${REST_HEAL} 회복합니다. 최대 체력을 넘지 않습니다.` },
  whetstone: { name: '숫돌', icon: 'treasure-whetstone', value: '+2', description: '다음 전투에서 살아 있는 본체에 처음 피해를 준 턴 끝에 피해 2를 더 줍니다. 남은 수량은 전투 후 사라집니다.' },
  lining: { name: '덧댄 천', icon: 'treasure-mantle', value: '−2', description: '다음 전투에서 처음 적 공격 피해를 최대 2 줄입니다. 남은 수량은 전투 후 사라집니다.' },
  emergency: { name: '응급 천', icon: 'treasure-emergency', value: '+2', description: '다음 전투에서 체력 8 이하인 첫 배치 시작에 체력 2를 회복합니다. 남은 수량은 전투 후 사라집니다.' },
  assist: { name: '협공 잔편', icon: 'treasure-assist', value: '+2', description: '켠 턴에 에고 주사위가 깨어 있고 첫 일반 주사위로 공격하며 정확히 막으면 룰렛 뒤 본체에 피해 2를 더 줍니다.' },
  smash: { name: '강타 잔편', icon: 'treasure-smash', value: '≤3', description: '켠 턴에 첫 일반 주사위로 본체를 공격하면 턴 끝에 그 눈만큼(최대 3) 피해를 더 줍니다.' },
  mirror: { name: '반전 거울', icon: 'treasure-mirror', value: '×2 →', description: '전투당 1회, 룰렛 피해를 미뤄 다음 턴 첫 유효 본체 공격 뒤 두 배(최대 12)로 줍니다. 다음 턴에 공격하지 않으면 사라집니다.' },
  overflow: { name: '넘침 방패', icon: 'treasure-overflow', value: '≤6 →', description: '전투당 1회, 적이 공격한 턴의 초과 방어를 최대 6까지 저장합니다. 다음 턴에 본체를 공격하면 그만큼 피해를 더 줍니다.' },
  incomplete: { name: '미완의 인장', icon: 'treasure-incomplete', value: '±2 · 1회', description: '미해금 족보 하나를 고릅니다. 등반당 1회, 일반 주사위 눈을 최대 2 바꿔 공격·정확 방어로 그 족보를 완성합니다.' },
  'heart-die': { name: '양면 심장', icon: 'treasure-heart-die', value: '1·3·5 / 2·4·6', description: '획득 시 홀수나 짝수를 고릅니다. 장착 중 에고 주사위의 굴림과 재굴림은 고른 쪽 세 눈에서 같은 확률로 나옵니다.' },
  hourglass: { name: '빚진 모래시계', icon: 'treasure-hourglass', value: '−2 · 2개', description: '전투당 1회, 기본 재굴림 뒤 체력 2를 내고 일반 주사위 둘을 다시 굴려 각각 원래 눈·새 눈 중 고릅니다.' },
  hammer: { name: '금 가르는 망치', icon: 'treasure-hammer', value: '12→15 · 0', description: '전투당 한 번, 힘 모으기 턴에 켜고 평소보다 3 높은 문턱을 넘으면 다음 치명 일격을 없앱니다. 켠 채 턴을 확정하면 실패해도 소모됩니다.' },
  banner: { name: '양날 깃발', icon: 'treasure-banner', value: '≤4 −', description: '전투당 1회, 켠 턴에 공격의 가장 낮은 유효 눈만큼(최대 4) 받는 피해를 줄입니다. 피해를 줄일 때만 소모됩니다.' },
  horn: { name: '교대의 뿔', icon: 'treasure-horn', value: '→8 · 1회', description: '전투당 1회, 에고 주사위로 본체 공격·정확 방어 시 룰렛 일반 피해를 에고 주사위 합공 피해 8로 바꿉니다.' },
  'twin-mold': { name: '쌍금 틀', icon: 'treasure-twin-mold', value: '=', description: '일반 주사위 하나를 다른 일반 주사위와 같은 눈으로 맞춥니다.' },
  spacer: { name: '간격자', icon: 'treasure-spacer', value: '−1', description: '방어가 예고보다 1 크면 1을 빼 정확히 막습니다.' },
  'advance-knot': { name: '전진 매듭', icon: 'treasure-advance-knot', value: '+6', description: '방어 칸을 비우고 공격하면 공격 합이 6 오릅니다.' },
  'reserve-gauge': { name: '예비 눈금', icon: 'treasure-reserve-gauge', value: '↔', description: '기본 재굴림에서 굴린 일반 주사위는 이전 눈과 새 눈 중 고릅니다.' },
  'clash-seal': { name: '격돌 인장', icon: 'treasure-clash-seal', value: '×2', description: '공격 칸에 같은 눈이 둘 이상이면 공격 합이 두 배가 됩니다.' },
  'die-latch': { name: '눈금 걸쇠', icon: 'treasure-die-latch', value: '→', description: '전투당 한 번, 일반 주사위 하나의 눈을 다음 턴에 다시 받습니다.' },
} as const

export function isNewTreasure(value: unknown): value is keyof typeof TREASURE_CARDS {
  return typeof value === 'string' && Object.hasOwn(TREASURE_CARDS, value)
}
