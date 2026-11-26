# 네온 화면 검토 반영

볼트의 2026-11-27 네온 검토에서 화면 담당으로 분류된 11개 항목을 반영했다. 전후 기준은 `ce80baa`와 이번 브랜치의 빌드다.

| # | 화면 | 바뀐 동작 |
| --- | --- | --- |
| 1 | 힘 모으기 | 이번 턴 `0` 옆에 화살표·모래시계와 다음 공격을 표시했다. 저지값은 적 앞의 깨진 방패 막대로 옮겼다. 적 본체에 닿는 공격만큼 막대가 줄어든다. 황제의 저지값 `12`에서 공격 `6`을 놓으면 절반이 남고, `12`를 채우면 다음 피해 예고가 갱신된다. |
| 2 | 해금 조건 | 열린 주사위의 이름과 그림을 맨 위에 배치했다. 전투와 같은 숫자 면을 사용하고 검·방패 두 줄 사이에 「또는」을 넣었다. 두 크기에서 공격과 방어 양쪽으로 순서가 다른 `6·5·4`를 확인했다. |
| 3 | 반격 룰렛 | 합공이 잠긴 칸은 부채꼴 전체를 어둡게 표시한다. 자동 회전에 모래시계와 「자동 정지」를 표시하고, 아래 띠에 가능한 피해 범위와 당첨 후 확정 피해를 차례로 표시한다. 첫 판의 수동 룰렛은 직접 누르는 버튼을 표시한다. |
| 4 | 방 전환 | 「입장」을 누르면 지도 제목과 입장 미리보기가 즉시 사라진다. 선택한 문을 확대하고 암전한 다음, 층 번호가 중앙에 한 번 나타나고 전장이 밝아진다. 기본 480ms와 움직임 줄이기 220ms로 구성했다. |
| 5 | 첫 판 방어 | 예고에 `7 + 2 = 9`를 표시한다. 강조한 두 주사위에서 방어 빈자리 두 곳으로 화살표가 이어진다. 방어 합에 따라 `0/9`에서 `9/9`로 갱신된다. |
| 6 | 정확 방어 | 방패가 닿는 순간 화면 가장자리에 황금빛이 돌고 큰 체크 방패가 나온다. 전투 연출 중 실제로 비활성화된 「턴 끝내기」 버튼을 어둡게 표시한다. |
| 7 | 마무리 일격 | 검이 닿는 지점에서 굵은 픽셀 검기를 그린 뒤 적이 밀리면서 무너진 자세로 이어진다. 적 피해 숫자에서 「적」을 뺐다. 체력 `0`에서는 남은 피해 잔상과 막대 채움을 곧바로 숨긴다. |
| 8 | 12층 황제 | 황제 이름과 왕관 체력 카드를 추가했다. 연타는 합계를 크게, 식을 작게 표시한다. 황제는 `21`과 `11 + 10`, 엇걸음병은 `8`과 `3×2 + 2`를 확인했다. |
| 9 | 갈림길 | 문 아래 이름표에 체력과 첫 턴 공격 합계를 병기했다. 강적의 겹친 카드 대신 황금 보석으로 유물 보상을 표시한다. |
| 10 | 보통 방어 | 한 타를 전부 막으면 회귀자 위에서 `0`이 짧게 튀고, 남는 방어는 작게 표시한다. 가시 골렘의 피해 `9`를 방어 `13`으로 막으면 `0` 옆에 `+4`가 뜬다. |
| 11 | 내 공격 | 검을 휘두를 때 적 예고를 낮은 밝기로 표시했다가 적 공격 차례에 복구한다. 피해 숫자는 맞은 인물의 몸에서 위로 튄다. |

## 전장 연출 확인

[몬스터 기획 양식](../../docs/monster-design-template.md)에 따라 가시 골렘의 대기·예고·접근·접촉·후속·가벼운 피격·큰 피격·붕괴에는 `public/art/motion/golem.png`의 전신 12컷을 재사용했다. 발 기준은 `(40, 29)`, 주먹 접점 후보는 첫 타격 `(4, 19)`와 후속 타격 `(7, 19)`, 회귀자의 검끝은 `(47.5, 20.5)`다. 처치 검기는 이 접점에서 시작하고 기존 피격·붕괴·격파 컷으로 이어진다. 새 전신 컷은 0장이다.

단독 정확 방어는 기존 `public/art/golem-parry.png` 12개 사용 컷의 280ms 접촉에서 화면 섬광과 방어음을 시작한다. 룰렛 시작과 정지 사이에는 전신 자세와 적 체력을 유지하고, `public/art/golem-counter.png` 8개 사용 컷의 반격 접점에서 피해를 보여 준다. 두 화면 크기에서 이 순서와 룰렛 음을 확인했다.

## 전후 사진

| # | 320×568 | 390×844 |
| --- | --- | --- |
| 1 · 힘 모으기 | [전](before/320x568-intent-charge.png) · [후](after/320x568-intent-charge.png) · [공격 6](after/320x568-intent-charge-half.png) | [전](before/390x844-intent-charge.png) · [후](after/390x844-intent-charge.png) · [공격 6](after/390x844-intent-charge-half.png) |
| 2 · 해금 조건 | [전](before/320x568-unlock-conditions.png) · [후](after/320x568-unlock-conditions.png) | [전](before/390x844-unlock-conditions.png) · [후](after/390x844-unlock-conditions.png) |
| 3 · 룰렛 | [전](before/320x568-roulette.png) · [후](after/320x568-roulette.png) · [회전 중](after/320x568-roulette-spinning.png) | [전](before/390x844-roulette.png) · [후](after/390x844-roulette.png) · [회전 중](after/390x844-roulette-spinning.png) |
| 4 · 방 전환 | [전](before/320x568-room-transition.png) · [후](after/320x568-room-transition.png) · [층 번호](after/320x568-room-floor.png) | [전](before/390x844-room-transition.png) · [후](after/390x844-room-transition.png) · [층 번호](after/390x844-room-floor.png) |
| 5 · 첫 판 방어 | [전](before/320x568-03-defend.png) · [후](after/320x568-03-defend.png) | [전](before/390x844-03-defend.png) · [후](after/390x844-03-defend.png) |
| 6 · 정확 방어 | [전](before/320x568-guard-exact.png) · [후](after/320x568-guard-exact.png) | [전](before/390x844-guard-exact.png) · [후](after/390x844-guard-exact.png) |
| 7 · 마무리 일격 | [전](before/320x568-impact-finisher.png) · [후](after/320x568-impact-finisher.png) · [붕괴](after/320x568-finisher-down.png) | [전](before/390x844-impact-finisher.png) · [후](after/390x844-impact-finisher.png) · [붕괴](after/390x844-finisher-down.png) |
| 8 · 황제 | [전](before/320x568-intent-attack.png) · [후](after/320x568-intent-attack.png) | [전](before/390x844-intent-attack.png) · [후](after/390x844-intent-attack.png) |
| 9 · 갈림길 | [전](before/320x568-fork-selected.png) · [후](after/320x568-fork-selected.png) | [전](before/390x844-fork-selected.png) · [후](after/390x844-fork-selected.png) |
| 10 · 보통 방어 | [전](before/320x568-guard-ordinary.png) · [후](after/320x568-guard-ordinary.png) | [전](before/390x844-guard-ordinary.png) · [후](after/390x844-guard-ordinary.png) |
| 11 · 내 공격 | [약타 전](before/320x568-impact-light.png) · [후](after/320x568-impact-light.png) · [강타 전](before/320x568-impact-heavy.png) · [후](after/320x568-impact-heavy.png) | [약타 전](before/390x844-impact-light.png) · [후](after/390x844-impact-light.png) · [강타 전](before/390x844-impact-heavy.png) · [후](after/390x844-impact-heavy.png) |

## 규칙 검증

`npm run build`가 통과했고, 단위 테스트 160개와 모바일 스모크 56개가 통과했다. 위 사진 56장의 링크와 실제 가로·세로 크기를 확인했다.

`npm run bot` 표준 출력 1,266바이트는 기존 기준과 동일했다. SHA-256은 `f3406e44431762fd4a5dfc9e419d712cee9d450b65fed9d5243593e09a59e416`이다. 규칙판 6 봇은 혼합 보스 유물과 시드 8192–12287에서 이전 커밋과 전체 층별 JSON 결과가 동일했다.

| 규칙판 6 경로 | 전 | 후 |
| --- | ---: | ---: |
| safe | 1,588/4,096 (38.77%) | 1,588/4,096 (38.77%) |
| elite | 1,542/4,096 (37.65%) | 1,542/4,096 (37.65%) |
