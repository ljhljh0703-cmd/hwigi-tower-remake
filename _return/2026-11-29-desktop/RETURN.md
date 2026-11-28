# 데스크톱 전투 화면 재검토

`codex/feedback-1128`에서 이전 결과 `e79cfc8`과 데스크톱 변경 `cca2fbb`을 같은 입력으로 비교했다. 1050×680 이상에서 전장과 오른쪽 패널을 같은 높이로 채우고, 화면 하단 여백은 16px로 맞췄다.

| 실제 뷰포트 | 전장·오른쪽 패널 높이 | 주사위 한 변 | 턴 끝내기·멈추기 높이 | 룰렛 지름 | 전투·해금·유물·보상 폭 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1440×900 | 796px | 76.3px | 76.5px | 403.2px | 1376px |
| 1920×1080 | 976px | 96px | 84px | 480px | 1728px |

오른쪽에서 유물과 소모품을 윗줄에 나눠 표시하고, 공격·방어 칸 아래에 턴 끝내기 버튼을 패널 폭으로 배치했다. 정확 방어 후에는 같은 패널에서 룰렛이 회전하고, 한 번 누르면 멈춘다. 해금 창은 그림과 설명·확인 버튼을 좌우에 배치했다. 강적 유물과 보상 화면은 카드와 상세 설명을 전투와 같은 폭에 펼친다.

## 전후 사진

| 화면 | 1440×900 | 1920×1080 |
| --- | --- | --- |
| 전투 배치 중 | [전](photos/1440x900-planning-before.png) · [후](photos/1440x900-planning-after.png) | [전](photos/1920x1080-planning-before.png) · [후](photos/1920x1080-planning-after.png) |
| 룰렛 | [전](photos/1440x900-roulette-before.png) · [후](photos/1440x900-roulette-after.png) | [전](photos/1920x1080-roulette-before.png) · [후](photos/1920x1080-roulette-after.png) |
| 해금 확인 | [전](photos/1440x900-unlock-before.png) · [후](photos/1440x900-unlock-after.png) | [전](photos/1920x1080-unlock-before.png) · [후](photos/1920x1080-unlock-after.png) |
| 강적 유물 선택 | [전](photos/1440x900-elite-relics-before.png) · [후](photos/1440x900-elite-relics-after.png) | [전](photos/1920x1080-elite-relics-before.png) · [후](photos/1920x1080-elite-relics-after.png) |
| 보상 | [전](photos/1440x900-reward-before.png) · [후](photos/1440x900-reward-after.png) | [전](photos/1920x1080-reward-before.png) · [후](photos/1920x1080-reward-after.png) |

## 검증

- 두 데스크톱 크기에서 실제 클릭으로 주사위를 배치하고, 룰렛의 회전과 한 번의 정지를 확인했다. 해금 확인을 닫고 강적 유물 교체 비교와 일반 보상 설명을 띄웠다. 전장과 조작부의 높이, 버튼의 화면 내 위치를 측정했다. [변경 전 측정](layout-before.json) · [변경 후 측정](layout-after.json)
- 320×568과 390×844에서 같은 다섯 장면의 PNG를 전후 비교했다. 10쌍이 바이트 단위로 일치했다.
- 데스크톱 기준 하한인 1050×680에서도 주사위와 조작 버튼이 패널 안에 들어왔다. 룰렛을 열어 둔 상태에서 1440×900 → 390×844 → 1920×1080으로 바꾼 뒤, 오른쪽 패널에서 멈추고 피해를 적용해 다음 턴으로 진입했다. 반격에 쓰는 아이템 선택 줄은 결과와 겹치지 않았다.
- Windows 빌드와 단위 테스트 197건을 통과했다.
- Linux에서 빌드, 단위 테스트 197건, 전체 스모크 192건이 통과했다. Noto Sans CJK KR Regular를 확인했으며 사진과 동일한 빌드의 CSS와 JS는 `index-DsTldJNp.css`와 `index-Dmneneo8.js`다. [Linux 검증 기록](https://github.com/ljhljh0703-cmd/hwigi-tower-remake/actions/runs/46161167274/job/141028576749)
