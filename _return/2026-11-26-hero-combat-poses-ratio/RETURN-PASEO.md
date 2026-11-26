# 회귀탑 회귀자 전투 12컷 적용

`integrate-feel`의 네 묶음 통합 커밋 `5d2009c` 위에 적용했다. 볼트의 `origin/master`가 지시서에 명시된 `ef168a968473065ceea3a65600ef94aae7dee6be`를 가리키는 것을 확인했다. 지시서의 원화 ZIP과 참고 패치 해시가 일치했고, 게임에 넣은 회귀자 PNG 12장도 ZIP 속 파일과 각각 바이트 단위로 일치했다.

## 적용과 검증

- 회귀자의 72×44px 셀은 발 (26, 39), 공격 칼끝 (47, 20)을 공유한다. 경기장에서 회귀자 픽셀 크기를 몬스터 수나 종류와 독립적으로 정했다. 호위전 세 인물도 같은 바닥선에 놓았다.
- 대기, 칼 올리기, 방어, 받아내기, 공격 준비, 앞발 디딤, 칼끝 접촉, 후속, 피격, 회복, 무릎, 쓰러짐을 실제 전투에서 확인했다. 캔버스의 불투명 픽셀을 검사해 자물쇠 상대 칼끝과 받아내기, 호위병 선타와 본체 초과 피해, 보스 치명 일격과 구판 봉인의 접촉을 확인했다.
- 낮고 넓은 얼림 대기는 비율 시안에 쓰인 `2026-11-26-lock-freeze-silhouettes/source-poses.zip`의 `freeze-ready.png`를 썼다. 기존 전투 시트의 공격·피격·격파 컷은 계속 쓴다.
- 320×568의 보스 전장은 발선과 체력·연타 표시를 옮겼다. 충전 때는 긴 무기와 예고가 겹치지 않도록 예고를 옆으로 배치했다. 룰렛이 열린 동안에는 짧은 화면의 체력을 원판 아래로 내렸다.
- 골렘 순수 정확 방어에서 접촉 뒤 밀려났다. 룰렛 시작과 당첨 순간의 캔버스 픽셀은 서로 일치했고 이후 전용 반격이 적용됐다. 일반 패배에서는 마지막 피격 뒤 전장을 240ms 더 유지해 회귀자의 무릎과 쓰러짐을 보여 준다. 움직임 줄이기에서는 이 대기 없이 게임 오버가 열린다.

| 대기 실루엣 | 320×568 | 390×844 |
| --- | ---: | ---: |
| 회귀자 · 호위전 포함 | 84×90px · 원화 한 픽셀당 3px | 84×90px · 원화 한 픽셀당 3px |
| 첫 골렘 | 124×88px | 124×88px |
| 자물쇠 | 92×88px | 92×88px |
| 얼림 | 112×72px | 112×72px |
| 12층 문지기 | 78×132px | 78×132px |

프로덕션 빌드를 헤드리스 Edge에서 두 크기로 열었다. 실제 터치로 입장·배치·턴 종료를 조작했다. 몬스터별 조작은 유효한 등반 저장에서 재현했고, 12층 봉인은 규칙판 5 저장으로 재현했다. 최신 규칙판 6에는 중간 보스, 제동 왕관, 갈림길, 전투 보상, 기믹 5종과 골렘 연출 회귀를 함께 실행했다. 단위 테스트 153개와 모바일 스모크 26개가 통과했다. `npm run bot`의 출력 1,266바이트는 `a10212b`와 일치했다.

## 모바일 사진

| 장면 | 390×844 | 320×568 |
| --- | --- | --- |
| 첫 골렘 비율 | [사진](390x844-ratio-thorns.png) | [사진](320x568-ratio-thorns.png) |
| 자물쇠 비율 | [사진](390x844-ratio-lock.png) | [사진](320x568-ratio-lock.png) |
| 얼림 비율 | [사진](390x844-ratio-freeze.png) | [사진](320x568-ratio-freeze.png) |
| 호위전 세 인물 비율 | [사진](390x844-ratio-escort.png) | [사진](320x568-ratio-escort.png) |
| 12층 문지기 비율 | [사진](390x844-ratio-boss.png) | [사진](320x568-ratio-boss.png) |
| 자물쇠 칼끝 접촉 | [사진](390x844-sword-contact.png) | [사진](320x568-sword-contact.png) |
| 자물쇠 받아내기 | [사진](390x844-guard-contact.png) | [사진](320x568-guard-contact.png) |
| 호위병 선타 접촉 | [사진](390x844-escort-contact.png) | [사진](320x568-escort-contact.png) |
| 보스 충전과 치명 일격 | [충전](390x844-boss-charge.png) · [접촉](390x844-boss-charge-contact.png) | [충전](320x568-boss-charge.png) · [접촉](320x568-boss-charge-contact.png) |
| 구판 보스 봉인 | [예고](390x844-boss-seal.png) · [접촉](390x844-boss-seal-contact.png) | [예고](320x568-boss-seal.png) · [접촉](320x568-boss-seal-contact.png) |
| 골렘 정확 방어 | [사진](390x844-golem-parry.png) | [사진](320x568-golem-parry.png) |
| 골렘 룰렛과 반격 | [룰렛](390x844-roulette.png) · [반격](390x844-counter.png) | [룰렛](320x568-roulette.png) · [반격](320x568-counter.png) |
| 치명타 뒤 쓰러짐 | [사진](390x844-lethal-down.png) | [사진](320x568-lethal-down.png) |
| 게임 오버 | [사진](390x844-game-over.png) | [사진](320x568-game-over.png) |
| 움직임 줄이기에서 당첨 | [사진](390x844-reduced-motion.png) | [사진](320x568-reduced-motion.png) |

사진을 다시 찍으려면 PowerShell에서 `$env:HWIGI_SMOKE_CHANNEL='msedge'`와 `$env:HWIGI_HERO_SHOTS=(Resolve-Path '_return/2026-11-26-hero-combat-poses-ratio').Path`를 지정하고 `npm run build`와 `npm run smoke`를 실행한다.
