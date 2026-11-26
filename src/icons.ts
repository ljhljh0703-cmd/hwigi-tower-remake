export function icon(name: string) {
  return `<svg class="icon" aria-hidden="true"><use href="#icon-${name}"/></svg>`
}

export function pixelIcon(name: string) {
  const source = new URL(`art/ui/icons/icon-${name}.png`, document.baseURI).href
  return `<img class="pixel-icon" src="${source}" alt="" width="24" height="24">`
}
import { NEW_TREASURES } from './treasure.ts'


export function itemIcon(name: string) {
  return NEW_TREASURES.some((id) => name === `treasure-${id}`) ? pixelIcon(name) : icon(name)
}
