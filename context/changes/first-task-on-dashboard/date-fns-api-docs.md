# date-fns API reference for S-01

> Source: Context7 MCP (`resolve-library-id` → `query-docs`), library `/date-fns/date-fns`, 2026-09-01.
> Scope: the exact date-fns functions needed to implement S-01's status computation and sorting, plus documented
> gotchas. Library selection rationale (why date-fns over Day.js/Luxon/native) lives in `external-research.md`.

## Functions needed

| Function                                          | Use in S-01                                                                                               |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `parseISO(dateString)`                            | Parse `last_done_date` (stored as an ISO date string) into a `Date`.                                      |
| `addDays` / `addWeeks` / `addMonths` / `addYears` | Compute the due date from `last_done_date` + `frequency_value`, branching on `frequency_unit`.            |
| `differenceInCalendarDays(dueDate, today)`        | Compute days-until-due for the OK / DUE SOON / OVERDUE thresholds.                                        |
| `compareAsc`                                      | Comparator for sorting by date, if a secondary date-based sort is needed within a status/importance tier. |
| `format`                                          | Display formatting in the UI (dashboard, task detail).                                                    |

## Reference implementation shape

```typescript
import { addDays, addWeeks, addMonths, addYears, differenceInCalendarDays, parseISO } from "date-fns";

type FrequencyUnit = "days" | "weeks" | "months" | "years";

function computeDueDate(lastDoneDate: Date, frequencyValue: number, frequencyUnit: FrequencyUnit): Date {
  switch (frequencyUnit) {
    case "days":
      return addDays(lastDoneDate, frequencyValue);
    case "weeks":
      return addWeeks(lastDoneDate, frequencyValue);
    case "months":
      return addMonths(lastDoneDate, frequencyValue);
    case "years":
      return addYears(lastDoneDate, frequencyValue);
  }
}

function computeStatus(
  dueDate: Date,
  today: Date,
  dueSoonThresholdDays: number,
): "OK" | "DUE_SOON" | "OVERDUE" {
  const daysUntilDue = differenceInCalendarDays(dueDate, today);
  if (daysUntilDue < 0) return "OVERDUE";
  if (daysUntilDue <= dueSoonThresholdDays) return "DUE_SOON";
  return "OK";
}
```

Dashboard sort (status rank, then importance — no extra library needed, per `external-research.md` section 3):

```typescript
const STATUS_RANK = { OVERDUE: 0, DUE_SOON: 1, OK: 2 } as const;

tasks.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.importance - a.importance);
```

## Documented gotchas to carry into the plan

> [!IMPORTANT]
> **Use `differenceInCalendarDays`, not `differenceInDays`, for the status thresholds.** `differenceInDays`
> counts full 24-hour periods and accounts for time-of-day (e.g. 23:59 → 00:01 next day = `0`, not `1`), which
> would misclassify a task as OVERDUE/OK a day later or earlier than the calendar date suggests.
> `differenceInCalendarDays` strips time-of-day and compares calendar dates directly — the correct semantics for
> a date-only field like `last_done_date`.

> [!WARNING]
> **`addMonths` clamps to the end of the target month** when the source day-of-month doesn't exist there (e.g.
> `addMonths(Jan 31, 1)` → Feb 28, not Mar 3). A monthly-frequency task last done on the 29th/30th/31st will see
> its due date silently clamp in short months — expected date-fns behavior, but worth a test case (`test_should_ clamp_due_date_when_last_done_date_is_month_end`) rather than a surprise found in production.

> [!NOTE]
> **Use lowercase format tokens** (`yyyy-MM-dd`), not Moment-style uppercase (`YYYY-MM-DD`). date-fns' `format`
> and `parse` treat `YYYY`/`DD` as ISO week-numbering year / day-of-year tokens, not calendar year / day-of-month
> — a common migration bug documented directly in date-fns' own docs.

## Sources

- <https://github.com/date-fns/date-fns/blob/main/pkgs/core/src/addDays/index.ts>
- <https://github.com/date-fns/date-fns/blob/main/pkgs/core/src/addMonths/index.ts>
- <https://github.com/date-fns/date-fns/blob/main/pkgs/core/src/differenceInCalendarDays/index.ts>
- <https://github.com/date-fns/date-fns/blob/main/pkgs/core/src/differenceInDays/index.ts>
- <https://github.com/date-fns/date-fns/blob/main/pkgs/core/src/compareDesc/index.ts>
- <https://github.com/date-fns/date-fns/blob/main/pkgs/core/src/differenceInBusinessDays/index.ts>
- <https://github.com/date-fns/date-fns/blob/main/pkgs/core/src/parseISO/index.ts>
- <https://github.com/date-fns/date-fns/blob/main/pkgs/core/docs/gettingStarted.md>
- <https://github.com/date-fns/date-fns/blob/main/pkgs/core/docs/unicodeTokens.md>
