# 콜 검증 예약작업 한 번에 등록(대표 PC) — 실행: schedule_all.bat 더블클릭 (이 폴더 기준 경로로 등록, 옛 경로 사용 안 함)
#  - 놓친 실행 보충: PC 가 꺼져 있거나 절전이라 시각을 놓치면 켜질 때 바로 실행(StartWhenAvailable), 정시에 절전에서 깨움(WakeToRun)
#  - 같은 작업이 겹치면 새로 시작하지 않음, 최대 3시간
#  - 로그온한 상태에서만 실행(브라우저 로그인 정보가 이 사용자 계정에 묶여 있어 다른 방식으로 돌면 로그인이 풀린 것처럼 보인다)
#  - CallVerifyUpdate: 매일 18:10 최신 코드 받기(auto_update.bat → D:\Projects\_tools\call_verify_update.bat, 결과 data\update.log)
$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$user = "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
function Settings([bool]$catchUp) {
  $p = @{ AllowStartIfOnBatteries = $true; DontStopIfGoingOnBatteries = $true; WakeToRun = $true;
          MultipleInstances = 'IgnoreNew'; ExecutionTimeLimit = (New-TimeSpan -Hours 3) }
  if ($catchUp) { $p.StartWhenAvailable = $true }
  New-ScheduledTaskSettingsSet @p
}
function Reg($name, $bat, $arg, $trigger, [bool]$catchUp) {
  $a = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument ("/c `"`"$dir\$bat`" $arg`"") -WorkingDirectory $dir
  Register-ScheduledTask -TaskName $name -Action $a -Trigger $trigger -Principal $principal -Settings (Settings $catchUp) -Force | Out-Null
  "등록: $name ($bat $arg)"
}
$wd = 'Monday','Tuesday','Wednesday','Thursday','Friday'
# 방송 대기(130분)는 놓쳐도 보충하지 않는다 — 밤에 뒤늦게 돌면 21:30 실행과 봇 메시지를 서로 가로챈다
Reg 'CallVerifyLive'   'live_run.bat'   '130' (New-ScheduledTaskTrigger -Weekly -DaysOfWeek $wd -At 14:40) $false
Reg 'CallVerifyUpdate' 'auto_update.bat' ''   (New-ScheduledTaskTrigger -Daily -At 18:10) $true
Reg 'CallVerifyVod'    'vod_run.bat'    ''    (New-ScheduledTaskTrigger -Weekly -DaysOfWeek $wd -At 18:30) $true
Reg 'CallVerifyDaily'  'daily_run.bat'  ''    (New-ScheduledTaskTrigger -Daily -At 21:30) $true
Reg 'CallVerifyWeekly' 'weekly_run.bat' ''    (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 22:00) $true
"등록 완료 — 실행 폴더: $dir"
