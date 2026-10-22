Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "WinVer.nsh"
!include "x64.nsh"

!ifdef ADMIN_ONLY
  !define PRODUCT_NAME "Stelex Admin"
  !define RUN_FILE "Stelex Admin.exe"
!else
  !define PRODUCT_NAME "Stelex GPT"
  !define RUN_FILE "Stelex GPT.exe"
!endif

Name "${PRODUCT_NAME}"
OutFile "${OUTPUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\${PRODUCT_NAME}"
InstallDirRegKey HKCU "Software\${PRODUCT_NAME}" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID zlib
Icon "${ICON_FILE}"
UninstallIcon "${ICON_FILE}"
VIProductVersion "${RELEASE_VERSION}.0"
VIAddVersionKey /LANG=1033 "ProductName" "${PRODUCT_NAME}"
VIAddVersionKey /LANG=1033 "FileDescription" "${PRODUCT_NAME} Setup"
VIAddVersionKey /LANG=1033 "FileVersion" "${RELEASE_VERSION}"
VIAddVersionKey /LANG=1033 "LegalCopyright" "Stelex"

!define MUI_ICON "${ICON_FILE}"
!define MUI_UNICON "${ICON_FILE}"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${RUN_FILE}"
!define MUI_LANGDLL_REGISTRY_ROOT HKCU
!define MUI_LANGDLL_REGISTRY_KEY "Software\${PRODUCT_NAME}"
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
    MessageBox MB_ICONSTOP "Stelex requires 64-bit Windows. / Stelex benoetigt 64-Bit-Windows."
    Abort
  ${EndIf}
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_ICONSTOP "Stelex requires Windows 10 or newer. / Stelex benoetigt Windows 10 oder neuer."
    Abort
  ${EndIf}
  SetRegView 64
  SetShellVarContext current
FunctionEnd

Section "${PRODUCT_NAME}"
!ifndef ADMIN_ONLY
  ; Remove the admin components bundled by older customer installers.
  ; Runtime userData and the separate private administrator profile are untouched.
  Delete "$INSTDIR\Stelex Admin.exe"
  RMDir /r "$INSTDIR\resources\app\admin"
  Delete "$INSTDIR\resources\owner-admin-auth.json"
  ${If} ${FileExists} "$INSTDIR\Stelex Admin.exe"
    MessageBox MB_ICONSTOP "Close the old Stelex Admin application and run setup again."
    Abort
  ${EndIf}
!endif
  SetOutPath "$INSTDIR"
  File /r "${PACKAGE_DIR}/*"
  WriteUninstaller "$INSTDIR\Uninstall ${PRODUCT_NAME}.exe"
  CreateDirectory "$SMPROGRAMS\${PRODUCT_NAME}"
  CreateShortcut "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk" "$INSTDIR\${RUN_FILE}" "" "$INSTDIR\resources\app\desktop\assets\icon.ico"
  CreateShortcut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${RUN_FILE}" "" "$INSTDIR\resources\app\desktop\assets\icon.ico"
!ifndef ADMIN_ONLY
  CreateShortcut "$SMPROGRAMS\${PRODUCT_NAME}\Modell einrichten.lnk" "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\Setup-Ollama.ps1"' "$INSTDIR\resources\app\desktop\assets\icon.ico"
!endif
  WriteRegStr HKCU "Software\${PRODUCT_NAME}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "DisplayVersion" "${RELEASE_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "Publisher" "Stelex"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "DisplayIcon" "$INSTDIR\resources\app\desktop\assets\icon.ico"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "UninstallString" '"$INSTDIR\Uninstall ${PRODUCT_NAME}.exe"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "EstimatedSize" ${ESTIMATED_SIZE}
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  SetRegView 64
  SetShellVarContext current
  !include "${UNINSTALL_MANIFEST}"
  Delete "$INSTDIR\Uninstall ${PRODUCT_NAME}.exe"
  Delete "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk"
!ifndef ADMIN_ONLY
  Delete "$SMPROGRAMS\${PRODUCT_NAME}\Modell einrichten.lnk"
!endif
  RMDir "$SMPROGRAMS\${PRODUCT_NAME}"
  Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}"
  DeleteRegKey HKCU "Software\${PRODUCT_NAME}"
  ; Remove only files included in this installer; preserve userData and Ollama models.
  RMDir "$INSTDIR"
SectionEnd
