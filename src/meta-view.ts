import { icon, itemIcon } from './icons.ts'
import { META_ARTIFACTS, META_PERKS, META_STAGES } from './meta-unlocks.ts'
import type { MetaFloor } from './meta-unlocks.ts'
import { perkDisplayName, rewardDisplayName } from './display-names.ts'

const floorIcon = (floor: MetaFloor) => floor === 12 ? 'completion-seal' : 'map-pin'

export function metaGuideContent(unlocked: readonly MetaFloor[]) {
  return META_STAGES.map(({ floor, perk, artifact }) => {
    const open = unlocked.includes(floor)
    const prerequisite = floor === 12 ? '12층 첫 완주' : `${floor}층 첫 입장`
    return `<div class="meta-guide-stage" data-meta-floor="${floor}">
      ${[{ ...META_PERKS[perk], name: perkDisplayName(perk, true) },
        { ...META_ARTIFACTS[artifact], name: rewardDisplayName(artifact, true) }].map(({ name, icon: symbol, value, description }) =>
        `<details class="meta-guide-card" data-unlocked="${open}"><summary>${itemIcon(symbol)}<strong>${name}</strong>
          <span>${open ? icon('map-check') : icon(floorIcon(floor))}${open ? value : floor}</span>
        </summary><p>${open ? description : prerequisite}</p></details>`).join('')}
    </div>`
  }).join('')
}

export function metaRevealContent(opened: readonly MetaFloor[]) {
  return META_STAGES.filter(({ floor }) => opened.includes(floor)).map(({ floor, perk, artifact }) =>
    `<li data-meta-floor="${floor}"><span class="meta-reveal-floor" aria-label="${floor === 12 ? '완주' : `${floor}층`}">${icon(floorIcon(floor))}${floor}</span>
      <span>${itemIcon(META_PERKS[perk].icon)}${perkDisplayName(perk, true)}</span>
      <span>${itemIcon(META_ARTIFACTS[artifact].icon)}${rewardDisplayName(artifact, true)}</span>
    </li>`).join('')
}
