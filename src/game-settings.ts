export const GAME_SETTINGS_KEY = 'hwigi-tower.settings'

export interface GameSettings {
  readonly music: boolean
  readonly effects: boolean
  readonly vibration: boolean
  readonly speed: 'normal' | 'fast'
  readonly reducedMotion?: boolean
  readonly restoreAudio?: 'music' | 'effects' | 'both'
}

const defaults: GameSettings = { music: true, effects: true, vibration: true, speed: 'normal' }

export function loadGameSettings(storage?: Pick<Storage, 'getItem'>): GameSettings {
  try {
    const saved = JSON.parse((storage ?? globalThis.localStorage).getItem(GAME_SETTINGS_KEY) ?? 'null')
    const { music, effects, vibration, speed, reducedMotion, restoreAudio } = saved ?? {}
    return {
      music: typeof music === 'boolean' ? music : defaults.music,
      effects: typeof effects === 'boolean' ? effects : defaults.effects,
      vibration: typeof vibration === 'boolean' ? vibration : defaults.vibration,
      speed: speed === 'fast' ? speed : defaults.speed,
      ...(typeof reducedMotion === 'boolean' && { reducedMotion }),
      ...((restoreAudio === 'music' || restoreAudio === 'effects' || restoreAudio === 'both') && { restoreAudio }),
    }
  } catch {
    return defaults
  }
}

export function saveGameSettings(settings: GameSettings, storage?: Pick<Storage, 'setItem'>) {
  try {
    (storage ?? globalThis.localStorage).setItem(GAME_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Settings still apply for this session when storage is unavailable.
  }
}

export function toggleMute(settings: GameSettings): GameSettings {
  const { music, effects, restoreAudio, ...rest } = settings
  if (music || effects) {
    return { ...rest, music: false, effects: false, restoreAudio: music && effects ? 'both' : music ? 'music' : 'effects' }
  }
  return { ...rest, music: restoreAudio !== 'effects', effects: restoreAudio !== 'music' }
}
