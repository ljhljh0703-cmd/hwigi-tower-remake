# 상층 회귀자와 방어 석판

작업 브랜치는 `codex/polish-1129`다. 이전판 `48f0f72`와 수정판 `d173519`을 같은 저장과 주사위 배치로 비교했다.

- 회귀자는 상층에서도 하층과 같은 원화 배율을 쓴다. 13·17·19층에서 대기 자세의 발과 전장 바닥선 차이는 모두 0px이다. 모바일은 전장을 좌우로 16px씩 넓혔다. 기기 픽셀 비율이 소수이면 적의 실제 확대 배율을 정수로 내려 잡아 과확대를 피했다. 기기 픽셀 비율 1에서 17층 인접 실루엣의 최소 간격은 320px 화면에서 3px, 390px에서 4px, 1440px에서 12px이다. 적 이름표는 화면 안쪽에 놓았다.
- 공격·방어 칸의 빈 상태와 채운 상태에 같은 녹청 석판을 쓴다. 빈 석판의 RGB 밝기는 채운 석판의 76%다. PNG 크기와 투명도는 일치한다.
- 19층 격파 비교는 시드 12의 보스 체력 13, 공격 6·6·5에서 턴 끝내기를 눌렀다. 세 화면에서 피해 13의 표시 시점은 입력 후 224ms로 일치했다. 수정판의 발과 바닥선 차이는 접근 +96ms와 피해 +112·136·160·211·340·560ms에서 모두 0px이었다. [프레임 좌표 수정 전](defeat-before.json) · [수정 후](defeat-after.json)

| 보기 | 12층 대기 배율 | 13·17·19층 수정 전 | 13·17·19층 수정 후 |
| --- | ---: | ---: | ---: |
| 320×568 | 3배 | 2배 | 3배 |
| 390×844 | 3배 | 2배 | 3배 |
| 1440×900 | 6배 | 2배 | 6배 |

[대기 자세와 패널 좌표 수정 전](geometry-before.json) · [수정 후](geometry-after.json) · [기기 픽셀 비율 1.5의 수정 후](geometry-dpr-1.5.json)

## 원본 화면

| 해상도 | 13층 두 마리 | 17층 세 마리 | 19층 보스와 호위 | 배치 중 빈 방어 | 배치 중 채운 방어 |
| --- | --- | --- | --- | --- | --- |
| 320×568 | [전](before/320x568-13-battle.png) · [후](after/320x568-13-battle.png) | [전](before/320x568-17-battle.png) · [후](after/320x568-17-battle.png) | [전](before/320x568-19-battle.png) · [후](after/320x568-19-battle.png) | [전](before/320x568-planning-empty-guard.png) · [후](after/320x568-planning-empty-guard.png) | [전](before/320x568-planning-filled-guard.png) · [후](after/320x568-planning-filled-guard.png) |
| 390×844 | [전](before/390x844-13-battle.png) · [후](after/390x844-13-battle.png) | [전](before/390x844-17-battle.png) · [후](after/390x844-17-battle.png) | [전](before/390x844-19-battle.png) · [후](after/390x844-19-battle.png) | [전](before/390x844-planning-empty-guard.png) · [후](after/390x844-planning-empty-guard.png) | [전](before/390x844-planning-filled-guard.png) · [후](after/390x844-planning-filled-guard.png) |
| 1440×900 | [전](before/1440x900-13-battle.png) · [후](after/1440x900-13-battle.png) | [전](before/1440x900-17-battle.png) · [후](after/1440x900-17-battle.png) | [전](before/1440x900-19-battle.png) · [후](after/1440x900-19-battle.png) | [전](before/1440x900-planning-empty-guard.png) · [후](after/1440x900-planning-empty-guard.png) | [전](before/1440x900-planning-filled-guard.png) · [후](after/1440x900-planning-filled-guard.png) |

| 해상도 | 회귀자 접근 +96ms | 보스 피해 +211ms |
| --- | --- | --- |
| 320×568 | [전](before/320x568-19-swing-96ms.png) · [후](after/320x568-19-swing-96ms.png) | [전](before/320x568-19-defeat-211ms.png) · [후](after/320x568-19-defeat-211ms.png) |
| 390×844 | [전](before/390x844-19-swing-96ms.png) · [후](after/390x844-19-swing-96ms.png) | [전](before/390x844-19-defeat-211ms.png) · [후](after/390x844-19-defeat-211ms.png) |
| 1440×900 | [전](before/1440x900-19-swing-96ms.png) · [후](after/1440x900-19-swing-96ms.png) | [전](before/1440x900-19-defeat-211ms.png) · [후](after/1440x900-19-defeat-211ms.png) |

## 검증

- `npm run build` 및 단위 테스트 197개 통과. 모바일 Chromium 상층·패널 스모크 18개 통과. 12층과 19층의 원화 배율, 바닥선, 전위와 회귀자의 간격, 기기 픽셀 비율 1.5의 17층 세 마리 배치를 스모크에서 검사한다.
- 리눅스에서 Noto Sans CJK KR 글꼴을 확인했고 전체 Chromium 스모크 196개가 통과했다. [Linux 검증 실행](https://github.com/ljhljh0703-cmd/hwigi-tower-remake/actions/runs/46170032983/job/141056132281)
- 세 해상도에서 시드 12의 13층을 이어하기로 열고 두 턴을 정상 속도로 플레이했다. 전위 피해 10, 후위로 이어진 피해 2, 전진한 후위의 두 번째 턴 피해 10이 수정 전후 일치했다.
- 1~19층 등반 봇 4,096회씩 실행. 안전·강적 경로와 해금 없음·전체, 시드 8192~8703 및 12288~12799에서 층별 결과와 플레이 지문이 일치했다. 양쪽 JSON의 SHA-256은 `450499c6ef7878631701b60801ca6739d03d678b62bab51f2791209d41d4be64`다. [봇 결과](bot-comparison.json)
- 후보 빌드 파일은 `index-CrKe7jiY.js`, `index-DnQJ9W-B.css`다.
