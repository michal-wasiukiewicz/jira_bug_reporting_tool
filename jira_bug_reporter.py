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
import time
import threading
from collections import deque
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

# ══════════════════════════════════════════════════════════════════════════════
#  Config helpers
# ══════════════════════════════════════════════════════════════════════════════

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

def get_security_cfg(cfg: dict) -> dict:
    """Zwraca konfigurację zabezpieczeń z wartościami domyślnymi."""
    defaults = {
        "api_rate_limit":       5,   # max wywołań API w oknie
        "api_rate_window_sec":  60,  # okno czasowe API (sekundy)
        "save_rate_limit":      10,  # max zapisów plików w oknie
        "save_rate_window_sec": 60,  # okno czasowe zapisu (sekundy)
        "cb_failure_threshold": 3,   # ile błędów otwiera circuit breaker
        "cb_recovery_sec":      30,  # przerwa recovery (sekundy)
    }
    return {**defaults, **cfg.get("security", {})}

# ══════════════════════════════════════════════════════════════════════════════
#  Rate Limiter — sliding window, thread-safe
# ══════════════════════════════════════════════════════════════════════════════

class RateLimiter:
    """
    Sliding window rate limiter.
    Odrzuca żądania gdy w oknie [now-window_sec, now] jest >= max_calls wywołań.
    """
    def __init__(self, name: str, max_calls: int, window_sec: int):
        self.name       = name
        self.max_calls  = max_calls
        self.window_sec = window_sec
        self._calls: deque = deque()
        self._lock = threading.Lock()

    def reconfigure(self, max_calls: int, window_sec: int):
        with self._lock:
            self.max_calls  = max_calls
            self.window_sec = window_sec

    def check(self) -> tuple:
        """
        Sprawdza limit i rejestruje wywołanie jeśli dozwolone.
        Zwraca (allowed: bool, info: int) gdzie info to:
          - jeśli dozwolone: pozostała liczba wywołań w oknie
          - jeśli odrzucone: liczba sekund do retry
        """
        now    = time.monotonic()
        cutoff = now - self.window_sec
        with self._lock:
            while self._calls and self._calls[0] < cutoff:
                self._calls.popleft()
            if len(self._calls) >= self.max_calls:
                retry_after = int(self.window_sec - (now - self._calls[0])) + 1
                return False, retry_after
            self._calls.append(now)
            return True, self.max_calls - len(self._calls)

    def stats(self) -> dict:
        now    = time.monotonic()
        cutoff = now - self.window_sec
        with self._lock:
            recent = sum(1 for t in self._calls if t >= cutoff)
            return {
                "calls_in_window": recent,
                "max_calls":       self.max_calls,
                "window_sec":      self.window_sec,
            }

# ══════════════════════════════════════════════════════════════════════════════
#  Circuit Breaker — chroni zapis przed kaskadą błędów
# ══════════════════════════════════════════════════════════════════════════════

class CircuitBreaker:
    """
    Trzy stany:
      CLOSED    — normalny tryb, błędy zliczane
      OPEN      — zbyt wiele błędów, żądania odrzucane bez próby
      HALF_OPEN — próbne wywołanie po przerwie recovery_sec

    Przejścia:
      CLOSED    → OPEN      po failure_threshold błędach z rzędu
      OPEN      → HALF_OPEN po upływie recovery_sec
      HALF_OPEN → CLOSED    po sukcesie
      HALF_OPEN → OPEN      po kolejnym błędzie
    """
    CLOSED    = "closed"
    OPEN      = "open"
    HALF_OPEN = "half_open"

    def __init__(self, name: str, failure_threshold: int, recovery_sec: int):
        self.name              = name
        self.failure_threshold = failure_threshold
        self.recovery_sec      = recovery_sec
        self._state            = self.CLOSED
        self._failures         = 0
        self._opened_at        = 0.0
        self._lock             = threading.Lock()

    def reconfigure(self, failure_threshold: int, recovery_sec: int):
        with self._lock:
            self.failure_threshold = failure_threshold
            self.recovery_sec      = recovery_sec

    @property
    def state(self) -> str:
        with self._lock:
            return self._state

    def allow(self) -> tuple:
        """
        Decyduje czy operacja może być wykonana.
        Zwraca (allowed: bool, reason: str).
        """
        now = time.monotonic()
        with self._lock:
            if self._state == self.CLOSED:
                return True, "ok"

            if self._state == self.OPEN:
                elapsed = now - self._opened_at
                if elapsed >= self.recovery_sec:
                    self._state = self.HALF_OPEN
                    print(f"[circuit:{self.name}] OPEN → HALF_OPEN (po {elapsed:.0f}s)")
                    return True, "half_open"
                remaining = int(self.recovery_sec - elapsed)
                return False, (
                    f"Zapis zablokowany — za dużo błędów z rzędu. "
                    f"Automatyczne wznowienie za {remaining}s, "
                    f"lub użyj /security/circuit-reset."
                )

            # HALF_OPEN — przepuszczamy jedno próbne żądanie
            return True, "half_open"

    def record_success(self):
        with self._lock:
            prev = self._state
            self._failures = 0
            self._state    = self.CLOSED
            if prev == self.HALF_OPEN:
                print(f"[circuit:{self.name}] HALF_OPEN → CLOSED (odzyskano)")

    def record_failure(self):
        with self._lock:
            self._failures += 1
            print(f"[circuit:{self.name}] błąd {self._failures}/{self.failure_threshold}")
            if self._failures >= self.failure_threshold:
                self._state     = self.OPEN
                self._opened_at = time.monotonic()
                print(f"[circuit:{self.name}] → OPEN "
                      f"(przerwa {self.recovery_sec}s)")

    def reset(self):
        with self._lock:
            self._state    = self.CLOSED
            self._failures = 0
            print(f"[circuit:{self.name}] → CLOSED (reset ręczny)")

    def stats(self) -> dict:
        now = time.monotonic()
        with self._lock:
            s = {
                "state":             self._state,
                "failure_count":     self._failures,
                "failure_threshold": self.failure_threshold,
                "recovery_sec":      self.recovery_sec,
            }
            if self._state == self.OPEN:
                elapsed = now - self._opened_at
                s["retry_in_sec"] = max(0, int(self.recovery_sec - elapsed))
            return s

# ══════════════════════════════════════════════════════════════════════════════
#  Inicjalizacja instancji (czytane z config przy starcie)
# ══════════════════════════════════════════════════════════════════════════════

_init_cfg = load_config()
_sec      = get_security_cfg(_init_cfg)

api_limiter  = RateLimiter("api",  _sec["api_rate_limit"],  _sec["api_rate_window_sec"])
save_limiter = RateLimiter("save", _sec["save_rate_limit"],  _sec["save_rate_window_sec"])
save_breaker = CircuitBreaker("save", _sec["cb_failure_threshold"], _sec["cb_recovery_sec"])

def _sync_security():
    """Aktualizuje parametry zabezpieczeń z aktualnego config.json."""
    sec = get_security_cfg(load_config())
    api_limiter.reconfigure( sec["api_rate_limit"],       sec["api_rate_window_sec"])
    save_limiter.reconfigure(sec["save_rate_limit"],      sec["save_rate_window_sec"])
    save_breaker.reconfigure(sec["cb_failure_threshold"], sec["cb_recovery_sec"])

# ══════════════════════════════════════════════════════════════════════════════
#  Flask app
# ══════════════════════════════════════════════════════════════════════════════

app = Flask(__name__, static_folder=str(BASE_DIR))
CORS(app)

# ── Static ─────────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")

@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(BASE_DIR, filename)

# ── Config ─────────────────────────────────────────────────────────────────────
@app.route("/config", methods=["GET"])
def get_config_endpoint():
    _sync_security()
    return jsonify(load_config())

@app.route("/config/theme", methods=["POST"])
def set_theme():
    data  = request.get_json(silent=True) or {}
    theme = data.get("theme")
    if theme not in ("basic", "bugreporter"):
        return jsonify({"error": "Dozwolone: basic, bugreporter"}), 400
    cfg = load_config(); cfg["theme"] = theme; save_config(cfg)
    print(f"[config] theme → {theme}")
    return jsonify({"ok": True, "theme": theme})

@app.route("/config/dark_mode", methods=["POST"])
def set_dark_mode():
    data = request.get_json(silent=True) or {}
    if "dark_mode" not in data:
        return jsonify({"error": "Brak pola dark_mode"}), 400
    cfg = load_config(); cfg["dark_mode"] = bool(data["dark_mode"]); save_config(cfg)
    print(f"[config] dark_mode → {cfg['dark_mode']}")
    return jsonify({"ok": True, "dark_mode": cfg["dark_mode"]})

# ── API version endpoint ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
@app.route("/api/version/<app_id>", methods=["GET"])
def get_version(app_id):
    _sync_security()

    # Rate limit
    allowed, info = api_limiter.check()
    if not allowed:
        print(f"[rate:api] limit przekroczony — retry za {info}s")
        return jsonify({
            "error":       f"Zbyt wiele wywołań API. Poczekaj {info} sekund.",
            "retry_after": info,
        }), 429

    cfg     = load_config()
    app_def = next((a for a in cfg["apps"] if a["id"] == app_id), None)
    if not app_def:
        return jsonify({"error": f"Nieznana aplikacja: '{app_id}'"}), 404

    url        = app_def["api_url"]
    ssl_verify = cfg.get("ssl_verify", True)
    headers    = {"Accept": "application/json"}
    custom     = app_def.get("api_headers") or {}
    if isinstance(custom, dict):
        headers.update(custom)

    if not ssl_verify:
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    h_log = [k for k in headers if k != "Accept"]
    print(f"[api] GET {url}  ssl={ssl_verify}"
          + (f"  headers={h_log}" if h_log else ""))

    try:
        r = req_lib.get(url, headers=headers, timeout=5, verify=ssl_verify)
        r.raise_for_status()
        d = r.json()
        result = {
            "ver":    d.get("ver",    d.get("version",     "")),
            "branch": d.get("branch", d.get("git_branch",  "")),
            "env":    d.get("env",    d.get("environment", "")),
            "appVer": d.get("appVer", d.get("app_version", "")),
        }
        print(f"[api] OK → {result}")
        return jsonify(result)
    except req_lib.exceptions.SSLError as e:
        msg = f"Błąd SSL: {e}. Ustaw ssl_verify: false w config.json."
        print(f"[api] SSL ERROR: {msg}")
        return jsonify({"error": msg}), 502
    except req_lib.exceptions.ConnectionError as e:
        print(f"[api] CONNECTION ERROR: {e}")
        return jsonify({"error": f"Nie można połączyć: {url}"}), 502
    except req_lib.exceptions.Timeout:
        return jsonify({"error": f"Timeout (5s): {url}"}), 504
    except req_lib.exceptions.HTTPError as e:
        return jsonify({"error": f"HTTP {e.response.status_code}: {url}"}), 502
    except Exception as e:
        print(f"[api] EXCEPTION: {e}")
        return jsonify({"error": str(e)}), 500

# ── Save report ────────────────────────────────────────────────────────────────
@app.route("/save-report", methods=["POST"])
def save_report():
    _sync_security()

    # Rate limit
    allowed, info = save_limiter.check()
    if not allowed:
        print(f"[rate:save] limit przekroczony — retry za {info}s")
        return jsonify({
            "error":       f"Zbyt wiele zapisów. Poczekaj {info} sekund.",
            "retry_after": info,
        }), 429

    # Circuit breaker
    cb_ok, cb_msg = save_breaker.allow()
    if not cb_ok:
        print(f"[circuit:save] zablokowano — {cb_msg}")
        return jsonify({"error": cb_msg}), 503

    data    = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Brak danych"}), 400
    markup  = data.get("markup",  "").strip()
    summary = data.get("summary", "").strip()
    if not markup:
        return jsonify({"error": "Brak treści raportu"}), 400

    try:
        cfg         = load_config()
        reports_dir = get_reports_dir(cfg)
        ts          = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename    = f"{ts}_bug_report.txt"
        filepath    = reports_dir / filename
        filepath.write_text(
            f"SUMMARY:\n{summary}\n\n{'─'*60}\n\n{markup}",
            encoding="utf-8"
        )
        save_breaker.record_success()
        print(f"[save] OK → {filepath}")
        return jsonify({"filename": filename, "path": str(filepath), "dir": str(reports_dir)})

    except OSError as e:
        save_breaker.record_failure()
        print(f"[save] OSError: {e}")
        return jsonify({"error": f"Błąd zapisu: {e}"}), 500
    except Exception as e:
        save_breaker.record_failure()
        print(f"[save] EXCEPTION: {e}")
        return jsonify({"error": f"Nieoczekiwany błąd: {e}"}), 500

# ── Security status i reset ────────────────────────────────────────────────────
@app.route("/security/status", methods=["GET"])
def security_status():
    """Aktualny stan limiterów i circuit breakera — do debugowania."""
    return jsonify({
        "api_rate_limiter":     api_limiter.stats(),
        "save_rate_limiter":    save_limiter.stats(),
        "save_circuit_breaker": save_breaker.stats(),
    })

@app.route("/security/circuit-reset", methods=["POST"])
def circuit_reset():
    """Ręczny reset circuit breakera po usunięciu przyczyny błędów."""
    save_breaker.reset()
    return jsonify({"ok": True, "state": save_breaker.state})

# ── Reports dir ────────────────────────────────────────────────────────────────
@app.route("/reports-dir", methods=["GET"])
def reports_dir_info():
    return jsonify({"dir": str(get_reports_dir(load_config()))})

# ── Health ─────────────────────────────────────────────────────────────────────
@app.route("/health", methods=["GET"])
def health():
    cfg = load_config()
    return jsonify({
        "status":    "ok",
        "theme":     cfg.get("theme", "bugreporter"),
        "dark_mode": cfg.get("dark_mode", True),
        "circuit":   save_breaker.state,
    })

# ── Shutdown ───────────────────────────────────────────────────────────────────
@app.route("/shutdown", methods=["POST"])
def shutdown():
    import threading as _t
    print("\n[server] Zamykanie na żądanie użytkownika...")
    def _stop():
        import time as _time, os, signal
        _time.sleep(0.5)
        os.kill(os.getpid(), signal.SIGTERM)
    _t.Thread(target=_stop, daemon=True).start()
    return jsonify({"status": "shutting_down"})

# ══════════════════════════════════════════════════════════════════════════════
#  Start
# ══════════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    cfg  = load_config()
    sec  = get_security_cfg(cfg)
    host = cfg["proxy"]["host"]
    port = cfg["proxy"]["port"]

    print(f"\n🚀  Jira Bug Reporter v5")
    print(f"     http://{host}:{port}\n")
    print(f"   Theme:    {cfg.get('theme','bugreporter')}  |  "
          f"Dark: {cfg.get('dark_mode', True)}  |  SSL verify: {cfg.get('ssl_verify', True)}")
    print(f"   Config:   {CONFIG_PATH}")
    print(f"   Raporty:  {get_reports_dir(cfg)}")
    print(f"\n   Zabezpieczenia:")
    print(f"     API:   max {sec['api_rate_limit']} wywołań / {sec['api_rate_window_sec']}s")
    print(f"     Zapis: max {sec['save_rate_limit']} plików / {sec['save_rate_window_sec']}s")
    print(f"     CB:    otwarcie po {sec['cb_failure_threshold']} błędach, "
          f"recovery po {sec['cb_recovery_sec']}s")
    print(f"\n   Aplikacje:")
    for a in cfg["apps"]:
        h     = a.get("api_headers") or {}
        h_str = f"  nagłówki: {list(h.keys())}" if h else ""
        print(f"     [{a['id']}] {a['name']}{h_str}")
        print(f"             → {a['api_url']}")
    print(f"\n   Zatrzymaj: Ctrl+C lub przycisk 'Wyłącz' w aplikacji\n")

    app.run(host=host, port=port, debug=False)
