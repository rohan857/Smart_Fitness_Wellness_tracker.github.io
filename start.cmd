@echo off
setlocal
cd /d "%~dp0"
if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" (
  "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" "%~dp0project.py" %*
) else (
  where py >nul 2>nul
  if not errorlevel 1 (
    py -3 "%~dp0project.py" %*
  ) else (
    python "%~dp0project.py" %*
  )
)
if errorlevel 1 (
  echo.
  echo AR Move could not start. Check the message above.
  pause
)
endlocal
