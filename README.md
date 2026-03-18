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

## Struktura plików

```
jira-bug-reporter/
├── jira_bug_reporter.py   ← serwer lokalny (Flask)
├── index.html             ← interfejs aplikacji
├── theme-bugreporter.css  ← motyw "Bug Reporter" (editorial, domyślny)
├── theme-basic.css        ← motyw "Basic" (industrial)
├── app.js                 ← logika aplikacji
├── config.json            ← konfiguracja
├── requirements.txt
├── README.md
└── reports/               ← zapisane raporty (tworzony automatycznie)
```

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
