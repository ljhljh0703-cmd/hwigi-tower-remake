# W7 적의 수 정의 표

`src/combat.ts`의 `ENEMY_INTENTS`에서 한 줄에 식별자, 화면에 표시할 이름, 타격 목록, 등장 조건(`matches`)을 정의한다.
새 수는 조건이 겹치는 기존 줄 앞에 넣는다. 위에서부터 처음 일치하는 줄을 사용한다.
`enemyAttackBuff`는 0에서 시작하고 각 타격의 기본 피해에 더해진다.

## 검증

기존 시험 16개와 새 시험 3개가 통과했다. `npm run build`도 통과했으며, Vite가 번들 크기 경고를 표시했다.
기준과 수정 후의 3,072경기에서 전투 상태 38,912개를 비교했다. 기존 상태 필드와 적 행동 및 교환 결과 문구가 모두 일치했다.

## `npm run bot` 전후 원 출력

표준 출력 1,266바이트가 일치했다. SHA-256은 `f3406e44431762fd4a5dfc9e419d712cee9d450b65fed9d5243593e09a59e416`이다.

<table>
<thead><tr><th>수정 전 · 99a14e5</th><th>수정 후 · exp/enemy-intents</th></tr></thead>
<tbody>
<tr>
<td>

<pre>

> hwigi-tower-remake@0.1.0 bot
> node scripts/bot.mjs

{"policy":"allAttack","seeds":512,"wins":28,"losses":484,"incomplete":0,"awakened":55,"winsWithAwakening":19,"rouletteSpins":0,"meanTurns":2,"turnsWithSeveralTradeoffs":1012,"turnsObserved":1024}
{"policy":"allGuard","seeds":512,"wins":2,"losses":510,"incomplete":0,"awakened":136,"winsWithAwakening":1,"rouletteSpins":651,"meanTurns":11.55,"turnsWithSeveralTradeoffs":4688,"turnsObserved":5915}
{"policy":"balanced","seeds":512,"wins":25,"losses":487,"incomplete":0,"awakened":61,"winsWithAwakening":11,"rouletteSpins":55,"meanTurns":4.95,"turnsWithSeveralTradeoffs":1960,"turnsObserved":2533}
{"policy":"neverReroll","seeds":512,"wins":214,"losses":298,"incomplete":0,"awakened":70,"winsWithAwakening":35,"rouletteSpins":399,"meanTurns":5.19,"turnsWithSeveralTradeoffs":1849,"turnsObserved":2659}
{"policy":"alwaysReroll","seeds":512,"wins":214,"losses":298,"incomplete":0,"awakened":83,"winsWithAwakening":38,"rouletteSpins":382,"meanTurns":5.13,"turnsWithSeveralTradeoffs":1842,"turnsObserved":2629}
{"policy":"adaptAndReroll","seeds":512,"wins":482,"losses":30,"incomplete":0,"awakened":26,"winsWithAwakening":24,"rouletteSpins":421,"meanTurns":4.31,"turnsWithSeveralTradeoffs":1614,"turnsObserved":2206}
</pre>

</td>
<td>

<pre>

> hwigi-tower-remake@0.1.0 bot
> node scripts/bot.mjs

{"policy":"allAttack","seeds":512,"wins":28,"losses":484,"incomplete":0,"awakened":55,"winsWithAwakening":19,"rouletteSpins":0,"meanTurns":2,"turnsWithSeveralTradeoffs":1012,"turnsObserved":1024}
{"policy":"allGuard","seeds":512,"wins":2,"losses":510,"incomplete":0,"awakened":136,"winsWithAwakening":1,"rouletteSpins":651,"meanTurns":11.55,"turnsWithSeveralTradeoffs":4688,"turnsObserved":5915}
{"policy":"balanced","seeds":512,"wins":25,"losses":487,"incomplete":0,"awakened":61,"winsWithAwakening":11,"rouletteSpins":55,"meanTurns":4.95,"turnsWithSeveralTradeoffs":1960,"turnsObserved":2533}
{"policy":"neverReroll","seeds":512,"wins":214,"losses":298,"incomplete":0,"awakened":70,"winsWithAwakening":35,"rouletteSpins":399,"meanTurns":5.19,"turnsWithSeveralTradeoffs":1849,"turnsObserved":2659}
{"policy":"alwaysReroll","seeds":512,"wins":214,"losses":298,"incomplete":0,"awakened":83,"winsWithAwakening":38,"rouletteSpins":382,"meanTurns":5.13,"turnsWithSeveralTradeoffs":1842,"turnsObserved":2629}
{"policy":"adaptAndReroll","seeds":512,"wins":482,"losses":30,"incomplete":0,"awakened":26,"winsWithAwakening":24,"rouletteSpins":421,"meanTurns":4.31,"turnsWithSeveralTradeoffs":1614,"turnsObserved":2206}
</pre>

</td>
</tr>
</tbody>
</table>

## `npm test` 원 출력

```text

> hwigi-tower-remake@0.1.0 test
> node --test

✔ a seed gives the same three opening dice and full battle twice (36.7471ms)
✔ a die belongs to only one slot and turn cannot end with dice left over (0.2277ms)
✔ a once-per-turn reroll keeps the new die even when it is worse (0.3328ms)
✔ a batch reroll changes only selected dice and consumes one chance (0.275ms)
✔ a heavy blow deals only the unguarded amount (0.2736ms)
✔ an exact single block enables precisely one roulette reward (0.2085ms)
✔ excess guard blocks the hit without bonus damage or roulette (0.2008ms)
✔ combo shares a shield across all hits and rewards only an exact total (0.2008ms)
✔ only the top two roulette slots award a joint attack with Mataios (1.9289ms)
✔ a finishing attack ends the turn before the enemy hits (0.3537ms)
✔ awakening checks crisis and can happen once per battle (1.3124ms)
✔ awakening finishes an enemy with 4 or 6 HP using a guard, guard, attack plan (0.664ms)
✔ awakening minimizes incoming damage when the enemy cannot be finished (0.2992ms)
✔ an exact block before awakening still opens the roulette after guard increases (0.2968ms)
✔ an exact block created by awakening does not open the roulette (0.3239ms)
✔ a finishing attack after awakening skips an earned roulette (0.8134ms)
✔ a zero enemy attack buff keeps the original odd and even turn attacks (0.2469ms)
✔ a +1 enemy attack buff adds one damage to every hit (0.2644ms)
✔ an additional enemy intent row plays in its matching turn (0.2546ms)
ℹ tests 19
ℹ suites 0
ℹ pass 19
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 265.616
```
