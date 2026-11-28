# 회귀탑 2스테이지 적 원화

겨울 폐허의 적을 Codex 내장 이미지 생성으로 만들었다. 기존 적의 대기 그림을 역할별로 한 장씩 첨부해 회색 돌, 숯색 외곽선, 녹슨 붉은 부분의 픽셀 화풍을 맞췄다. 이름은 작가가 넣을 수 있도록 `?`로 표시했다. 방패와 19층 호위는 명세의 같은 파수 원화를 쓴다. [사용한 원본과 생성 프롬프트](../../art-source/enemy-motion/UPPER-SOURCES.md)

| 역할 | 출신 갈래 | 생김새 한 줄 |
| --- | --- | --- |
| 돌진 | 탑의 산물 | 부서진 계단 석판이 네 발로 뭉쳤고, 쐐기처럼 큰 앞발과 녹슨 붉은 어깨 틈이 보인다. [원화](../../art-source/enemy-motion/raw/upper-dash.png) |
| 방패 | 파수 | 검은 사각 눈구멍과 깨진 어깨 모서리를 지닌 석갑 파수가 녹슨 쇠띠를 두른 계단형 방패를 든다. [원화](../../art-source/enemy-motion/raw/upper-shield.png) |
| 지원 겸 직접 공격 | 갇힌 자 | 검은 두건과 찢어진 짧은 망토를 입고, 한 손엔 갈고리 곤봉을 들고 다른 손은 펼친다. [원화](../../art-source/enemy-motion/raw/upper-support.png) |
| 19층 보스 호위 | 파수 | 석갑과 돌판 방패를 든 같은 파수가 격문 안에서 보스 앞을 막는다. [공용 원화](../../art-source/enemy-motion/raw/upper-shield.png) |
| 19층 보스 | 갇힌 자 | 창살 두건과 돌가루가 낀 너덜한 망토를 두르고, 끊어진 손목 쇠고리와 붉은 쇠띠를 감은 각진 망치를 달고 있다. [기본](../../art-source/enemy-motion/raw/upper-boss.png) · [특수](../../art-source/enemy-motion/raw/upper-boss-special.png) |

## 전투 화면

| 시드 12 | 320×568 | 390×844 |
| --- | --- | --- |
| 13층 돌진과 지원 | [PNG](320x568-seed12-13-turn1-formation.png) | [PNG](390x844-seed12-13-turn1-formation.png) |
| 13층 전위 격파 뒤 전진 | [PNG](320x568-seed12-13-turn1-rear-stepping.png) | [PNG](390x844-seed12-13-turn1-rear-stepping.png) |
| 17층 강적 세 마리 | [PNG](320x568-seed12-17-turn1-elite.png) | [PNG](390x844-seed12-17-turn1-elite.png) |
| 19층 호위와 보스 | [PNG](320x568-seed12-19-turn1-guarded-boss.png) | [PNG](390x844-seed12-19-turn1-guarded-boss.png) |
| 19층 전진한 보스 | [PNG](320x568-seed12-19-boss-front.png) | [PNG](390x844-seed12-19-boss-front.png) |
| 19층 보스의 강타 준비 | [PNG](320x568-seed12-19-boss-charge.png) | [PNG](390x844-seed12-19-boss-charge.png) |
| 19층 강타 | [접촉](320x568-seed12-19-charge-contact.png) · [후속](320x568-seed12-19-charge-follow.png) | [접촉](390x844-seed12-19-charge-contact.png) · [후속](390x844-seed12-19-charge-follow.png) |
| 19층 약화 강타 | [접촉](320x568-seed12-19-weak-contact.png) · [후속](320x568-seed12-19-recover-start.png) | [접촉](390x844-seed12-19-weak-contact.png) · [후속](390x844-seed12-19-recover-start.png) |

두 화면 모두 시드 12, 19층 6턴에 1·1·1을 방어에 두었다. 일반 강타는 회귀자에게 18, 약화 강타는 8의 피해를 한 번 표시했다. 같은 시각에 강타음이 한 번 시작됐고, 각 강타에 맞는 망치 접촉과 후속 자세가 나왔다. [접촉·피해·소리 기록](boss-contact-records.json)

## 동작과 타점

완성된 배포 시트는 일반 적 48×48, 보스 80×80의 투명 칸을 쓴다. 대기·예고·접근·접촉·후속·재준비·연타 접촉·고유 자세·가벼운 피격·큰 피격·무릎 꺾임·격파에 전진 두 장과 후위 두 장을 더했다. 네 기본 시트 64컷과 보스 특수 12컷, 총 76컷이다. 320×568의 전위·후위는 4배·3배, 390×844는 5배·4배로 그린다. 캔버스에서 보간을 끄고 좌표도 픽셀에 맞춘다. 후위는 한 단 위에 세우며 명도를 약간 낮춘다. 상층 갈림길 카드와 방 미리보기도 새 대기 원화를 쓴다.

| 전투 | 320×568 몸 높이 | 390×844 몸 높이 |
| --- | --- | --- |
| 13층 | 96 · 75px | 120 · 100px |
| 17층 강적 | 100 · 75 · 75px | 125 · 100 · 100px |
| 19층 호위와 보스 | 100 · 78px | 125 · 104px |

| 역할 | 발 기준 | 기본 접촉 / 연타 접촉 | 고유 자세와 후속 |
| --- | --- | --- | --- |
| 돌진 | 24, 43 | 앞발 (1, 34) / (2, 33) | 앞발을 거두며 재준비한다. 피격 뒤 무릎이 꺾이고 기존 돌 파편이 나온다. |
| 방패·호위 | 24, 43 | 방패 모서리 (1, 40) / (2, 38) | 14층 교대에서 방패를 내린 뒤 두 걸음 자세로 교대한다. |
| 지원 | 24, 43 | 갈고리 곤봉 (1, 28) / (1, 30) | 펼친 손 자세에 기존 연결 표시를 붙인다. 두 걸음 자세가 13층 전위 격파 뒤 이어진다. |
| 보스 | 40, 71 | 망치 (3, 58) / (6, 57) | 위로 들어 준비한다. 강타 (7, 61)와 약화 (7, 65)는 망치 타점이 다르다. 중단에는 무릎을 대고, 회복에는 숨을 고르고 일어선다. |

일반·연타·강타 타점은 `manifest.json`에 각 칸의 불투명 픽셀 좌표로 기록했다. 상층의 접촉 정지, 한 타격당 효과음과 피해, 약화 판정, 파편, 전진 처리에는 이전 병합판의 판정을 쓴다. 움직임 줄이기에서는 새 격파 자세로 결과를 보여 준다. [발과 타점 데이터](../../art-source/enemy-motion/manifest.json) · [배포 시트](../../public/art/motion/)

## 검증

1~12층 봇 32,768건을 재실행했다. 두 시드 구간, 보수·강적 우선 경로, 해금 0·10장의 8개 코호트에서 공개판 `81484c7` 및 직전 작업 브랜치 `9fc8995`와 층별 도착·이탈·턴 수, 방별 체크포인트 SHA-256, 12층 완주 22,350건이 모두 일치했다. [봇 비교 자료](lower-bot-results.json) · [공개판 원시 비교](../2026-11-28-stage2-2/merge-81484c7/lower-bot-comparison.json)

원화 빌드는 `3e851d1`이다. Windows의 `index-CNkaa4ht.js` SHA-256은 `b02bc81db9e8a27ca79ca3f39bb7cc75fe9cefa3b00d7e4a6aa9f3632dba6ba8`이다. 배포 PNG 76컷의 알파가 0 또는 255이며 접촉 좌표가 불투명 픽셀임을 검사했다. 하층 시트의 발·타점 데이터는 직전판과 일치했다. Windows 빌드, 단위 테스트 197개, 두 화면의 상층 스모크 8개가 통과했다.

시드 12의 로비부터 두 턴, 정확 방어·룰렛 반격까지 하층 스모크 8개를 다시 통과했다. 두 화면에서 직전판과 피해량, 효과음 순서, 착지 뒤 파편 위치 해시가 일치했다. [하층 연출 대조](lower-contact-comparison.json)

390×844에서 수집가를 선택한 시드 14로 로비부터 19층 완주까지 실제 입력 191건을 다시 재생했다. 빠름, 동작 줄이기, 자동 룰렛 설정으로 Galmuri11 로딩과 최종 결산을 확인했다. [입력 목록](../2026-11-28-stage2-2/seed-14-replay.json) · [완주 화면](390x844-seed14-lobby-to-summit.png)

Ubuntu에서 Noto Sans CJK KR을 확인했다. 같은 빌드 파일명으로 빌드, 단위 테스트 197개, Chromium 전체 스모크 184개가 통과했다. [Ubuntu 검증](https://github.com/ljhljh0703-cmd/hwigi-tower-remake/actions/runs/46134922155)

```powershell
npm.cmd run build
npm.cmd test
$env:HWIGI_SMOKE_CHANNEL = 'msedge'
npm.cmd run smoke -- stage-two
node scripts/stage-two-bot.mjs safe 8192 4096 none lower
```
