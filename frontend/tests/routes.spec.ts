import { expect, test } from "@playwright/test";
import { installApi, projectId } from "./api-fixture";
test("API projectId deep link, reload and browser history", async ({
  page,
}) => {
  const state = await installApi(page);
  await page.goto("/#reports");
  await page.getByRole("link", { name: /真實 API 專案/ }).click();
  await expect(page).toHaveURL(new RegExp(`#projects/${projectId}$`));
  await expect(page.locator(".report-title h1")).toHaveText("真實 API 專案");
  await page.reload();
  await expect(page.locator(".report-title h1")).toHaveText("真實 API 專案");
  await page.goBack();
  await expect(page.locator("h1")).toHaveText("分析報告");
  await page.goForward();
  await expect(page.locator(".report-title h1")).toHaveText("真實 API 專案");
  expect(state.reads).toContain(`/projects/${projectId}/report`);
  expect(state.report.id).not.toBe(projectId);
});
test("legacy demo bookmark works and malformed route is recoverable", async ({
  page,
}) => {
  await installApi(page);
  await page.goto("/#report-1");
  await expect(page.locator(".report-title h1")).toHaveText(
    "會員中心改版與權限整合",
  );
  await page.goto("/#projects/%E0%A4%A");
  await expect(
    page.getByRole("heading", { name: "找不到這份報告" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "回到報告列表" }).click();
  await expect(page.locator("h1")).toHaveText("分析報告");
});
