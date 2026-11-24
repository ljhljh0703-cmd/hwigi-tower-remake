---
created: 2026-11-24
updated: 2026-11-24
type: project
tags: [hwigi-remake, 작업지시, 타격감]
proposed_by: claude
confirmed_by: null
status: provisional
review_trigger: "이 작업 반환 묶음이 들어오면"
---
<!-- 회귀탑 리메이크 Paseo 팀 작업 지시: 타격감 보강과 화면 글자 정리. 작가는 이 파일 경로만 넘긴다. -->

# 작업 지시: 타격감 보강과 화면 글자 정리

## 1. 먼저 읽을 것
1. 볼트 루트에서 `python3 scripts/vault_sync.py start`
2. 이 저장소 `docs/hitfeel/MARKET-REVIEW.md` 2장과 3장 전부(볼트 `wiki/projects/hwigi-remake/MARKET-REVIEW.md` 와 같은 내용. 볼트 쪽은 맥에서 아직 깃허브에 안 올라갔을 수 있음)
2-1. 볼트 `wiki/projects/reference-lab-returns/2026-11-22-game-art-research-run/` 의 타격 연출 결론(105회차 연타 피해 표시, 120회차 타격 그림자 0.06초, 172회차 방패 타격 표시 등). 이 연구에서 실제로 해 보고 정한 값이 있으면 그 값을 쓰고, MARKET-REVIEW 2-1 표 값은 연구에 없는 항목에만 쓴다. 둘이 다르면 RETURN.md에 어느 쪽을 썼는지 적는다
3. `wiki/projects/design-aesthetic-returns/2026-10-19-game-feel/REPORT.md` 1장, 3-4, 3-5, 3-6

## 2. 할 일 (저장소 `ljhljh0703-cmd/hwigi-tower-remake`, 이 지시서가 들어 있는 브랜치 `hitfeel` 에서 이어서)
1. 피해 숫자 위치: `src/style.css` `.damage-float`를 적 의도 상자와 겹치지 않는 맞은 몸 중앙으로 옮긴다. 돌판 배경과 테두리를 빼고 흰 글자 + 짙은 외곽선. `src/main.ts` `showDamage`에 튀어나옴(0.64 → 1.15 → 1, 120ms)과 위로 40px 떠오르며 700ms 사라짐을 넣는다
2. 피해 크기별 글자 크기(로그 단계)와 피해 5 이상 붉은색
3. 히트스톱(양쪽 정지와 떨림, 50ms + 피해당 8ms, 상한 140ms), 맞은 쪽 흰 번쩍임 80ms, 6~10px 밀림. `src/arena.ts` 자세 연출에 붙인다
4. 트라우마 방식 화면 흔들림. 피해 5 미만은 흔들지 않는다. 값은 MARKET-REVIEW 2-1 표
5. 정확 방어 연출(방패 고리, 「딱 막음」, 120ms 정지 뒤 룰렛), 연타 숫자 비켜 쌓기와 효과음 음높이 상승, 돌 파편 6~12개, 체력 잔상 막대 0.35초
6. 에고 주사위 해금 순간 300ms 정지와 주사위 확대
7. 「움직임 줄이기」 설정(흔들림과 떨림 0)
8. 화면 글자: 「동료 주사위」 → 「에고 주사위」, 「회귀탑」 → 「회귀자는 탑을 오른다」(`src/main.ts` 104, 269, 573행, `src/battle-guide.ts` 40, 54~56행, `index.html` 8, 111, 114행). 해금 전 합공 칸은 잠금 표시

## 3. 꼭 지킬 것
- 규칙 폴더 코드 수정 금지. 연출은 화면 쪽에만 추가한다
- 끝내기 전 `npm test` 전부 통과, `npm run bot` 결과가 작업 전과 글자 단위로 같아야 한다. 다르면 멈추고 보고
- 그림이 필요하면 웹 ChatGPT, 막히면 Codex 내장 생성. 코드로 그림을 대신 그리지 않는다(파편, 고리, 번쩍임 같은 도형 연출은 코드 몫이라 괜찮다)
- `main`에 올리지 않는다. 공개 배포는 작가가 「올려」 한 뒤에만
- 같은 시드(`?seed=7`)로 작업 전과 후를 각각 녹화해 반환 묶음에 둔다. 피해 숫자가 의도 상자에 가리지 않는 프레임 1장 포함

## 4. 반환
- `wiki/projects/hwigi-remake-returns/<날짜>-hitfeel/`에 RETURN.md(바꾼 파일, 시험 결과, 봇 결과 비교, 녹화 경로), 전·후 녹화
- `python3 scripts/handoff_check.py --push <경로>` 로 올리고 커밋 번호를 받는다
- 작가에게 한 줄: 「회귀탑 손맛 보강 해 볼 준비됨, 브랜치 hitfeel, 커밋 <번호>」
- 세션 끝에 `python3 scripts/vault_sync.py close`
