#!/bin/bash
# Jira Bug Reporter v5 — skrypt zatrzymujący (Linux/macOS)

PORT=5000
PIDFILE="../jira_bug_reporter.pid"

if [ -f "$PIDFILE" ]; then
    PID=$(cat "$PIDFILE")
    if kill -0 "$PID" 2>/dev/null; then
        echo "[stop] Zatrzymuję PID: $PID"
        kill "$PID"
        sleep 1
        # Jeśli nadal żyje — wymuś
        if kill -0 "$PID" 2>/dev/null; then
            echo "[stop] Wymuszam zatrzymanie..."
            kill -9 "$PID"
        fi
        echo "[stop] Zatrzymano."
    else
        echo "[WARN] Proces $PID już nie istnieje."
    fi
    rm -f "$PIDFILE"
else
    echo "[WARN] Brak pliku $PIDFILE. Szukam po porcie $PORT..."
    PID=$(lsof -ti :$PORT 2>/dev/null)
    if [ -n "$PID" ]; then
        echo "[stop] Znaleziono PID: $PID — zatrzymuję..."
        kill "$PID"
        echo "[stop] Zatrzymano."
    else
        echo "[ERROR] Nie znaleziono procesu na porcie $PORT."
        exit 1
    fi
fi
