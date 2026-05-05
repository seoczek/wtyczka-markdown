# Changelog

## 0.1.1

- Poprawiono zachowanie wciec w blokach kodu podczas konwersji do Markdown.
- Poprawiono inline code zawierajacy backticki.
- Poprawiono zagniezdzone listy punktowane i numerowane.
- Zachowano tekst `summary` w elementach `details`, np. w FAQ i akordeonach.
- Dodano testy regresyjne dla powyzszych przypadkow.

## 0.1.0

- Dzialajace MVP rozszerzenia Chrome MV3.
- Konwersja zaznaczonego HTML do Markdown.
- Obsluga popupu, menu kontekstowego, skrotu klawiszowego i przycisku `MD`.
- Tryb zbierania wielu fragmentow do sesji.
- Poprawki bezpieczenstwa przed publikacja:
  - allowlista protokolow linkow,
  - bezpieczne fence dla blokow kodu,
  - brak pustych linkow obrazow,
  - obsluga bledow `chrome.storage`,
  - testy regresyjne dla sanitizacji i konwersji.
