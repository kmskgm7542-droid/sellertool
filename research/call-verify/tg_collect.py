"""
텔레그램 채널 수집기 — 대표 본인 계정으로 로그인해 구독 중인 알림 채널의 글을 내려받는다.

  실행: tg_collect.bat (또는 python tg_collect.py)
  1회 준비: https://my.telegram.org → API development tools → api_id / api_hash 발급
  첫 실행: 전화번호 + 텔레그램으로 오는 인증코드 입력 (한 번만, 이후 data/tg_session 재사용)
  결과: data/result.json — 텔레그램 데스크톱 내보내기와 같은 형식 (+ channel 필드)
        → run.mjs parse data/result.json 로 바로 이어진다

  data/ 폴더는 .gitignore 대상. 로그인 세션·콜 원문은 이 PC 밖으로 나가지 않는다.
  본인 검증용. 재배포·상품화 금지.
"""
import asyncio
import json
import sys
from pathlib import Path

try:
    from telethon import TelegramClient
except ImportError:
    print("telethon 이 없습니다. tg_collect.bat 으로 실행하거나: python -m pip install telethon")
    sys.exit(1)

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
CFG = DATA / "tg_config.json"
STATE = DATA / "tg_state.json"
OUT = DATA / "result.json"


def load(p, default):
    return json.loads(p.read_text("utf-8")) if p.exists() else default


def save(p, obj):
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=1), "utf-8")


def ask(prompt):
    return input(prompt).strip()


async def pick_channels(client, cfg):
    """설정에 채널이 없으면 목록을 보여주고 번호로 고르게 한다."""
    dialogs = [d for d in await client.get_dialogs() if d.is_channel or d.is_group]
    wanted = cfg.get("channels") or []
    chosen = []
    if wanted:
        for d in dialogs:
            if any(w in (d.name or "") for w in wanted):
                chosen.append(d)
        missing = [w for w in wanted if not any(w in (d.name or "") for d in chosen)]
        for w in missing:
            print(f"⚠ '{w}' 채널을 찾지 못했습니다. 아래 목록에서 다시 고르세요.")
    if not chosen or len(chosen) < len(wanted):
        print("\n=== 참여 중인 채널/그룹 ===")
        for i, d in enumerate(dialogs, 1):
            print(f"{i:3d}. {d.name}")
        nums = ask("\n수집할 채널 번호를 쉼표로 입력 (예: 3,7): ")
        chosen = [dialogs[int(n) - 1] for n in nums.split(",") if n.strip().isdigit()]
        cfg["channels"] = [d.name for d in chosen]
        save(CFG, cfg)
    return chosen


async def main():
    DATA.mkdir(exist_ok=True)
    cfg = load(CFG, {})
    if not cfg.get("api_id") or not cfg.get("api_hash"):
        print("my.telegram.org 에서 발급한 값을 입력하세요 (한 번만 묻습니다). 붙여넣기는 마우스 오른쪽 클릭.")
        while True:
            v = ask("api_id (숫자): ")
            if v.isdigit():
                cfg["api_id"] = int(v)
                break
            print("  숫자만 입력하세요.")
        while True:
            v = ask("api_hash (영문+숫자 32자): ")
            if len(v) == 32:
                cfg["api_hash"] = v
                break
            print(f"  길이가 {len(v)}자입니다. 32자를 정확히 붙여넣으세요.")
        save(CFG, cfg)

    client = TelegramClient(str(DATA / "tg_session"), cfg["api_id"], cfg["api_hash"])
    await client.start(  # 첫 실행 시 전화번호·인증코드(·2단계 비밀번호) 입력
        phone=lambda: ask("텔레그램 전화번호 (예: +821012345678): "),
        code_callback=lambda: ask("텔레그램 앱으로 온 인증코드: "),
        password=lambda: ask("2단계 인증 비밀번호 (설정한 경우만): "),
    )
    me = await client.get_me()
    print(f"로그인: {me.first_name or ''} ({me.phone})")

    channels = await pick_channels(client, cfg)
    state = load(STATE, {})
    if not state.get("v2"):  # 사진·링크 알림도 받도록 바뀐 뒤 첫 실행이면 처음부터 다시 받는다
        state = {"v2": True}
    existing = load(OUT, {"messages": []})
    by_key = {(m.get("channel"), m["id"]): m for m in existing["messages"]}

    def flush():
        msgs = sorted(by_key.values(), key=lambda m: (m["date_unixtime"], m["id"]))
        save(OUT, {"name": "call-verify", "messages": msgs})
        save(STATE, state)
        return len(msgs)

    total_new = 0
    for ch in channels:
        key = str(ch.id)
        min_id = int(state.get(key, 0))
        n = 0
        print(f"{ch.name}: 수집 중...")
        async for m in client.iter_messages(ch.entity, min_id=min_id, reverse=True):
            if n and n % 100 == 0:
                print(f"  {n}건...", end="\r")
                flush()  # 중간에 끊겨도 여기까지는 남는다
            text = m.message or ""
            urls = []
            for ent, val in (m.get_entities_text() or []):
                u = getattr(ent, "url", None) or val
                if isinstance(u, str) and u.startswith("http"):
                    urls.append(u)
            wp = getattr(getattr(m, "web_preview", None), "url", None)
            if wp:
                urls.append(wp)
            has_media = bool(m.photo or m.document)
            if not text and not urls and not has_media:
                continue
            media_path = ""
            if m.photo:  # 사진 알림(캡처 공지)은 나중에 글자 추출(OCR)용으로 로컬에만 저장
                mdir = DATA / "tg_media"
                mdir.mkdir(exist_ok=True)
                try:
                    media_path = str(await m.download_media(file=str(mdir / f"{ch.id}_{m.id}")))
                except Exception as exc:  # 사진 하나 실패해도 수집은 계속
                    print(f"  사진 저장 실패 {m.id}: {exc}")
            by_key[(ch.name, m.id)] = {
                "type": "message",
                "id": m.id,
                "date": m.date.isoformat(),
                "date_unixtime": int(m.date.timestamp()),
                "channel": ch.name,
                "text": text,
                "urls": sorted(set(urls)),
                "has_media": has_media,
                "media": Path(media_path).name if media_path else "",
            }
            state[key] = max(int(state.get(key, 0)), m.id)
            n += 1
        total_new += n
        total = flush()
        print(f"{ch.name}: 새 글 {n}건 (저장됨)")

    print(f"\n합계 {total}건 (신규 {total_new}) → {OUT}")
    print("다음: 이 result.json 을 김이사에게 업로드하거나, node run.mjs parse data/result.json")
    await client.disconnect()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("중단")
    except Exception as exc:
        print(f"\n✖ 오류: {type(exc).__name__}: {exc}")
        print("이 창을 캡처해서 김이사에게 보내주세요. (지금까지 받은 글은 data/result.json 에 저장돼 있습니다)")
