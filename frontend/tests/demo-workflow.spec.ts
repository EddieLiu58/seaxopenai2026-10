import { expect, test } from "@playwright/test";
import { demoStorageKey } from "../src/lib/demo-workflows";

test("demo can add workflows offline, persist locally and stay isolated from API", async ({
  page,
}) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (["POST", "PATCH", "DELETE"].includes(request.method()))
      writes.push(request.url());
  });
  await page.route("**/api/v1/**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "UNAVAILABLE", message: "服務暫停", details: {} },
      }),
    }),
  );
  await page.goto("/#projects/demo-report");
  await page.getByRole("button", { name: "新增流程", exact: true }).click();
  await page
    .getByRole("textbox", { name: "工作名稱", exact: true })
    .fill("寄送會員通知");
  await page
    .getByRole("textbox", { name: "流程描述", exact: true })
    .fill("會員資料更新後寄送通知。");
  await page.getByRole("checkbox", { name: "後端開發部", exact: true }).check();
  const secondDepartment = page
    .getByRole("checkbox")
    .filter({ visible: true })
    .first();
  const secondName = await secondDepartment.locator("..").innerText();
  await secondDepartment.check();
  await expect(page.getByText("前置工作", { exact: true })).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "修改理由（選填）" })
    .fill("補充通知流程");
  await page.getByRole("button", { name: "確認新增", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("儲存在此瀏覽器");
  const card = page.locator("article").filter({
    has: page.getByRole("heading", { name: "寄送會員通知", exact: true }),
  });
  await expect(card).toContainText("後端開發部");
  await expect(card).toContainText(secondName.trim());
  await expect(card).not.toContainText("前置工作");
  await expect(card).toContainText("補充通知流程");
  await page.reload();
  await expect(card).toBeVisible();
  await expect(card).toContainText("後端開發部");
  await expect(card).toContainText(secondName.trim());
  await page.goto("/#report-1");
  await expect(card).toBeVisible();
  await page.getByRole("button", { name: "新增流程", exact: true }).click();
  await expect(page.getByText("前置工作", { exact: true })).toHaveCount(0);
  expect(writes).toEqual([]);
});

test("failed local save keeps the demo form draft and does not claim success", async ({
  page,
}) => {
  await page.addInitScript((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key)
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      original.call(this, name, value);
    };
  }, demoStorageKey);
  await page.route("**/api/v1/**", (route) => route.abort());
  await page.goto("/#projects/demo-report");
  await page.getByRole("button", { name: "新增流程", exact: true }).click();
  await page
    .getByRole("textbox", { name: "工作名稱", exact: true })
    .fill("尚未儲存的工作");
  await page
    .getByRole("textbox", { name: "流程描述", exact: true })
    .fill("本機空間不足時保留草稿。");
  await page.getByRole("button", { name: "確認新增", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "工作名稱", exact: true }),
  ).toHaveValue("尚未儲存的工作");
  await expect(
    page.getByText("瀏覽器無法儲存這筆 Workflow，請檢查儲存空間或權限後重試。"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "尚未儲存的工作" }),
  ).toHaveCount(0);
  await expect(page.getByText("已新增流程 並儲存在此瀏覽器。")).toHaveCount(0);
});
