/**
 * @fileoverview Playwright E2E tests for the core chat and persistence flows.
 *
 * These tests run against a real Next.js dev server (configured in `playwright.config.ts`)
 * and make live OpenAI API calls — they are the only test layer that exercises the full
 * stack end-to-end: browser → Next.js → AI SDK → OpenAI → DummyJSON → SQLite → UI.
 *
 * Tests run `.serial` (not parallel) because they share the same server and each test's
 * first message creates a new conversation that subsequent assertions depend on.
 *
 * Key contracts verified:
 * - **core flow**: a typed message produces visible product cards (`data-testid="product-card"`)
 *   with image and price — the fundamental render path.
 * - **persistence**: messages and cards survive a full page reload, verifying the
 *   delete-then-recreate transaction landed before the reload. Uses `toPass` retry loop
 *   because `onFinish` persistence is async and may not complete before the reload.
 * - **new conversation**: "New chat" navigates to a fresh URL, the previous messages are
 *   gone, and the sidebar gains a new `data-testid="conversation-item"` entry.
 */
import { test, expect } from "@playwright/test";

test.describe.serial("chat flow", () => {
  test("core flow: search returns product cards with title, price, and image", async ({ page }) => {
    await page.goto("/");

    const input = page.getByTestId("chat-input");
    await input.fill("show me some smartphones");
    await input.press("Enter");

    const firstCard = page.getByTestId("product-card").first();
    await expect(firstCard).toBeVisible({ timeout: 60_000 });

    await expect(firstCard.locator("img")).toBeVisible();
    await expect(firstCard.getByText(/\$\d/).first()).toBeVisible();
    // CardTitle renders the product title as text content somewhere in the card.
    await expect(firstCard).not.toBeEmpty();
  });

  test("persistence: messages and product cards survive a reload", async ({ page }) => {
    await page.goto("/");

    const input = page.getByTestId("chat-input");
    await input.fill("show me some smartphones");
    await input.press("Enter");

    const firstCard = page.getByTestId("product-card").first();
    await expect(firstCard).toBeVisible({ timeout: 60_000 });

    // onFinish persists the conversation server-side slightly after the client
    // finishes streaming. That happens asynchronously after the UI considers
    // streaming "done", so retry the reload until the persisted state shows up.
    await expect(async () => {
      await page.reload();
      await expect(page.getByRole("log").getByText("show me some smartphones")).toBeVisible({
        timeout: 2_000,
      });
      await expect(page.getByTestId("product-card").first()).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
  });

  test("new conversation: starts a fresh, empty chat and adds a sidebar entry", async ({ page }) => {
    await page.goto("/");

    const input = page.getByTestId("chat-input");
    await input.fill("show me some smartphones");
    await input.press("Enter");
    await expect(page.getByTestId("product-card").first()).toBeVisible({ timeout: 60_000 });

    const conversationsBefore = await page.getByTestId("conversation-item").count();

    const urlBefore = page.url();
    await page.getByTestId("new-conversation").click();
    await page.waitForURL((url) => url.toString() !== urlBefore);

    await expect(page.getByTestId("product-card")).toHaveCount(0);
    await expect(page.getByRole("log").getByText("show me some smartphones")).toHaveCount(0);

    const conversationsAfter = await page.getByTestId("conversation-item").count();
    expect(conversationsAfter).toBeGreaterThan(conversationsBefore);
  });
});
