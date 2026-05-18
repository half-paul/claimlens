import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/test/reset");
  expect(response.ok()).toBeTruthy();
});

test("admin imports, reviewer annotates, admin scores, visitor searches and opens commentary", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Encyclopedia article URL").fill("https://en.wikipedia.org/wiki/Ada_Lovelace");
  await page.getByRole("button", { name: "Import snapshot" }).click();
  await expect(page.getByRole("heading", { name: "Ada Lovelace" })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/Stored .*revision/)).toBeVisible();

  await page.getByRole("button", { name: "reviewer" }).click();
  await page.locator(".articleBody .sentence").first().click();
  await expect(page.getByRole("heading", { name: "New annotation" })).toBeVisible();
  await page.getByLabel("Annotation classification").selectOption("Missing context");
  await page.getByLabel("Annotation score").selectOption("Partly true");
  await page.getByPlaceholder("Comment or alternative explanation").fill("The sentence needs context from an independent source.");
  await page.getByPlaceholder("Reference URL").fill("https://www.britannica.com/biography/Ada-Lovelace");
  await page.getByPlaceholder("Reference title").fill("Ada Lovelace | Biography");
  await page.getByPlaceholder("Quote or summary").fill("External reference used to support the annotation.");
  await page.getByRole("button", { name: "Submit annotation" }).click();

  await expect(page.getByRole("heading", { name: "Missing context" })).toBeVisible();
  await expect(page.getByText("The sentence needs context from an independent source.")).toBeVisible();

  await page.getByRole("button", { name: "admin" }).click();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Introduction · sentence · approved")).toBeVisible();
  const scoreSelect = page.locator('select[aria-label="Article score"]');
  await scoreSelect.selectOption({ label: "Partly true" });
  await expect(scoreSelect).toHaveValue("Partly true");
  await page.getByPlaceholder("Overall summary/comment").fill("Overall score assigned after human review.");
  await page.getByRole("button", { name: "Save score" }).click();
  await expect(page.getByText("Article score saved.")).toBeVisible();
  await expect(page.locator(".reviewStats .score", { hasText: "Partly true" })).toBeVisible();

  await page.getByRole("button", { name: "visitor" }).click();
  await page.getByLabel("Search").fill("Ada Lovelace");
  await page.getByRole("button", { name: "Search stored articles" }).click();
  await page.getByRole("button", { name: /Ada Lovelace/ }).click();
  await page.locator(".sourceHighlight.approved").first().click();

  await expect(page.getByText("Stored source copy with independent reviewer commentary")).toBeVisible();
  await expect(page.getByText("Ada Lovelace | Biography")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Missing context" })).toBeVisible();
});

test("reviewer can flag selected source text as a word-level annotation", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Encyclopedia article URL").fill("https://en.wikipedia.org/wiki/Ada_Lovelace");
  await page.getByRole("button", { name: "Import snapshot" }).click();
  await expect(page.getByRole("heading", { name: "Ada Lovelace" })).toBeVisible({ timeout: 30000 });

  await page.getByRole("button", { name: "reviewer" }).click();
  await page.getByRole("button", { name: "word" }).click();
  const pickerParagraph = page.locator(".reviewerSentencePicker p").first();
  await pickerParagraph.evaluate((node) => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const textNode = Array.from({ length: 100 }, () => walker.nextNode()).find((child) =>
      child?.textContent?.match(/\b[A-Za-z]{4,}\b/)
    );
    if (!textNode?.textContent) throw new Error("No text node found");
    const wordStart = textNode.textContent.search(/\b[A-Za-z]{4,}\b/);
    const range = document.createRange();
    range.setStart(textNode, wordStart);
    range.setEnd(textNode, wordStart + textNode.textContent.slice(wordStart).match(/^[A-Za-z]+/)![0].length);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.getByRole("button", { name: "Flag selected text" }).click();
  await expect(page.getByText(/word selection/)).toBeVisible();
  await page.getByLabel("Annotation score").selectOption("Mostly false");
  await page.getByPlaceholder("Comment or alternative explanation").fill("This selected word needs a narrower claim.");
  await page.getByRole("button", { name: "Submit annotation" }).click();

  await expect(page.getByText("This selected word needs a narrower claim.")).toBeVisible();
  await expect(page.getByText("Mostly false")).toBeVisible();
});

test("mutating API routes enforce role-based access", async ({ request }) => {
  const anonymousImport = await request.post("/api/articles", {
    data: { url: "https://en.wikipedia.org/wiki/Ada_Lovelace" }
  });
  expect(anonymousImport.status()).toBe(401);

  const reviewerDomainUpdate = await request.patch("/api/domains", {
    headers: { "x-test-role": "reviewer" },
    data: { allowed_domains: ["wikipedia.org"] }
  });
  expect(reviewerDomainUpdate.status()).toBe(403);

  const adminDomainUpdate = await request.patch("/api/domains", {
    headers: { "x-test-role": "admin" },
    data: { allowed_domains: ["wikipedia.org", "britannica.com"] }
  });
  expect(adminDomainUpdate.ok()).toBeTruthy();
});
