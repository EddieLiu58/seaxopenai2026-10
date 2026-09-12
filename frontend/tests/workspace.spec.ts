import { expect, test } from "@playwright/test";
import { departmentId, installApi, memory, projectId } from "./api-fixture";

test("lists API projects and exactly one isolated demo", async ({ page }) => {
  const state = await installApi(page);
  await page.goto("/#reports");
  await expect(page.getByRole("link", { name: /真實 API 專案/ })).toBeVisible();
  const demo = page.getByRole("region", { name: "前端示範報告" });
  await expect(demo.locator(".report-row")).toHaveCount(1);
  await demo.getByRole("link").click();
  await expect(page.locator(".report-title h1")).toHaveText(
    "會員中心改版與權限整合",
  );
  await expect(page.getByRole("button", { name: "編輯工作" })).toHaveCount(0);
  await expect(page.getByRole("textbox")).toHaveCount(0);
  expect(state.posts).toHaveLength(0);
});

test("create POST retains idempotency key after network loss and polls real result", async ({
  page,
}) => {
  const state = await installApi(page, {
    initiallyEmpty: true,
    createDisconnect: true,
  });
  await page.goto("/");
  await page.getByLabel("專案名稱", { exact: true }).fill("新增 API 分析");
  await page
    .getByLabel("需求內容", { exact: true })
    .fill("需要管理會員資料，並完成權限驗證。");
  await expect(
    page.getByRole("button", { name: "建立分析", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "建立分析", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "無法連線",
  );
  await page.getByRole("button", { name: "重試建立分析" }).click();
  await expect(page).toHaveURL(new RegExp(`#projects/${projectId}$`));
  await expect(page.getByRole("heading", { name: "確認會員需求" })).toBeVisible(
    { timeout: 15000 },
  );
  expect(state.posts[0].key).toBe(state.posts[1].key);
  expect(state.posts[0].body).toEqual(state.posts[1].body);
  await page.reload();
  await expect(page.locator(".report-title h1")).toHaveText("新增 API 分析");
});

test("editing preserves draft on conflict and sends only modified workflow fields", async ({
  page,
}) => {
  const state = await installApi(page, { conflict: true });
  await page.goto(`/#projects/${projectId}`);
  await expect(page.getByText("不知道", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "編輯工作", exact: true }).click();
  await page
    .getByRole("textbox", { name: "流程描述", exact: true })
    .fill("補充新的驗收條件。");
  await page.getByLabel("修改理由（選填）").fill("依團隊討論修正");
  await page.getByRole("button", { name: "儲存修改" }).click();
  await expect(
    page.getByRole("textbox", { name: "流程描述", exact: true }),
  ).toHaveValue("補充新的驗收條件。");
  await expect(page.getByRole("button", { name: "儲存修改" })).toBeDisabled();
  await page
    .getByRole("button", { name: "已檢視，使用最新版本送出草稿" })
    .click();
  await page.getByRole("button", { name: "儲存修改" }).click();
  await expect(
    page.getByText("補充新的驗收條件。", { exact: true }),
  ).toBeVisible();
  expect(state.patches[1]).toEqual({
    expectedReportVersion: 2,
    description: "補充新的驗收條件。",
    reason: "依團隊討論修正",
  });
  expect(state.report.workflows[0].assignmentSource).toBe("AI");
});

test("assign, add workflow without dependencies, delete with query version and read history", async ({
  page,
}) => {
  const state = await installApi(page);
  await page.goto(`/#projects/${projectId}`);
  await page.getByRole("button", { name: "編輯工作", exact: true }).click();
  await page.getByRole("checkbox", { name: "產品部", exact: true }).check();
  await page.getByRole("button", { name: "儲存修改" }).click();
  await expect(page.getByText("人工指定", { exact: true })).toBeVisible();
  expect(state.patches[0].departmentIds).toEqual([departmentId]);
  expect(state.patches[0]).not.toHaveProperty("departmentId");
  await page.getByRole("button", { name: "新增流程", exact: true }).click();
  await page.getByLabel("工作名稱", { exact: true }).fill("開發會員介面");
  await page
    .getByRole("textbox", { name: "流程描述", exact: true })
    .fill("依需求實作介面。");
  await expect(page.getByText("前置工作", { exact: true })).toHaveCount(0);
  await page
    .locator("form")
    .getByRole("button", { name: "確認新增", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "開發會員介面" }),
  ).toBeVisible();
  expect(
    state.posts.find((p) => p.path.endsWith("/workflows"))?.body
      .dependsOnWorkflowIds,
  ).toBeUndefined();
  const card = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: "開發會員介面" }) });
  await card.getByRole("button", { name: "刪除工作" }).click();
  await page.getByLabel("刪除理由（選填）").fill("需求取消");
  await page.getByRole("button", { name: "確認刪除" }).click();
  await expect(page.getByRole("heading", { name: "開發會員介面" })).toHaveCount(
    0,
  );
  expect(state.deletes[0].searchParams.get("reason")).toBe("需求取消");
  await page.getByRole("button", { name: "修改歷程", exact: true }).click();
  await expect(page.getByText("尚無修改紀錄。")).toBeVisible();
});

test("all reanalysis clears assignments, locks editing and keeps cleared state on failure", async ({
  page,
}) => {
  const state = await installApi(page, { analysisFailed: true });
  await page.goto(`/#projects/${projectId}`);
  await page.getByRole("button", { name: "全部重新分析", exact: true }).click();
  await page.getByLabel("操作理由（必填）").fill("依最新職能重新判定");
  await page.getByRole("button", { name: "確認送出" }).click();
  await expect(page.getByText("未歸屬", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "編輯工作", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText("需求／歸屬分析：失敗")).toBeVisible({
    timeout: 15000,
  });
  expect(state.report.workflows[0].assignmentStatus).toBe("UNASSIGNED");
  await expect(
    page.getByRole("button", { name: "重試分析", exact: true }),
  ).toBeEnabled();
});

test("closed report remains readonly when feedback fails and can retry feedback", async ({
  page,
}) => {
  const state = await installApi(page, { feedbackFailed: true });
  await page.goto(`/#projects/${projectId}`);
  await page
    .getByRole("button", { name: "確認分工並結案", exact: true })
    .click();
  await page.getByLabel("結案說明（選填）").fill("接受目前分工");
  await page.getByRole("button", { name: "確認送出" }).click();
  await expect(page.getByText("組織回饋：失敗")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "編輯工作", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "重試回饋" }).click();
  await expect(page.getByText("組織回饋：已完成")).toBeVisible();
  expect(state.project.status).toBe("CLOSED");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "全部重新分析", exact: true }),
  ).toBeDisabled();
});

test("initialize organization once, including relationship text", async ({
  page,
}) => {
  const state = await installApi(page, { initialized: false });
  await page.goto("/#company");
  await page.getByLabel("組織資料 JSON", { exact: true }).fill(
    JSON.stringify({
      departments: memory.departments,
      relationshipsDescription: memory.relationshipsDescription,
    }),
  );
  await page.getByRole("button", { name: "確認初始化部門清單" }).click();
  await expect(
    page.getByRole("heading", { name: "產品部", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "確認初始化部門清單" }),
  ).toHaveCount(0);
  expect(state.posts[0].body.relationshipsDescription).toBe(
    memory.relationshipsDescription,
  );
});

test("API failure never creates fake projects and still offers exactly one demo", async ({
  page,
}) => {
  await page.route("**/api/v1/**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "UNAVAILABLE", message: "服務暫停", details: {} },
      }),
    }),
  );
  await page.goto("/#reports");
  await expect(
    page.getByRole("region", { name: "前端示範報告" }).locator(".report-row"),
  ).toHaveCount(1);
  await expect(page.locator(".report-row")).toHaveCount(1);
  await expect(page.getByRole("alert").first()).toContainText("服務暫停");
});

test("mobile API report and company fit viewport", async ({ page }) => {
  await installApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const hash of [
    "new",
    "reports",
    "company",
    `projects/${projectId}`,
    "projects/demo-report",
  ]) {
    await page.goto(`/#${hash}`);
    await expect(page.locator("h1")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
  }
  await page.screenshot({ path: "/tmp/seax-api-mobile.png", fullPage: true });
});

test("editing a workflow preserves existing backend dependencies without exposing controls", async ({
  page,
}) => {
  const state = await installApi(page);
  const sourceId = state.report.workflows[0].id;
  state.report.workflows.push({
    ...state.report.workflows[0],
    id: "66666666-6666-4666-8666-666666666666",
    name: "發送完成通知",
    dependsOnWorkflowIds: [sourceId],
  });
  await page.goto(`/#projects/${projectId}`);
  const card = page
    .locator("article")
    .filter({
      has: page.getByRole("heading", { name: "發送完成通知", exact: true }),
    });
  await expect(page.getByRole("heading", { name: "前置工作" })).toHaveCount(0);
  await card.getByRole("button", { name: "編輯工作", exact: true }).click();
  await expect(card.getByText("前置工作", { exact: true })).toHaveCount(0);
  await card
    .getByRole("textbox", { name: "流程描述", exact: true })
    .fill("更新通知內容。");
  await card.getByRole("button", { name: "儲存修改" }).click();
  await expect(card.getByText("更新通知內容。", { exact: true })).toBeVisible();
  expect(state.patches[0]).not.toHaveProperty("dependsOnWorkflowIds");
  expect(state.report.workflows[1].dependsOnWorkflowIds).toEqual([sourceId]);
});

test("multiple departments can be created, edited, cleared and reloaded", async ({
  page,
}) => {
  const state = await installApi(page);
  const secondId = "77777777-7777-4777-8777-777777777777";
  state.memory!.departments.push({
    id: secondId,
    name: "工程部",
    description: "開發",
  });
  await page.goto(`/#projects/${projectId}`);
  await page.getByRole("button", { name: "新增流程", exact: true }).click();
  await page.getByLabel("工作名稱", { exact: true }).fill("跨部門流程");
  await page
    .getByRole("textbox", { name: "流程描述", exact: true })
    .fill("共同開發並驗收。");
  await page.getByRole("checkbox", { name: "產品部", exact: true }).check();
  await page.getByRole("checkbox", { name: "工程部", exact: true }).check();
  await page.getByRole("button", { name: "確認新增", exact: true }).click();
  const card = page
    .locator("article")
    .filter({
      has: page.getByRole("heading", { name: "跨部門流程", exact: true }),
    });
  await expect(card).toContainText("工程部");
  await expect(card).toContainText("產品部");
  const body = state.posts.find((entry) =>
    entry.path.endsWith("/workflows"),
  )!.body;
  expect(body.departmentIds).toEqual([departmentId, secondId]);
  expect(body).not.toHaveProperty("departmentId");
  await page.reload();
  await card.getByRole("button", { name: "編輯工作", exact: true }).click();
  await expect(
    card.getByRole("checkbox", { name: "工程部", exact: true }),
  ).toBeChecked();
  await expect(
    card.getByRole("checkbox", { name: "產品部", exact: true }),
  ).toBeChecked();
  await card.getByRole("checkbox", { name: "工程部", exact: true }).uncheck();
  await card.getByRole("button", { name: "儲存修改", exact: true }).click();
  await expect(
    card.getByRole("button", { name: "編輯工作", exact: true }),
  ).toBeVisible();
  expect(state.patches.at(-1)?.departmentIds).toEqual([departmentId]);
  await card.getByRole("button", { name: "編輯工作", exact: true }).click();
  await card.getByRole("checkbox", { name: "產品部", exact: true }).uncheck();
  await card
    .getByRole("combobox", { name: "歸屬狀態", exact: true })
    .selectOption("UNKNOWN");
  await card.getByRole("button", { name: "儲存修改", exact: true }).click();
  await expect(card.getByText("不知道", { exact: true })).toBeVisible();
  expect(state.patches.at(-1)).toMatchObject({
    departmentIds: [],
    assignmentStatus: "UNKNOWN",
  });
});
