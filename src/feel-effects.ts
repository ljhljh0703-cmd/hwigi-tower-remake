// Transient layers outlive a single UI render, but never own focus or game state.
export class FeelEffects {
  private timers = new Set<number>()
  private tracks = new Set<Animation>()
  private layers = new Set<HTMLElement>()

  constructor(private reduced: () => boolean, private speed: () => number) {}

  after(delay: number, action: () => void) {
    const timer = window.setTimeout(() => {
      this.timers.delete(timer)
      if (!document.hidden) action()
    }, delay)
    this.timers.add(timer)
  }

  clear() {
    for (const timer of this.timers) clearTimeout(timer)
    this.timers.clear()
    for (const animation of this.tracks) animation.cancel()
    this.tracks.clear()
    for (const layer of this.layers) layer.remove()
    this.layers.clear()
  }

  animate(target: Element, keyframes: Keyframe[], duration: number, done?: () => void) {
    const frames = this.reduced() ? [{ opacity: .75 }, { opacity: 1 }] : keyframes
    const animation = target.animate(frames, { duration: (this.reduced() ? Math.min(85, duration) : duration) / this.speed(), easing: 'ease-out' })
    this.tracks.add(animation)
    animation.finished.then(() => {
      this.tracks.delete(animation)
      done?.()
    }, () => this.tracks.delete(animation))
    return animation
  }

  layer(rect: DOMRect, name: string, content = '') {
    const node = document.createElement('span')
    node.className = 'feel-layer feel-' + name
    node.setAttribute('aria-hidden', 'true')
    Object.assign(node.style, { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px' })
    node.innerHTML = content
    document.body.append(node)
    this.layers.add(node)
    return node
  }

  release(node: HTMLElement) {
    node.remove()
    this.layers.delete(node)
  }

  pulse(node: HTMLElement, depth = 2) {
    this.animate(node, [{ transform: 'translateY(0)' }, { transform: 'translateY(' + depth + 'px) scaleY(.94)' }, { transform: 'none' }], 115)
  }
}
