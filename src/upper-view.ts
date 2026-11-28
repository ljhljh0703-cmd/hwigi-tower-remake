import { upperLane } from './arena.ts'
import type { Arena } from './arena.ts'
import type { BattleAudio } from './battle-audio.ts'
import { UPPER_ENEMIES } from './enemy-codex.ts'
import { icon } from './icons.ts'
import { formationActions, livingEnemies, upperHeavyDamage } from './upper-combat.ts'
import type { Formation, FormationDamage, UpperRole } from './upper-combat.ts'
import { forecastYacht, hasAutomaticEgo } from './yacht-combat.ts'
import type { YachtBattle } from './yacht-combat.ts'

export class UpperView {
  private readonly readout = document.createElement('div')

  constructor(private readonly arena: Arena, private readonly field: HTMLElement, private readonly sound: BattleAudio,
    private readonly wait: (ms: number) => Promise<void>, private readonly reduced: () => boolean) {
    this.readout.className = 'upper-readout'
    this.field.append(this.readout)
  }

  render(battle: YachtBattle) {
    this.field.classList.toggle('upper-field', Boolean(battle.formation))
    this.readout.hidden = !battle.formation
    if (battle.formation) this.show(battle, battle.formation, true)
  }

  private show(battle: YachtBattle, formation: Formation, preview = false, damage?: FormationDamage, layout = formation) {
    const alive = livingEnemies(layout)
    const facing = formationActions(formation)
    const forecast = preview && battle.phase === 'assign' ? forecastYacht(battle) : undefined
    const direct = forecast?.upper?.exchange.direct
    const missed = new Set(direct?.filter(contact => contact.hp === 0).map(contact => contact.id))
    const visibleActions = forecast?.upper?.exchange.actions ?? facing.actions
    const target = formation.counterOrder?.[0]
    const weakened = forecast?.chargeBroken
    const guardLabel = target ? `${icon('parry')} 정확 방어` :
      `${icon('shield')} 방어 목표 <b>${forecast?.incoming.totalDamage ?? facing.totalDamage}</b>${preview && battle.phase === 'assign' && hasAutomaticEgo(battle) ? `<span title="에고 배치 전">${icon('companion-awake')}</span>` : ''}`
    const helpers = visibleActions.filter(action => 'from' in action)
    this.readout.innerHTML = `<div class="upper-goal">${guardLabel}</div>
      ${alive.map(({ id }, lane) => {
        const enemy = formation.enemies.find(entry => entry.id === id)!
        const name = UPPER_ENEMIES[id]
        const position = lane ? '뒤' : '앞'
        const hits = (enemy.hp && !missed.has(id) ? visibleActions : facing.actions).flatMap(action => 'hit' in action && action.hit.id === id ? [action.hit] : [])
        const aiding = helpers.find(action => action.from === id)
        const aided = helpers.find(action => action.to === id)
        const predicted = direct?.find(contact => contact.id === id)
        const stance = enemy.toppled ? '넘어짐 ×2' : enemy.action.pose === 'prepare' ? `준비 ${upperHeavyDamage(formation, Boolean(weakened))}`
          : enemy.action.pose === 'cancelled' ? '중단' : enemy.action.pose === 'rest' ? '자세 회복' : '대기'
        const opponent = aiding && alive.findIndex(entry => entry.id === aiding.to)
        return `<div class="upper-card" data-role="${id}" data-lane="${lane}" style="--lane-x:${upperLane[lane] * 100}%" ${target === id ? 'data-counter-target' : ''}>
          <strong class="upper-position" aria-label="${position} ${name.name}, ${name.role}"><span role="img" aria-label="${position}">${icon(lane ? 'formation-rear' : 'formation-front')}</span>${name.name}</strong>
          <span class="upper-hp" aria-label="체력 ${enemy.hp}/${enemy.maxHp}">${icon('heart')}${enemy.hp}<small>/${enemy.maxHp}</small></span>
          <span class="upper-intent" ${missed.has(id) ? 'data-cancelled' : ''}>${hits.length ? hits.map(action =>
            `<b>${action.amount}${action.boosted ? '<i aria-label="지원 적용">↑</i>' : ''}</b>`).join('') :
            aiding ? `<span title="${opponent === 0 ? '전위' : '후위'}의 다음 첫 피해 +2">지원 ↖</span>`
              : `<span>${stance}</span>`}${aided ? '<small title="지원 대상">↑</small>' : ''}</span>
          ${predicted ? `<span class="upper-preview" aria-label="${predicted.pierce ? '관통 ' : ''}예상 피해 ${predicted.amount}">${predicted.pierce ? '↪' : '−'}${predicted.amount}</span>` : ''}
          ${damage?.id === id ? `<output class="upper-damage">−${damage.amount}</output>` : ''}
        </div>`
      }).join('')}`
  }

  async retreat(battle: YachtBattle) {
    const formation = battle.formation
    if (!formation?.movedBack) return
    const from = { ...formation, enemies: [...formation.enemies].reverse() }
    this.show(battle, formation, false, undefined, from)
    this.arena.setUpperScene(formation, { id: formation.movedBack, kind: 'advance', from })
    await this.wait(this.reduced() ? 54 : 220)
    this.sound.play('step', .9)
    this.arena.setUpperScene(formation)
    this.show(battle, formation, true)
  }

  async play(before: YachtBattle, after: YachtBattle, counter: boolean, playerContact: (damage: number, hp: number) => void, joint = false) {
    const exchange = after.formationExchange
    if (!before.formation || !exchange) return
    let formation = before.formation
    let hp = before.playerHp
    const pause = (ms: number) => this.wait(this.reduced() ? Math.min(ms, 84) : ms)
    const playDamage = async (contacts: readonly FormationDamage[], swing: boolean) => {
      for (const [index, contact] of contacts.entries()) {
        if (index === 0 && swing) {
          this.arena.setUpperScene(formation, { id: contact.id, kind: 'swing' })
          if (!this.reduced()) this.sound.play('swish', counter ? 1.12 : .95)
          await pause(111)
        }
        const from = formation
        formation = { ...formation, enemies: formation.enemies.map(enemy => enemy.id === contact.id ? { ...enemy, hp: contact.hp } : enemy) }
        this.arena.setUpperScene(formation, { id: contact.id, kind: 'hit', amount: contact.amount, defeated: contact.hp === 0, from, blade: swing && index === 0 })
        this.show(before, formation, false, contact, from)
        this.sound.play('stone-hit', contact.amount >= 5 ? .82 : 1.15, .25)
        await pause(contact.hp === 0 ? 147 : 176)
        if (contact.advance) {
          this.readout.dataset.advance = contact.advance
          this.arena.setUpperScene(formation, { id: contact.advance, kind: 'advance', from })
          await pause(220)
          this.sound.play('step', .9)
          delete this.readout.dataset.advance
        }
        this.arena.setUpperScene(formation)
        this.show(before, formation)
      }
    }
    if (counter) {
      await playDamage(exchange.counter ?? [], !joint)
      return
    }
    await playDamage(exchange.direct, true)
    let index = 0
    let attacker: UpperRole | undefined
    for (const action of exchange.actions) {
      if ('from' in action) {
        this.arena.setUpperScene(formation, { id: action.from, kind: 'support' })
        const source = this.readout.querySelector<HTMLElement>(`[data-role="${action.from}"]`)
        const target = this.readout.querySelector<HTMLElement>(`[data-role="${action.to}"]`)
        if (source && target) {
          const link = document.createElement('span')
          link.className = 'upper-support-link'
          link.style.left = `${Math.min(source.offsetLeft, target.offsetLeft)}px`
          link.style.width = `${Math.abs(source.offsetLeft - target.offsetLeft)}px`
          this.readout.append(link)
        }
        await pause(161)
        this.show(before, formation)
        continue
      }
      const { id, boosted } = action.hit
      const damage = after.lastExchange!.hitsTaken[index++]
      const enemy = formation.enemies.find(entry => entry.id === id)
      const heavy = id === 'gatekeeper' && before.formation!.bossStep === 'strike'
      const weakened = enemy?.action.pose === 'weakened'
      const motion = { id, heavy, weakened, repeat: attacker === id }
      this.arena.setUpperScene(formation, { ...motion, kind: 'attack' })
      await pause(120)
      this.arena.setUpperScene(formation, { ...motion, kind: damage ? 'recoil' : 'block' })
      hp = Math.max(0, hp - damage)
      playerContact(damage, hp)
      this.sound.play(damage ? heavy ? 'slam' : 'stone-hit' : 'block', boosted ? 1.17 : 1, .24)
      attacker = id
      await pause(168)
    }
    await playDamage(exchange.delayed, false)
    if (hp !== after.playerHp) playerContact(0, after.playerHp)
    if (after.phase === 'counter') this.sound.play('perfect-block')
  }
}
