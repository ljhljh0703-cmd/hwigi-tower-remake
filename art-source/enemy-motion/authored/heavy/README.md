# 돌벽 보초 · 창살의 죄수 제작 도구

`../upper-shield.aseprite`, `../upper-boss.aseprite`, `../upper-boss-special.aseprite`가 편집 원본이다. 게임 PNG는 `node scripts/compile-enemy-motion-art.mjs <sharp 모듈 경로>`로 다시 내보낸다.

`make.py`는 처음 제작할 때 `reference/`의 운영 시트에서 새 원화를 만든 기록이다. 실행하면 이 폴더 아래에 산출물을 쓰므로 게임 파일을 덮어쓰지 않는다. `checks.json`은 프레임별 경계·접지·변경 픽셀, `manifest-fields.json`은 매니페스트의 `alphaPixels`·`drawing` 값이다. 공격점 8개(보초 3, 죄수 3, 특수 2)는 모두 무기 레이어에 칠해져 있다.
