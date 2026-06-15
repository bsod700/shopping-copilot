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
