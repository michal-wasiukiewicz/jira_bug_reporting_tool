# Jira Bug Formatter

Lokalne narzędzie QA do tworzenia zgłoszeń błędów w formacie Jira Wiki Markup.

---

## Struktura plików

```
jira-bug-formatter/
├── config.json     ← konfiguracja aplikacji i API URL-i
├── index.html      ← interfejs (otwórz w przeglądarce)
├── proxy.py        ← CORS proxy (uruchom przed index.html)
└── README.md
```

---

## Szybki start

### Wariant A — bez proxy (brak wywołań API)

Po prostu otwórz `index.html` w przeglądarce (dwuklik).  
Pola wersji środowiska wypełniasz **ręcznie**. Wszystko działa offline.

---

### Wariant B — z proxy (automatyczne pobieranie wersji z API)

**1. Zainstaluj zależności (tylko raz):**
```bash
pip install flask flask-cors requests
```

**2. Uruchom proxy:**
```bash
python proxy.py
```
Proxy startuje na `http://localhost:5000`.

**3. Otwórz `index.html`** w przeglądarce.

W prawym górnym rogu aplikacji pojawi się zielona kropka `proxy :5000`.  
Teraz przycisk `⟳ API` w sekcji Środowisko będzie pobierał dane automatycznie.

---

## Konfiguracja (`config.json`)

### Dodawanie aplikacji

```json
{
  "apps": [
    {
      "id":      "moja-apka",
      "name":    "Moja Aplikacja",
      "modules": ["Moduł A", "Moduł B"],
      "api_url": "http://wewnetrzne-api/moja-apka/version"
    }
  ]
}
```

### Oczekiwany format odpowiedzi API

Proxy rozumie JSON z polami:

| Pole | Alternatywy | Opis |
|------|-------------|------|
| `ver` | `version` | Wersja aplikacji |
| `branch` | — | Gałąź git |
| `env` | `environment` | Środowisko (staging, prod…) |
| `appVer` | `app_version` | Wersja paczki/buildu |

---

## Zmiana portu proxy

W `config.json`:
```json
"proxy": {
  "host": "localhost",
  "port": 5001
}
```

Oraz w `index.html` (linia z `PROXY_BASE`):
```js
const PROXY_BASE = 'http://localhost:5001';
```

---

## Skróty

| Akcja | Jak |
|-------|-----|
| Skopiuj markup | Przycisk **Kopiuj** w prawym panelu |
| Pobierz wersję z API | Przycisk **⟳ API** (wymaga proxy) |
| Tryb offline | Otwórz `index.html` bez uruchamiania proxy |
