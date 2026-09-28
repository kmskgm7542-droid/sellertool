"""Claude API 키를 data/anthropic.json 에 저장하고 아주 짧은 요청으로 확인한다. 키는 data/ 밖으로 나가지 않는다."""
import json
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data"
CFG = DATA / "anthropic.json"
DATA.mkdir(exist_ok=True)

old = json.loads(CFG.read_text("utf-8")) if CFG.exists() else {}
print("console.anthropic.com → API Keys → Create Key 로 만든 키를 붙여넣으세요 (sk-ant-... 로 시작). 붙여넣기는 마우스 오른쪽 클릭.")
key = input(f"API 키{' [Enter=기존 유지]' if old.get('api_key') else ''}: ").strip() or old.get("api_key", "")
if not key.startswith("sk-ant-"):
    print("키 형식이 아닙니다(sk-ant- 로 시작해야 함).")
    sys.exit(1)
CFG.write_text(json.dumps({"api_key": key}, indent=1), "utf-8")
try:
    import anthropic
    client = anthropic.Anthropic(api_key=key)
    r = client.messages.create(model="claude-opus-5", max_tokens=16, messages=[{"role": "user", "content": "확인. '연결 성공' 이라고만 답해."}])
    print("확인 응답:", next((b.text for b in r.content if b.type == "text"), "").strip())
    print("✅ 키 저장·확인 완료. 이제 daily_run 이 방송 자막에서 타점을 자동으로 뽑습니다.")
except ImportError:
    print("anthropic 패키지가 없습니다. setup_ai.bat 으로 실행하세요.")
    sys.exit(1)
except anthropic.AuthenticationError:
    print("✖ 키가 틀렸거나 비활성입니다.")
    sys.exit(1)
except anthropic.PermissionDeniedError as exc:
    print(f"✖ 권한/결제 문제: {exc.message}. console.anthropic.com → Billing 에서 크레딧을 충전하세요.")
    sys.exit(1)
except Exception as exc:
    print(f"✖ 확인 실패: {type(exc).__name__}: {exc}")
    sys.exit(1)
