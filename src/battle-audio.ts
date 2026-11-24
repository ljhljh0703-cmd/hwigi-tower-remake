const effects = [
  'dice-roll', 'dice-place', 'stone-hit', 'perfect-block', 'roulette-tick',
  'roulette-stop', 'unlock', 'victory', 'defeat',
] as const

type Effect = (typeof effects)[number]
type Track = Effect | 'chamber-loop'

export class BattleAudio {
  private context?: AudioContext
  private master?: GainNode
  private readonly tracks = new Map<Track, Promise<AudioBuffer>>()
  private musicPending = false
  private revision = 0
  private enabled = true

  get isEnabled() { return this.enabled }

  activate() {
    if (!this.enabled) return
    try {
      if (!this.context) {
        this.context = new AudioContext()
        this.master = this.context.createGain()
        this.master.connect(this.context.destination)
        for (const effect of effects) void this.load(effect).catch(() => {})
      }
      void this.context.resume().catch(() => {})
      if (!this.musicPending) {
        this.musicPending = true
        void this.load('chamber-loop').then((buffer) => {
          this.start(buffer, 0.055, true)
        }).catch(() => { this.musicPending = false })
      }
    } catch {
      // Combat remains playable when Web Audio is unavailable.
    }
  }

  toggle() {
    this.enabled = !this.enabled
    this.revision++
    if (this.master) this.master.gain.value = Number(this.enabled)
    if (this.enabled) this.activate()
  }

  play(effect: Effect, pitch = 1) {
    if (!this.context || !this.enabled) return
    const revision = this.revision
    void this.load(effect).then((buffer) => {
      if (revision === this.revision) this.start(buffer, effect === 'roulette-tick' ? 0.12 : 0.19, false, pitch)
    }).catch(() => {})
  }

  private load(track: Track) {
    let pending = this.tracks.get(track)
    if (!pending) {
      pending = fetch(new URL(`sfx/${track}.mp3`, document.baseURI)).then((response) => {
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
    source.connect(gain).connect(this.master!)
    source.addEventListener('ended', () => {
      source.disconnect()
      gain.disconnect()
    }, { once: true })
    source.start()
  }
}
