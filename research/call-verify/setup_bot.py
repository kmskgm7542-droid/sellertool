"""텔레그램 봇 연결 설정 — 토큰과 받을 사람(chat_id)을 저장하고 시험 메시지를 보낸다.
navi-ev-trading 에서 쓰던 봇(BotFather 토큰)을 그대로 쓰면 된다. chat_id 기본값은 대표 계정.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from notify import send_text  # noqa: E402

DATA = Path(__file__).resolve().parent / "data"
CFG = DATA / "tg_bot.json"
DATA.mkdir(exist_ok=True)

old = json.loads(CFG.read_text("utf-8")) if CFG.exists() else {}
print("BotFather 에서 받은 봇 토큰을 붙여넣으세요 (예: 123456789:AAxxxx...). 붙여넣기는 마우스 오른쪽 클릭.")
token = input(f"봇 토큰{' [Enter=기존 유지]' if old.get('token') else ''}: ").strip() or old.get("token", "")
chat = input(f"받을 사람 chat_id [Enter={old.get('chat_id', '929205656')}]: ").strip() or str(old.get("chat_id", "929205656"))
if not token:
    print("토큰이 없습니다.")
    sys.exit(1)
c = {"token": token, "chat_id": chat}
CFG.write_text(json.dumps(c, indent=1), "utf-8")
try:
    ok = send_text(c, "✅ 콜 검증 봇 연결 확인 — 매주 일요일 밤 성적표가 이 채팅으로 옵니다.")
    print("시험 메시지 전송:", "성공" if ok else "실패")
except Exception as exc:
    print(f"✖ 전송 실패: {exc}")
    print("토큰이 틀렸거나, 대표님이 그 봇에게 먼저 아무 메시지나 보낸 적이 없으면 실패합니다(봇은 먼저 말 걸 수 없음).")
    sys.exit(1)
