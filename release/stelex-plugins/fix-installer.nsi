Unicode true
!include "MUI2.nsh"
Name "STELEX GPT - DeepSeek Fix"
OutFile "${OUTPUT_FILE}"
RequestExecutionLevel user
SetCompressor zlib
ShowInstDetails show
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "STELEX GPT mit DeepSeek einrichten"
!define MUI_WELCOMEPAGE_TEXT "Dieses Setup installiert die Basis und danach zwingend die DeepSeek-, Free-Limit- und Plugin-Ergaenzungen.$\r$\n$\r$\nStelex GPT und Stelex Admin vor dem Fortfahren vollstaendig schliessen. Modelle werden anschliessend ausgewaehlt und heruntergeladen."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_LANGUAGE "German"
Section
  InitPluginsDir
  SetOutPath "$PLUGINSDIR\Stelex"
  File /r "${INPUT_DIR}/*"
  DetailPrint "Starte Basisinstallation und integrierte Ergaenzungen ..."
  ExecWait '"$SYSDIR\cmd.exe" /D /S /C ""$PLUGINSDIR\Stelex\Install.bat""' $0
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONSTOP "Einrichtung nicht abgeschlossen (Code $0). Fehlermeldung im Installationsfenster beachten."
    SetErrorLevel $0
    Abort
  ${EndIf}
  SetErrorLevel 0
SectionEnd
