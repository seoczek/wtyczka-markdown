# Changelog

## 0.2.0

### Nowe

- Kopiowanie tabeli do Google Sheets i Excela (TSV).
- „Kopiuj dla AI”: sesja w blokach `<document>` pogrupowanych według źródeł, obniżone nagłówki, własna instrukcja z gotowymi presetami i szacunek tokenów.
- Pobieranie sesji jako plik `.md`.
- Licznik zebranych fragmentów na ikonie rozszerzenia.
- Ukrywanie przycisku `MD` na wybranych domenach.
- Wybór trybu Smart / Strict w popupie.
- Edycja wyniku przed skopiowaniem, dodawanie do sesji z podglądu, usuwanie pojedynczych wpisów i cofanie czyszczenia sesji.
- Interfejs po polsku i angielsku.

### Poprawki

- Tryb Smart nie gubi już treści: `<br>`, `<hr>`, krótkie elementy (np. `5/5`), ceny, okruszki, FAQ i tabele zostają.
- Konwersja działa w ramkach `iframe`, w `textarea` i przy wielu zakresach zaznaczenia.
- Skrót i menu kontekstowe zawsze pokazują komunikat, także przy błędzie; na stronach zastrzeżonych pojawia się wskaźnik na ikonie.
- Kopiowanie ze skrótu i menu działa bez fokusu strony (dokument offscreen).
- Zapisy sesji nie gubią się przy szybkich, równoległych konwersjach; duplikaty są pomijane.
- Przycisk `MD` działa od razu po instalacji i aktualizacji, bez odświeżania kart, i nie przejmuje fokusu strony.
- Popup mieści się w limicie wysokości Chrome i jest w pełni obsługiwany z klawiatury.

### Wydajność i jakość

- Na stronach ładuje się tylko lekki skrypt przycisku; silnik konwersji jest wstrzykiwany dopiero po akcji.
- Usunięto zbędne uprawnienie `activeTab`.
- ESLint, testy warstwy rozszerzenia, kontrola manifestu i tłumaczeń, paczka ZIP w CI.

## 0.1.1

- Poprawiono zachowanie wcięć w blokach kodu podczas konwersji do Markdown.
- Poprawiono inline code zawierający backticki.
- Poprawiono zagnieżdżone listy punktowane i numerowane.
- Zachowano tekst `summary` w elementach `details`, np. w FAQ i akordeonach.
- Dodano testy regresyjne dla powyższych przypadków.

## 0.1.0

- Działające MVP rozszerzenia Chrome MV3.
- Konwersja zaznaczonego HTML do Markdown.
- Obsługa popupu, menu kontekstowego, skrótu klawiszowego i przycisku `MD`.
- Tryb zbierania wielu fragmentów do sesji.
- Poprawki bezpieczeństwa przed publikacją:
  - allowlista protokołów linków,
  - bezpieczne fence dla bloków kodu,
  - brak pustych linków obrazów,
  - obsługa błędów `chrome.storage`,
  - testy regresyjne dla sanitizacji i konwersji.
