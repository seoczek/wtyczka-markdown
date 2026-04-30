# Contributing

## Local setup

1. Zainstaluj Node.js.
2. Uruchom `npm install`.
3. Uruchom `npm run verify`.
4. Zaladuj folder projektu w Chrome przez `chrome://extensions` jako `Load unpacked`.

## Before opening a pull request

- Uruchom `npm run verify`.
- Sprawdz recznie cztery wejscia: popup, skrot, menu kontekstowe i przycisk `MD`.
- Testuj na `test-page.html` oraz co najmniej jednej prawdziwej stronie.
- Nie dodawaj zaleznosci runtime bez jasnego powodu.
- Nie zmieniaj uprawnien w `manifest.json` bez opisania w README i `SECURITY.md`.

## Code style

Rozszerzenie w wersji `0.1.x` nie ma bundlera. Pliki wskazane w `manifest.json` sa zrodlem prawdy dla runtime.
