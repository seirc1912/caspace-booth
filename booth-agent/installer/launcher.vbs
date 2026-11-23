' Starts the booth agent with no console window; output goes to logs\agent.log
' (rotated at 5 MB). Run by the "Caspace Booth Agent" scheduled task at logon.
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
logDir = dir & "\logs"
If Not fso.FolderExists(logDir) Then fso.CreateFolder(logDir)
logFile = logDir & "\agent.log"
If fso.FileExists(logFile) Then
  If fso.GetFile(logFile).Size > 5242880 Then
    If fso.FileExists(logDir & "\agent.old.log") Then fso.DeleteFile(logDir & "\agent.old.log")
    fso.MoveFile logFile, logDir & "\agent.old.log"
  End If
End If
Set shell = CreateObject("WScript.Shell")
cmd = "cmd /c """"" & dir & "\node\node.exe"" """ & dir & "\app\agent.mjs"" """ & dir & "\config.json"" >> """ & logFile & """ 2>&1"""
' 0 = hidden window, True = wait so Task Scheduler sees when the agent stops (and restarts it).
WScript.Quit shell.Run(cmd, 0, True)
