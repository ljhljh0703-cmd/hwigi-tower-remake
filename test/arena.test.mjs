import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { ENEMY_SPRITES, ESCORT_SPRITE, enemyExchangePoses, enemyPlanPose, escortExchangePoses, heroExchangePoses } from '../src/arena.ts'
import { beginAscent } from '../src/ascent.ts'
import { ASCENT_ENEMIES, MAP_ENEMIES } from '../src/enemy-roster.ts'
import { resolveYachtTurn, startYachtBattle } from '../src/yacht-combat.ts'
import poolClips from '../src/pool-clips.json' with { type: 'json' }
import poolFormat from '../src/pool-format.json' with { type: 'json' }

function poses(before) {
  const { battle } = resolveYachtTurn(before)
  return heroExchangePoses(before, battle.lastExchange).map(({ pose }) => pose)
}

test('the hero swings, guards and reels in the order a mixed turn resolves', () => {
  const { battle } = beginAscent(91)
  const before = { ...battle, dice: [4, 5, 3], slots: ['guard', 'guard', 'attack'] }
  assert.deepEqual(poses(before), ['attack', 'guard'])
  assert.deepEqual(poses({ ...before, dice: [2, 5, 3] }), ['attack', 'guard', 'hit'])
  assert.deepEqual(poses({ ...before, slots: ['attack', 'attack', 'attack'] }), ['attack', 'hit'])
})

test('the hero guards only when the enemy actually attacks', () => {
  const { battle } = beginAscent(91)
  const before = { ...battle, dice: [4, 5, 3], slots: ['guard', 'guard', 'attack'] }
  assert.deepEqual(poses({ ...before, enemyHp: 3 }), ['attack'])
  const charge = { id: 'charge', name: '힘 모으기', hits: [], matches: () => true }
  assert.deepEqual(poses({ ...before, enemyIntents: [charge] }), ['attack'])
})

test('the hero recoils from thorns after a finishing blow without showing a guard', () => {
  const { battle } = beginAscent(3)
  const before = { ...battle, turn: 2, enemyHp: 3, dice: [4, 5, 3], slots: ['guard', 'guard', 'attack'] }
  assert.deepEqual(poses(before), ['attack', 'hit'])
})

test('every enemy and the summoned guard have complete native-size artwork', () => {
  const [ordinary, elite, [boss]] = ASCENT_ENEMIES
  assert.deepEqual(Object.keys(ENEMY_SPRITES).sort(), [...ASCENT_ENEMIES.flat(), ...MAP_ENEMIES].map(({ id }) => id).concat('chain-warden').sort())
  const pool = ENEMY_SPRITES.rage
  for (const [sprites, size] of [
    [[...ordinary, ...MAP_ENEMIES.filter(({ attackPerUnlock }) => !attackPerUnlock)].map(({ id }) => ENEMY_SPRITES[id]).filter(sprite => sprite !== pool), [32, 40]],
    [[...elite, ...MAP_ENEMIES.filter(({ attackPerUnlock }) => attackPerUnlock)].map(({ id }) => ENEMY_SPRITES[id]), [40, 48]],
    [[ENEMY_SPRITES[boss.id]], [48, 48]],
    [[ENEMY_SPRITES['chain-warden']], [40, 44]],
    [[ESCORT_SPRITE], [24, 28]],
  ]) {
    for (const { name, poses, footY } of sprites) {
      assert.deepEqual(Object.keys(poses).sort(), ['attack', 'charge', name === 'boss' ? 'knockdown' : 'hit', 'idle'].sort())
      for (const [pose, footX] of Object.entries(poses)) {
        const png = readFileSync(new URL(`../public/art/${name}-${pose}.png`, import.meta.url))
        assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], size, `${name}-${pose}`)
        assert.ok(footX >= 0 && footX < size[0] && footY >= 0 && footY < size[1])
      }
    }
  }
  // The rage slot is the slime pool: a wide puddle whose portrait is one native
  // 80x48 drawing and whose combat poses are cells of the rigged sheet.
  const size = (file) => {
    const png = readFileSync(new URL(`../public/art/${file}.png`, import.meta.url))
    return [png.readUInt32BE(16), png.readUInt32BE(20)]
  }
  assert.equal(pool.name, 'slime-pool')
  assert.ok(ordinary.some(({ id }) => id === 'rage'))
  const [width, height] = size('slime-pool-idle')
  assert.deepEqual([width, height], [80, 48])
  assert.ok(pool.poses.idle >= 0 && pool.poses.idle < width && pool.footY >= 0 && pool.footY < height)
  const [cellWidth, cellHeight] = poolFormat.size
  const [rigWidth, rigHeight] = size('motion/slime-pool-rig')
  assert.deepEqual(size('motion/slime-pool-layers'), [rigWidth, rigHeight * 3])
  assert.ok(poolFormat.pivot[0] < cellWidth && poolFormat.pivot[1] < cellHeight)
  for (const clip of ['idle', 'attack', 'hit', 'heavy-hit', 'death']) {
    assert.ok(poolClips[clip]?.length, clip)
    for (const [, x, y] of poolClips[clip]) {
      assert.ok(x >= 0 && y >= 0 && x + cellWidth <= rigWidth && y + cellHeight <= rigHeight, `${clip} ${x},${y}`)
    }
  }
})

test('ordinary and elite enemies ready, reel, and attack for actual exchanges', () => {
  for (const enemy of [...ASCENT_ENEMIES.slice(0, 2).flat(), ...MAP_ENEMIES]) {
    const before = { ...startYachtBattle(91, 22, false, false, undefined, enemy), dice: [3, 4, 5], slots: ['attack', 'guard', 'guard'] }
    assert.equal(enemyPlanPose(enemy.id, before), 'charge')
    assert.equal(enemyPlanPose(enemy.id, { ...before, phase: 'counter' }), 'idle')
    const { battle } = resolveYachtTurn(before)
    assert.deepEqual(enemyExchangePoses(enemy.id, before, battle.lastExchange).map(({ pose }) => pose), ['hit', 'attack'])
  }
  const elite = ASCENT_ENEMIES[1].find(({ id }) => id === 'vitality')
  const before = { ...startYachtBattle(91, 22, false, false, undefined, elite), turn: 3 }
  assert.equal(enemyPlanPose(elite.id, before), 'charge')
})

test('a summoned guard recoils and only joins the attack if it survives', () => {
  const elite = ASCENT_ENEMIES[1].find(({ id }) => id === 'escort')
  const before = {
    ...startYachtBattle(91, 22, false, false, undefined, elite),
    turn: 4, dice: [2, 4, 5], slots: ['attack', 'guard', 'guard'], escort: { hp: 5, bonus: 3 },
  }
  const resolvePoses = (battle) => escortExchangePoses(battle, resolveYachtTurn(battle).battle.lastExchange).map(({ pose }) => pose)
  assert.deepEqual(resolvePoses(before), ['hit', 'attack'])
  assert.deepEqual(resolvePoses({ ...before, dice: [5, 4, 5] }), ['hit'])
  assert.deepEqual(resolvePoses({ ...before, turn: 3 }), ['hit'])
})
