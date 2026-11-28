# 19층 보스 원화 재제작

붉은 사각 망치, 뼈빛 창살 두건, 어두운 소매 위의 구리색 손목 고리를 각각 큰 색면으로 다시 그렸다. 12층 보스 대기 원화를 화풍 참고로 삼아 Codex 내장 이미지 생성으로 기본 16컷과 특수 12컷을 만들었다. 19층의 전투 시트와 지도 대기 그림을 교체했다. [원본·프롬프트](../../art-source/enemy-motion/BOSS-REDRAW.md) · [이전 390×844 대기 화면](../2026-11-28-stage2-art/390x844-seed12-19-boss-front.png)

| 시드 12 실제 전투 | 320×568 | 390×844 |
| --- | --- | --- |
| 대기 | [PNG](320x568-seed12-19-boss-front.png) | [PNG](390x844-seed12-19-boss-front.png) |
| 준비 | [PNG](320x568-seed12-19-boss-charge.png) | [PNG](390x844-seed12-19-boss-charge.png) |
| 강타 | [접촉](320x568-seed12-19-charge-contact.png) · [후속](320x568-seed12-19-charge-follow.png) | [접촉](390x844-seed12-19-charge-contact.png) · [후속](390x844-seed12-19-charge-follow.png) |
| 약화 강타 | [접촉](320x568-seed12-19-weak-contact.png) · [후속](320x568-seed12-19-recover-start.png) | [접촉](390x844-seed12-19-weak-contact.png) · [후속](390x844-seed12-19-recover-start.png) |
| 무릎 꺾임 | [PNG](320x568-seed12-19-boss-knee.png) | [PNG](390x844-seed12-19-boss-knee.png) |
| 강타 중단 | [PNG](320x568-seed12-19-boss-interrupted.png) | [PNG](390x844-seed12-19-boss-interrupted.png) |
| 회복 | [PNG](320x568-seed12-19-boss-recover.png) | [PNG](390x844-seed12-19-boss-recover.png) |
| 호위 뒤 대기 | [PNG](320x568-seed12-19-turn1-guarded-boss.png) | [PNG](390x844-seed12-19-turn1-guarded-boss.png) |

## 픽셀 배율과 타점

직전 빌드의 전위도 320px에서 4배, 390px에서 5배의 정수 확대였다. 이번에는 대기 자세의 본체 높이를 원화 33px에서 42px로 늘리고, 화면에서는 각각 3배·4배로 그렸다. 원본 크기에서 장비 윤곽을 확인하고, 별도로 원화의 상하좌우에 같은 색 이웃이 없는 불투명 픽셀 비율을 셌다. 대기 자세는 44.32%에서 9.79%, 강타 접촉은 45.81%에서 8.84%로 줄었다. [원화 픽셀 비교](native-pixels.json)

| 기기의 CSS 픽셀당 물리 픽셀 | 320×568에서 원화 1px | 390×844에서 원화 1px |
| --- | ---: | ---: |
| 1 | 3×3 | 4×4 |
| 1.25 | 3×3 | 4×4 |
| 2 | 6×6 | 8×8 |

브라우저에서 실제 `drawImage`의 원본과 목적지 크기, 물리 픽셀 좌표, 캔버스 변환 행렬을 검사했다. 가로·세로에 같은 정수 배율을 적용하고 보간을 끈 상태에서 그린다. 두 시트의 80×80 칸과 발 기준점 (40, 71)을 확인했다. 강타는 망치 앞면 (1, 58), 약화 강타는 낮은 망치 앞면 (4, 61)에서 닿는다. 6턴에 1·1·1을 방어에 두었을 때 두 화면에서 일반 강타 피해 18, 약화 강타 피해 8이 각각 한 번 적용됐고, 각 피해와 같은 시각에 강타음 한 번이 시작됐다. [접촉 프레임·피해·소리 기록](boss-contact-records.json)

## 검증

1~12층 봇 32,768건을 재실행했다. 8개 코호트에서 공개판 `81484c7`과 대조한 직전 결과와 층별 도착·이탈·턴 수, 방별 체크포인트 SHA-256, 12층 완주 22,350건이 일치했다. [봇 비교](lower-bot-results.json) · [공개판 대조 기록](../2026-11-28-stage2-2/merge-81484c7/lower-bot-comparison.json)

검증한 원화 빌드는 `bed1ddd`다. Windows `index-BUhhNsLc.js`의 SHA-256은 `7cf9f77464a7eb23cf628283930cec0b10604b2e5af6ae964ed45aa9272da271`이다. Windows에서 빌드, 단위 테스트 197개, 상층 스모크 12개를 통과했다. 13·17층 배치와 14층 교대, 19층 호위전도 두 화면에서 다시 실행했다. 배포 그림 변경은 19층 보스 기본·특수 시트와 지도용 대기 그림 세 파일이다.

390×844에서 시드 14의 실제 입력 191건으로 로비부터 19층 승리까지 다시 재생했다. 빠름·동작 줄이기·자동 룰렛 설정을 사용했고 Galmuri11 로딩과 최종 결산을 확인했다. [재생 입력](../2026-11-28-stage2-2/seed-14-replay.json)

두 화면의 하층 격파·정확 방어·룰렛 반격 스모크 8개도 통과했다. 같은 입력에서 피해량, 효과음 순서, 착지 뒤 파편 위치 해시가 `4cde95d`와 일치했다.

Ubuntu에서 Noto Sans CJK KR, 같은 빌드 파일명, 단위 테스트 197개와 Chromium 전체 스모크 188개의 통과를 확인했다. [Ubuntu 검증](https://github.com/ljhljh0703-cmd/hwigi-tower-remake/actions/runs/46136323221)
