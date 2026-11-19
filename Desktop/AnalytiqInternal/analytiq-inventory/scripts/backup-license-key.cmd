@echo off
rem Windows wrapper: runs backup-license-key.sh through Git Bash.
rem The encrypted backup is written to your Desktop.
setlocal
set "SCRIPT=%~dp0backup-license-key.sh"
if exist "%ProgramFiles%\Git\bin\bash.exe" (
  "%ProgramFiles%\Git\bin\bash.exe" "%SCRIPT%"
  exit /b %ERRORLEVEL%
)
echo Git for Windows was not found at "%ProgramFiles%\Git\bin\bash.exe".
echo Install Git for Windows from https://git-scm.com/download/win and run this again.
exit /b 1
