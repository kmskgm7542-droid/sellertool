"""화면에 찍히는 내용을 data/<이름>_run.log 에도 그대로 남긴다 (창이 닫혀도 원인을 볼 수 있게)."""
import sys
import traceback
from datetime import datetime
from pathlib import Path


class _Tee:
    def __init__(self, stream, fh):
        self.stream = stream
        self.fh = fh

    def write(self, s):
        self.stream.write(s)
        self.fh.write(s)
        self.fh.flush()

    def flush(self):
        self.stream.flush()
        self.fh.flush()

    def __getattr__(self, name):
        return getattr(self.stream, name)


def start(name, data_dir):
    data_dir.mkdir(exist_ok=True)
    fh = open(data_dir / f"{name}_run.log", "a", encoding="utf-8")
    fh.write(f"\n===== {datetime.now():%Y-%m-%d %H:%M:%S} 시작 (python {sys.version.split()[0]}) =====\n")
    sys.stdout = _Tee(sys.stdout, fh)
    sys.stderr = _Tee(sys.stderr, fh)

    def hook(t, v, tb):
        print("\n✖ 오류: " + "".join(traceback.format_exception(t, v, tb)))
        print("이 창을 캡처하거나 data 폴더의 _run.log 파일을 김이사에게 보내주세요.")

    sys.excepthook = hook
    return fh
