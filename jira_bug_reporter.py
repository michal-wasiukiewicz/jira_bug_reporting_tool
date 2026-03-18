#!/usr/bin/env python3
"""
Jira Bug Reporter v5 — serwer lokalny
-------------------------------------
Uruchomienie:
    pip install flask flask-cors requests
    python jira_bug_reporter.py

Następnie otwórz: http://localhost:5000
"""

import json
import sys
from datetime import datetime
from pathlib import Path

try:
    from flask import Flask, request, jsonify, send_from_directory
    from flask_cors import CORS
    import requests as req_lib
except ImportError:
    print("Brak wymaganych bibliotek. Uruchom:")
    print("  pip install flask flask-cors requests")
    sys.exit(1)

BASE_DIR    = Path(__file__).parent
CONFIG_PATH = BASE_DIR / "config.json"

# ── Config helpers ─────────────────────────────────────────────────────────────
def load_config() -> dict:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)

def save_config(cfg: dict):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)

def get_reports_dir(cfg: dict) -> Path:
    raw = cfg.get("reports_dir", "").strip()
    if not raw or raw == ".":
        base = BASE_DIR / "reports"
    else:
        p = Path(raw)
        base = p if p.is_absolute() else BASE_DIR / p
    base.mkdir(parents=True, exist_ok=True)
    return base

# ── Flask ──────────────────────────────────────────────────────────────────────
app = Flask(__name__, static_folder=str(BASE_DIR))
CORS(app)

# ── Serve static files (HTML, CSS, JS) ────────────────────────────────────────
@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")

@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(BASE_DIR, filename)

# ── Config endpoints ───────────────────────────────────────────────────────────
@app.route("/config", methods=["GET"])
def get_config_endpoint():
    return jsonify(load_config())

@app.route("/config/theme", methods=["POST"])
def set_theme():
    """Zapisuje wybrany styl (v3/v4) do config.json."""
    data = request.get_json(silent=True) or {}
    theme = data.get("theme")
    if theme not in ("basic", "bugreporter"):
        return jsonify({"error": "Nieprawidłowy theme. Dozwolone: basic, bugreporter"}), 400
    cfg = load_config()
    cfg["theme"] = theme
    save_config(cfg)
    print(f"[config] theme → {theme}")
    return jsonify({"ok": True, "theme": theme})

@app.route("/config/dark_mode", methods=["POST"])
def set_dark_mode():
    """Zapisuje tryb ciemny/jasny do config.json."""
    data = request.get_json(silent=True) or {}
    if "dark_mode" not in data:
        return jsonify({"error": "Brak pola dark_mode"}), 400
    cfg = load_config()
    cfg["dark_mode"] = bool(data["dark_mode"])
    save_config(cfg)
    print(f"[config] dark_mode → {cfg['dark_mode']}")
    return jsonify({"ok": True, "dark_mode": cfg["dark_mode"]})

# ── API proxy ──────────────────────────────────────────────────────────────────
@app.route("/api/version/<app_id>", methods=["GET"])
def get_version(app_id):
    cfg     = load_config()
    app_map = {a["id"]: a["api_url"] for a in cfg["apps"]}

    if app_id not in app_map:
        return jsonify({"error": f"Nieznana aplikacja: '{app_id}'. Dostępne: {list(app_map)}"}), 404

    url        = app_map[app_id]
    ssl_verify = cfg.get("ssl_verify", True)   # domyślnie weryfikuj SSL

    if not ssl_verify:
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        print(f"[proxy] WARN: ssl_verify=false — certyfikat SSL nie jest weryfikowany")

    print(f"[proxy] GET {url}  (ssl_verify={ssl_verify})")
    try:
        r = req_lib.get(url, timeout=5, verify=ssl_verify)
        r.raise_for_status()
        d = r.json()
        result = {
            "ver":    d.get("ver",    d.get("version",     "")),
            "branch": d.get("branch", d.get("git_branch",  "")),
            "env":    d.get("env",    d.get("environment", "")),
            "appVer": d.get("appVer", d.get("app_version", "")),
        }
        print(f"[proxy] OK → {result}")
        return jsonify(result)
    except req_lib.exceptions.SSLError as e:
        msg = f"Błąd SSL: {e}. Ustaw \"ssl_verify\": false w config.json aby pominąć weryfikację."
        print(f"[proxy] SSL ERROR: {msg}")
        return jsonify({"error": msg}), 502
    except req_lib.exceptions.ConnectionError as e:
        msg = f"Nie można połączyć: {url}"
        print(f"[proxy] ERROR: {msg} ({e})")
        return jsonify({"error": msg}), 502
    except req_lib.exceptions.Timeout:
        msg = f"Timeout (5s): {url}"
        print(f"[proxy] TIMEOUT: {msg}")
        return jsonify({"error": msg}), 504
    except req_lib.exceptions.HTTPError as e:
        msg = f"HTTP {e.response.status_code}: {url}"
        print(f"[proxy] HTTP ERROR: {msg}")
        return jsonify({"error": msg}), 502
    except Exception as e:
        print(f"[proxy] EXCEPTION: {e}")
        return jsonify({"error": str(e)}), 500

# ── Save report ────────────────────────────────────────────────────────────────
@app.route("/save-report", methods=["POST"])
def save_report():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Brak danych"}), 400
    markup  = data.get("markup",  "").strip()
    summary = data.get("summary", "").strip()
    if not markup:
        return jsonify({"error": "Brak treści raportu"}), 400

    cfg         = load_config()
    reports_dir = get_reports_dir(cfg)
    ts          = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename    = f"{ts}_bug_report.txt"
    filepath    = reports_dir / filename
    filepath.write_text(f"SUMMARY:\n{summary}\n\n{'─'*60}\n\n{markup}", encoding="utf-8")
    print(f"[save] {filepath}")
    return jsonify({"filename": filename, "path": str(filepath), "dir": str(reports_dir)})

# ── Reports dir info ───────────────────────────────────────────────────────────
@app.route("/reports-dir", methods=["GET"])
def reports_dir_info():
    return jsonify({"dir": str(get_reports_dir(load_config()))})

# ── Health ─────────────────────────────────────────────────────────────────────
@app.route("/health", methods=["GET"])
def health():
    cfg = load_config()
    return jsonify({"status": "ok", "theme": cfg.get("theme","bugreporter"), "dark_mode": cfg.get("dark_mode", True)})

# ── Shutdown ───────────────────────────────────────────────────────────────────
@app.route("/shutdown", methods=["POST"])
def shutdown():
    """Zamyka serwer z poziomu interfejsu użytkownika."""
    import threading
    print("\n[server] Zamykanie na żądanie użytkownika...")
    # Krótkie opóźnienie — żeby odpowiedź zdążyła dotrzeć do przeglądarki
    def _stop():
        import time, os, signal
        time.sleep(0.5)
        os.kill(os.getpid(), signal.SIGTERM)
    threading.Thread(target=_stop, daemon=True).start()
    return jsonify({"status": "shutting_down"})

# ── Start ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    cfg  = load_config()
    host = cfg["proxy"]["host"]
    port = cfg["proxy"]["port"]
    print(f"\n🚀  Jira Bug Reporter v5")
    print(f"     http://{host}:{port}\n")
    print(f"   Theme:     {cfg.get('theme','v4')}  |  Dark mode: {cfg.get('dark_mode', True)}")
    print(f"   Config:    {CONFIG_PATH}")
    print(f"   Raporty:   {get_reports_dir(cfg)}")
    print(f"\n   Aplikacje:")
    for a in cfg["apps"]:
        print(f"     [{a['id']}] {a['name']}")
        print(f"             → {a['api_url']}")
    print(f"\n   Zatrzymaj: Ctrl+C\n")
    app.run(host=host, port=port, debug=False)
