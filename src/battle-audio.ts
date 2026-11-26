const wheelEffects = ['roulette-engage', 'roulette-ratchet', 'roulette-latch'] as const
const effects = [
  'dice-roll', 'dice-place', 'stone-hit', 'perfect-block', 'roulette-tick',
  'roulette-stop', 'unlock', 'victory', 'defeat', ...wheelEffects,
] as const

type Effect = (typeof effects)[number]
type Track = Effect | 'chamber-loop'
const waveFiles = new Set<Track>(wheelEffects)

export class BattleAudio {
  private context?: AudioContext
  private musicGain?: GainNode
  private effectsGain?: GainNode
  private readonly tracks = new Map<Track, Promise<AudioBuffer>>()
  private musicPending = false
  private revision = 0
  private music = true
  private effects = true
  private needsResume = false

  activate() {
    if (!this.music && !this.effects) return
    try {
      if (!this.context) {
        this.context = new AudioContext()
        this.musicGain = this.context.createGain()
        this.effectsGain = this.context.createGain()
        this.musicGain.connect(this.context.destination)
        this.effectsGain.connect(this.context.destination)
        this.updateGains()
      }
      if (this.needsResume || this.context.state !== 'running') {
        this.needsResume = false
        void this.context.resume().catch(() => { this.needsResume = true })
      }
      if (this.effects) for (const effect of effects) void this.load(effect).catch(() => {})
      if (this.music && !this.musicPending) {
        this.musicPending = true
        void this.load('chamber-loop').then((buffer) => {
          this.start(buffer, 0.055, true)
        }).catch(() => { this.musicPending = false })
      }
    } catch {
      // Combat remains playable when Web Audio is unavailable.
    }
  }

  setEnabled(music: boolean, effects: boolean) {
    if (effects !== this.effects) this.revision++
    this.music = music
    this.effects = effects
    this.updateGains()
  }

  suspend() {
    if (!this.context) return
    this.needsResume = true
    this.revision++
    void this.context.suspend().catch(() => {})
  }

  resumeOnGesture() {
    if (this.context && (this.needsResume || this.context.state !== 'running')) this.activate()
  }

  private updateGains() {
    if (this.musicGain) this.musicGain.gain.value = Number(this.music)
    if (this.effectsGain) this.effectsGain.gain.value = Number(this.effects)
  }

  play(effect: Effect, pitch = 1, volume = effect === 'roulette-tick' ? .12 : .19) {
    if (!this.context || !this.effects || this.needsResume) return
    const revision = this.revision
    void this.load(effect).then((buffer) => {
      if (revision === this.revision) this.start(buffer, volume, false, pitch)
    }).catch(() => {})
  }

  private load(track: Track) {
    let pending = this.tracks.get(track)
    if (!pending) {
      const extension = waveFiles.has(track) ? 'wav' : 'mp3'
      pending = fetch(new URL(`sfx/${track}.${extension}`, document.baseURI)).then((response) => {
        if (!response.ok) throw new Error(`Audio unavailable: ${track}`)
        return response.arrayBuffer()
      }).then((bytes) => this.context!.decodeAudioData(bytes)).catch((error: unknown) => {
        this.tracks.delete(track)
        throw error
      })
      this.tracks.set(track, pending)
    }
    return pending
  }

  private start(buffer: AudioBuffer, volume: number, loop = false, pitch = 1) {
    const context = this.context!
    const source = context.createBufferSource()
    const gain = context.createGain()
    gain.gain.value = volume
    source.buffer = buffer
    source.loop = loop
    source.playbackRate.value = pitch
    source.connect(gain).connect((loop ? this.musicGain : this.effectsGain)!)
    source.addEventListener('ended', () => {
      source.disconnect()
      gain.disconnect()
    }, { once: true })
    source.start()
  }
}
