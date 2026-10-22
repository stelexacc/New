Unicode true
!include "LogicLib.nsh"
!include "x64.nsh"
!include "WinVer.nsh"
Name "Stelex Admin"
OutFile "${OUTPUT_FILE}"
RequestExecutionLevel user
SilentInstall silent
SetCompressor /SOLID zlib
Icon "${ICON_FILE}"
VIProductVersion "${RELEASE_VERSION}.0"
VIAddVersionKey /LANG=1033 "ProductName" "Stelex Admin"
VIAddVersionKey /LANG=1033 "FileDescription" "Stelex Admin — Portable"
VIAddVersionKey /LANG=1033 "FileVersion" "${RELEASE_VERSION}"
VIAddVersionKey /LANG=1033 "LegalCopyright" "Stelex"
Section
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "Stelex Admin requires 64-bit Windows."
    SetErrorLevel 1
    Quit
  ${EndIf}
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_ICONSTOP "Stelex Admin requires Windows 10 or newer."
    SetErrorLevel 1
    Quit
  ${EndIf}
  InitPluginsDir
  SetOutPath "$PLUGINSDIR\StelexAdmin"
  File /r "${PACKAGE_DIR}/*"
  ExecWait '"$PLUGINSDIR\StelexAdmin\Stelex Admin.exe"' $0
  SetOutPath "$TEMP"
  SetErrorLevel $0
SectionEnd
