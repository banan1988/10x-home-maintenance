// risk: test-plan.md §3 Phase 5, risk #5 — the full login → add → edit → complete →
// delete journey works through the real UI (the last open risk in the test rollout).
// seed: tests/e2e/seed.spec.ts
import { test, expect } from "@playwright/test";

const TEST_USER_EMAIL = "isolation-test-user-a@example.com";
const TEST_USER_PASSWORD = "isolation-test-password";

test("user can sign in, add, view, edit, complete, and delete a maintenance task", async ({ page }) => {
  // Login through the real UI is a deliberate exception to this project's "authenticate
  // without the UI" default rule (see E2E_RULES.md) — login is the risk under test here,
  // not incidental setup.
  await page.goto("/auth/signin");
  await page.getByRole("textbox", { name: "Email" }).fill(TEST_USER_EMAIL);
  await page.getByRole("textbox", { name: "Password" }).fill(TEST_USER_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Successful sign-in redirects to "/", not "/dashboard" — navigate there explicitly.
  await page.waitForURL("/");
  await page.goto("/dashboard");

  const taskName = `E2E Task ${Date.now()}`;
  const editedTaskName = `${taskName} Edited`;

  // Negative assertion: submitting the Add Task form with no fields filled must be
  // blocked client-side — the dialog stays open and no navigation occurs.
  await page.getByRole("button", { name: "Add task" }).click();
  const addDialog = page.getByRole("dialog");
  await addDialog.getByRole("button", { name: "Add task" }).click();
  await expect(addDialog.getByText("Name is required")).toBeVisible();
  await expect(page).toHaveURL("/dashboard");

  // Fill in a valid task. last_done_date = today, frequency = 3 days lands comfortably
  // inside the DUE_SOON band (0 < days-until-due <= 7), away from either status boundary,
  // so the dashboard and /tasks status texts below are genuinely distinct strings.
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

  // Dashboard renders the friendly STATUS_LABEL ("Due soon"), not the raw enum.
  const dashboardRow = page.getByRole("listitem").filter({ hasText: taskName });
  await expect(dashboardRow).toBeVisible();
  await expect(dashboardRow.getByText("Due soon")).toBeVisible();

  // /tasks renders the raw TaskStatus enum ("DUE_SOON") for the same task.
  await page.goto("/tasks");
  let taskRow = page.getByRole("row", { name: taskName });
  await expect(taskRow).toBeVisible();
  await expect(taskRow.getByText("DUE_SOON", { exact: true })).toBeVisible();

  // Edit: change the name and frequency; only Name/Frequency value are reliably
  // getByRole-addressable in this dialog (see E2E_RULES.md — Category/Importance have no
  // accessible name here).
  await taskRow.getByRole("button", { name: "Edit" }).click();
  const editDialog = page.getByRole("dialog");
  await editDialog.getByRole("textbox", { name: "Name" }).fill(editedTaskName);
  await editDialog.getByRole("spinbutton", { name: "Frequency value" }).fill("4");
  await editDialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Task updated")).toBeVisible();

  taskRow = page.getByRole("row", { name: editedTaskName });
  await expect(taskRow).toBeVisible();

  // Complete: DUE_SOON tasks mark done without an extra confirmation step (only OK-status
  // tasks prompt "mark as done early?" — see shouldConfirmCompletion in src/lib/status.ts).
  await taskRow.getByRole("button", { name: "Mark done" }).click();
  await expect(page.getByText("Task completed — see you in 4 days")).toBeVisible();

  // Delete — this also doubles as the test's own cleanup.
  taskRow = page.getByRole("row", { name: editedTaskName });
  await taskRow.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Task deleted")).toBeVisible();
  await expect(page.getByRole("row", { name: editedTaskName })).not.toBeVisible();
});
