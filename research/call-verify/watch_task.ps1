# 관심종목 가격 확인 예약작업(CallVerifyWatch) 등록 — schedule_all.ps1 과 daily_run.bat(작업이 없을 때)이 부른다
#  - 매일 00:00부터 10분마다, 창 없이(watch_hidden.vbs). 절전에서 깨우지 않음, 놓친 실행 보충 안 함(다음 10분에 다시 확인)
#  - 로그온한 상태에서만 실행, 한 번 최대 9분
$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$user = "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 9)
$trigger = New-ScheduledTaskTrigger -Daily -At 00:00
$trigger.Repetition = (New-ScheduledTaskTrigger -Once -At 00:00 -RepetitionInterval (New-TimeSpan -Minutes 10) -RepetitionDuration (New-TimeSpan -Hours 23 -Minutes 59)).Repetition
$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ("`"$dir\watch_hidden.vbs`"") -WorkingDirectory $dir
Register-ScheduledTask -TaskName 'CallVerifyWatch' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
"등록: CallVerifyWatch (관심종목 가격 확인, 10분마다 · 창 없음)"
