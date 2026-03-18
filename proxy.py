#!/usr/bin/env python3
"""
CORS Proxy dla Jira Bug Formatter
----------------------------------
Uruchomienie:
    pip install flask flask-cors requests
    python proxy.py

Proxy nasłuchuje na http://localhost:5000
i przekazuje żądania do wewnętrznych API.
"""

import json
import sys
from datetime import datetime
from pathlib import Path

try:
    from flask import Flask, request, jsonify
    from flask_cors import CORS
    import requests
except ImportError:
    print("Brak wymaganych bibliotek. Uruchom:")
    print("  pip install flask flask-cors requests")
    sys.exit(1)

# --- Wczytaj konfigurację ---
CONFIG_PATH = Path(__file__).parent / "config.json"
with open(CONFIG_PATH, encoding="utf-8") as f:
    config = json.load(f)

# Zbuduj słownik app_id -> api_url
APP_URLS = {app["id"]: app["api_url"] for app in config["apps"]}

HOST = config["proxy"]["host"]
PORT = config["proxy"]["port"]

# --- Katalog raportów ---
def get_reports_dir() -> Path:
    """
    Zwraca katalog do zapisu raportów.
    Jeśli reports_dir w config jest pusty — używa podkatalogu 'reports' obok proxy.py.
    Możesz podać ścieżkę bezwzględną (C:/raporty) lub względną (../inne_miejsce).
    """
    raw = config.get("reports_dir", "").strip()
    if not raw or raw == ".":
        base = Path(__file__).parent / "reports"
    else:
        p = Path(raw)
        base = p if p.is_absolute() else Path(__file__).parent / p
    base.mkdir(parents=True, exist_ok=True)
    return base

# --- Flask app ---
app = Flask(__name__)
CORS(app, origins=["null", "file://", "http://localhost", "http://127.0.0.1"])


@app.route("/config", methods=["GET"])
def get_config():
    """Zwraca konfigurację aplikacji do frontendu."""
    return jsonify(config)


@app.route("/api/version/<app_id>", methods=["GET"])
def get_version(app_id):
    """
    Proxy do wewnętrznego API wersji.
    Oczekiwany format odpowiedzi z API: { ver, branch, env, appVer }
    """
    if app_id not in APP_URLS:
        return jsonify({"error": f"Nieznana aplikacja: {app_id}"}), 404

    target_url = APP_URLS[app_id]

    try:
        response = requests.get(target_url, timeout=5)
        response.raise_for_status()
        data = response.json()

        # Normalizuj odpowiedź — wyciągnij tylko pola których potrzebujemy
        normalized = {
            "ver":    data.get("ver", data.get("version", "")),
            "branch": data.get("branch", ""),
            "env":    data.get("env", data.get("environment", "")),
            "appVer": data.get("appVer", data.get("app_version", "")),
        }
        return jsonify(normalized)

    except requests.exceptions.ConnectionError:
        return jsonify({"error": "Nie można połączyć się z API. Sprawdź VPN / sieć."}), 502
    except requests.exceptions.Timeout:
        return jsonify({"error": "API nie odpowiedziało w czasie 5 sekund."}), 504
    except requests.exceptions.HTTPError as e:
        return jsonify({"error": f"API zwróciło błąd: {e.response.status_code}"}), 502
    except Exception as e:
        return jsonify({"error": f"Nieznany błąd: {str(e)}"}), 500


@app.route("/save-report", methods=["POST"])
def save_report():
    """
    Zapisuje raport do pliku tekstowego.
    Body JSON: { summary: str, markup: str }
    Zwraca: { path: str, filename: str }
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Brak danych w żądaniu"}), 400

    summary = data.get("summary", "").strip()
    markup  = data.get("markup", "").strip()

    if not markup:
        return jsonify({"error": "Brak treści raportu"}), 400

    reports_dir = get_reports_dir()
    ts       = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{ts}_bug_report.txt"
    filepath = reports_dir / filename

    content = f"SUMMARY:\n{summary}\n\n{'─' * 60}\n\n{markup}"
    filepath.write_text(content, encoding="utf-8")

    return jsonify({
        "filename": filename,
        "path":     str(filepath),
        "dir":      str(reports_dir),
    })


@app.route("/reports-dir", methods=["GET"])
def reports_dir_info():
    """Zwraca aktualny katalog zapisu raportów."""
    d = get_reports_dir()
    return jsonify({"dir": str(d)})


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "proxy": f"{HOST}:{PORT}"})


if __name__ == "__main__":
    print(f"\n🚀 CORS Proxy uruchomiony na http://{HOST}:{PORT}")
    print(f"   Obsługiwane aplikacje: {list(APP_URLS.keys())}")
    print(f"   Skonfigurowane API URL-e:")
    for app_id, url in APP_URLS.items():
        print(f"     [{app_id}] → {url}")
    print("\n   Otwórz index.html w przeglądarce, proxy działa w tle.")
    print("   Zatrzymaj: Ctrl+C\n")

    app.run(host=HOST, port=PORT, debug=False)