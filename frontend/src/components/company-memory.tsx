"use client";
import { useRef, useState } from "react";
import { api, errorMessage, validateText } from "@/lib/api/client";
import type { GlobalMemory, InitializeMemory } from "@/lib/api/types";
import { refreshWorkspace } from "@/lib/workspace-store";
import { DepartmentChart } from "./department-chart";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { ErrorNotice, displayDate, Loading } from "./api-shared";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function parseMemory(text: string): InitializeMemory {
  const value = JSON.parse(text);
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !Array.isArray(value.departments)
  )
    throw new Error(
      "JSON 必須包含 departments 陣列及 relationshipsDescription 文字。",
    );
  if (
    Object.keys(value).some(
      (key) => !["departments", "relationshipsDescription"].includes(key),
    )
  )
    throw new Error(
      "初始化 JSON 僅接受 departments 與 relationshipsDescription。",
    );
  if (!value.departments.length || value.departments.length > 200)
    throw new Error("部門數量必須介於 1–200。");
  const ids = new Set<string>();
  for (const department of value.departments) {
    if (
      !department ||
      typeof department !== "object" ||
      Array.isArray(department) ||
      !uuid.test(department.id) ||
      typeof department.name !== "string" ||
      typeof department.description !== "string"
    )
      throw new Error("每個部門需要 UUID 格式 id、name、description。");
    if (
      Object.keys(department).some(
        (key) => !["id", "name", "description"].includes(key),
      )
    )
      throw new Error("部門僅接受 id、name、description。");
    if (ids.has(department.id.toLowerCase()))
      throw new Error("部門 ID 不可重複。");
    ids.add(department.id.toLowerCase());
    validateText(department.name, "部門名稱", 200);
    validateText(department.description, "部門職能", 10000);
  }
  if (typeof value.relationshipsDescription !== "string")
    throw new Error("請提供 relationshipsDescription，可為空字串。");
  validateText(value.relationshipsDescription, "組織關係", 100000, false);
  return value as InitializeMemory;
}
export function CompanyMemory({
  memory,
  loading,
  loadError,
}: {
  memory: GlobalMemory | null;
  loading: boolean;
  loadError: string;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const initialize = async (event: React.FormEvent) => {
    event.preventDefault();
    if (lock.current) return;
    let body: InitializeMemory;
    try {
      body = parseMemory(text);
    } catch (error) {
      setError(errorMessage(error));
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await api.initialize(body);
      await refreshWorkspace();
    } catch (error) {
      setError(errorMessage(error));
      await refreshWorkspace();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="page-kicker">讓每一次分析，都有公司的脈絡。</div>
          <h1>部門清單</h1>
          <p>全系統共用的組織職能，隨結案回饋持續更新。</p>
        </div>
        <Button
          variant="outline"
          disabled={loading || busy}
          onClick={() => void refreshWorkspace()}
        >
          重新載入
        </Button>
      </div>
      <ErrorNotice message={loadError || error} />
      {loading && !memory ? (
        <Loading />
      ) : memory ? (
        <>
          <div className="api-notice">
            版本 {memory.version} ·{" "}
            {memory.source === "INITIAL" ? "初始組織資料" : "結案回饋更新"} ·{" "}
            {displayDate(memory.createdAt)}
          </div>
          <DepartmentChart memory={memory} />
          <p className="api-notice">
            組織資料已初始化。後續由結案回饋更新職能描述，不能再次匯入覆蓋。
          </p>
        </>
      ) : (
        !loadError && (
          <form className="form-surface" onSubmit={initialize}>
            <h2>首次初始化部門清單</h2>
            <p>
              匯入部門與組織關係 JSON。全系統僅初始化一次，送出前請確認內容。
            </p>
            <label>
              選擇組織 JSON
              <input
                type="file"
                accept=".json,application/json"
                disabled={busy}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    if (file.size > 10 * 1024 * 1024)
                      throw new Error("JSON 不可超過 10 MiB。");
                    setText(await file.text());
                  } catch (error) {
                    setError(errorMessage(error));
                  }
                }}
              />
            </label>
            <label>
              組織資料 JSON
              <Textarea
                rows={15}
                value={text}
                onChange={(event) => setText(event.target.value)}
                disabled={busy}
                placeholder={
                  '{"departments":[{"id":"部門 UUID","name":"部門名稱","description":"部門職能"}],"relationshipsDescription":"組織關係"}'
                }
              />
            </label>
            <Button type="submit" disabled={busy}>
              {busy ? "正在初始化…" : "確認初始化部門清單"}
            </Button>
          </form>
        )
      )}
    </>
  );
}
