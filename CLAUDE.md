@AGENTS.md

## ⚠️ 브랜치·배포 규칙 — 수정사항 덮어쓰기 방지 (2026-11-12)

여러 세션(자동매매 폰·자산증식 폰·PC)이 이 저장소를 함께 쓴다. 아래를 어기면 **최신 수정이 옛 코드로 덮어써진다.**

1. **세션 시작 시 먼저 최신화.** `git fetch origin` 후 작업할 브랜치를 `git pull` 한다. 새 세션은 기본 브랜치(master)에서 열리므로, 아래 2번을 확인하기 전에는 파일을 고치지 않는다.
2. **call-verify(`research/call-verify/`)는 항상 `claude/automated-trading-ecg8p6` 브랜치에서 이어서 작업한다.**
   `git checkout claude/automated-trading-ecg8p6 && git pull origin claude/automated-trading-ecg8p6`
   master 나 새로 만든 브랜치에서 call-verify 를 고치지 않는다.
3. **작업 단위가 끝나면 PR 로 master 에 병합한다.** master 가 늘 최신이어야 다음 세션이 옛 코드에서 시작하지 않는다. 충돌이 나면 한쪽으로 덮지 말고 대표에게 확인한다.
4. **사업 문서·sellertool 웹 작업은 master 기준**으로 하고, `research/call-verify/` 파일은 건드리지 않는다.
5. **이력을 덮는 명령 금지:** `git push --force`, `git reset --hard origin/...`, 다른 브랜치 파일을 통째로 checkout 해서 덮기.
6. **대표 PC 배포:** zip 을 풀어 덮어쓰게 하지 말 것. PC 에서는 `D:\Projects\_tools\call_verify_update.bat`(안전 업데이트: 최신 브랜치 자동 선택·업데이트 전 백업·PC에서 고친 파일 보호)로 받는다. PC 실행 폴더는 `D:\Projects\call-verify`, `data/` 는 PC 에만 있고 레포에는 없다.
