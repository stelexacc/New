Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "WinVer.nsh"
!include "x64.nsh"

Name "Stelex GPT"
OutFile "${OUTPUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\Stelex GPT"
InstallDirRegKey HKCU "Software\Stelex GPT" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID zlib
Icon "${ICON_FILE}"
UninstallIcon "${ICON_FILE}"
VIProductVersion "${RELEASE_VERSION}.0"
VIAddVersionKey /LANG=1033 "ProductName" "Stelex GPT"
VIAddVersionKey /LANG=1033 "FileDescription" "Stelex GPT Setup"
VIAddVersionKey /LANG=1033 "FileVersion" "${RELEASE_VERSION}"
VIAddVersionKey /LANG=1033 "LegalCopyright" "Stelex"

!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\Stelex GPT.exe"
!define MUI_LANGDLL_REGISTRY_ROOT HKCU
!define MUI_LANGDLL_REGISTRY_KEY "Software\Stelex GPT"
!define MUI_LANGDLL_REGISTRY_VALUENAME "InstallerLanguage"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "German"
!insertmacro MUI_LANGUAGE "English"

Function .onInit
  !insertmacro MUI_LANGDLL_DISPLAY
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "Stelex GPT requires 64-bit Windows. / Stelex GPT benötigt 64-Bit-Windows."
    Abort
  ${EndIf}
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_ICONSTOP "Stelex GPT requires Windows 10 or newer. / Stelex GPT benötigt Windows 10 oder neuer."
    Abort
  ${EndIf}
  SetRegView 64
  SetShellVarContext current
FunctionEnd

Section "Stelex GPT"
  SetOutPath "$INSTDIR"
  File /r "${PACKAGE_DIR}/*"
  WriteUninstaller "$INSTDIR\Uninstall Stelex GPT.exe"
  CreateDirectory "$SMPROGRAMS\Stelex GPT"
  CreateShortcut "$SMPROGRAMS\Stelex GPT\Stelex GPT.lnk" "$INSTDIR\Stelex GPT.exe" "" "$INSTDIR\resources\app\desktop\assets\icon.ico"
  CreateShortcut "$SMPROGRAMS\Stelex GPT\Stelex Admin.lnk" "$INSTDIR\Stelex Admin.exe" "" "$INSTDIR\resources\app\desktop\assets\icon.ico"
  CreateShortcut "$SMPROGRAMS\Stelex GPT\Modell einrichten.lnk" "$INSTDIR\Setup-Stelex-Model.bat" "" "$INSTDIR\resources\app\desktop\assets\icon.ico"
  CreateShortcut "$DESKTOP\Stelex GPT.lnk" "$INSTDIR\Stelex GPT.exe" "" "$INSTDIR\resources\app\desktop\assets\icon.ico"
  WriteRegStr HKCU "Software\Stelex GPT" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Stelex GPT" "DisplayName" "Stelex GPT"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Stelex GPT" "DisplayVersion" "${RELEASE_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Stelex GPT" "Publisher" "Stelex"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Stelex GPT" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Stelex GPT" "DisplayIcon" "$INSTDIR\resources\app\desktop\assets\icon.ico"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Stelex GPT" "UninstallString" '"$INSTDIR\Uninstall Stelex GPT.exe"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Stelex GPT" "EstimatedSize" ${ESTIMATED_SIZE}
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Stelex GPT" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Stelex GPT" "NoRepair" 1
SectionEnd

Section "Uninstall"
  SetRegView 64
  SetShellVarContext current
  !include "${UNINSTALL_MANIFEST}"
  Delete "$INSTDIR\Uninstall Stelex GPT.exe"
  Delete "$SMPROGRAMS\Stelex GPT\Stelex GPT.lnk"
  Delete "$SMPROGRAMS\Stelex GPT\Stelex Admin.lnk"
  Delete "$SMPROGRAMS\Stelex GPT\Modell einrichten.lnk"
  RMDir "$SMPROGRAMS\Stelex GPT"
  Delete "$DESKTOP\Stelex GPT.lnk"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Stelex GPT"
  DeleteRegKey HKCU "Software\Stelex GPT"
  ; Delete only known installed files; preserve unrelated files and user data.
  RMDir "$INSTDIR"
SectionEnd
