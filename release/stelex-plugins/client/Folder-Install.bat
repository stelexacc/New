@echo off
setlocal EnableExtensions DisableDelayedExpansion
start "" /wait "%~dp0Setup.exe" %*
exit /b %ERRORLEVEL%
