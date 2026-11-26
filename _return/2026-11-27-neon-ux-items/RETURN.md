# 네온 검토 아이템 화면 7건

수정 전 기준은 영구 해금 구현 직후의 `8a66756`이다. 두 모바일 크기에서 같은 등반 상태를 복원하고 게임 버튼으로 각 화면에 들어갔다. 발동 순간을 비교하기 위해 전진 매듭의 대기 상태도 별도로 촬영했다.

| 화면 | 반영 | 320×568 전 | 320×568 후 | 390×844 전 | 390×844 후 |
|---|---|---|---|---|---|
| 하단 아이템 사용 | 보유 칩을 전장 위 독립 행에 배치해 쇠사슬 집행관 이름을 가리지 않게 했다. 빚진 모래시계 사용 바에 체력 −2와 지정할 주사위 눈 1~6을 표시한다. | [전](320x568-lower-item-use-before.png) | [후](320x568-lower-item-use-after.png) | [전](390x844-lower-item-use-before.png) | [후](390x844-lower-item-use-after.png) |
| 상점 | 보스 유물 기호와 숫자를 한 칸 안에 세로로 배치했다. 선택과 저장 재진입 때 구매 버튼이 해당 품목의 동전 값을 표시한다. | [전](320x568-shop-before.png) | [후](320x568-shop-after.png) | [전](390x844-shop-before.png) | [후](390x844-shop-after.png) |
| 소모품 사용 | 동전 수와 층수 사이에 구분선을 넣었다. 현재 배치로 효과를 받을 때 전진 매듭의 공격 +6 옆에 체크와 발동 표시가 빛난다. | [전](320x568-consumable-before.png) | [후](320x568-consumable-after.png) | [전](390x844-consumable-before.png) | [후](390x844-consumable-after.png) |
| 전투 보상 | 전진 매듭, 간격자, 예비 눈금의 일회용 띠에 등급을 함께 표시한다. 요약에는 공격·방어·재굴림 대상 기호를 붙였다. 유물 띠는 아래 강적·상점 사진에서 확인할 수 있다. | [전](320x568-battle-reward-before.png) | [후](320x568-battle-reward-after.png) | [전](390x844-battle-reward-before.png) | [후](390x844-battle-reward-after.png) |
| 강적 유물 유지 | 장착한 유물 세 장을 아이콘과 이름이 붙은 작은 카드로 나란히 보여 준다. 지금 유물 유지로 기존 조합과 동전 +2를 받는 흐름을 확인했다. | [전](320x568-elite-keep-three-before.png) | [후](320x568-elite-keep-three-after.png) | [전](390x844-elite-keep-three-before.png) | [후](390x844-elite-keep-three-after.png) |
| 강적 유물 선택 | 제목 아래 유물 보유 칸을 표시한다. 눈금 걸쇠에는 다음 턴과 주사위 1개를 표시하고 교대의 뿔에는 합공 피해를 표시한다. | [전](320x568-elite-relic-before.png) | [후](320x568-elite-relic-after.png) | [전](390x844-elite-relic-before.png) | [후](390x844-elite-relic-after.png) |
| 보스 유물 선택 | 네 카드의 이득을 밝은 윗줄, 대가를 붉은 아랫줄로 배치했다. 카드 높이를 키우고 아래 여백을 줄였다. | [전](320x568-boss-relics-before.png) | [후](320x568-boss-relics-after.png) | [전](390x844-boss-relics-before.png) | [후](390x844-boss-relics-after.png) |

전진 매듭 대기 사진에는 아직 공격 주사위를 놓지 않았다. 공격 칸에 주사위를 놓고 방어 칸을 비우면 위 표의 발동 사진처럼 바뀐다.

| 320×568 전 | 320×568 후 | 390×844 전 | 390×844 후 |
|---|---|---|---|
| [전](320x568-consumable-ready-before.png) | [후](320x568-consumable-ready-after.png) | [전](390x844-consumable-ready-before.png) | [후](390x844-consumable-ready-after.png) |

## 검증

- `npm run build` 통과. 아이템 조건·수치·가격·저장 규칙은 기존 구현을 따른다.
- `npm test` 174개 통과.
- `npm run smoke -- --workers 2` Edge 모바일 58개 통과. 모래시계와 예비 눈금의 하단 선택, 소모품 목록 넘침, 두 줄 효과 요약, 상점 재진입과 동전 차감, 세 칸을 유지한 뒤 이어 하기까지 확인했다.
- PNG 32장의 해상도와 링크를 검사했다. 기본 전후 28장에 전진 매듭 대기 전후 4장을 더했다.
