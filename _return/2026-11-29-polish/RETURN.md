# 11월 29일 전투 마무리

공개판 `66f98bb`에서 `codex/polish-1129`를 만들었다. 로컬 커밋 `1449bb2`를 `058962f`로 가져왔다. 에고 그림은 28px이며 투명 입력 영역이 그림 바깥으로 사방 12px 넓어졌다. 세 뷰포트에서 44px 사각형의 네 모서리가 모두 입력 영역에 포함되고 오른쪽 가장자리 입력으로 에고 설명이 열렸다.

공격·방어 외곽과 빼앗긴 자리는 기존 주사위 홈 원화에서 내보냈다. 기본·눌림·사용 불가 재굴림 몸체는 구리판 원화에서 내보냈다. 판과 버튼의 모서리를 유지하면서 가운데를 늘려 모바일과 PC에 같은 재질을 썼다. [원화와 내보내기](../../art-source/combat-controls/README.md) · [320×568 전투 UI 전](frames/controls/320x568-controls-before-planning.png) · [후](frames/controls/320x568-controls-after-planning.png) · [1440×900 후](frames/controls/1440x900-controls-after-planning.png) · [빼앗긴 자리 후](frames/controls/390x844-stolen-after-socket.png)

## 같은 입력으로 한 항목씩 비교

| 실험 | 따로 바꾼 항목과 관측값 | 프레임과 기록 |
| --- | --- | --- |
| 보스 격파 | 격파 대미지는 세 보스 모두 13이었다. 같은 피격 셀에서 떼어낸 조각으로 6·12·19층의 3·2·3개 궤적을 바꿨다. 착지 뒤 +560ms에 위치가 달라진 조각 수가 세 화면에서 같았다. | [+211ms 간수](frames/fragments/320x568-warden6-after-211ms.png) · [황제](frames/fragments/390x844-emperor12-after-211ms.png) · [죄수](frames/fragments/1440x900-gatekeeper19-after-211ms.png) · [전 기록](fragments-before.json) · [후 기록](fragments-after.json) |
| 연속 강타 | 17층 강적전에서 실제 내 피해 8, 8의 간격이 288ms에서 264ms로 줄었다. 12층 시드 0의 연속 턴에 준 피해는 17, 14였다. 두 번째 내 강타의 후속 동작은 144ms에서 96ms로 줄이고, 그 접촉의 강타음 재생률은 0.82에서 1.02로 높였다. | [연타 전](frames/rhythm/390x844-same-turn-before-hit2.png) · [후](frames/rhythm/390x844-same-turn-after-hit2.png) · [연속 턴 전](rhythm-before.json) · [후](rhythm-after.json) |
| 상층 플레이어 접근 | 13층 시드 12에서 공격 5·2·1로 낸 피해 8의 첫 접촉이 111ms에서 224ms가 됐다. 후속 강타 접근에는 176ms를 쓴다. | [96ms 전](frames/approach/390x844-upper-heavy-before-96ms.png) · [후](frames/approach/390x844-upper-heavy-after-96ms.png) · [전 기록](approach-before.json) · [후 기록](approach-after.json) |
| 상층 격파 수치 | 공격을 받은 적의 체력 카드 안에 피해 수치를 배치하고, 표준 속도에서 접촉 뒤 376ms 동안 남겼다. 13층 전위와 19층 보스에서 +112·136·160·211·340ms의 숫자 영역과 불투명 파편 마스크 겹침은 세 화면 모두 0px였다. +340ms에서 글자를 숨긴 짝과 비교해 글리프 220~260px를 확인했다. | [19층 +136ms 전](frames/readout/320x568-boss19-before-136ms.png) · [+340ms 후](frames/readout/320x568-boss19-after-340ms.png) · [글자 숨김](frames/readout/320x568-boss19-after-340ms-text-hidden.png) · [마스크·글리프](glyphs.json) · [전 기록](readout-before.json) · [후 기록](readout-after.json) |

[전체 프레임 168장](frames/)은 320×568, 390×844, 1440×900에서 촬영했다. 6·12층 격파는 시드 0의 유효한 해금 전 저장에서 공격 6·6·5를 사용했다. 19층과 13층은 시드 12의 상층 저장으로 재현했다. 17층 연타는 첫 피해 흡수를 피하기 위해 속죄의 왕홀을 장착한 강적전 저장으로 비교했다.

### 타점과 원화

| 장면 | 원화·접촉과 후속 | 앞뒤 효과와 소리 |
| --- | --- | --- |
| 6층 청동 간수 | `chain-warden-hit.png`, 발 (29, 42). 사슬과 청동 어깨는 각기 위로 벌어지고 무거운 철추는 낮게 떨어진다. | 기존 청동 파단면과 바닥 그림자를 사용한다. 접촉의 강타·청동 여운과 착지음 시점은 같은 판정에 붙는다. |
| 12층 침묵의 황제 | `motion/boss.png`의 피격 셀, 아틀라스 발 기준. 붉은 어깨는 높고 오른쪽으로, 디딘 무릎은 낮고 반대쪽으로 간다. | 기존 돌 파단면과 바닥 그림자로 비행과 착지를 구분한다. 숫자·체력은 접촉에 맞춰 표시한다. |
| 19층 창살의 죄수 | `motion/upper-boss.png`의 큰 피격 셀, 아틀라스 발 기준. 망치는 낮게, 창살 두건은 높게, 쇠고리 부분은 중간 높이로 나뉜다. | 정수 배율과 반응 카메라를 사용한다. 피해 행은 HUD의 체력 카드에 붙이고 파편은 뒤 전장에 그린다. |
| 강타와 연타 | 기존 준비·디딤·칼끝·후속 셀을 사용한다. 실제 접촉 횟수에 맞춰 각 적과 회귀자의 피해를 표시한다. | 상층 첫 강타의 휘두름은 접촉 62ms 전에 시작한다. 접촉 정지 및 카메라 감쇠는 기존 경로를 사용한다. 동작 줄이기에서는 짧은 접촉 표시와 정지 자세를 쓴다. |

타격감 A/B는 한 단계씩 빌드했다. 조각은 `BPyw6BMU → AcD3bFlQ`, 리듬은 `AcD3bFlQ → BmIlXXFe`, 상층 접근은 `BmIlXXFe → DV7NeL7p`, 피해 표시는 `DV7NeL7p → BFB3_Ali`의 JS 빌드로 비교했다. 타격감 실험의 양쪽에는 같은 전투 패널 그림을 적용했다.

## 규칙과 검증

공개판과 후보에서 안전 경로·강적 경로, 영구 해금 없음·전부를 조합해 총 4,096건을 돌렸다. 1~12층 진행 해시와 13~19층 집계가 일치했으며, 원본 JSON의 SHA-256도 같았다. [공개판 봇](bot-before.json) · [후보 봇](bot-after.json)

Windows 빌드와 단위 테스트 197건을 통과했다. 수정한 상층 프레임 스모크를 두 모바일 크기에서 다시 실행해 13층 전위 격파 +340ms 수치와 후위의 두 발걸음을 확인했다.

전투 패널은 세 크기에서 빈 칸과 배치된 칸의 출처를 확인했다. 재굴림은 누르기 전, 누르는 동안, 소진 뒤에 각 그림 파일을 로드했다. [전투 UI 확인](controls-after.json)

Linux에서 최종 후보 `d55453c`의 빌드, 단위 테스트 197건, 전체 스모크 192건을 통과했다. Noto Sans CJK KR Regular를 확인했다. 사진과 일치하는 최종 CSS와 JS는 `index-3dHb1sia.css`, `index-BFB3_Ali.js`다. [Linux 검증 기록](https://github.com/ljhljh0703-cmd/hwigi-tower-remake/actions/runs/46167718753/job/141048859263)
