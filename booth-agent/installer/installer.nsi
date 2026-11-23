; Caspace Booth Agent — Windows installer (built on macOS with `makensis`, see build.mjs).
Unicode true
!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!ifndef VERSION
  !define VERSION "1.0.0"
!endif
!define APPNAME "Caspace Booth Agent"
!define TASKNAME "Caspace Booth Agent"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\CaspaceBoothAgent"

Name "Gửi ảnh phòng chụp Caspace"
OutFile "${OUTFILE}"
; Program Files: only Administrators can create or change it, so no standard user can
; pre-plant files that this elevated installer (or the logon task) would run.
InstallDir "$PROGRAMFILES64\CaspaceBooth"
RequestExecutionLevel admin
SetCompressor /SOLID lzma
ShowInstDetails show
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APPNAME}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "FileDescription" "Gửi ảnh Capture One lên caspace.vn"
VIAddVersionKey "CompanyName" "Cá Space"
VIAddVersionKey "LegalCopyright" "Cá Space"

!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
Page custom ConfigPage ConfigPageLeave
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Mở trang trạng thái"
!define MUI_FINISHPAGE_RUN_FUNCTION OpenStatus
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Vietnamese"

Var Dialog
Var BoothBox
Var KeyBox
Var ServerBox
Var FolderBox
Var BoothId
Var BoothKey
Var ServerUrl
Var WatchRoot
Var HasConfig

Function .onInit
  StrCpy $HasConfig "0"
  ${If} ${FileExists} "$INSTDIR\config.json"
    StrCpy $HasConfig "1"
  ${EndIf}
FunctionEnd

Function ConfigPage
  !insertmacro MUI_HEADER_TEXT "Thông tin máy phòng chụp" "Chủ quán cung cấp mã phòng và mã bí mật cho máy này."
  nsDialogs::Create 1018
  Pop $Dialog
  ${If} $HasConfig == "1"
    ${NSD_CreateLabel} 0 0 100% 20u "Máy này đã được cài. Để trống ô nào thì giữ nguyên giá trị cũ (dùng khi cập nhật phiên bản)."
    Pop $0
  ${EndIf}
  ${NSD_CreateLabel} 0 24u 30% 12u "Mã phòng:"
  Pop $0
  ${NSD_CreateComboBox} 32% 22u 40% 80u ""
  Pop $BoothBox
  ${NSD_CB_AddString} $BoothBox "booth-1"
  ${NSD_CB_AddString} $BoothBox "booth-2"
  ${NSD_CB_AddString} $BoothBox "booth-3"
  ${NSD_CB_AddString} $BoothBox "booth-4"
  ${NSD_CreateLabel} 0 44u 30% 12u "Mã bí mật:"
  Pop $0
  ${NSD_CreatePassword} 32% 42u 68% 12u ""
  Pop $KeyBox
  ${NSD_CreateLabel} 0 64u 30% 12u "Máy chủ:"
  Pop $0
  ${If} $HasConfig == "1"
    ${NSD_CreateText} 32% 62u 68% 12u ""
  ${Else}
    ${NSD_CreateText} 32% 62u 68% 12u "https://caspace.vn"
  ${EndIf}
  Pop $ServerBox
  ${NSD_CreateLabel} 0 84u 30% 12u "Thư mục ảnh Capture One:"
  Pop $0
  ${If} $HasConfig == "1"
    ${NSD_CreateText} 32% 82u 50% 12u ""
  ${Else}
    ${NSD_CreateText} 32% 82u 50% 12u "C:\Users\ADMIN\Pictures"
  ${EndIf}
  Pop $FolderBox
  ${NSD_CreateButton} 84% 81u 16% 14u "Chọn…"
  Pop $0
  ${NSD_OnClick} $0 BrowseFolder
  ${NSD_CreateLabel} 0 104u 100% 30u "Ảnh trong <thư mục>\<số điện thoại>\Output sẽ tự gửi lên hệ thống. Mã bí mật chỉ lưu trên máy này."
  Pop $0
  nsDialogs::Show
FunctionEnd

Function BrowseFolder
  ${NSD_GetText} $FolderBox $0
  nsDialogs::SelectFolderDialog "Chọn thư mục Pictures chứa các phiên Capture One" $0
  Pop $0
  ${If} $0 != "error"
    ${NSD_SetText} $FolderBox $0
  ${EndIf}
FunctionEnd

Function ConfigPageLeave
  ${NSD_GetText} $BoothBox $BoothId
  ${NSD_GetText} $KeyBox $BoothKey
  ${NSD_GetText} $ServerBox $ServerUrl
  ${NSD_GetText} $FolderBox $WatchRoot
  ${If} $HasConfig == "0"
    ${If} $BoothId == ""
    ${OrIf} $BoothKey == ""
      MessageBox MB_ICONEXCLAMATION "Vui lòng chọn mã phòng và nhập mã bí mật."
      Abort
    ${EndIf}
  ${EndIf}
FunctionEnd

Function StopAgent
  nsExec::Exec 'schtasks /End /TN "${TASKNAME}"'
  Pop $0
  nsExec::Exec 'powershell -NoProfile -Command "Get-Process node -ErrorAction SilentlyContinue | Where-Object { $$_.Path -like \"$INSTDIR\*\" } | Stop-Process -Force"'
  Pop $0
  Sleep 1000
FunctionEnd

Function OpenStatus
  ExecShell "open" "http://127.0.0.1:47821/"
FunctionEnd

Section "Install"
  Call StopAgent
  ; Lock the folder BEFORE copying or running anything from it: owner Administrators,
  ; no inherited/explicit ACEs except Administrators/SYSTEM (full) and Users (read+run).
  CreateDirectory "$INSTDIR"
  nsExec::Exec 'icacls "$INSTDIR" /setowner "*S-1-5-32-544" /T /C'
  Pop $0
  nsExec::Exec 'icacls "$INSTDIR" /reset /T /C'
  Pop $0
  nsExec::Exec 'icacls "$INSTDIR" /inheritance:r /grant:r "*S-1-5-32-544:(OI)(CI)F" "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-545:(OI)(CI)RX"'
  Pop $0
  ${If} $0 != "0"
    MessageBox MB_ICONSTOP "Không khoá được quyền thư mục cài đặt. Dừng cài để an toàn."
    Abort
  ${EndIf}
  SetOutPath "$INSTDIR"
  File /r "${PAYLOAD}\*.*"

  DetailPrint "Lưu cấu hình…"
  nsExec::ExecToStack '"$INSTDIR\node\node.exe" "$INSTDIR\installer\write-config.mjs" "$INSTDIR\config.json" "$BoothId" "$BoothKey" "$ServerUrl" "$WatchRoot"'
  Pop $0
  Pop $1
  ${If} $0 != "0"
    MessageBox MB_ICONSTOP "Cấu hình chưa đúng:$\r$\n$1$\r$\nHãy chạy lại Setup."
    Abort
  ${EndIf}

  DetailPrint "Phân quyền thư mục…"
  ; Only state/ and logs/ are writable by the agent (runs as the logged-in user).
  CreateDirectory "$INSTDIR\state"
  CreateDirectory "$INSTDIR\logs"
  nsExec::Exec 'icacls "$INSTDIR\state" /grant:r "*S-1-5-32-545:(OI)(CI)M"'
  Pop $0
  nsExec::Exec 'icacls "$INSTDIR\logs" /grant:r "*S-1-5-32-545:(OI)(CI)M"'
  Pop $0

  DetailPrint "Đăng ký tự chạy khi đăng nhập Windows…"
  nsExec::ExecToStack '"$INSTDIR\node\node.exe" "$INSTDIR\installer\register-task.mjs" "$INSTDIR" "$INSTDIR\installer\task.xml"'
  Pop $0
  Pop $1
  ${If} $0 != "0"
    MessageBox MB_ICONSTOP "Không đăng ký được tác vụ tự chạy:$\r$\n$1"
  ${EndIf}

  WriteINIStr "$DESKTOP\Gửi ảnh Caspace.url" "InternetShortcut" "URL" "http://127.0.0.1:47821/"
  CreateDirectory "$SMPROGRAMS\Caspace"
  WriteINIStr "$SMPROGRAMS\Caspace\Gửi ảnh Caspace.url" "InternetShortcut" "URL" "http://127.0.0.1:47821/"
  CreateShortcut "$SMPROGRAMS\Caspace\Gỡ cài đặt.lnk" "$INSTDIR\uninstall.exe"

  WriteUninstaller "$INSTDIR\uninstall.exe"
  WriteRegStr HKLM "${UNINSTKEY}" "DisplayName" "Gửi ảnh phòng chụp Caspace"
  WriteRegStr HKLM "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "${UNINSTKEY}" "Publisher" "Cá Space"
  WriteRegStr HKLM "${UNINSTKEY}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKLM "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegDWORD HKLM "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINSTKEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  nsExec::Exec 'schtasks /End /TN "${TASKNAME}"'
  Pop $0
  nsExec::Exec 'schtasks /Delete /TN "${TASKNAME}" /F'
  Pop $0
  nsExec::Exec 'powershell -NoProfile -Command "Get-Process node -ErrorAction SilentlyContinue | Where-Object { $$_.Path -like \"$INSTDIR\*\" } | Stop-Process -Force"'
  Pop $0
  Sleep 1000
  Delete "$DESKTOP\Gửi ảnh Caspace.url"
  RMDir /r "$SMPROGRAMS\Caspace"
  ; Photos in Pictures are never touched.
  RMDir /r "$INSTDIR"
  DeleteRegKey HKLM "${UNINSTKEY}"
SectionEnd
