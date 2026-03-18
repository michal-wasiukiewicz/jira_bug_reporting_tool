@echo off
:: Jira Bug Reporter v5 — skrypt zatrzymujący (Windows)

set PIDFILE=..\jira_bug_reporter.pid
set PORT=5000

if not exist %PIDFILE% (
    echo [WARN] Brak pliku %PIDFILE%.
    echo        Szukam procesu po porcie %PORT%...
    for /f "tokens=5" %%i in ('netstat -ano ^| findstr ":%PORT% " ^| findstr "LISTENING"') do (
        echo [stop] Znaleziono PID: %%i
        taskkill /PID %%i /F
        echo [stop] Zatrzymano.
        goto :done
    )
    echo [ERROR] Nie znaleziono procesu na porcie %PORT%.
    goto :done
)

set /p PID=<%PIDFILE%
echo [stop] Zatrzymuję PID: %PID%
taskkill /PID %PID% /F >nul 2>&1
if errorlevel 1 (
    echo [WARN] Proces %PID% nie istnieje lub juz sie zakonczyl.
) else (
    echo [stop] Zatrzymano.
)
del %PIDFILE% >nul 2>&1

:done
pause
