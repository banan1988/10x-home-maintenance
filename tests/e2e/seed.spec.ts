// seed test — the exemplar every generated E2E spec in this project is modeled on.
// See tests/e2e/E2E_RULES.md for the governing rules this pattern demonstrates.
import { test, expect, type Page } from "@playwright/test";

const TEST_USER_EMAIL = "isolation-test-user-a@example.com";
const TEST_USER_PASSWORD = "isolation-test-password";

// Every page here mounts a client:load React island (AddTaskDialog / TaskList). On a cold
// dev server, Vite's on-demand module transforms for that island's JS can still be in flight
// when the next interaction sets a DOM value; hydration then mounts with its own (stale/empty)
// initial state and wipes it. Waiting for the network to settle after each navigation lets
// that module graph finish loading first — by then hydration has already run synchronously,
// so subsequent fills/clicks stick. See E2E_RULES.md.
async function gotoAndWaitForHydration(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

test("maintenance task persists after page reload", async ({ page, baseURL }) => {
  // Authenticate without the UI: page.request shares its cookie jar with the browser
  // context, so a plain form POST to the real signin endpoint logs the browser in too.
  // An explicit Origin header is required — Astro's built-in CSRF check 403s a same-origin
  // POST that arrives without one, which a real browser form submission always sends but
  // Playwright's APIRequestContext does not add automatically.
  await page.request.post("/api/auth/signin", {
    form: { email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD },
    headers: { origin: baseURL ?? "" },
  });

  const taskName = `Seed Task ${Date.now()}`;

  await gotoAndWaitForHydration(page, "/dashboard");
  await page.getByRole("button", { name: "Add task" }).click();

  const addDialog = page.getByRole("dialog");
  await addDialog.getByRole("textbox", { name: "Name" }).fill(taskName);
  await addDialog.getByRole("combobox", { name: "Category" }).click();
  await page.getByRole("option", { name: "hvac" }).click();
  await addDialog.getByRole("combobox", { name: "Importance" }).click();
  await page.getByRole("option", { name: "medium" }).click();
  await addDialog.getByRole("spinbutton", { name: "Frequency" }).fill("3");
  await addDialog.getByRole("combobox", { name: "Unit" }).click();
  await page.getByRole("option", { name: "day" }).click();
  await addDialog.getByRole("button", { name: "Pick a date" }).click();
  await page.getByRole("button", { name: /^Today,/ }).click();
  await addDialog.getByRole("button", { name: "Add task" }).click();

  await expect(page.getByText(taskName)).toBeVisible();

  await page.reload();
  await expect(page.getByText(taskName)).toBeVisible();

  // Cleanup: delete the task so re-runs don't accumulate rows.
  await gotoAndWaitForHydration(page, "/tasks");
  const taskRow = page.getByRole("row", { name: taskName });
  await taskRow.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(taskName)).not.toBeVisible();
});
