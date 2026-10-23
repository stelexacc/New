Unicode true
!include "MUI2.nsh"
Name "STELEX GPT - Client ohne Admin"
OutFile "${OUTPUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\Stelex GPT"
InstallDirRegKey HKCU "Software\Stelex GPT" "InstallDir"
RequestExecutionLevel user
SetCompressor zlib
ShowInstDetails show
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "STELEX GPT - nur der Client"
!define MUI_WELCOMEPAGE_TEXT "Dieses Paket enthaelt ausschliesslich Stelex GPT mit DeepSeek-Auswahl, Free-Limits und Plugins. Das Admin-Tool und dessen privates Bundle sind nicht enthalten.$\r$\n$\r$\nAlle Stelex-Apps vor dem Fortfahren schliessen."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "German"
Section "Stelex GPT Client"
  SetShellVarContext current
  InitPluginsDir
  SetOutPath "$PLUGINSDIR\preflight"
  File "${INPUT_DIR}/Wait-StelexBackend.ps1"
  File "${CLEANUP_DIR}/Remove-BundledAdmin.ps1"
  File "${CLEANUP_DIR}/old-admin-hashes.json"
  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\preflight\Wait-StelexBackend.ps1" -InstallDirectory "$INSTDIR"' $0
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONSTOP "Alle Stelex-Apps schliessen und erneut versuchen."
    SetErrorLevel $0
    Abort
  ${EndIf}
  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\preflight\Remove-BundledAdmin.ps1" -InstallDirectory "$INSTDIR"' $0
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONSTOP "Die alte gebuendelte Admin-Kopie konnte nicht bereinigt werden."
    SetErrorLevel $0
    Abort
  ${EndIf}
  SetOutPath "$INSTDIR"
  File /r "${INPUT_DIR}/*"
  WriteRegStr HKCU "Software\Stelex GPT" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Stelex GPT" "DisplayName" "Stelex GPT (Client)"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Stelex GPT" "DisplayVersion" "1.8.1-client-only"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Stelex GPT" "UninstallString" '$\"$INSTDIR\Uninstall Stelex GPT.exe$\"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Stelex GPT" "InstallLocation" "$INSTDIR"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Stelex GPT" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Stelex GPT" "NoRepair" 1
  WriteUninstaller "$INSTDIR\Uninstall Stelex GPT.exe"
  CreateDirectory "$SMPROGRAMS\Stelex GPT"
  CreateShortcut "$SMPROGRAMS\Stelex GPT\Stelex GPT.lnk" "$INSTDIR\Stelex GPT.exe"
  CreateShortcut "$SMPROGRAMS\Stelex GPT\Deinstallieren.lnk" "$INSTDIR\Uninstall Stelex GPT.exe"
  CreateShortcut "$DESKTOP\Stelex GPT.lnk" "$INSTDIR\Stelex GPT.exe"
  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\Setup-Client.ps1"' $0
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONSTOP "Programmdateien sind installiert, die Modelleinrichtung ist noch nicht abgeschlossen. Install.bat im Programmordner erneut starten und die dortige Fehlermeldung beachten."
    SetErrorLevel $0
    Abort
  ${EndIf}
  SetErrorLevel 0
SectionEnd
Section "Uninstall"
  SetShellVarContext current
  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\Wait-StelexBackend.ps1" -InstallDirectory "$INSTDIR"' $0
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONSTOP "Alle Stelex-Apps schliessen und erneut deinstallieren."
    Abort
  ${EndIf}
  !include "${DELETE_MANIFEST}"
  Delete "$INSTDIR\Uninstall Stelex GPT.exe"
  Delete "$DESKTOP\Stelex GPT.lnk"
  Delete "$SMPROGRAMS\Stelex GPT\Stelex GPT.lnk"
  Delete "$SMPROGRAMS\Stelex GPT\Deinstallieren.lnk"
  RMDir "$SMPROGRAMS\Stelex GPT"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Stelex GPT"
  DeleteRegKey HKCU "Software\Stelex GPT"
SectionEnd
