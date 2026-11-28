# 검사 원본

104 × 60 투명 픽셀, 오른쪽을 보는 검사. 모든 포즈의 발 기준은 왼쪽 위에서 (36, 57)이다. 원본 크기의 정수 배율과 최근접 보간을 사용한다.

- `hero.aseprite`에는 13개 전투 키(`idle`, `idle-breathe`, `guard-lift`, `guard`, `guard-brace`, `attack-prepare`, `step`, `attack`, `attack-follow`, `hit`, `recover`, `fall`, `down`)와 8개 레이어가 있다. 무기는 Sword 레이어에 있고 Fingers가 손잡이 위를 덮는다. 각 키는 `public/art/hero-<키>.png`와 픽셀 단위로 같다.
- 무기를 교체할 때는 `hero.json`의 각 프레임 grip에 손잡이 중심을, tip에 칼끝을 맞춘다. guard는 칼의 가드 위치다. PNG를 개별 교체해도 피벗을 바꾸지 않는다. `hero-atlas.png`는 5열 고정 셀 미리보기 시트다.
- 중단·하단 방어(`guard-middle`, `guard-low`)는 `../hero-guards/`의 파츠를 Rear arm → Mantle → Legs → Coat → Head → Sword → Sword arm → Fingers 순으로 합성한다. 재생성은 `node art-source/hero-guards/draw.cjs`.
- 공격자가 닿는 검사 픽셀은 `src/hero-contact-rows.json`에 있다. 그림을 바꾸면 이 행들이 여전히 칠해진 픽셀인지 `python scripts/verify_art.py`로 확인한다.
- 하체와 발 디딤의 원본은 LuizMelo의 Hero Knight(CC0)다. 원작의 하체 픽셀을 포즈에 맞춰 편집하고 채색했으며 상체, 머리, 망토, 팔, 손과 검을 회귀탑용으로 그렸다. 원문: `licenses/Hero-Knight.txt`, https://luizmelo.itch.io/hero-knight
