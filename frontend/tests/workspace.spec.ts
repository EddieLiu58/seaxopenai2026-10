import { test, expect } from "@playwright/test";
test("report search, status filtering, and browser navigation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
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
  await expect(
    page.getByRole("button", { name: "已準備開案", exact: true }),
  ).toBeDisabled();
  await page.goBack();
  await expect(page.locator("h1")).toHaveText("分析報告");
  expect(errors).toEqual([]);
});
test("create, adjust, confirm, accumulate memory, and persist on reload", async ({
  page,
}) => {
  await page.goto("/#new");
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
  await expect(page.locator(".work-node")).toHaveCount(5);
  await page.getByRole("button", { name: "準備開案", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText(
    "還有 1 項待確認事項",
  );
  await expect(
    page.getByRole("button", { name: "確認，準備開案" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "返回檢視" }).click();
  await page
    .locator(".work-node")
    .filter({ hasText: "服務與資料介接" })
    .click();
  await page.getByLabel("主責部門").selectOption("數據部");
  await page.getByRole("textbox", { name: "待確認事項", exact: true }).fill("");
  await page.getByLabel("調整原因").fill("會議已確認由數據部主責資料介接。");
  await page.getByRole("button", { name: "儲存調整" }).click();
  await page.reload();
  await expect(
    page.locator(".work-node").filter({ hasText: "服務與資料介接" }),
  ).toContainText("數據部");
  await page.getByRole("button", { name: "準備開案", exact: true }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "確認，準備開案" }).click();
  await expect(
    page.getByRole("button", { name: "已準備開案", exact: true }),
  ).toBeDisabled();
  await page.goto("/#company");
  await page.getByRole("tab", { name: "公司記憶" }).click();
  await expect(page.locator(".memory-item")).toHaveCount(3);
  await expect(page.locator(".memory-item").first()).toContainText(
    "會議已確認由數據部主責資料介接。",
  );
});
test("company document validation, upload, editing and deletion", async ({
  page,
}) => {
  await page.goto("/#company");
  const upload = page.getByLabel("上傳公司資料");
  await upload.setInputFiles({
    name: "invalid.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("invalid"),
  });
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "此版本支援",
  );
  await upload.setInputFiles({
    name: "測試職掌.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("平台部負責共用服務與基礎建設。"),
  });
  await expect(page.locator(".document-row")).toHaveCount(4);
  await page
    .locator(".document-open")
    .filter({ hasText: "測試職掌.md" })
    .click();
  await page
    .getByLabel("文件內容")
    .fill("平台部主責共用服務；產品部確認使用情境。");
  await page.getByRole("button", { name: "儲存文件" }).click();
  await page.reload();
  await page
    .locator(".document-open")
    .filter({ hasText: "測試職掌.md" })
    .click();
  await expect(page.getByLabel("文件內容")).toHaveValue(
    "平台部主責共用服務；產品部確認使用情境。",
  );
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "刪除 測試職掌.md", exact: true })
    .click();
  await page.getByRole("button", { name: "確認刪除", exact: true }).click();
  await expect(page.locator(".document-row")).toHaveCount(3);
});
test("workflow add work, edit, connect and remove using keyboard-accessible forms", async ({
  page,
}) => {
  await page.goto("/#report-1");
  await page.getByRole("button", { name: "新增工作", exact: true }).click();
  await page.getByLabel("工作名稱").fill("權限稽核");
  await page.getByLabel("調整原因").fill("新增稽核步驟避免權限遺漏");
  await page.getByRole("button", { name: "儲存調整" }).click();
  await expect(page.locator(".work-node")).toHaveCount(6);
  await page.getByText("用表單管理連線（鍵盤操作）").click();
  await page.getByLabel("前置工作").selectOption({ label: "整合測試與驗收" });
  await page.getByLabel("後續工作").selectOption({ label: "權限稽核" });
  await page.getByRole("button", { name: "建立連線", exact: true }).click();
  await expect(page.locator(".edge-list>div")).toHaveCount(6);
  await page.locator(".edge-list>div").last().getByRole("button").click();
  await expect(page.locator(".edge-list>div")).toHaveCount(5);
  await page.locator(".work-node").filter({ hasText: "權限稽核" }).click();
  await page.getByLabel("調整原因").fill("會議決議合併至整合測試");
  await page.getByRole("button", { name: "刪除這項工作" }).click();
  await expect(page.locator(".work-node")).toHaveCount(5);
});
test("mobile pages fit the viewport and navigation works", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".report-row")).toHaveCount(6);
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
  await page.getByRole("button", { name: "開啟導覽" }).click();
  await page
    .locator(".sidebar")
    .getByRole("link", { name: "分析報告" })
    .click();
  await expect(page.locator("h1")).toHaveText("分析報告");
});
test("desktop visual baseline", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".report-row")).toHaveCount(6);
  await page.screenshot({ path: "/tmp/whose-pot-desktop.png", fullPage: true });
  await page.goto("/#report-1");
  await expect(page.locator(".work-node")).toHaveCount(5);
  await page.screenshot({
    path: "/tmp/whose-pot-workflow.png",
    fullPage: true,
  });
});

test("new and company page visual check", async ({ page }) => {
  await page.goto("/#new");
  await expect(page.getByLabel("報告名稱")).toBeVisible();
  await page.screenshot({ path: "/tmp/whose-pot-new.png", fullPage: true });
  await page.goto("/#company");
  await expect(page.locator(".document-row")).toHaveCount(3);
  await page.screenshot({ path: "/tmp/whose-pot-company.png", fullPage: true });
  await page
    .locator(".sidebar-tip")
    .getByRole("link", { name: "查看公司記憶" })
    .click();
  await expect(page.getByRole("tab", { name: "公司記憶" })).toHaveAttribute(
    "data-state",
    "active",
  );
  await page.getByRole("link", { name: "跳至主要內容" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  await expect(page.locator("h1")).toHaveText("公司資料");
});
