# Security Policy

## Supported version

The current supported version is `0.1.x`.

## Privacy model

Wtyczka dziala lokalnie w przegladarce. Nie wysyla zaznaczonej tresci, URL-i ani ustawien do zewnetrznych serwerow.

Tryb zbierania do sesji zapisuje pelny Markdown, adres strony, domene i czas przechwycenia w lokalnym storage przegladarki. Uzytkownik moze wyczyscic sesje w popupie przyciskiem `Wyczysc sesje`.

## Permissions

Rozszerzenie uzywa Manifest V3 i nastepujacych uprawnien:

- `activeTab`: praca na aktywnej karcie po akcji uzytkownika.
- `contextMenus`: menu kontekstowe dla zaznaczenia.
- `storage`: zapis ustawien i sesji.
- `clipboardWrite`: kopiowanie Markdown do schowka.
- `<all_urls>` w `host_permissions` i `content_scripts.matches`: content script jest dostepny na zwyklych stronach, zeby przycisk `MD`, skrot i popup dzialaly bez dodatkowej instalacji per domena.

Chrome nadal blokuje rozszerzenia na stronach systemowych, Chrome Web Store i czesci specjalnych widokow.

## Reporting

Zglaszaj problemy bezpieczenstwa prywatnie wlascicielowi repozytorium. Nie publikuj publicznie przykladow zawierajacych cudze dane, fragmenty poczty, panele administracyjne ani wewnetrzne dokumenty.
