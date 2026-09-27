# Security Policy

## Supported version

The current supported version is `0.2.x`.

## Privacy model

Wtyczka działa lokalnie w przeglądarce. Nie wysyła zaznaczonej treści, adresów URL ani ustawień do zewnętrznych serwerów.

Sesja zapisuje Markdown, tytuł, adres strony, domenę i czas przechwycenia w `chrome.storage.local`. Ostatni wynik trafia do `chrome.storage.session` i znika po zamknięciu przeglądarki. Sesję czyści przycisk **Wyczyść** w popupie.

Ustawienia (tryb, wyłączone domeny, instrukcja dla AI) są w `chrome.storage.sync`, więc Chrome może je synchronizować między urządzeniami zalogowanego użytkownika.

## Permissions

- `<all_urls>` w `host_permissions` i `content_scripts.matches`: lekki skrypt przycisku `MD` na zwykłych stronach i konwersja w ramkach.
- `scripting`: wstrzyknięcie silnika konwersji dopiero po akcji użytkownika.
- `offscreen`, `clipboardWrite`: zapis do schowka ze skrótu i menu kontekstowego.
- `contextMenus`: menu kontekstowe dla zaznaczenia.
- `storage`: ustawienia, sesja i ostatni wynik.

Linki w wyniku przechodzą przez allowlistę protokołów (`http`, `https`, `mailto`, `tel`, względne). Interfejs na stronie działa w zamkniętym Shadow DOM i reaguje tylko na zdarzenia z `isTrusted`.

## Reporting

Zgłaszaj problemy bezpieczeństwa prywatnie właścicielowi repozytorium. Nie publikuj przykładów zawierających cudze dane, fragmenty poczty, panele administracyjne ani wewnętrzne dokumenty.
