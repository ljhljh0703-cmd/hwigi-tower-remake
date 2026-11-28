# 11월 28일 플레이 피드백

작업 브랜치는 `codex/feedback-1128`이고 공개판 비교 기준은 `b47b4e3`다. 아래 사진은 같은 입력을 공개판과 후보 빌드에서 재생해 촬영했다.

| 항목 | 반영 | 대표 사진 |
| --- | --- | --- |
| 1. 해금 | 에고, 재굴림, 3·5·7·9·12층 영구 카드에 그림과 이름, 효과를 표시한다. 확인 전에는 진행이 멈추고 이어하기에서도 미확인 창이 돌아온다. | [에고 전](photos/01-ego-unlock-320x568-before.png) · [에고 후](photos/01-ego-unlock-320x568-after.png) · [재굴림 후](photos/01-reroll-unlock-320x568-after.png) · [영구 카드 후](photos/01-permanent-unlock-320x568-after.png) |
| 2. 시작 화면 | 전장 왼쪽 위의 ‘…그 눈이면.’과 첫 해금 설명 카드를 걷었다. 주사위와 칸에 붙는 표시를 남기고, 입력 안내는 주사위판 위로 옮겼다. 특전은 이름이 보이며, 작은 화면에서는 이름을 먼저 읽을 수 있게 했다. | [첫 턴 전](photos/02-first-turn-320x568-before.png) · [첫 턴 후](photos/02-first-turn-320x568-after.png) · [해금 신호 전](photos/02-opening-390x844-before.png) · [해금 신호 후](photos/02-opening-390x844-after.png) |
| 3. 룰렛 표시 | 동작 안내, 피해 범위, 에고 합공 설명을 걷었다. 바늘과 칸의 숫자, 멈춘 결과가 보인다. | [정확 방어 전](photos/03-wheel-320x568-before.png) · [정확 방어 후](photos/03-wheel-320x568-after.png) · [결과 전](photos/03-wheel-result-320x568-before.png) · [결과 후](photos/03-wheel-result-320x568-after.png) |
| 4. 룰렛 입력 | 정확 방어가 끝나면 회전하며, 한 번 멈추면 감속하고 딸깍 소리를 낸다. 점술사의 은화로 추가 룰렛을 열 때에도 같은 정지 동작을 쓴다. | [버튼 전](photos/04-wheel-action-390x844-before.png) · [버튼 후](photos/04-wheel-action-390x844-after.png) |
| 5. 문 입장 | 문을 한 번 누르면 층 진입 연출이 시작된다. | [입장 전](photos/05-door-320x568-before.png) · [입장 후](photos/05-door-320x568-after.png) |
| 6. 층 지도 | 갈림길의 12층 지도 미리보기를 걷었다. | [갈림길 전](photos/06-map-390x844-before.png) · [갈림길 후](photos/06-map-390x844-after.png) |
| 7. 에고 주사위 | 표준 속도 1.45초 동안 굴러 눈이 선 뒤 목적지로 간다. 방어 칸에 닿으면 합계와 목표를, 공격으로 쓰러뜨리면 격파를 표시한다. 동작 줄이기는 약 0.23초다. | [배치 전](photos/07-ego-placement-320x568-before.png) · [9/9 방어 후](photos/07-ego-placement-320x568-after.png) · [격파 표시](photos/07-ego-attack-320x568-after.png) |
| 8. PC 배치 | 1050×680부터 전장과 주사위판을 좌우로 배치하고 유물은 오른쪽 위에 둔다. 데스크톱의 하층 전투 원화를 정수 배율로 키웠다. | [1440×900 전](photos/08-desktop-1440x900-before.png) · [후](photos/08-desktop-1440x900-after.png) · [1920×1080 전](photos/08-desktop-1920x1080-before.png) · [후](photos/08-desktop-1920x1080-after.png) |
| 9. 유물 교체 | 강적 보상과 유물을 파는 상점이 같은 보유 효과와 교체 비교를 쓴다. 위 슬롯에서 효과를 읽고, 새 유물을 고른 뒤 위 슬롯이나 교체 버튼으로 뺄 항목을 고른다. 보스 유물은 전용 슬롯에 들어간다. | [320×568 전](photos/09-relic-comparison-320x568-before.png) · [후](photos/09-relic-comparison-320x568-after.png) · [390×844 후](photos/09-relic-comparison-390x844-after.png) · [1440×900 후](photos/09-relic-comparison-1440x900-after.png) |

[전체 사진 89장](photos/)의 파일명에 항목 번호, 뷰포트, 전후를 적었다. 각 항목의 기본 크기는 320×568, 390×844, 1440×900이며, 데스크톱 배치에는 1920×1080도 포함했다.

## 1~19층 규칙 비교

보통 길과 강적 우선 경로에 영구 해금 없음과 전부 해금을 조합했다. 각 조합은 8192번과 12288번에서 시작하는 512개 시드 구간 두 개를 사용했다. 총 4,096건에서 1~12층 상태 해시와 13~19층 집계가 공개판과 일치했다.

| 지표 | 공개판 | 후보 |
| --- | ---: | ---: |
| 1~12층 시작 | 4,096 | 4,096 |
| 12층 완주 및 상층 입장 | 2,822 | 2,822 |
| 19층 완주 · 전위 초과 피해 이월 사용 | 1,530 | 1,530 |
| 19층 완주 · 비교용 이월 미사용 | 1,520 | 1,520 |

[공개판 봇 출력](bot-before.json) · [후보 봇 출력](bot-after.json)

## 검증

- 후보 `dd07522`로 Windows 빌드와 단위 테스트 197건, 모바일 핵심 흐름 스모크 16건을 통과했다.
- 320×568과 390×844의 가시 골렘 반격을 공개판에서 4건, 후보에서 4건 재생했다. 체력 20에서는 피해 8과 남은 체력 12를, 체력 1에서는 피해 1과 격파를 기록했다. 판정 프레임은 모두 반격 원화의 같은 컷이며, 체력 1에서 기록한 파편 최대 수는 7개로 일치했다. [공개판 기록](counter-before/) · [후보 기록](counter-after/)
- 룰렛은 동작 줄이기에서 고정된 바늘과 멈추기 버튼을 표시한다. 기존 자동 진행 설정을 켠 경우에는 입력 없이 반격한다.
- 방어가 9/9가 되는 에고 턴을 두 모바일 크기에서 재생했다. 굴림부터 배치 표시가 사라질 때까지 표준 1.490~1.492초, 동작 줄이기 0.256~0.258초를 기록했다. [에고 시간 기록](ego-timing.json)
- Linux의 Chrome Headless Shell에서 `dd07522`로 빌드, 단위 테스트 197건, 전체 스모크 192건을 통과했다. `fc-match`는 Noto Sans CJK KR Regular를 확인했다. 화면 시험의 CSS와 JS 빌드 식별자는 각각 `index-Dw8INAWG.css`와 `index-8DsSg-vq.js`다. [Linux 검증 기록](https://github.com/ljhljh0703-cmd/hwigi-tower-remake/actions/runs/46159589962/job/141023680285)
