import { availableMapNodes, beginMapAscent, enterMapNode, resolveAscentTurn, returnToMap, rewardOffers, takeAscentReward } from '../src/ascent.ts'
import { generateAscentMap } from '../src/ascent-map.ts'
import { loadAscentSave, writeAscentSave } from '../src/ascent-save.ts'

export function nodeFor(enemyId, floor, rules = 6) {
  for (let seed = 0; seed < 1024; seed++) {
    const node = generateAscentMap(seed, rules).nodes.find((entry) => entry.enemyId === enemyId && (!floor || entry.floor === floor))
    if (node) return { seed, node }
  }
  throw new Error(`적 방을 찾지 못했습니다: ${enemyId}`)
}

export function playWith(run, dice, slots, extra = {}) {
  return resolveAscentTurn({ ...run, battle: { ...run.battle, dice, slots, ...extra } })
}

export function finishRoom(run, relic = 'revived-heart') {
  if (run.route.screen === 'battle') {
    const dice = run.battle.dice.map(() => 6)
    run = playWith(run, dice, dice.map(() => 'attack'), { enemyHp: 1 })
  }
  const node = run.route.map.byId[run.route.node]
  const choice = node.enemyId === 'chain-warden' ? relic : run.route.map.rules >= 6 && node.kind === 'elite' ? rewardOffers(run)[0] ?? 'skip' : 'skip'
  return takeAscentReward(run, choice, choice === 'incomplete' ? { hand: 'straight' } : {})
}

export function mapBefore(seed, floor, rules = 6, relic, fifthLane) {
  let run = beginMapAscent(seed, undefined, 'odd', rules)
  while (run.route.completed.length < floor - 1) {
    const choices = availableMapNodes(run)
    const node = choices[0].floor === 5 && fifthLane !== undefined ? choices[fifthLane]
      : choices.find(({ kind }) => kind !== 'elite') ?? choices[0]
    run = returnToMap(finishRoom(enterMapNode(run, node.id), relic))
  }
  return run
}

export function encounter(enemyId, floor, rules = 6) {
  const { seed, node } = nodeFor(enemyId, floor, rules)
  return enterMapNode(mapBefore(seed, node.floor, rules), node.id)
}

export function eliteWithThreeArtifacts() {
  for (let seed = 0; seed < 64; seed++) {
    let run = beginMapAscent(seed, undefined, 'odd', 7)
    while (run.route.completed.length < 10) {
      const nodes = availableMapNodes(run)
      const node = nodes.find(({ kind }) => kind === 'elite') ?? nodes.find(({ kind }) => kind === 'fight') ?? nodes[0]
      run = enterMapNode(run, node.id)
      if (node.kind === 'elite' && run.battle.loot.equipped.length === 3) return run
      run = returnToMap(finishRoom(run))
    }
  }
  throw new Error('유물 세 개 장착 뒤의 강적 전투를 찾지 못했습니다.')
}

export function checkpoint(run, rewardPreview, selected = []) {
  let json
  const storage = { setItem: (_key, value) => { json = value }, getItem: () => json ?? null, removeItem: () => { json = undefined } }
  writeAscentSave({ ascent: run, selected, rewardPreview }, storage)
  return { json, restored: loadAscentSave(storage) }
}
