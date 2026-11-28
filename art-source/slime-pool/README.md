# 슬라임 웅덩이 원본

- `slime-pool.aseprite`에는 수정한 17개 키 포즈가 10개 레이어로 들어 있다. `original.aseprite`는 처음 선택한 픽셀 그림이다.
- Spine 4.2에서 Import Data로 `slime-pool.json`을 불러오고 `images/`를 유지한다. `skull`은 두개골 높이와 회전을, 앞쪽 `skull-film` 슬롯은 수면의 가림을 담당한다. `basin`은 접지점에, `lash-0`–`lash-5`는 줄기다.
- 게임 셀은 104 × 48, 바닥 기준 (73, 41)이다. 왼쪽 24픽셀은 길어진 줄기를 위한 공간이다. 기준 포즈의 끝 픽셀은 (14, 15)이다.
- `attack`의 0.132–0.223초에 해골이 가장 깊이 잠기고, 0.320초에 `strike` 이벤트, 0.370초까지 접촉 자세다. 실제 재생은 전투의 타격·방어 이벤트에 동기화된다(`src/arena.ts`).

## 다시 내보내기

이 폴더에서 Spine JSON, 아틀라스, 개별 PNG를 교체한 뒤 실행한다.

```sh
npm install --no-save @esotericsoftware/spine-core@4.2.70
python -m pip install Pillow numpy
node tools/sample.mjs
python tools/rasterize.py
```

`rebuilt/`의 결과를 아래 경로로 복사한다. 피벗이나 접촉 키를 고쳤다면 `src/pool-format.json`과 전투 타이밍도 맞추고 `python scripts/verify_art.py`를 다시 실행한다.

| rebuilt 파일 | 게임 경로 |
| --- | --- |
| pool-clips.json | `src/pool-clips.json` |
| slime-pool-motion.png | `public/art/motion/slime-pool-rig.png` |
| slime-pool-layers.png, slime-pool.png | `public/art/motion/` |
| slime-pool-idle.png | `public/art/` |
