# 전투 조작부의 이미지 원본

세 장 모두 이 작업을 위해 ImageGen으로 제작한 투명 PNG다. 주사위와 룰렛은 이번 전투용으로 제작했고, 구리판은 앞서 같은 게임의 쉼터용으로 제작한 원화를 재사용했다. 주사위 눈, 룰렛 숫자, 행동 이름을 원화에 넣지 않아 게임 상태와 번역에 맞춰 바꿀 수 있다. 세 원본의 제작 지시는 `art-direction.txt`에 있다.

| 원본 | 배포 이미지 | 본편에서 쓰는 곳 |
| --- | --- | --- |
| dice-source.png | bone.png, ego.png, socket.png | 일반·에고 주사위, 빈 자리, 선택·이동 상태 |
| wheel-source.png | rim.png, hub.png, pointer.png | 정확 방어 뒤 반격 룰렛의 테두리·축·바늘 |
| copper-source.png | turn-button.png | 턴 끝내기, 룰렛 돌리기·멈추기의 기본·눌림·사용 불가 |
| dice-source.png | slot-frame.png, slot-filled.png, stolen-socket.png | 공격·방어 바깥 패널과 빼앗긴 주사위 자리 |
| copper-source.png | reroll.png, reroll-pressed.png, reroll-disabled.png | 두 재굴림 버튼의 기본·눌림·사용 불가 |

Pillow가 있는 Python으로 저장소 루트에서 `python art-source/combat-controls/export.py`를 실행하면 배포 이미지를 `public/art/ui/combat-controls/`에 내보낸다. 공격·방어 패널과 재굴림의 테두리는 모서리 크기를 유지하며 늘어난다. 입력 영역과 한글, 눈과 합계, 룰렛 각 구간 및 회전은 게임이 관리한다. 여섯 조작 기호는 본편에 있던 PNG를 재사용한다.
