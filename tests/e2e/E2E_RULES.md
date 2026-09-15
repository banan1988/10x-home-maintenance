# E2E Testing Rules

These rules govern every Playwright spec generated under `tests/e2e/`. See `seed.spec.ts`
for the worked example.

- Use `getByRole`, `getByLabel`, `getByText` as primary locators. Never CSS selectors,
  XPath, or DOM structure. Fall back to `getByTestId` only when accessibility attributes
  are truly ambiguous (none needed so far in this app).
- Each test is independently runnable — its own setup, action, assertion, and cleanup.
  No test may assume another test already ran.
- Never use `page.waitForTimeout()`. Wait for state: `toBeVisible()`, `waitForURL()`,
  `waitForResponse()`.
- Use a unique identifier (timestamp suffix, e.g. `` `Task ${Date.now()}` ``) for every
  piece of test data created, and clean it up (delete) at the end of the test.
- **Authenticate without the UI by default** — `page.request.post("/api/auth/signin", { form: { email, password }, headers: { origin: baseURL } })`
  before navigating. `page.request` shares its cookie jar with the browser context (a
  Playwright-documented guarantee), so this logs the browser in without ever touching the
  sign-in form. **The explicit `origin` header is required**, not optional: Astro's
  built-in CSRF check 403s a same-origin POST that arrives without one — a real browser
  form submission always sends this header, but Playwright's `APIRequestContext` does not
  add it automatically. Use the `baseURL` fixture, never a hardcoded string. The one
  deliberate exception to UI-free auth: a test whose named risk *is* the login flow itself
  (e.g. the key-user-flow spec) signs in through the real UI on purpose — that is the risk
  under test, not incidental setup.
- Assert the business outcome (task visible with the right status text, row gone after
  delete), never an implementation detail.

## App-specific patterns discovered via browser-driven exploration

- **Scope locators to the open dialog/row.** Add/Edit dialogs and the tasks table reuse
  the same button text ("Add task", "Edit", "Delete", "Mark done") in more than one place
  at once. Scope with `page.getByRole("dialog")` / `page.getByRole("alertdialog")` /
  `page.getByRole("row", { name: taskName })` rather than relying on element order.
- **Playwright automatically excludes `aria-hidden` content from role queries.** When a
  Radix dialog opens, the page behind it gets `aria-hidden`, so a plain
  `getByRole("button", { name: "Delete" })` inside an open `alertdialog` resolves
  unambiguously even though an identically-named button exists in the table behind it.
  Still prefer explicit dialog/row scoping above for clarity and to stay correct if that
  changes.
- **The calendar's "today" cell has a dynamic accessible name** — `"Today, <Weekday>, <Month> <Day>, <Year>"`. Use `page.getByRole("button", { name: /^Today,/ })`, never a
  hardcoded date string.
- **Success query params are transient.** `?success=task-added` etc. get stripped via
  client-side `history.replaceState` almost immediately after the page's toast-trigger
  script runs. Don't assert on the URL's query string — wait for the visible toast text
  or the resulting DOM change instead.
- **Dashboard vs. Tasks show different status text for the same task**: `/dashboard`
  renders the friendly `STATUS_LABEL` ("Due soon"/"OK"/"Overdue"); `/tasks` renders the
  raw `TaskStatus` enum ("DUE_SOON"/"OK"/"OVERDUE") as a table cell.
- **`EditTaskDialog`'s Category/Importance selects have no accessible name** (a real gap:
  their `SelectTrigger` has no `id` paired with the adjacent `<label>`, unlike
  `AddTaskDialog`). Only `Name` and `Frequency value` are reliably `getByRole`-addressable
  in the edit dialog; don't touch Category/Importance there.
- **Wait for network idle after every navigation to a page with a `client:load` island,
  before interacting with it.** Every page here mounts one (`SignInForm` / `AddTaskDialog` /
  `TaskList`). On a cold dev server, Vite's on-demand module transforms for that island's JS
  can still be in flight when a `fill()`/`click()` sets a DOM value; React's hydration then
  mounts with its own (stale/empty) initial state and silently wipes it — the symptom is a
  client-side validation error ("Name is required") on a field you just filled, or a hang
  waiting for a navigation that never happens because the form never actually submitted. Use
  a small `gotoAndWaitForHydration(page, url)` helper (`page.goto` + `page.waitForLoadState ("networkidle")`) for every navigation onto such a page — see both spec files. This only
  reproduces on each island's *first* render against a given dev-server process, so a test
  that happens to run after another test already warmed the same route (alphabetical file
  order, `workers: 1` in CI) can pass locally while the same spec run standalone or first
  fails — don't trust a single green run's route-ordering luck as proof this is unnecessary.
