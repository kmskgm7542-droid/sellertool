"""유튜브 로그인 상태 확인 — 풀렸으면 텔레그램으로 하루 한 번만 알린다(멤버십 방송·게시판은 로그인이 끊기면 조용히 비게 된다).
  yt_live.py / yt_posts.py 가 페이지를 연 직후 호출한다.
"""
import json
import subprocess
import sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent

# 상단 바에 계정 아바타가 있으면 로그인, '로그인' 버튼(ServiceLogin 링크)만 있으면 풀린 것
JS_LOGGED_IN = r"""
() => {
  const avatar = document.querySelector('ytd-masthead #avatar-btn, ytd-masthead #avatar, ytd-topbar-menu-button-renderer #avatar-btn');
  const signin = document.querySelector('ytd-masthead a[href*="ServiceLogin"], ytd-masthead a[aria-label="로그인"], ytd-masthead a[aria-label="Sign in"]');
  if (avatar) return 'in';
  if (signin) return 'out';
  return 'unknown';
}
"""


async def login_state(page):
    """'in' | 'out' | 'unknown' (화면 구조를 못 읽으면 unknown — 알리지 않는다)"""
    try:
        return await page.evaluate(JS_LOGGED_IN)
    except Exception:
        return "unknown"


def alert_login_lost(data_dir: Path, where: str):
    """오늘 처음이면 텔레그램으로 알린다. 봇이 없으면 화면에만."""
    msg = (f"⚠ 유튜브 로그인이 풀렸습니다({where}). 멤버십 방송·게시판을 읽지 못합니다.\n"
           "PC에서 yt_posts.bat 을 한 번 실행해 브라우저 창에서 다시 로그인하고 Enter 를 누르세요.")
    print(msg)
    marker = data_dir / "yt_login_alert.json"
    today = date.today().isoformat()
    try:
        if marker.exists() and json.loads(marker.read_text("utf-8")).get("date") == today:
            return
    except Exception:
        pass
    if (data_dir / "tg_bot.json").exists():
        try:
            subprocess.run([sys.executable, str(HERE / "notify.py"), msg], timeout=60)
            marker.write_text(json.dumps({"date": today, "where": where}), "utf-8")
        except Exception as exc:
            print(f"  (알림 전송 실패: {type(exc).__name__})")


async def check_and_alert(page, data_dir: Path, where: str) -> bool:
    """로그인돼 있으면 True. 풀렸으면 알리고 False."""
    st = await login_state(page)
    if st == "out":
        alert_login_lost(data_dir, where)
        return False
    return True
