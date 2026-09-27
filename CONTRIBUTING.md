# Contributing

## Local setup

1. Zainstaluj Node.js 20+.
2. Uruchom `npm install`.
3. Uruchom `npm run verify`.
4. Załaduj folder projektu w `chrome://extensions` przez **Załaduj rozpakowane**.

## Struktura

- `src/settings.js`, `src/content-script.js`: lekki skrypt na każdej stronie (przycisk `MD`, toast).
- `src/cleaner.js`, `src/markdown.js`, `src/extractor.js`: silnik konwersji wstrzykiwany na żądanie.
- `src/session.js`: sesja i eksport dla AI, współdzielone przez service worker i popup.
- `src/injected.js`: funkcje uruchamiane w stronie przez `chrome.scripting`.
- `background.js`: service worker, jedyne miejsce zapisu sesji i kopiowania ze skrótu/menu.
- `offscreen.html`, `offscreen.js`: zapis do schowka bez fokusu strony.
- `_locales/`: teksty interfejsu. Każdy klucz musi istnieć w `en` i `pl`.

## Before opening a pull request

- `npm run verify` i `npm run test:e2e` muszą przejść (E2E ładuje rozszerzenie w Chromium; pierwszy raz: `npx playwright install chromium`).
- Sprawdź ręcznie cztery wejścia: popup, skrót, menu kontekstowe i przycisk `MD`, także w ramce `iframe` na `test-page.html`.
- Dodaj test do `tests/` dla każdej poprawki konwersji.
- Nie dodawaj zależności runtime.
- Zmianę uprawnień opisz w README i `SECURITY.md`.

## Release

1. Podbij wersję w `package.json` i `manifest.json` (lint pilnuje zgodności).
2. Uzupełnij `CHANGELOG.md`.
3. `npm run pack` tworzy `dist/wtyczka-markdown-<wersja>.zip` (ten sam plik CI publikuje jako artefakt).
4. Dołącz ZIP do wydania na GitHubie: `gh release create v<wersja> dist/wtyczka-markdown-<wersja>.zip`.
