import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const [lever, ...args] = process.argv.slice(2)
const attackGrowth = /^attack-([1-9])(?:-cap-([1-9]))?$/.exec(lever)
if (!['faces-1-4', 'sleep-two'].includes(lever) && !attackGrowth) {
  throw new Error('Usage: node scripts/ego-balance-levers.mjs <faces-1-4|sleep-two|attack-2[-cap-3]> [rules-six-bot args]')
}
if (args[4] !== '7') throw new Error('These levers are for rules 7 only.')

const tempRoot = realpathSync(tmpdir())
const workspace = mkdtempSync(join(tempRoot, 'hwigi-ego-balance-'))
function replace(file, before, after) {
  const path = join(workspace, file)
  const source = readFileSync(path, 'utf8')
  if (source.split(before).length !== 2) throw new Error(`Expected one match in ${file}: ${before}`)
  writeFileSync(path, source.replace(before, after))
}

try {
  // Apply one profile in an isolated copy used only by the balance bot.
  for (const dir of ['src', 'exp', 'scripts']) cpSync(join(root, dir), join(workspace, dir), { recursive: true })
  writeFileSync(join(workspace, 'package.json'), '{"type":"module"}\n')
  const combat = 'src/yacht-combat.ts'
  switch (lever) {
    case 'faces-1-4':
      replace(combat, "return parity ? dieFaces.filter(face => face % 2 === Number(parity === 'odd')) : dieFaces",
        "return dieFaces.filter(face => face <= 4 && (!parity || face % 2 === Number(parity === 'odd')))")
      replace(combat, 'const egoFace = hasAutomaticEgo(battle) ? companionFace(battle, roll(battle.seed, battle.turn, FOURTH_DIE_CHANNEL)) : undefined',
        'const faces = egoFaces(battle)\n  const egoFace = hasAutomaticEgo(battle) ? faces[draw(battle.seed, battle.turn, FOURTH_DIE_CHANNEL) % faces.length] : undefined')
      break
    case 'sleep-two':
      replace(combat, 'const egoFace = hasAutomaticEgo(battle) ?', 'const egoFace = battle.turn > 2 && hasAutomaticEgo(battle) ?')
      replace('exp/map/item-rules-policy.mjs', 'if (!hasAutomaticEgo(plan)) return plan',
        'if (plan.turn <= 2 || !hasAutomaticEgo(plan)) return plan')
      break
    default: {
      const growth = Number(attackGrowth[1])
      const adjustment = `rules === 7 ? ${growth} : `
      replace('src/ascent-map.ts', 'const attackPerUnlock = rules <= 4', `const attackPerUnlock = ${adjustment}rules <= 4`)
      replace('src/ascent-map.ts', "if (node.enemyId === 'chain-warden') return CHAIN_WARDEN",
        `if (node.enemyId === 'chain-warden') return rules === 7 ? { ...CHAIN_WARDEN, attackPerUnlock: ${growth} } : CHAIN_WARDEN`)
      if (attackGrowth[2]) {
        replace('src/ascent.ts', 'enemy, unlocks.length * enemy.attackPerUnlock,',
          `enemy, Math.min(unlocks.length * enemy.attackPerUnlock, previousBattle.itemsSeven ? ${Number(attackGrowth[2])} : Infinity),`)
      }
    }
  }
  const result = spawnSync(process.execPath, [join(workspace, 'scripts/rules-six-bot.mjs'), ...args], { stdio: 'inherit' })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally {
  const resolved = realpathSync(workspace)
  if (dirname(resolved) !== tempRoot || !basename(resolved).startsWith('hwigi-ego-balance-')) throw new Error('Unexpected temporary path')
  rmSync(resolved, { recursive: true })
}
