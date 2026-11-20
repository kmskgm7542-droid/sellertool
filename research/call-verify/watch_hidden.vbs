' Runs watch_run.bat without a console window (task CallVerifyWatch, every 10 minutes)
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run "cmd /c """ & dir & "\watch_run.bat""", 0, True
