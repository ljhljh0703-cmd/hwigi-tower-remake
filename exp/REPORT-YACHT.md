# 회귀자는 탑을 오른다 · 족보 해금 우선 시험 1

기준 커밋 `99a14e5`, 작업 갈래 `exp/yacht-unlock`. 시드 0~511을 해금 조건 4개와 봇 정책 3개에 각각 적용해 총 6,144번 등반했다. 30턴 상한에 도달해 미결로 끝난 전투는 12개 조합 모두 0회였다.

## 실행 명령

```powershell
node exp/yacht.mjs
npm test
npm run build
```

Node.js v26.13.1, npm 11.20.0에서 실행했다. 시험 25개가 통과했고 TypeScript 검사와 Vite 빌드가 완료됐다. Vite는 500 kB를 넘는 축소 번들에 대해 경고했다.

## AI가 정한 시작값

- 두 전투 모두 공개판의 첫 적을 사용했다. 적 체력은 매 전투 30, 예고 피해는 홀수 턴 한 방 12, 짝수 턴 연타 4·4·4다. 첫 전투는 플레이어 체력 22와 기본 주사위 3개로 시작한다. 첫 전투 승리 시 남은 체력을 둘째 전투로 그대로 넘겼다. 공개판의 봇과 같은 30턴 상한을 적용하고 전투마다 각성 사용 여부를 초기화했다.
- 첫 전투 시드는 입력값, 둘째 전투 시드는 `(seed ^ 0x9e3779b9) >>> 0`이다. 기본 주사위 3개, 기존 재굴림, 룰렛, 각성에는 공개판과 같은 난수 채널을 사용했다. 네 번째 주사위 첫 굴림, 기본 재굴림에서 네 번째로 처리한 굴림, 추가 재굴림에는 채널 8·9·10을 각각 사용했다.
- 대응 봇은 기존 `adaptAndReroll`과 같은 점수와 배치 순서로 평가하고, 기본 재굴림에서 눈 1~3을 다시 굴렸다. 추가 재굴림에서는 눈 1~3 중 가장 낮은 주사위 하나를 골랐다. 동률이면 앞 주사위를 골랐다.
- 족보 봇은 당장 쓸 수 있는 목표 칸의 족보를 먼저 배치했다. 재굴림이 필요하면 목표 족보의 눈 두 개를 보존했다. 트리플은 높은 눈부터, 3연속은 낮은 시작 눈부터 확인했다. 방어 목표의 합은 이번 턴 예고 피해와 같아야 한다. 재굴림할 목표가 없거나 최종 배치에서 목표를 쓸 수 없으면 해당 선택에 대응 봇 정책을 사용했다. 추가 재굴림에서는 보존할 두 눈을 제외한 주사위 중 가장 낮은 눈 하나를 골랐다.
- 봇의 족보 목표는 모든 해금 조건에서 같았다. 둘째 전투에 들어갈 때 첫 전투에서 처음 해금한 능력만 적용했다. 재굴림 주사위는 기본 재굴림을 이미 쓴 턴에 주사위 하나를 골라 전투당 한 번 다시 굴리는 것으로 구현했다. 기본 재굴림에서 보존했던 주사위도 선택할 수 있다.
- 한 칸에 놓인 눈이 정확히 세 개일 때 그 칸의 족보를 판정했다. 각성이 바꾼 눈을 포함한 족보는 집계에서 제외했다. 방어 족보는 공격 이후 적이 실제로 행동하고, 최종 방어 합계가 예고 피해와 같을 때 집계했다. 룰렛은 각성 전 방어 합계를 쓰는 공개판의 규칙대로 실행했다.

## 결과

### 승률과 완주율

1전투 승률과 2전투 완주율의 분모는 각각 512번이다. 2전투 승률은 2전투에 진입한 등반을 분모로 삼았다. 완주는 두 적을 모두 이긴 등반이다.

| 안 | 봇 | 1전투 승률 | 2전투 승률 | 2전투 완주율 |
| --- | --- | --- | --- | --- |
| 해금 없음 | 대응 | 482/512 (94.14%) | 286/482 (59.34%) | 286/512 (55.86%) |
| 해금 없음 | 공격 족보 | 99/512 (19.34%) | 4/99 (4.04%) | 4/512 (0.78%) |
| 해금 없음 | 방어 족보 | 469/512 (91.60%) | 226/469 (48.19%) | 226/512 (44.14%) |
| 트리플만 | 대응 | 482/512 (94.14%) | 312/482 (64.73%) | 312/512 (60.94%) |
| 트리플만 | 공격 족보 | 99/512 (19.34%) | 4/99 (4.04%) | 4/512 (0.78%) |
| 트리플만 | 방어 족보 | 469/512 (91.60%) | 261/469 (55.65%) | 261/512 (50.98%) |
| 3연속만 | 대응 | 482/512 (94.14%) | 296/482 (61.41%) | 296/512 (57.81%) |
| 3연속만 | 공격 족보 | 99/512 (19.34%) | 3/99 (3.03%) | 3/512 (0.59%) |
| 3연속만 | 방어 족보 | 469/512 (91.60%) | 230/469 (49.04%) | 230/512 (44.92%) |
| 둘 다 | 대응 | 482/512 (94.14%) | 322/482 (66.80%) | 322/512 (62.89%) |
| 둘 다 | 공격 족보 | 99/512 (19.34%) | 3/99 (3.03%) | 3/512 (0.59%) |
| 둘 다 | 방어 족보 | 469/512 (91.60%) | 265/469 (56.50%) | 265/512 (51.76%) |

### 처음 해금한 칸과 룰렛 횟수

해금 횟수는 전투 1·2에서 등반마다 족보별 첫 해금을 한 번씩 셌다. 룰렛은 두 전투에서 실제로 돌린 횟수를 합산했다.

| 안 | 봇 | 트리플 공격 | 트리플 방어 | 3연속 공격 | 3연속 방어 | 룰렛 실행 |
| --- | --- | --- | --- | --- | --- | --- |
| 해금 없음 | 대응 | 0 | 0 | 0 | 0 | 1114 |
| 해금 없음 | 공격 족보 | 0 | 0 | 0 | 0 | 194 |
| 해금 없음 | 방어 족보 | 0 | 0 | 0 | 0 | 1339 |
| 트리플만 | 대응 | 77 | 56 | 0 | 0 | 1107 |
| 트리플만 | 공격 족보 | 174 | 0 | 0 | 0 | 196 |
| 트리플만 | 방어 족보 | 52 | 82 | 0 | 0 | 1358 |
| 3연속만 | 대응 | 0 | 0 | 179 | 88 | 1095 |
| 3연속만 | 공격 족보 | 0 | 0 | 323 | 0 | 194 |
| 3연속만 | 방어 족보 | 0 | 0 | 83 | 275 | 1350 |
| 둘 다 | 대응 | 74 | 56 | 173 | 91 | 1086 |
| 둘 다 | 공격 족보 | 176 | 0 | 328 | 0 | 198 |
| 둘 다 | 방어 족보 | 53 | 83 | 81 | 277 | 1379 |

### 두 번째 전투에 가지고 들어간 능력

전체 등반 512번을 분모로 삼았다.

| 안 | 봇 | 네 번째 주사위 | 재굴림 주사위 | 둘 다 |
| --- | --- | --- | --- | --- |
| 해금 없음 | 대응 | 0/512 (0.00%) | 0/512 (0.00%) | 0/512 (0.00%) |
| 해금 없음 | 공격 족보 | 0/512 (0.00%) | 0/512 (0.00%) | 0/512 (0.00%) |
| 해금 없음 | 방어 족보 | 0/512 (0.00%) | 0/512 (0.00%) | 0/512 (0.00%) |
| 트리플만 | 대응 | 67/512 (13.09%) | 0/512 (0.00%) | 0/512 (0.00%) |
| 트리플만 | 공격 족보 | 32/512 (6.25%) | 0/512 (0.00%) | 0/512 (0.00%) |
| 트리플만 | 방어 족보 | 74/512 (14.45%) | 0/512 (0.00%) | 0/512 (0.00%) |
| 3연속만 | 대응 | 0/512 (0.00%) | 191/512 (37.30%) | 0/512 (0.00%) |
| 3연속만 | 공격 족보 | 0/512 (0.00%) | 42/512 (8.20%) | 0/512 (0.00%) |
| 3연속만 | 방어 족보 | 0/512 (0.00%) | 234/512 (45.70%) | 0/512 (0.00%) |
| 둘 다 | 대응 | 67/512 (13.09%) | 191/512 (37.30%) | 20/512 (3.91%) |
| 둘 다 | 공격 족보 | 32/512 (6.25%) | 42/512 (8.20%) | 9/512 (1.76%) |
| 둘 다 | 방어 족보 | 74/512 (14.45%) | 234/512 (45.70%) | 32/512 (6.25%) |

2전투에 진입한 등반을 분모로 삼았다.

| 안 | 봇 | 네 번째 주사위 | 재굴림 주사위 | 둘 다 |
| --- | --- | --- | --- | --- |
| 해금 없음 | 대응 | 0/482 (0.00%) | 0/482 (0.00%) | 0/482 (0.00%) |
| 해금 없음 | 공격 족보 | 0/99 (0.00%) | 0/99 (0.00%) | 0/99 (0.00%) |
| 해금 없음 | 방어 족보 | 0/469 (0.00%) | 0/469 (0.00%) | 0/469 (0.00%) |
| 트리플만 | 대응 | 67/482 (13.90%) | 0/482 (0.00%) | 0/482 (0.00%) |
| 트리플만 | 공격 족보 | 32/99 (32.32%) | 0/99 (0.00%) | 0/99 (0.00%) |
| 트리플만 | 방어 족보 | 74/469 (15.78%) | 0/469 (0.00%) | 0/469 (0.00%) |
| 3연속만 | 대응 | 0/482 (0.00%) | 191/482 (39.63%) | 0/482 (0.00%) |
| 3연속만 | 공격 족보 | 0/99 (0.00%) | 42/99 (42.42%) | 0/99 (0.00%) |
| 3연속만 | 방어 족보 | 0/469 (0.00%) | 234/469 (49.89%) | 0/469 (0.00%) |
| 둘 다 | 대응 | 67/482 (13.90%) | 191/482 (39.63%) | 20/482 (4.15%) |
| 둘 다 | 공격 족보 | 32/99 (32.32%) | 42/99 (42.42%) | 9/99 (9.09%) |
| 둘 다 | 방어 족보 | 74/469 (15.78%) | 234/469 (49.89%) | 32/469 (6.82%) |

### 주사위 수별 방어 배치와 선택지

두 전투에서 주사위 수별로 집계했다. 네 개를 굴린 턴에도 방어 칸에 정확히 세 개를 배치하면 방어 3개로 기록했다. 선택지 수는 모든 재굴림 후 배치 직전에 셌다. 현재 턴에 생존하는 배치의 `받는 피해 / 가하는 피해` 결과 쌍에서 중복과 열등한 쌍을 뺐다. 가하는 피해에는 적의 남은 체력까지로 제한한 룰렛 피해의 기댓값이 포함된다. 관측 턴이 0이면 비율을 대시로 표시했다.

| 안 | 봇 | 3개 턴 수 | 3개 중 방어 3개 | 3개 중 선택지 0~1개 | 4개 턴 수 | 4개 중 방어 3개 | 4개 중 선택지 0~1개 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 해금 없음 | 대응 | 4987 | 2048/4987 (41.07%) | 1720/4987 (34.49%) | 0 | — | — |
| 해금 없음 | 공격 족보 | 1925 | 601/1925 (31.22%) | 482/1925 (25.04%) | 0 | — | — |
| 해금 없음 | 방어 족보 | 5224 | 2561/5224 (49.02%) | 1902/5224 (36.41%) | 0 | — | — |
| 트리플만 | 대응 | 4617 | 1886/4617 (40.85%) | 1563/4617 (33.85%) | 218 | 76/218 (34.86%) | 96/218 (44.04%) |
| 트리플만 | 공격 족보 | 1852 | 573/1852 (30.94%) | 452/1852 (24.41%) | 66 | 9/66 (13.64%) | 24/66 (36.36%) |
| 트리플만 | 방어 족보 | 4765 | 2299/4765 (48.25%) | 1697/4765 (35.61%) | 289 | 157/289 (54.33%) | 141/289 (48.79%) |
| 3연속만 | 대응 | 4930 | 1966/4930 (39.88%) | 1704/4930 (34.56%) | 0 | — | — |
| 3연속만 | 공격 족보 | 1913 | 592/1913 (30.95%) | 479/1913 (25.04%) | 0 | — | — |
| 3연속만 | 방어 족보 | 5250 | 2572/5250 (48.99%) | 1936/5250 (36.88%) | 0 | — | — |
| 둘 다 | 대응 | 4564 | 1806/4564 (39.57%) | 1546/4564 (33.87%) | 218 | 72/218 (33.03%) | 98/218 (44.95%) |
| 둘 다 | 공격 족보 | 1842 | 565/1842 (30.67%) | 449/1842 (24.38%) | 66 | 9/66 (13.64%) | 25/66 (37.88%) |
| 둘 다 | 방어 족보 | 4801 | 2321/4801 (48.34%) | 1727/4801 (35.97%) | 290 | 155/290 (53.45%) | 137/290 (47.24%) |

## 재미 판정이 필요해 보이는 수치

- 대응 봇의 완주는 해금 없음 286/512 (55.86%)에서 둘 다 322/512 (62.89%)로, 방어 족보 봇의 완주는 226/512 (44.14%)에서 265/512 (51.76%)로 집계됐다. 공격 족보 봇의 완주는 각각 4/512 (0.78%)와 3/512 (0.59%)였다.
- 둘 다 조건의 방어 족보 봇은 3개 턴 중 2321/4801 (48.34%)와 4개 턴 중 155/290 (53.45%)에서 방어 칸에 세 개를 놓았다. 방어 칸에서 처음 해금한 족보는 트리플 83회, 3연속 277회였다.
- 둘 다 조건에서 선택지 0~1개인 턴의 3개·4개 비율은 대응 봇이 1546/4564 (33.87%)와 98/218 (44.95%), 공격 족보 봇이 449/1842 (24.38%)와 25/66 (37.88%), 방어 족보 봇이 1727/4801 (35.97%)와 137/290 (47.24%)였다.

## 원 출력

### `node exp/yacht.mjs`

```jsonl
{"variant":"baseline","policy":"adaptive","seeds":512,"firstWins":482,"secondEntered":482,"secondWins":286,"incompleteFights":0,"unlocks":{"triple":{"attack":0,"guard":0},"straight":{"attack":0,"guard":0}},"secondPowers":{"fourthDie":0,"extraReroll":0,"both":0},"turns":{"3":{"total":4987,"guardThree":2048,"atMostOneChoice":1720},"4":{"total":0,"guardThree":0,"atMostOneChoice":0}},"rouletteSpins":1114}
{"variant":"baseline","policy":"attackHand","seeds":512,"firstWins":99,"secondEntered":99,"secondWins":4,"incompleteFights":0,"unlocks":{"triple":{"attack":0,"guard":0},"straight":{"attack":0,"guard":0}},"secondPowers":{"fourthDie":0,"extraReroll":0,"both":0},"turns":{"3":{"total":1925,"guardThree":601,"atMostOneChoice":482},"4":{"total":0,"guardThree":0,"atMostOneChoice":0}},"rouletteSpins":194}
{"variant":"baseline","policy":"guardHand","seeds":512,"firstWins":469,"secondEntered":469,"secondWins":226,"incompleteFights":0,"unlocks":{"triple":{"attack":0,"guard":0},"straight":{"attack":0,"guard":0}},"secondPowers":{"fourthDie":0,"extraReroll":0,"both":0},"turns":{"3":{"total":5224,"guardThree":2561,"atMostOneChoice":1902},"4":{"total":0,"guardThree":0,"atMostOneChoice":0}},"rouletteSpins":1339}
{"variant":"triple","policy":"adaptive","seeds":512,"firstWins":482,"secondEntered":482,"secondWins":312,"incompleteFights":0,"unlocks":{"triple":{"attack":77,"guard":56},"straight":{"attack":0,"guard":0}},"secondPowers":{"fourthDie":67,"extraReroll":0,"both":0},"turns":{"3":{"total":4617,"guardThree":1886,"atMostOneChoice":1563},"4":{"total":218,"guardThree":76,"atMostOneChoice":96}},"rouletteSpins":1107}
{"variant":"triple","policy":"attackHand","seeds":512,"firstWins":99,"secondEntered":99,"secondWins":4,"incompleteFights":0,"unlocks":{"triple":{"attack":174,"guard":0},"straight":{"attack":0,"guard":0}},"secondPowers":{"fourthDie":32,"extraReroll":0,"both":0},"turns":{"3":{"total":1852,"guardThree":573,"atMostOneChoice":452},"4":{"total":66,"guardThree":9,"atMostOneChoice":24}},"rouletteSpins":196}
{"variant":"triple","policy":"guardHand","seeds":512,"firstWins":469,"secondEntered":469,"secondWins":261,"incompleteFights":0,"unlocks":{"triple":{"attack":52,"guard":82},"straight":{"attack":0,"guard":0}},"secondPowers":{"fourthDie":74,"extraReroll":0,"both":0},"turns":{"3":{"total":4765,"guardThree":2299,"atMostOneChoice":1697},"4":{"total":289,"guardThree":157,"atMostOneChoice":141}},"rouletteSpins":1358}
{"variant":"straight","policy":"adaptive","seeds":512,"firstWins":482,"secondEntered":482,"secondWins":296,"incompleteFights":0,"unlocks":{"triple":{"attack":0,"guard":0},"straight":{"attack":179,"guard":88}},"secondPowers":{"fourthDie":0,"extraReroll":191,"both":0},"turns":{"3":{"total":4930,"guardThree":1966,"atMostOneChoice":1704},"4":{"total":0,"guardThree":0,"atMostOneChoice":0}},"rouletteSpins":1095}
{"variant":"straight","policy":"attackHand","seeds":512,"firstWins":99,"secondEntered":99,"secondWins":3,"incompleteFights":0,"unlocks":{"triple":{"attack":0,"guard":0},"straight":{"attack":323,"guard":0}},"secondPowers":{"fourthDie":0,"extraReroll":42,"both":0},"turns":{"3":{"total":1913,"guardThree":592,"atMostOneChoice":479},"4":{"total":0,"guardThree":0,"atMostOneChoice":0}},"rouletteSpins":194}
{"variant":"straight","policy":"guardHand","seeds":512,"firstWins":469,"secondEntered":469,"secondWins":230,"incompleteFights":0,"unlocks":{"triple":{"attack":0,"guard":0},"straight":{"attack":83,"guard":275}},"secondPowers":{"fourthDie":0,"extraReroll":234,"both":0},"turns":{"3":{"total":5250,"guardThree":2572,"atMostOneChoice":1936},"4":{"total":0,"guardThree":0,"atMostOneChoice":0}},"rouletteSpins":1350}
{"variant":"both","policy":"adaptive","seeds":512,"firstWins":482,"secondEntered":482,"secondWins":322,"incompleteFights":0,"unlocks":{"triple":{"attack":74,"guard":56},"straight":{"attack":173,"guard":91}},"secondPowers":{"fourthDie":67,"extraReroll":191,"both":20},"turns":{"3":{"total":4564,"guardThree":1806,"atMostOneChoice":1546},"4":{"total":218,"guardThree":72,"atMostOneChoice":98}},"rouletteSpins":1086}
{"variant":"both","policy":"attackHand","seeds":512,"firstWins":99,"secondEntered":99,"secondWins":3,"incompleteFights":0,"unlocks":{"triple":{"attack":176,"guard":0},"straight":{"attack":328,"guard":0}},"secondPowers":{"fourthDie":32,"extraReroll":42,"both":9},"turns":{"3":{"total":1842,"guardThree":565,"atMostOneChoice":449},"4":{"total":66,"guardThree":9,"atMostOneChoice":25}},"rouletteSpins":198}
{"variant":"both","policy":"guardHand","seeds":512,"firstWins":469,"secondEntered":469,"secondWins":265,"incompleteFights":0,"unlocks":{"triple":{"attack":53,"guard":83},"straight":{"attack":81,"guard":277}},"secondPowers":{"fourthDie":74,"extraReroll":234,"both":32},"turns":{"3":{"total":4801,"guardThree":2321,"atMostOneChoice":1727},"4":{"total":290,"guardThree":155,"atMostOneChoice":137}},"rouletteSpins":1379}
```

### `npm test`

```text
> hwigi-tower-remake@0.1.0 test
> node --test

✔ a seed gives the same three opening dice and full battle twice (25.8492ms)
✔ a die belongs to only one slot and turn cannot end with dice left over (0.2434ms)
✔ a once-per-turn reroll keeps the new die even when it is worse (0.6444ms)
✔ a batch reroll changes only selected dice and consumes one chance (0.3194ms)
✔ a heavy blow deals only the unguarded amount (0.3207ms)
✔ an exact single block enables precisely one roulette reward (0.1949ms)
✔ excess guard blocks the hit without bonus damage or roulette (0.1975ms)
✔ combo shares a shield across all hits and rewards only an exact total (0.2344ms)
✔ only the top two roulette slots award a joint attack with Mataios (2.2475ms)
✔ a finishing attack ends the turn before the enemy hits (0.3228ms)
✔ awakening checks crisis and can happen once per battle (0.9149ms)
✔ awakening finishes an enemy with 4 or 6 HP using a guard, guard, attack plan (0.4447ms)
✔ awakening minimizes incoming damage when the enemy cannot be finished (0.2207ms)
✔ an exact block before awakening still opens the roulette after guard increases (0.6241ms)
✔ an exact block created by awakening does not open the roulette (0.2808ms)
✔ a finishing attack after awakening skips an earned roulette (0.2625ms)
✔ three guards unlock a triple only on an exact block (3.0451ms)
✔ a finishing attack skips the three guards and the roulette (0.3268ms)
✔ awakening substitutions earn no hand, while unchanged faces can still qualify (0.4555ms)
✔ three-straight sorts faces, rejects duplicates and does not wrap around (0.2411ms)
✔ the extra reroll requires a basic reroll that turn and is spent once per fight (0.4266ms)
✔ a fourth die survives turn transitions and can use the base reroll (0.306ms)
✔ attack and guard bots keep matching pairs and guard falls back on an unreachable target (0.7595ms)
✔ the adaptive first fight matches the original bot on seeds 0 through 511 (99.4673ms)
✔ unlocks activate in fight two with carried HP and each unlock is recorded once (10.8669ms)
ℹ tests 25
ℹ suites 0
ℹ pass 25
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 364.0732
```

### `npm run build`

```text
> hwigi-tower-remake@0.1.0 build
> tsc --noEmit && vite build --base=./

vite v7.3.8 building client environment for production...
transforming...
✓ 11 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                     3.13 kB │ gzip:   1.13 kB
dist/assets/index-CaB74-K7.css      4.15 kB │ gzip:   1.50 kB
dist/assets/index-BNIIGW9d.js   1,221.03 kB │ gzip: 337.63 kB

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 7.32s
```

진행 기록 · 해금 두 종과 봇 정책 세 종을 구현하고, 시드 512개로 12개 조합의 실험과 시험·빌드 검증을 완료했다.
