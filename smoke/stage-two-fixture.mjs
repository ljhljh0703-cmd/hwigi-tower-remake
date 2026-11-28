import { availableMapNodes, beginMapAscent, chooseUpperAscent, enterMapNode, resolveAscentTurn, returnToMap, rewardOffers, takeAscentReward } from '../src/ascent.ts'
import { ASCENT_SAVE_KEY, writeAscentSave } from '../src/ascent-save.ts'
import { livingEnemies } from '../src/upper-combat.ts'

export function withFormation(run, health) {
  const formation = run.battle.formation
  const enemies = formation.enemies.map((enemy, index) => ({ ...enemy, hp: health[index] ?? enemy.hp }))
  return { ...run, battle: { ...run.battle, enemyHp: enemies.reduce((sum, enemy) => sum + enemy.hp, 0),
    formation: { ...formation, enemies } } }
}

export function withDice(run, dice, slots = dice.map(() => null)) {
  return { ...run, battle: { ...run.battle, dice, slots } }
}

export function atFloor(floor, kind, upper = true, seed = 12) {
  let run = beginMapAscent(seed, undefined, 'odd', 7, { generation: 0, pool: [], opened: [] }, upper)
  while (availableMapNodes(run)[0]?.floor < floor) {
    const nodes = availableMapNodes(run)
    const node = nodes.find(candidate => candidate.kind === 'shop') ?? nodes[0]
    run = enterMapNode(run, node.id)
    if (run.route.screen === 'battle') {
      if (run.battle.formation) run = withFormation(run, livingEnemies(run.battle.formation).map(() => 1))
      else run = { ...run, battle: { ...run.battle, enemyHp: 1 } }
      run = resolveAscentTurn(withDice(run, [6, 5, 3], ['attack', 'attack', 'attack']))
    }
    if (run.route.screen === 'upper-choice') run = chooseUpperAscent(run, true)
    if (run.route.screen !== 'map') {
      const choice = node.enemyId === 'chain-warden' ? 'emperor-shield' : node.kind === 'elite' ? rewardOffers(run)[0] : 'skip'
      run = returnToMap(takeAscentReward(run, choice))
    }
  }
  const nodes = availableMapNodes(run)
  const node = nodes.find(candidate => candidate.kind === kind) ?? nodes[0]
  return enterMapNode(run, node.id)
}

export function checkpointFor(ascent) {
  const values = new Map()
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  }
  writeAscentSave({ ascent, selected: [] }, storage)
  return { storage, json: storage.getItem(ASCENT_SAVE_KEY) }
}
