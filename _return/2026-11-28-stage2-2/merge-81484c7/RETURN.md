# 회귀탑 2스테이지와 공개판 전투 연출 병합

공개판 `81484c7`을 `codex/stage2`에 병합했다. 검증 빌드 `946c974`의 부모는 기존 상층 `e8a51b5`와 공개판 `81484c7`이다. 상층 전투에서 주사위의 그림·착지음과 룰렛 그림을 확인했다. 전위 피해가 표시되는 순간 접촉 반동과 타격음이 시작되고, 격파 뒤 후위가 앞으로 걸어 나온다.

## 실제 전투

| 시드 12 | 320×568 | 390×844 |
| --- | --- | --- |
| 12층 승리 뒤 선택 | [화면](320x568-seed12-12-turn1-choice.png) | [화면](390x844-seed12-12-turn1-choice.png) |
| 13층 두 마리 | [화면](320x568-seed12-13-turn1-formation.png) | [화면](390x844-seed12-13-turn1-formation.png) |
| 13층 전위 격파와 후위 전진 | [격파](320x568-seed12-13-turn1-front-hit.png) · [전진](320x568-seed12-13-turn1-rear-stepping.png) | [격파](390x844-seed12-13-turn1-front-hit.png) · [전진](390x844-seed12-13-turn1-rear-stepping.png) |
| 13층 룰렛과 반격 대상 | [화면](320x568-seed12-13-turn2-counter-target.png) | [화면](390x844-seed12-13-turn2-counter-target.png) |
| 17층 강적 세 마리 | [화면](320x568-seed12-17-turn1-elite.png) | [화면](390x844-seed12-17-turn1-elite.png) |
| 19층 호위와 보스 | [화면](320x568-seed12-19-turn1-guarded-boss.png) | [화면](390x844-seed12-19-turn1-guarded-boss.png) |

13층 공격 눈 6·4·2에서 전위에 10 피해로 격파가 적용된다. 전진 뒤 2 피해는 후위에게 이어져 체력이 10/12로 남는다. 첫 주사위 착지음은 주사위마다 한 번, 튕기는 소리는 첫 주사위에서 한 번 재생된다. 전위 격파의 접촉·돌 깨짐·낙하음도 각각 한 번 확인했다. 390×844에서 시드 14로 로비부터 19층 승리까지 실제 브라우저 조작 191건을 재생하고 Galmuri11 로딩을 확인했다. [완주 화면](390x844-seed14-lobby-to-summit.png) · [재생 입력](../seed-14-replay.json)

| 상층 접촉 설계 | 화면과 소리 |
| --- | --- |
| 준비·판정 | 기존 공격 준비·디딤·접촉·후속 포즈와 `public/art/motion/`의 기존 시트를 사용한다. 칼끝은 대상의 왼쪽 윤곽, 적의 무기나 앞발은 회귀자의 오른쪽 접점으로 온다. 관통은 전위 격파와 후위 전진 이후 대상별 피해를 표시한다. |
| 접촉·반동 | 가벼운 피격 36ms, 큰 피격과 격파 56ms 동안 접촉의 자세와 첫 타격 위치를 유지한다. 적 공격의 피해마다 회귀자가 왼쪽으로, 회귀자의 피해마다 적이 오른쪽으로 반동한다. 공개판과 같은 카메라 감쇠를 적용하며 숫자, 예고, 조작부는 제자리에 남는다. |
| 파편·회복 | 기존 시트의 발과 불투명 윤곽을 기준으로 파편을 낸다. 돌진은 돌, 방패·보스 호위·보스는 황동 파편과 효과음을 쓴다. 지원은 기존 공통 피격과 격파 표현을 쓴다. 움직임 줄이기에서는 체력과 피해 표시로 결과를 읽는다. |

## 하층 전투 연출 비교

공개판과 병합판에서 같은 스모크로 시드 12를 로비부터 두 턴 재생했다. 실제 피해 시각 기준 두 화면에서 `−11` 한 번, 강타·돌 깨짐·낙하 순서, 비행 뒤의 정지 잔해를 확인했다. 정확 방어와 룰렛 반격은 두 적 체력에서 따로 확인했다. 두 판의 착지 후 픽셀 해시, 피해와 소리 순서가 일치했다. 움직이는 파편의 중간 프레임은 캡처 시점에 따라 소폭 달랐다. 실시간 정상 속도로도 같은 입력을 반복해 강타음 약 350ms 뒤 낙하음과 보상 진입을 확인했다. [프레임과 소리 기록](lower-contact-comparison.json) · [실시간 재생 기록](normal-contact.json)

| 화면 | +112ms | +136ms | +160ms | 비행 +211ms | 착지 +560ms | 정확 방어 뒤 반격 |
| --- | --- | --- | --- | --- | --- | --- |
| 320×568 | [PNG](320x568-golem-112ms.png) | [PNG](320x568-golem-136ms.png) | [PNG](320x568-golem-160ms.png) | [PNG](320x568-golem-211ms.png) | [PNG](320x568-golem-560ms.png) | [PNG](320x568-counter-211ms.png) |
| 390×844 | [PNG](390x844-golem-112ms.png) | [PNG](390x844-golem-136ms.png) | [PNG](390x844-golem-160ms.png) | [PNG](390x844-golem-211ms.png) | [PNG](390x844-golem-560ms.png) | [PNG](390x844-counter-211ms.png) |

## 등반 봇

시드 8192–12287과 12288–16383에서 보수·강적 우선 경로와 해금 0·10장을 조합해 총 32,768건을 양쪽에서 돌렸다. 8개 코호트 모두 1~12층 도착·패배·턴 수, 방별 체크포인트 SHA-256, 12층 완주 수가 일치했다. 양쪽에서 22,350건이 12층을 완주했다. [코호트별 원시 비교](lower-bot-comparison.json)

| 시작 시드 | 경로 | 해금 0장 12층 완주 | 해금 10장 12층 완주 |
| --- | --- | ---: | ---: |
| 8192 | 보수 | 2,984 | 2,894 |
| 8192 | 강적 우선 | 2,678 | 2,662 |
| 12288 | 보수 | 2,945 | 2,827 |
| 12288 | 강적 우선 | 2,705 | 2,655 |

병합판에서 상층까지 같은 8개 코호트를 재실행했다. 상층 입장 22,350건 중 11,642건(52.09%)이 19층을 완주했다. 전위에서 피해가 멈추는 비교군 완주율은 51.49%였다. 두 경우 모두 이전 상층 검증의 코호트별 결과와 일치했다. 이탈률의 분모는 해당 층 도착자다. [상층 봇 결과](upper-bot-results.json)

| 층 | 도착 | 이탈 | 이탈률 |
| --- | ---: | ---: | ---: |
| 13 | 22,350 | 0 | 0.00% |
| 14 | 22,350 | 17 | 0.08% |
| 15 | 22,333 | 664 | 2.97% |
| 16 정비 | 21,669 | 0 | 0.00% |
| 17 | 21,669 | 3,353 | 15.47% |
| 18 정비 | 18,316 | 0 | 0.00% |
| 19 | 18,316 | 6,674 | 36.44% |

## 빌드와 재현

Windows의 검증 JS는 `index-CQJzHZkU.js`, SHA-256 `9a10c91cec519c6810850f00aa39eaf3f42c4c81c352da7afd8e5d628c9eada0`이다. CSS는 `index-Y1BB-Vkz.css`, SHA-256 `d79f81238bde1638b4e5bad2ad0970e11bc2c24d350bce9fd204f7cf17e15ea1`이다.

Windows에서 빌드와 단위 테스트 197개, 상층 스모크 6개, 격파 가독성 28개, 주사위·룰렛·전투 연출 74개가 통과했다. 공개판에서도 시드 12 격파와 정확 방어 반격 스모크 4개를 통과했다.

Ubuntu에서 같은 JS 파일명의 빌드와 단위 테스트 197개, Chromium 전체 스모크 182개가 통과했다. `fonts-noto-cjk`를 설치했고 `fc-match :lang=ko`는 이 실행의 시스템 기본 후보로 WenQuanYi Zen Hei를 반환했다. [Ubuntu 검증](https://github.com/ljhljh0703-cmd/hwigi-tower-remake/actions/runs/46131870455)

```powershell
npm.cmd run build
npm.cmd test
$env:HWIGI_SMOKE_CHANNEL = 'msedge'
npm.cmd run smoke -- stage-two defeat-readability combat-image-controls dice-roll-sound golem-counter-contact feel-integration
node scripts/stage-two-bot.mjs safe 8192 4096 none lower
node scripts/stage-two-bot.mjs safe 8192 4096 none
```

공개판에 같은 봇을 돌릴 때 `81484c7`의 별도 체크아웃에서 `scripts/stage-two-bot.mjs`만 가져와 마지막 인자로 `lower`를 지정한다. 같은 장면의 공개판 화면을 생성하려면 `81484c7`의 빌드 경로를 `HWIGI_SMOKE_DIST`에 넣고 `defeat-readability`를 실행한다. [상층 난이도·원화 기록](../RETURN.md)
