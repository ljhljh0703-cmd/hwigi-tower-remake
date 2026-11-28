import { START_PERK_CARDS } from './perks.ts'
import type { StartPerk } from './perks.ts'
import { REWARD_CARDS } from './rewards.ts'
import type { Reward } from './rewards.ts'

const rewardNames: Partial<Record<Reward, string>> = {
  buckle: '수호의 혁대', coin: '점술사의 은화', tuning: '장인의 끌',
  'twin-mold': '쌍둥이 거푸집', 'advance-knot': '결사의 매듭',
  'reserve-gauge': '갈림길의 부적', 'clash-seal': '쌍검의 문장',
  kit: '약초 꾸러미', lining: '낡은 누비옷', mirror: '되비치는 거울', overflow: '응보의 방패',
  'heart-die': '갈라진 심장', banner: '선봉의 깃발', horn: '전우의 뿔피리',
  'die-latch': '기억의 걸쇠', scabbard: '굶주린 검집', 'adjacent-needle': '어긋난 바늘',
  'pip-ring': '맞물린 반지', 'blood-grip': '핏빛 칼자루', 'linked-cup': '도박사의 뿔잔',
  'brake-crown': '짓누르는 왕관', 'healing-scepter': '속죄의 왕홀',
}

const perkNames: Partial<Record<StartPerk, string>> = {
  shield: '방패의 기세', blade: '묵직한 대검', collector: '탑의 서기관', reroll: '악마의 주사위',
  oath: '두 갈래 서약', counter: '보복의 낙인', 'reverse-guard': '뒤집힌 방패',
  'join-slots': '하나 된 태세', 'charge-roll': '무모한 돌격',
  'counter-recover': '두 번째 숨결', 'early-reroll': '첫수의 행운',
}

export function rewardDisplayName(id: Reward, seven?: boolean) {
  return (seven && rewardNames[id]) || REWARD_CARDS[id].name
}

export function perkDisplayName(id: StartPerk, seven?: boolean) {
  return (seven && perkNames[id]) || START_PERK_CARDS[id].name
}
