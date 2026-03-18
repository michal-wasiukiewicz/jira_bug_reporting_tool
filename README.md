# Jira Bug Reporter v5

Lokalne narzędzie QA do tworzenia zgłoszeń błędów w formacie Jira Wiki Markup.

---

## Szybki start

```bash
pip install -r requirements.txt
python jira_bug_reporter.py
```

Następnie otwórz: **http://localhost:5000**

---

## Uruchamianie z zapisem PID

Zapisanie PID procesu pozwala go awaryjnie znaleźć i zabić bez użycia interfejsu, gdy coś się posypie.

### Windows

```bat
:: start.bat
@echo off
start /B python jira_bug_reporter.py > jira_bug_reporter.log 2>&1
:: Poczekaj chwilę aż proces wstanie, potem zapisz PID
timeout /t 2 /nobreak >nul
for /f "tokens=2" %%i in ('tasklist /fi "imagename eq python.exe" /fo list ^| find "PID:"') do (
    echo %%i > jira_bug_reporter.pid
    echo [start] PID: %%i
    goto :done
)
:done
echo Otwórz http://localhost:5000
```

Albo prościej — jednolinijkowo w PowerShell:

```powershell
# Uruchom i zapisz PID
$p = Start-Process python -ArgumentList "jira_bug_reporter.py" -PassThru -RedirectStandardOutput "jira_bug_reporter.log" -RedirectStandardError "jira_bug_reporter_err.log" -NoNewWindow
$p.Id | Out-File "jira_bug_reporter.pid"
Write-Host "[start] PID: $($p.Id) — otwórz http://localhost:5000"
```

### Linux / macOS

```bash
# start.sh
python jira_bug_reporter.py >> jira_bug_reporter.log 2>&1 &
echo $! > jira_bug_reporter.pid
echo "[start] PID: $(cat jira_bug_reporter.pid) — otwórz http://localhost:5000"
```

---

## Awaryjne zatrzymanie (gdy interfejs nie odpowiada)

### Windows — znajdź i zabij po PID z pliku

```powershell
# Odczytaj PID z pliku i zatrzymaj
$pid = Get-Content jira_bug_reporter.pid
Stop-Process -Id $pid -Force
Write-Host "Zatrzymano proces PID $pid"
```

### Windows — znajdź po porcie (gdy nie masz pliku PID)

```powershell
# Znajdź co zajmuje port 5000
netstat -ano | findstr :5000
# Wynik np: TCP  0.0.0.0:5000  ...  LISTENING  12345
#                                               ^^^^^ to jest PID

# Zatrzymaj po PID
taskkill /PID 12345 /F
```

### Linux / macOS — zabij po PID z pliku

```bash
kill $(cat jira_bug_reporter.pid)
# lub wymuś:
kill -9 $(cat jira_bug_reporter.pid)
```

### Linux / macOS — znajdź po porcie (gdy nie masz pliku PID)

```bash
# Znajdź PID procesu zajmującego port 5000
lsof -ti :5000
# lub:
ss -tlnp | grep 5000

# Zatrzymaj
kill $(lsof -ti :5000)
```

---

## Tryb debug

Tryb debug włącza:
- **auto-reload** — serwer restartuje się automatycznie po każdej zmianie `jira_bug_reporter.py`
- **szczegółowe logi błędów** — pełny stack trace w konsoli i w przeglądarce
- **interaktywny debugger** w przeglądarce przy wyjątkach (pin wyświetlany w konsoli)

### Uruchomienie w trybie debug

```bash
# Przez zmienną środowiskową (zalecane)
set FLASK_DEBUG=1         # Windows CMD
$env:FLASK_DEBUG=1        # Windows PowerShell
export FLASK_DEBUG=1      # Linux / macOS

python jira_bug_reporter.py
```

Albo bezpośrednio w kodzie — zmień ostatnią linię `jira_bug_reporter.py`:

```python
# Zamień:
app.run(host=host, port=port, debug=False)

# Na:
app.run(host=host, port=port, debug=True)
```

> ⚠️ **Nie używaj `debug=True` w sieci firmowej** — interaktywny debugger Flask daje dostęp do powłoki Python na serwerze. Tryb debug tylko na `localhost`.

### Podgląd logów na żywo (Linux / macOS)

```bash
# W jednym terminalu uruchom serwer z zapisem logów:
python jira_bug_reporter.py 2>&1 | tee jira_bug_reporter.log

# W drugim terminalu śledź logi:
tail -f jira_bug_reporter.log
```

### Podgląd logów na żywo (Windows PowerShell)

```powershell
# Uruchom i jednocześnie wyświetlaj logi
python jira_bug_reporter.py 2>&1 | Tee-Object -FilePath "jira_bug_reporter.log"
```

---

## Struktura plików

```
jira-bug-reporter/
├── jira_bug_reporter.py   ← serwer lokalny (Flask)
├── index.html             ← interfejs aplikacji
├── theme-bugreporter.css  ← motyw "Bug Reporter" (editorial, domyślny)
├── theme-basic.css        ← motyw "Basic" (industrial)
├── app.js                 ← logika aplikacji
├── config.json            ← konfiguracja
├── start.bat              ← start z zapisem PID (Windows)
├── stop.bat               ← awaryjne zatrzymanie (Windows)
├── start.sh               ← start z zapisem PID (Linux/macOS)
├── stop.sh                ← awaryjne zatrzymanie (Linux/macOS)
├── requirements.txt
├── README.md
├── jira_bug_reporter.pid  ← PID działającego procesu (tworzony przez start.bat/.sh)
├── jira_bug_reporter.log  ← logi serwera (tworzony przy starcie)
└── reports/               ← zapisane raporty (tworzony automatycznie)
```

### Zalecany sposób uruchomienia

**Windows:**
```bat
start.bat
```

**Linux / macOS:**
```bash
chmod +x start.sh stop.sh   # tylko pierwszy raz
./start.sh
```

Skrypty startowe: sprawdzają czy port jest wolny, uruchamiają serwer w tle, zapisują PID do `jira_bug_reporter.pid`, czekają aż serwer wstanie i otwierają przeglądarkę automatycznie.

---

## Konfiguracja (`config.json`)

```json
{
  "proxy":       { "host": "localhost", "port": 5000 },
  "version":     "5.0",
  "theme":       "bugreporter",   // "bugreporter" lub "basic"
  "dark_mode":   true,            // true = ciemny, false = jasny
  "reports_dir": "",              // "" = ./reports/, lub ścieżka np. "C:/raporty"
  "apps": [
    {
      "id":      "app1",
      "name":    "Nazwa aplikacji",
      "modules": ["Moduł A", "Moduł B"],
      "api_url": "http://twoje-api/version"
    }
  ]
}
```

Zmiany w `config.json` są widoczne natychmiast — nie trzeba restartować serwera.

---

## Funkcje

### Formularz
- **Klasyfikacja** — Severity, Powtarzalność, Wpływ na biznes
- **Opis błędu** — pole tekstowe
- **Środowisko** — Aplikacja, Moduły (multi-select: Ctrl/Cmd+klik), wersja, branch, env, app ver, przeglądarka
- **Kroki do odtworzenia** — każda linia = jeden krok (lista numerowana w Jira)
- **Rezultaty** — Wynik rzeczywisty, Wynik oczekiwany, Dane testowe
- **Załączniki** — Screenshot, Logi systemowe

### Przyciski `+` / `−` przy polach
Każde pole ma przycisk kontrolujący czy trafi do wygenerowanego opisu:

| Stan | Wygląd | Znaczenie |
|------|--------|-----------|
| Pole wypełnione | `+` zielony | dołączone (domyślnie) |
| Pole wypełnione, kliknięte | `−` czerwony | wykluczone ręcznie |
| Pole puste | `−` szary | wykluczone (domyślnie) |
| Pole puste, kliknięte | `+` bursztynowy | wymuszone mimo braku treści |

### Toolbar bloków kodu
W polach "Wynik rzeczywisty" i "Dane testowe":
- **`</> → kod`** — zaznacz fragment i kliknij aby owinąć w `{code:json}...\n{code}`, lub kliknij bez zaznaczenia aby wstawić pusty blok
- **`✕ kod`** — usuń tagi `{code}` z zaznaczenia (lub z całego pola jeśli brak zaznaczenia)

### Kopiowanie i zapis
- **Kopiuj Summary** — kopiuje tylko linię summary do schowka
- **Kopiuj Markup** — kopiuje treść zgłoszenia **bez** linii `h1. [S1]...` (gotowe do wklejenia w pole opisu Jiry)
- **Zapisz** — zapisuje plik `{timestamp}_bug_report.txt` z pełną treścią (summary + markup)

### Motywy i tryb
Przełącznik w prawym rogu topbara:
- **Bug Reporter / Basic** — zmiana motywu wizualnego (zapisywana w `config.json`)
- **🌙 / ☀️** — przełącznik dark/light mode (zapisywany w `config.json`)

### Pobieranie wersji z API
Przycisk **⟳ API** w sekcji Środowisko pobiera dane przez serwer lokalny z URL skonfigurowanego w `api_url`. Oczekiwany format odpowiedzi:
```json
{ "ver": "1.4.2", "branch": "main", "env": "staging", "appVer": "2.0.1" }
```
Obsługiwane aliasy: `version`, `environment`, `app_version`, `git_branch`.

---

## Changelog

### v5.0
- Aplikacja działa wyłącznie jako serwer lokalny (`python jira_bug_reporter.py` → `http://localhost:5000`) — jeden plik HTML, zero problemów z CORS i `file://`
- Zmiana nazwy z `proxy.py` na `jira_bug_reporter.py`
- Jeden `index.html` zamiast osobnych `v3.html` / `v4.html`
- Motywy przemianowane: `v3` → **Basic**, `v4` → **Bug Reporter**
- Pliki CSS przemianowane: `v3.css` → `theme-basic.css`, `v4.css` → `theme-bugreporter.css`
- Przełącznik motywu i dark/light mode zapisuje wybór w `config.json` — stan pamiętany między sesjami
- **Kopiuj Markup** — kopiuje treść bez linii `h1` summary (do wklejenia w pole opisu Jiry)
- **Zapisz do pliku** — zapisuje pełną treść: summary + markup (do archiwum)
- **Przycisk Wyłącz** w topbarze — zamknięcie serwera z poziomu przeglądarki bez użycia konsoli
- Nagłówek topbar powiększony 2× (motyw Bug Reporter)
- Pola aplikacja/moduły: multi-select (Ctrl/Cmd+klik dla wielu modułów)
- Summary budowane bez spacji między tagami `[]`: `[S1][Moduł][Moduł2] Opis`

### v4 (poprzednia)
- Dwa osobne pliki HTML (v3.html, v4.html) ze wspólnym app.js
- CSS wydzielony do osobnych plików (v3.css, v4.css)
- Logika opcjonalności pól: przyciski `+`/`−` per pole
- Toolbar bloków kodu w polach actual/testdata
- Proporcje layoutu 60/40 (formularz/markup)
- Przełącznik dark/light mode

### v3 (poprzednia)
- Dwa style interfejsu: industrial dark (v3) i editorial accordion (v4)
- Podgląd markup na żywo obok formularza
- Kopiowanie Summary i Markup do schowka
- Zapis raportów do pliku .txt z timestampem
- Konfigurowalny katalog zapisu raportów

### v2 (poprzednia)
- CORS proxy w Python (Flask) do wewnętrznych API
- Pobieranie danych wersji z API (ver, branch, env, appVer)
- Wbudowany config w HTML (bez zależności od serwera)

### v1 (pierwsza wersja)
- Podstawowy formularz HTML z podglądem Jira Wiki Markup
- Kopiowanie do schowka
- Config w osobnym pliku JSON
