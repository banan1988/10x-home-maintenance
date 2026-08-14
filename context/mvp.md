# Home Maintenance - MVP

### Główny problem

Właściciele i najemcy domów/mieszkań mają wiele cyklicznych czynności, o których trzeba pamiętać: wymiana filtrów, przeglądy, czyszczenie urządzeń, wymiana
baterii czy konserwacja instalacji.

Informacje o tych czynnościach są często przechowywane w pamięci, notatkach lub kalendarzu. Brakuje prostego miejsca, które odpowiada na pytanie:

**"Co w moim domu wymaga teraz uwagi?"**

Home Maintenance ma pozwolić użytkownikowi zapisywać takie czynności i automatycznie informować go, które z nich są aktualne, zbliżają się do terminu lub są już
przeterminowane.

### Najmniejszy zestaw funkcjonalności

* Rejestracja, logowanie i wylogowanie użytkownika.
* Dodawanie, edycja, wyświetlanie i usuwanie czynności konserwacyjnych.
* Określenie nazwy, kategorii, ważności, częstotliwości oraz daty ostatniego wykonania.
* Automatyczne wyliczanie kolejnego terminu wykonania.
* Automatyczne określanie statusu: `OK`, `DUE SOON`, `OVERDUE`.
* Dashboard pokazujący czynności wymagające największej uwagi.
* Izolacja danych użytkowników.
* REST API dla operacji na czynnościach.
* Co najmniej jeden test E2E kluczowego przepływu użytkownika.
* GitHub Actions uruchamiające testy i build.

### Co NIE wchodzi w zakres MVP

* aplikacja mobilna,
* współdzielenie domu z innymi użytkownikami,
* wiele nieruchomości,
* powiadomienia push/SMS,
* integracja z kalendarzem,
* płatności,
* IoT,
* zdjęcia i skanowanie dokumentów,
* rozbudowana analityka,
* AI/LLM jako wymagany element aplikacji.

AI może zostać wykorzystane pomocniczo, ale podstawowa funkcjonalność aplikacji nie może od niego zależeć.

### Kryteria sukcesu

* Użytkownik może się zarejestrować i zalogować.
* Użytkownik może wykonać pełny CRUD na swoich czynnościach.
* Aplikacja poprawnie wylicza następny termin i status czynności.
* Dashboard pozwala szybko znaleźć czynności wymagające uwagi.
* Użytkownik nie ma dostępu do danych innych użytkowników.
* Istnieje działający test E2E kluczowego przepływu.
* CI automatycznie uruchamia testy i build.
* MVP można wdrożyć i zaprezentować jako działającą aplikację.
