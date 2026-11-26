export const META_VALUES = { scabbardCap: 6, bloodCap: 4 } as const

export const META_PERKS = {
  'reverse-guard': { name: '뒷면 막기', icon: 'meta-reverse-guard', value: '7−눈 · 1회', description: '전투당 한 번, 고른 방어 주사위를 방어 합에서만 반대편 눈(7−눈)으로 셉니다.' },
  'join-slots': { name: '칸 잇기', icon: 'meta-join-slots', value: '2·3·4', description: '공격과 방어에 나뉘어 놓인 3연속으로도 재굴림 주사위를 해금합니다.' },
  'charge-roll': { name: '돌격 굴림', icon: 'meta-charge-roll', value: '1개 → 4·5·6', description: '기본 재굴림으로 하나만 굴리면 4~6이 나오고 그 주사위는 이번 턴 공격에만 놓습니다.' },
  'counter-recover': { name: '재정비', icon: 'meta-counter-recover', value: '0 → 재굴림 +1', description: '룰렛 피해를 포기하면 이미 사용한 해금 재굴림 1회를 되찾습니다.' },
  'early-reroll': { name: '선행 재굴림', icon: 'meta-early-reroll', value: '해금 → 기본', description: '해금 재굴림을 기본 재굴림보다 먼저 쓸 수 있습니다.' },
} as const

export const META_ARTIFACTS = {
  scabbard: { name: '예비 칼집', icon: 'meta-scabbard', value: `→ +0~${META_VALUES.scabbardCap}`, description: `적을 쓰러뜨린 공격의 초과 피해를 최대 ${META_VALUES.scabbardCap} 저장해 다음 전투 첫 공격에 보탭니다.` },
  'adjacent-needle': { name: '옆칸 바늘', icon: 'meta-adjacent-needle', value: '→1칸 · 1회', description: '전투당 한 번, 룰렛 결과를 시계 방향 바로 옆 칸으로 옮깁니다.' },
  'pip-ring': { name: '옮김 고리', icon: 'meta-pip-ring', value: '−1 → +1', description: '전투당 한 번, 일반 주사위 하나의 눈을 1 내리고 다른 하나의 눈을 1 올립니다.' },
  'blood-grip': { name: '핏빛 손잡이', icon: 'meta-blood-grip', value: `회복 ≤${META_VALUES.bloodCap}`, description: `전투당 한 번, 공격 주사위 하나를 소모해 턴 끝에 그 눈만큼 회복합니다(최대 ${META_VALUES.bloodCap}).` },
  'linked-cup': { name: '연속 주사위통', icon: 'meta-linked-cup', value: '2개 · 연속 · 1회', description: '전투당 한 번, 고른 일반 주사위 둘을 연속하는 눈으로 기본 재굴림합니다.' },
} as const

export type MetaPerk = keyof typeof META_PERKS
export type MetaArtifact = keyof typeof META_ARTIFACTS
export const META_STAGES = [
  { floor: 3, perk: 'reverse-guard', artifact: 'scabbard' },
  { floor: 5, perk: 'join-slots', artifact: 'adjacent-needle' },
  { floor: 7, perk: 'charge-roll', artifact: 'pip-ring' },
  { floor: 9, perk: 'counter-recover', artifact: 'blood-grip' },
  { floor: 12, perk: 'early-reroll', artifact: 'linked-cup' },
] as const satisfies readonly { floor: number; perk: MetaPerk; artifact: MetaArtifact }[]

export type MetaFloor = (typeof META_STAGES)[number]['floor']

export function isMetaPerk(value: unknown): value is MetaPerk {
  return typeof value === 'string' && Object.hasOwn(META_PERKS, value)
}

export function isMetaArtifact(value: unknown): value is MetaArtifact {
  return typeof value === 'string' && Object.hasOwn(META_ARTIFACTS, value)
}

export function isMetaFloor(value: unknown): value is MetaFloor {
  return META_STAGES.some(({ floor }) => floor === value)
}

export function metaFloorForCard(value: unknown) {
  return META_STAGES.find(({ perk, artifact }) => perk === value || artifact === value)?.floor
}
