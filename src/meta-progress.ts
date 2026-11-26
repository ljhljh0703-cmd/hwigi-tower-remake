import type { Ascent } from './ascent.ts'
import { isMetaFloor, isMetaPerk, metaFloorForCard, META_STAGES } from './meta-unlocks.ts'
import type { MetaFloor, MetaPerk } from './meta-unlocks.ts'

export const META_SAVE_KEY = 'hwigi-tower.meta'
export const META_CARD_COUNT = META_STAGES.length * 2
export const ALL_META_FLOORS = META_STAGES.map(({ floor }) => floor)

export interface MetaProgress {
  readonly version: 1
  readonly generation: number
  readonly unlocked: readonly MetaFloor[]
  readonly seen: readonly MetaPerk[]
}

export interface RunMeta {
  readonly generation: number
  readonly pool: readonly MetaFloor[]
  readonly opened: readonly MetaFloor[]
}

const empty: MetaProgress = { version: 1, generation: 0, unlocked: [], seen: [] }
const generation = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const floors = (list: unknown): list is MetaFloor[] => Array.isArray(list) && new Set(list).size === list.length && list.every(isMetaFloor)

export function isRunMeta(value: unknown): value is RunMeta {
  if (!value || typeof value !== 'object') return false
  const meta = value as Partial<RunMeta>
  return generation(meta.generation) && floors(meta.pool) && floors(meta.opened)
}

export function loadMetaProgress(storage?: Pick<Storage, 'getItem'>): MetaProgress {
  try {
    const value = JSON.parse((storage ?? globalThis.localStorage).getItem(META_SAVE_KEY) ?? 'null') as Partial<MetaProgress> | null
    if (value?.version === 1 && generation(value.generation) && floors(value.unlocked) && Array.isArray(value.seen) &&
      new Set(value.seen).size === value.seen.length && value.seen.every((id) => isMetaPerk(id) && value.unlocked!.includes(metaFloorForCard(id)!))) {
      return value as MetaProgress
    }
  } catch {
    // A missing or unreadable record starts with an empty catalog.
  }
  return empty
}

export function writeMetaProgress(progress: MetaProgress, storage?: Pick<Storage, 'setItem'>) {
  try { (storage ?? globalThis.localStorage).setItem(META_SAVE_KEY, JSON.stringify(progress)) } catch {
    // The current run can still use its candidate snapshot.
  }
}

export function resetMetaProgress(progress: MetaProgress): MetaProgress {
  return { ...empty, generation: progress.generation + 1 }
}

export function snapshotMeta(progress: MetaProgress): RunMeta {
  return { generation: progress.generation, pool: progress.unlocked, opened: [] }
}

export function resumeMetaRun(run: Ascent, progress: MetaProgress) {
  if (run.route?.map.rules !== 7) return { run, progress }
  const meta = run.meta ?? { ...snapshotMeta(progress), pool: [] }
  if (!run.meta || meta.generation !== progress.generation) {
    return { run: { ...run, meta: { ...meta, generation: progress.generation, opened: [] } }, progress }
  }
  const unlocked = ALL_META_FLOORS.filter((floor) => progress.unlocked.includes(floor) || meta.opened.includes(floor))
  return { run, progress: unlocked.length === progress.unlocked.length ? progress : { ...progress, unlocked } }
}

export function openMetaStage(run: Ascent, progress: MetaProgress, floor: number, completed = false) {
  const resumed = resumeMetaRun(run, progress)
  const meta = resumed.run.meta
  if (!meta || !isMetaFloor(floor) || (floor === 12) !== completed || resumed.progress.unlocked.includes(floor)) return resumed
  const route = run.route
  if (completed ? route?.screen !== 'finished' || route.completed.length !== 12 || run.battle.phase !== 'won'
    : route?.node == null || route.map.byId[route.node]?.floor !== floor) return resumed
  const unlocked = ALL_META_FLOORS.filter((stage) => stage === floor || resumed.progress.unlocked.includes(stage))
  const opened = [...meta.opened, floor]
  return { run: { ...resumed.run, meta: { ...meta, opened } }, progress: { ...resumed.progress, unlocked } }
}

export function markMetaOffers(progress: MetaProgress, offers: readonly string[]) {
  const fresh = offers.filter((id): id is MetaPerk => isMetaPerk(id) && !progress.seen.includes(id) && progress.unlocked.includes(metaFloorForCard(id)!))
  return { fresh, progress: fresh.length ? { ...progress, seen: [...progress.seen, ...fresh] } : progress }
}
