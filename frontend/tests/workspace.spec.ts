import { test, expect } from "@playwright/test";
test("report actions confirm kickoff and reanalysis preserves feedback", async ({ page }) => {
  await page.goto("/#report-1");
  const feedback = page.getByLabel("會員資料管理的使用者回饋");
  await feedback.fill("確認需加入第三方登入。");
  await page.getByRole("button", { name: "準備開案", exact: true }).click();
  await page.getByRole("button", { name: "返回檢視", exact: true }).click();
  await expect(page.locator(".report-title .status")).toHaveText("協作中");
  await page.getByRole("button", { name: "準備開案", exact: true }).click();
  await page.getByRole("button", { name: "確認，準備開案", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "已準備開案", exact: true })).toBeDisabled();
  await expect(feedback).toHaveValue("確認需加入第三方登入。");
  await page.getByRole("button", { name: "重新分析", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("尚未串接 AI");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.locator(".report-title .status")).toHaveText("已準備開案");
  await page.getByRole("button", { name: "重新分析", exact: true }).click();
  await page.getByRole("button", { name: "確認重新分析", exact: true }).click();
  await expect(page.getByRole("button", { name: "正在重新分析…", exact: true })).toBeDisabled();
  await expect(page.locator(".report-title .status")).toHaveText("待確認");
  await page.reload();
  await expect(feedback).toHaveValue("確認需加入第三方登入。");
  await expect(page.getByRole("button", { name: "準備開案", exact: true })).toBeEnabled();
  await page.goto("/#reports");
  await expect(page.locator(".report-row").filter({ hasText: "會員中心改版" })).toContainText("待確認");
});
test("report search, status filtering, and browser navigation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("h1")).toHaveText("新增需求分析");
  await page.getByRole("link", { name: "分析報告" }).click();
  await expect(page.locator(".report-row")).toHaveCount(6);
  await page
    .getByRole("textbox", { name: "搜尋報告", exact: true })
    .fill("退款");
  await expect(page.locator(".report-row")).toHaveCount(1);
  await page
    .getByRole("textbox", { name: "搜尋報告", exact: true })
    .fill("不存在的需求");
  await expect(page.getByText("沒有符合的報告")).toBeVisible();
  await page.getByRole("button", { name: "清除篩選" }).click();
  await page
    .locator(".filter-tabs")
    .getByRole("button", { name: "已準備開案", exact: true })
    .click();
  await expect(page.locator(".report-row")).toHaveCount(2);
  await page.locator(".report-row").first().click();
  await expect(page.locator(".report-title h1")).toContainText("企業方案");
  await expect(page.locator(".use-case-card")).toHaveCount(2);
  await page.goBack();
  await expect(page.locator("h1")).toHaveText("分析報告");
  await page.locator(".brand").click();
  await expect(page.getByLabel("報告名稱")).toBeVisible();
  expect(errors).toEqual([]);
});
test("create use cases and persist independent feedback", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "建立示範分析", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "至少 2 個字",
  );
  await page.getByLabel("報告名稱").fill("測試需求協作");
  await page
    .getByLabel("需求內容", { exact: false })
    .fill(
      "我們需要建立新的會員登入流程，包含會員資料查詢、角色權限與異常處理。",
    );
  await page.getByRole("button", { name: "重試建立示範分析" }).click();
  await expect(page.locator(".report-title h1")).toHaveText("測試需求協作");
  await expect(page.locator(".use-case-card")).toHaveCount(2);
  const feedback = page.getByLabel("主要使用流程的使用者回饋");
  await feedback.fill("請補上第三方登入並請資安部協作。");
  await expect(page.locator(".use-case-card").first()).toContainText("已儲存在此瀏覽器");
  await page.reload();
  await expect(feedback).toHaveValue("請補上第三方登入並請資安部協作。");
  await expect(page.getByLabel("例外與權限處理的使用者回饋")).toHaveValue("");
  await expect(page.locator(".use-case-card").first().locator(".use-case-tags li")).toHaveCount(2);
  await feedback.fill("");
  await page.reload();
  await expect(feedback).toHaveValue("");
});
test("company department import validation and replacement", async ({
  page,
}) => {
  await page.goto("/#company");
  const upload = page.getByLabel("重新匯入部門資料");
  await upload.setInputFiles({
    name: "invalid.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("invalid"),
  });
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Unexpected token",
  );
  await upload.setInputFiles({
    name: "departments.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        departments: [
          { id: "d1", name: "測試部門", description: "負責測試匯入。" },
        ],
      }),
    ),
  });
  await expect(
    page.getByRole("heading", { name: "1 個部門，清楚看見責任邊界" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "測試部門" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "測試部門" })).toBeVisible();
});
test("legacy report feedback persists and storage failure is visible", async ({ page }) => {
  await page.goto("/#report-1");
  await expect(page.locator(".use-case-card")).toHaveCount(3);
  const feedback = page.getByLabel("會員資料管理的使用者回饋");
  await feedback.fill("舊報告回饋");
  await page.goto("/#reports");
  await page.goto("/#report-1");
  await expect(feedback).toHaveValue("舊報告回饋");
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error("quota"); }; });
  await feedback.fill("尚未儲存的回饋");
  await expect(page.locator(".use-case-card").first()).toContainText("尚未儲存，請匯出備份");
  await expect(feedback).toHaveValue("尚未儲存的回饋");
});
test("mobile pages fit the viewport and navigation works", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByLabel("報告名稱")).toBeVisible();
  await page.screenshot({ path: "/tmp/whose-pot-mobile.png", fullPage: true });
  for (const route of ["reports", "new", "company", "report-1"]) {
    await page.goto("/#" + route);
    await expect(page.locator("h1")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
  }
  await page.getByRole("navigation", { name: "Use Case 步驟列" })
    .getByRole("button", { name: "03 帳號安全驗證" }).click();
  await expect(page.locator("#use-case-2")).toBeFocused();
  await expect(page.getByRole("navigation", { name: "Use Case 步驟列" })
    .getByRole("button", { name: "03 帳號安全驗證" })).toHaveAttribute("aria-current", "step");
  await expect(page).toHaveURL(/#report-1$/);
  await page.getByLabel("帳號安全驗證的使用者回饋").fill("檢查安全驗證");
  await expect(page.getByLabel("帳號安全驗證的使用者回饋")).toHaveValue("檢查安全驗證");
  await page.getByRole("button", { name: "回到頂部", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByRole("button", { name: "回到頂部", exact: true })).toHaveCount(0);
  await expect(page.locator("main")).toBeFocused();
  await page.getByRole("button", { name: "開啟導覽" }).click();
  await page
    .locator(".sidebar")
    .getByRole("link", { name: "分析報告" })
    .click();
  await expect(page.locator("h1")).toHaveText("分析報告");
});
test("desktop visual baseline", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("報告名稱")).toBeVisible();
  await page.screenshot({ path: "/tmp/whose-pot-desktop.png", fullPage: true });
  await page.goto("/#report-1");
  await expect(page.locator(".use-case-card")).toHaveCount(3);
  await page.screenshot({
    path: "/tmp/whose-pot-use-cases.png",
    fullPage: true,
  });
});

test("new and company page visual check", async ({ page }) => {
  await page.goto("/#new");
  await expect(page.getByLabel("報告名稱")).toBeVisible();
  await page.screenshot({ path: "/tmp/whose-pot-new.png", fullPage: true });
  await page.goto("/#company");
  await expect(
    page.getByRole("heading", { name: "10 個部門，清楚看見責任邊界" }),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/whose-pot-company.png", fullPage: true });
  await page.getByRole("link", { name: "跳至主要內容" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  await expect(page.locator("h1")).toHaveText("公司資料");
});
