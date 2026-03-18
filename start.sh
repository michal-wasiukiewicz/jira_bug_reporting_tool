#!/bin/bash
# Jira Bug Reporter v5 — skrypt startowy (Linux/macOS)
# Uruchamia serwer, zapisuje PID do jira_bug_reporter.pid, logi do jira_bug_reporter.log

PORT=5000
LOGFILE="jira_bug_reporter.log"
PIDFILE="jira_bug_reporter.pid"
SCRIPT="jira_bug_reporter.py"

# Sprawdź czy Python jest dostępny
if ! command -v python3 &>/dev/null && ! command -v python &>/dev/null; then
    echo "[ERROR] Python nie znaleziony. Zainstaluj Python 3 i spróbuj ponownie."
    exit 1
fi
PYTHON=$(command -v python3 || command -v python)

# Sprawdź czy port jest już zajęty
if lsof -ti :$PORT &>/dev/null; then
    EXISTING_PID=$(lsof -ti :$PORT)
    echo "[WARN] Port $PORT jest już zajęty przez PID $EXISTING_PID."
    echo "       Aplikacja może już działać: http://localhost:$PORT"
    echo "       Aby zatrzymać: kill $EXISTING_PID"
    exit 1
fi

echo "[start] Uruchamiam Jira Bug Reporter v5..."
echo "[start] Logi: $LOGFILE"
echo "[start] PID:  $PIDFILE"

# Uruchom w tle
$PYTHON $SCRIPT >> "$LOGFILE" 2>&1 &
APP_PID=$!
echo $APP_PID > "$PIDFILE"
echo "[start] PID: $APP_PID"

# Czekaj aż serwer wstanie (max 10s)
TRIES=0
until curl -s "http://localhost:$PORT/health" &>/dev/null; do
    sleep 1
    TRIES=$((TRIES + 1))
    if [ $TRIES -ge 10 ]; then
        echo "[ERROR] Serwer nie odpowiada po 10 sekundach."
        echo "        Sprawdź logi: cat $LOGFILE"
        exit 1
    fi
done

echo "[start] Serwer działa → http://localhost:$PORT"

# Otwórz przeglądarkę
if command -v xdg-open &>/dev/null; then
    xdg-open "http://localhost:$PORT" &
elif command -v open &>/dev/null; then
    open "http://localhost:$PORT"
fi

echo ""
echo "Aby zatrzymać serwer:"
echo "  - Użyj przycisku 'Wyłącz' w aplikacji"
echo "  - Lub uruchom: ./stop.sh"
echo "  - Lub: kill \$(cat $PIDFILE)"
