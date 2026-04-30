# Wtyczka Markdown

Rozszerzenie Chrome MV3, które konwertuje zaznaczony fragment strony WWW do czystego Markdown i kopiuje wynik do schowka.

Projekt działa lokalnie w przeglądarce. Nie używa AI i nie wysyła treści na zewnętrzne serwery.

## Status

Wersja `0.1.0` to MVP do ręcznego testowania i lokalnego użycia w Chrome.

Obsługiwane wejścia:

- skrót `Ctrl+Shift+Y`, na macOS `Control+Shift+Y`,
- menu kontekstowe po zaznaczeniu tekstu,
- pływający przycisk `MD` przy zaznaczeniu,
- popup rozszerzenia z podglądem i trybem sesji.
- przycisk edycji skrótu, który otwiera `chrome://extensions/shortcuts`.

## Instalacja w Chrome

1. Otwórz `chrome://extensions`.
2. Włącz `Tryb dewelopera`.
3. Kliknij `Załaduj rozpakowane`.
4. Wskaż folder `wtyczka-markdown`.
5. Jeśli testujesz lokalny plik `test-page.html`, wejdź w szczegóły rozszerzenia i włącz dostęp do adresów `file://`.

## Użycie

1. Otwórz stronę z artykułem albo `test-page.html`.
2. Zaznacz fragment tekstu.
3. Uruchom konwersję skrótem, menu kontekstowym, przyciskiem `MD` albo popupem.
4. Wynik zostanie wygenerowany jako Markdown i skopiowany do schowka, jeśli przeglądarka pozwoli na zapis do schowka.

## Prywatność i uprawnienia

Rozszerzenie działa lokalnie. Nie ma kodu wykonującego requesty do zewnętrznych API i nie przesyła zaznaczonej treści poza przeglądarkę.

Uprawnienia w `manifest.json`:

- `activeTab`: praca z aktywną kartą po akcji użytkownika.
- `contextMenus`: menu kontekstowe dla zaznaczenia.
- `storage`: zapis ustawień i sesji.
- `clipboardWrite`: kopiowanie Markdown do schowka.
- `<all_urls>`: content script jest dostępny na zwykłych stronach, żeby skrót, popup, menu i pływający przycisk działały spójnie.

Tryb `Zbieraj do sesji` zapisuje pełny Markdown, adres strony, domenę i czas przechwycenia w lokalnym storage przeglądarki. Sesję można wyczyścić w popupie przyciskiem `Wyczyść sesję`.

Chrome blokuje rozszerzenia na stronach systemowych, Chrome Web Store i części specjalnych widoków. W takim przypadku popup pokaże komunikat zamiast konwersji.

## Funkcje

- Konwersja zaznaczonego HTML do Markdown.
- Czyszczenie typowych elementów szumu: reklamy, newslettery, bannery, popupy, nawigacja, sidebary i ukryte elementy.
- Obsługa nagłówków, akapitów, list, linków, cytatów, kodu, tabel, checklist, `details/summary` i list definicji.
- Kopiowanie całego zebranego pakietu z sesji osobnym przyciskiem.
- Zachowanie polskich znaków.
- Bezpieczna allowlista linków: `http`, `https`, `mailto`, `tel`.
- Odporne bloki kodu, także gdy kod zawiera backticki.

## Testy

Instalacja narzędzi developerskich:

```bash
npm install
```

Pełna weryfikacja:

```bash
npm run verify
```

To uruchamia:

- walidację `manifest_version: 3` i składni JS,
- podstawowy lint bezpieczeństwa runtime,
- testy regresyjne sanitizacji, Markdown i storage.

## Test ręczny przed wydaniem

1. Załaduj rozszerzenie jako unpacked w Chrome.
2. Otwórz `test-page.html`.
3. Sprawdź te same zaznaczenia przez popup, skrót, menu kontekstowe i przycisk `MD`.
4. Zweryfikuj wynik dla nagłówków, list, linków, cytatu, kodu, tabeli, checklisty, obrazu z alt oraz bloków reklamowych.
5. Powtórz test na jednej prawdziwej stronie artykułu i jednej cięższej stronie CMS/opisu produktu.

## Ograniczenia

- Wtyczka działa na zaznaczeniu, nie na całej stronie.
- Bardzo niestandardowe CMS-y mogą wymagać dalszych heurystyk.
- Treści w iframe'ach i zamkniętych komponentach mogą być niedostępne.
- Uprawnienie `<all_urls>` jest zostawione w MVP dla spójnego UX; w przyszłości można rozważyć wstrzykiwanie skryptu tylko po akcji użytkownika.

## Licencja

MIT. Szczegóły w pliku `LICENSE`.
