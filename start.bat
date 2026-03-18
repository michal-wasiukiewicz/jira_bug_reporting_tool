@echo off
:: Jira Bug Reporter v5 — skrypt startowy (Windows)
:: Uruchamia serwer, zapisuje PID do jira_bug_reporter.pid, logi do jira_bug_reporter.log

setlocal

set PORT=5000
set LOGFILE=jira_bug_reporter.log
set PIDFILE=jira_bug_reporter.pid
set SCRIPT=jira_bug_reporter.py

:: Sprawdź czy Python jest dostępny
where python >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python nie znaleziony w PATH. Zainstaluj Python i spróbuj ponownie.
    pause
    exit /b 1
)

:: Sprawdź czy port jest już zajęty
netstat -ano | findstr ":%PORT% " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
    echo [WARN] Port %PORT% jest juz zajety. Sprawdz czy aplikacja juz dziala.
    echo        Aby znalezc PID: netstat -ano ^| findstr ":%PORT%"
    pause
    exit /b 1
)

echo [start] Uruchamiam Jira Bug Reporter v5...
echo [start] Logi: %LOGFILE%
echo [start] PID:  %PIDFILE%
echo.

:: Uruchom w tle, przekieruj logi
start /B python %SCRIPT% > %LOGFILE% 2>&1

:: Poczekaj aż serwer wstanie (max 10s)
set /a TRIES=0
:wait_loop
timeout /t 1 /nobreak >nul
set /a TRIES+=1

:: Sprawdź czy serwer odpowiada
curl -s -o nul http://localhost:%PORT%/health
if not errorlevel 1 goto :started

if %TRIES% LSS 10 goto :wait_loop

echo [ERROR] Serwer nie odpowiada po 10 sekundach. Sprawdz logi: %LOGFILE%
pause
exit /b 1

:started
:: Zapisz PID (ostatni python.exe uruchomiony w tym procesie)
for /f "tokens=2" %%i in ('tasklist /fi "imagename eq python.exe" /fo list 2^>nul ^| find "PID:"') do (
    echo %%i> %PIDFILE%
    echo [start] Serwer dziala  PID: %%i
    goto :open
)

:open
echo [start] Otwieram przegladarke...
start http://localhost:%PORT%
echo.
echo Aby zatrzymac serwer:
echo   - Uzyj przycisku "Wylacz" w aplikacji
echo   - Lub uruchom: stop.bat
echo   - Lub: taskkill /PID [PID z pliku %PIDFILE%] /F
echo.
endlocal
