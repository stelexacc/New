Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "WinVer.nsh"
!include "x64.nsh"
!include "nsDialogs.nsh"
Var CheckOriginal
Var CheckQwen
Var CheckDolphin
Var CheckGemma
Var CheckPython
Var CheckVoice
Var ComponentTotal
Var ModelsJson
Var PythonJson
Var VoiceJson

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
Page custom ComponentsPage ComponentsLeave
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

Function ComponentsPage
  InitPluginsDir
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 28u "Ein Modell reicht. Weitere Modelle und der EXE-Builder sind optional. Vorhandene Ollama-Daten werden wiederverwendet."
  Pop $0
  ${NSD_CreateCheckbox} 0 34u 100% 16u "Qwen 3.5 Abliterated 9B | Download ca. 6,5 GB"
  Pop $CheckOriginal
  ${NSD_CreateCheckbox} 0 55u 100% 16u "Qwen HauhauCS 9B Q4 | Download ca. 5,6 GB (empfohlen)"
  Pop $CheckQwen
  ${NSD_Check} $CheckQwen
  ${NSD_CreateCheckbox} 0 76u 100% 16u "Dolphin 3.0 8B Q4 | Download ca. 4,9 GB"
  Pop $CheckDolphin
  ${NSD_CreateCheckbox} 0 97u 100% 16u "Gemma HauhauCS E4B Q4 | Download ca. 5,3 GB"
  Pop $CheckGemma
  ${NSD_CreateCheckbox} 0 118u 100% 16u "Python-EXE-Builder | zusaetzlich ca. 0,35 GB"
  Pop $CheckPython
  ${NSD_CreateCheckbox} 0 139u 100% 16u "Sprachmodul pruefen | bereits gebuendelt, ca. 0,16 GB"
  Pop $CheckVoice
  ${NSD_Check} $CheckVoice
  ${NSD_CreateLabel} 0 161u 100% 30u ""
  Pop $ComponentTotal
  ${NSD_OnClick} $CheckOriginal ComponentClicked
  ${NSD_OnClick} $CheckQwen ComponentClicked
  ${NSD_OnClick} $CheckDolphin ComponentClicked
  ${NSD_OnClick} $CheckGemma ComponentClicked
  ${NSD_OnClick} $CheckPython ComponentClicked
  Call UpdateComponentTotal
  nsDialogs::Show
FunctionEnd
Function ComponentClicked
  Pop $0
  Call UpdateComponentTotal
FunctionEnd
Function UpdateComponentTotal
  StrCpy $2 750
  ${NSD_GetState} $CheckOriginal $0
  ${If} $0 == ${BST_CHECKED}
    IntOp $2 $2 + 6500
  ${EndIf}
  ${NSD_GetState} $CheckQwen $0
  ${If} $0 == ${BST_CHECKED}
    IntOp $2 $2 + 5600
  ${EndIf}
  ${NSD_GetState} $CheckDolphin $0
  ${If} $0 == ${BST_CHECKED}
    IntOp $2 $2 + 4920
  ${EndIf}
  ${NSD_GetState} $CheckGemma $0
  ${If} $0 == ${BST_CHECKED}
    IntOp $2 $2 + 5340
  ${EndIf}
  ${NSD_GetState} $CheckPython $0
  ${If} $0 == ${BST_CHECKED}
    IntOp $2 $2 + 350
  ${EndIf}
  ${NSD_SetText} $ComponentTotal "Geschaetzter Gesamtbedarf: ca. $2 MB. Alte Modelle werden nicht geloescht. Groessen sind Richtwerte, freier Speicher wird beim Download benoetigt."
FunctionEnd
Function ComponentsLeave
  StrCpy $ModelsJson "["
  ${NSD_GetState} $CheckOriginal $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $ModelsJson '$ModelsJson$\"qwen3.5-abliterated:9b$\",'
  ${EndIf}
  ${NSD_GetState} $CheckQwen $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $ModelsJson '$ModelsJson$\"stelex-qwen35-hauhau:9b$\",'
  ${EndIf}
  ${NSD_GetState} $CheckDolphin $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $ModelsJson '$ModelsJson$\"stelex-dolphin3:8b$\",'
  ${EndIf}
  ${NSD_GetState} $CheckGemma $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $ModelsJson '$ModelsJson$\"stelex-gemma4-hauhau:e4b$\",'
  ${EndIf}
  StrLen $1 $ModelsJson
  ${If} $1 > 1
    StrCpy $ModelsJson $ModelsJson -1
  ${EndIf}
  StrCpy $ModelsJson "$ModelsJson]"
  StrCpy $PythonJson "false"
  StrCpy $VoiceJson "false"
  ${NSD_GetState} $CheckPython $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $PythonJson "true"
  ${EndIf}
  ${NSD_GetState} $CheckVoice $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $VoiceJson "true"
  ${EndIf}
  FileOpen $0 "$PLUGINSDIR\selected-components.json" w
  FileWrite $0 '{$\"models$\":$ModelsJson,$\"python$\":$PythonJson,$\"voice$\":$VoiceJson}'
  FileClose $0
FunctionEnd

Section "${PRODUCT_NAME}"
  ; Remove obsolete decrypted files from the old installation; data remains in AppData.
  RMDir /r "$INSTDIR\resources\app\admin"
  Delete "$INSTDIR\resources\owner-admin-auth.json"
  SetOutPath "$INSTDIR"
  File /r "${PACKAGE_DIR}/*"
  IfSilent skip_component_download
  CopyFiles /SILENT "$PLUGINSDIR\selected-components.json" "$INSTDIR\selected-components.json"
  ExecWait '$SYSDIR\WindowsPowerShell\v1.0\powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\Setup-Selected.ps1"' $0
  ${If} $0 != 0
    MessageBox MB_ICONEXCLAMATION "Some components could not be prepared. Run component setup again. / Nicht alle Komponenten bereit. Einrichtung erneut starten."
  ${EndIf}
  skip_component_download:
  WriteUninstaller "$INSTDIR\Uninstall ${PRODUCT_NAME}.exe"
  CreateDirectory "$SMPROGRAMS\${PRODUCT_NAME}"
  CreateShortcut "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk" "$INSTDIR\${RUN_FILE}" "" "$INSTDIR\resources\app\desktop\assets\icon.ico"
  CreateShortcut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${RUN_FILE}" "" "$INSTDIR\resources\app\desktop\assets\icon.ico"
!ifndef ADMIN_ONLY
  CreateShortcut "$SMPROGRAMS\${PRODUCT_NAME}\Komponenten auswaehlen.lnk" "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\Select-Components.ps1"'
  CreateShortcut "$SMPROGRAMS\${PRODUCT_NAME}\Modell einrichten.lnk" "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\Setup-Ollama.ps1"' "$INSTDIR\resources\app\desktop\assets\icon.ico"
!endif
  CreateShortcut "$SMPROGRAMS\${PRODUCT_NAME}\Stelex Admin.lnk" "$INSTDIR\Stelex Admin.exe" "" "$INSTDIR\resources\app\desktop\assets\icon.ico"
  CreateShortcut "$DESKTOP\Stelex Admin.lnk" "$INSTDIR\Stelex Admin.exe" "" "$INSTDIR\resources\app\desktop\assets\icon.ico"
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
  Delete "$SMPROGRAMS\${PRODUCT_NAME}\Komponenten auswaehlen.lnk"
  Delete "$SMPROGRAMS\${PRODUCT_NAME}\Modell einrichten.lnk"
!endif
  Delete "$SMPROGRAMS\${PRODUCT_NAME}\Stelex Admin.lnk"
  Delete "$DESKTOP\Stelex Admin.lnk"
  RMDir "$SMPROGRAMS\${PRODUCT_NAME}"
  Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}"
  DeleteRegKey HKCU "Software\${PRODUCT_NAME}"
  ; Remove only files included in this installer; preserve userData and Ollama models.
  RMDir "$INSTDIR"
SectionEnd
