"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import UseCaseReport from "./use-case-report";
import ReportActions from "./report-actions";
import {
  CookingPot,
  LayoutGrid,
  Plus,
  Building2,
  ChevronRight,
  ArrowUpRight,
  FileText,
  Search,
  SlidersHorizontal,
  Clock3,
  CircleCheck,
  GitBranch,
  ArrowLeft,
  Sparkles,
  Upload,
  X,
  Check,
  BookOpen,
  HelpCircle,
  Menu,
  Users,
  ShieldCheck,
  Layers,
  LoaderCircle,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  getUseCases,
  makeNodes,
  makeEdges,
  today,
  type Workspace,
  type Report,
  type CompanyDepartment,
} from "@/lib/workspace-data";
import {
  useWorkspaceStore,
  updateWorkspace,
  useWorkspaceView,
} from "@/lib/workspace-store";
type View = "reports" | "new" | "company" | string;
const statuses = ["全部報告", "待確認", "協作中", "已準備開案"] as const;
function Status({ status }: { status: Report["status"] }) {
  return (
    <span
      className={`status status-${status === "待確認" ? "pending" : status === "協作中" ? "progress" : "done"}`}
    >
      <span />
      {status}
    </span>
  );
}
function download(name: string, content: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/plain;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function readTextFile(file: File) {
  if (!/\.(txt|md)$/i.test(file.name))
    throw new Error("此版本支援 TXT、Markdown 文件；其他格式請先貼上文字。");
  if (file.size > 1024 * 1024)
    throw new Error("文件上限為 1 MB，請縮小文件後重試。");
  const text = await file.text();
  if (!text.trim()) throw new Error("文件沒有可讀取的內容，請改選其他文件。");
  return text;
}
export default function WorkspaceApp() {
  const { data, ready, error: storageError } = useWorkspaceStore();
  const setData = updateWorkspace;
  const view = useWorkspaceView();
  const [toast, setToast] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [help, setHelp] = useState(false);
  const [showPrd, setShowPrd] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 5000);
  }, []);
  useEffect(() => {
    const sync = () => setMobileNav(false);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);
  const navigate = (v: View) => {
    location.hash = v;
    setMobileNav(false);
  };
  const updateReport = useCallback(
    (report: Report) =>
      setData((prev) => ({
        ...prev,
        reports: prev.reports.map((r) =>
          r.id === report.id ? { ...report, date: today() } : r,
        ),
      })),
    [setData],
  );
  const report = data.reports.find((r) => r.id === view);
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "is-open" : ""}`}>
        <a href="#new" className="brand">
          <span className="brand-icon">
            <CookingPot size={24} />
          </span>
          <span>
            這是誰的鍋
            <span className="brand-sub">把分工理清，讓協作發生。</span>
          </span>
        </a>
        <div className="workspace-switch">
          <span className="company-avatar">S</span>
          <div>
            <strong>甩鍋科技</strong>
            <small>公司工作空間</small>
          </div>
          <span className="workspace-demo">示範</span>
        </div>
        <div className="nav-label">工作空間</div>
        <nav aria-label="主要導覽">
          <a
            href="#reports"
            className={
              view === "reports" || report ? "nav-item active" : "nav-item"
            }
          >
            <LayoutGrid size={18} />
            <span>分析報告</span>
            <span className="nav-count">{data.reports.length}</span>
          </a>
          <a
            href="#new"
            className={view === "new" ? "nav-item active" : "nav-item"}
          >
            <Plus size={18} />
            <span>新增需求分析</span>
          </a>
          <a
            href="#company"
            className={view === "company" ? "nav-item active" : "nav-item"}
          >
            <Building2 size={18} />
            <span>公司資料</span>
          </a>
        </nav>
        <div className="sidebar-tip">
          <div className="tip-mark">
            <GitBranch size={21} />
          </div>
          <strong>好協作，從清楚的分工開始</strong>
          <p>每一次確認的共識，都是下一次分析的起點。</p>
          <a href="#company">
            查看部門資料 <ArrowUpRight size={14} />
          </a>
        </div>
        <div className="sidebar-bottom">
          <button onClick={() => setHelp(true)}>
            <HelpCircle size={17} />
            使用說明 <ArrowUpRight size={14} />
          </button>
          <div className="profile">
            <span className="user-avatar">邱</span>
            <div>
              <strong>邱文良</strong>
              <small>產品經理 · 示範角色</small>
            </div>
            <span className="online-dot" />
          </div>
        </div>
      </aside>
      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label="關閉導覽"
          onClick={() => setMobileNav(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <Button
              variant="ghost"
              size="icon"
              className="mobile-menu"
              aria-label="開啟導覽"
              onClick={() => setMobileNav(!mobileNav)}
            >
              <Menu size={20} />
            </Button>
            <span>工作空間</span>
            <ChevronRight size={14} />
            <strong>
              {view === "new" ? "新增需求分析" : view === "company" ? "公司資料" : "分析報告"}
            </strong>
            {report && (
              <>
                <ChevronRight size={14} />
                <span className="breadcrumb-report">報告內容</span>
              </>
            )}
          </div>
          <div className="topbar-right">
            <span className="demo-badge">
              <span />
              前端示範模式
            </span>
            <span className="topbar-divider" />
            <span className="user-avatar small">邱</span>
          </div>
        </header>
        {storageError && (
          <div className="storage-error">
            {storageError}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                download("workspace-backup.json", JSON.stringify(data, null, 2))
              }
            >
              <Download size={14} />
              匯出備份
            </Button>
          </div>
        )}
        <main
          id="main"
          tabIndex={-1}
          className="main-content"
        >
          {!ready ? (
            <div className="loading-state">
              <LoaderCircle className="spinner" />
              正在開啟工作空間…
            </div>
          ) : view === "reports" ? (
            <ReportList data={data} navigate={navigate} />
          ) : view === "new" ? (
            <NewReport
              onCreate={(r) => {
                setData((prev) => ({ ...prev, reports: [r, ...prev.reports] }));
                navigate(r.id);
                notify("已建立示範分析報告，請檢視並調整分工");
              }}
              departmentCount={data.departments.length}
            />
          ) : view === "company" ? (
            <Company
              data={data}
              setData={setData}
              notify={notify}
            />
          ) : report ? (
            <>
              <div className="report-heading">
                <div>
                  <button
                    className="back-link"
                    onClick={() => navigate("reports")}
                  >
                    <ArrowLeft size={14} />
                    返回報告列表
                  </button>
                  <div className="report-title">
                    <h1>{report.title}</h1>
                    <Status status={report.status} />
                  </div>
                  <p>
                    {getUseCases(report).length} 個使用情境 <span>·</span>{" "}
                    {new Set(getUseCases(report).flatMap((item) => item.departments)).size}{" "}
                    個協作部門 <span>·</span> 更新於 {report.date}
                  </p>
                </div>
                <div className="heading-actions">
                  <Button variant="outline" onClick={() => setShowPrd(true)}>
                    <FileText size={16} />
                    原始 PRD
                  </Button>
                  <ReportActions key={report.id} report={report} notify={notify} />
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <FileText />
              <h2>找不到這份報告</h2>
              <p>報告可能不在此瀏覽器的工作空間中。</p>
              <Button onClick={() => navigate("reports")}>回到報告列表</Button>
            </div>
          )}
          {ready && report && (
            <UseCaseReport report={report} onChange={updateReport} storageError={storageError} />
          )}
        </main>
        <footer className="app-footer">
          <span>少一點「這是誰的鍋」，多一點「我們一起做」。</span>
          <span>
            <ShieldCheck size={13} /> 資料僅保存在此瀏覽器
          </span>
        </footer>
      </div>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>從需求到共識，分工有依據</DialogTitle>
            <DialogDescription>
              此版本可體驗完整操作流程，所有分析結果皆為示範內容。
            </DialogDescription>
          </DialogHeader>
          <ol className="help-steps">
            <li>
              <strong>準備公司資料</strong>
              <p>上傳組織架構、部門職掌與既有流程。</p>
            </li>
            <li>
              <strong>建立需求分析</strong>
              <p>貼上 PRD 或上傳 TXT、Markdown 文件，產生示範流程。</p>
            </li>
            <li>
              <strong>一起釐清責任</strong>
              <p>
                逐項閱讀 Use Case、查看建議協作部門，並填寫使用者回饋。
              </p>
            </li>
            <li>
              <strong>留下使用者回饋</strong>
              <p>回饋會自動儲存在此瀏覽器，重新開啟報告即可繼續。</p>
            </li>
          </ol>
        </DialogContent>
      </Dialog>
      <Dialog open={showPrd} onOpenChange={setShowPrd}>
        <DialogContent className="wide-dialog">
          <DialogHeader>
            <DialogTitle>原始 PRD</DialogTitle>
            <DialogDescription>{report?.title}</DialogDescription>
          </DialogHeader>
          <pre className="document-preview">{report?.prd}</pre>
          <Button
            variant="outline"
            onClick={() => report && download(`${report.title}.md`, report.prd)}
          >
            <Download size={15} />
            下載 PRD
          </Button>
        </DialogContent>
      </Dialog>
      {toast && (
        <div className="toast" role="status">
          <CircleCheck size={18} />
          {toast}
          <button aria-label="關閉通知" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
function ReportList({
  data,
  navigate,
}: {
  data: Workspace;
  navigate: (v: string) => void;
}) {
  const [filter, setFilter] = useState<string>("全部報告");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const filtered = data.reports
    .filter(
      (r) =>
        (filter === "全部報告" || r.status === filter) &&
        `${r.title} ${r.description}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "newest"
        ? b.date.localeCompare(a.date)
        : a.date.localeCompare(b.date),
    );
  const pending = data.reports.filter((r) => r.status === "待確認").length;
  const progress = data.reports.filter((r) => r.status === "協作中").length;
  const done = data.reports.filter((r) => r.status === "已準備開案").length;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="page-kicker">讓每個需求，都找到對的人。</div>
          <h1>分析報告</h1>
          <p>從需求拆解到分工共識，讓跨部門協作更有方向。</p>
        </div>
        <Button size="lg" onClick={() => navigate("new")}>
          <Plus size={18} />
          新增需求分析
        </Button>
      </div>
      <section className="overview-strip" aria-label="報告狀態總覽">
        {[
          {
            label: "全部報告",
            count: data.reports.length,
            icon: FileText,
            caption: "每個想法的協作起點",
            style: "all",
          },
          {
            label: "待確認",
            count: pending,
            icon: Clock3,
            caption: "等待你釐清責任邊界",
            style: "pending",
          },
          {
            label: "協作中",
            count: progress,
            icon: GitBranch,
            caption: "讓建議逐步成為共識",
            style: "progress",
          },
          {
            label: "已準備開案",
            count: done,
            icon: CircleCheck,
            caption: "分工就緒，開始行動",
            style: "done",
          },
        ].map((s) => (
          <button
            key={s.label}
            className={`overview-item ${s.style}`}
            onClick={() => setFilter(s.label)}
          >
            <div className="overview-label">
              <span className="overview-icon">
                <s.icon size={18} />
              </span>
              {s.label}
              <ArrowUpRight size={14} className="overview-arrow" />
            </div>
            <strong>{String(s.count).padStart(2, "0")}</strong>
            <small>{s.caption}</small>
          </button>
        ))}
      </section>
      <section className="collaboration-banner">
        <div className="banner-copy">
          <span className="banner-label">
            <Sparkles size={14} />
            從需求，走向共識
          </span>
          <h2>
            不是找誰背鍋，
            <br />
            是讓每個人知道怎麼一起做。
          </h2>
          <p>
            交給 AI 拆解需求，由團隊定義責任。
            <br />
            把討論留下來，讓下一次合作更順暢。
          </p>
          <button onClick={() => navigate("new")}>
            開始新的需求分析 <ArrowUpRight size={16} />
          </button>
        </div>
        <div className="banner-flow" aria-hidden="true">
          <div className="flow-source">
            <FileText size={20} />
            <span>一份需求</span>
          </div>
          <div className="flow-branch">
            <svg viewBox="0 0 110 150" preserveAspectRatio="none">
              <path d="M0 75 H40 Q55 75 55 60 V24 Q55 12 70 12 H110 M55 75 H110 M55 75 V126 Q55 138 70 138 H110" />
            </svg>
          </div>
          <div className="flow-teams">
            <div>
              <span className="team-icon product">
                <Layers size={15} />
              </span>
              產品部<span>釐清需求</span>
              <Check size={13} />
            </div>
            <div>
              <span className="team-icon design">
                <Users size={15} />
              </span>
              設計部<span>定義體驗</span>
              <Check size={13} />
            </div>
            <div>
              <span className="team-icon engineering">
                <GitBranch size={15} />
              </span>
              工程部<span>實現功能</span>
              <Check size={13} />
            </div>
          </div>
          <span className="banner-note">
            <span />
            各司其職，一起完成。
          </span>
        </div>
      </section>
      <section className="reports-section">
        <div className="section-heading">
          <h2>
            你的需求分析 <span>{data.reports.length}</span>
          </h2>
          <span>每次調整，都是更好的協作經驗。</span>
        </div>
        <div className="report-filters">
          <div className="filter-tabs" role="group" aria-label="依報告狀態篩選">
            {statuses.map((s) => (
              <button
                key={s}
                aria-pressed={filter === s}
                className={filter === s ? "active" : ""}
                onClick={() => setFilter(s)}
              >
                {s}
                {s === "全部報告" && <span>{data.reports.length}</span>}
              </button>
            ))}
          </div>
          <div className="search-sort">
            <label className="search-input">
              <Search size={16} />
              <input
                placeholder="搜尋報告名稱或內容…"
                aria-label="搜尋報告"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button aria-label="清除搜尋" onClick={() => setQuery("")}>
                  <X size={14} />
                </button>
              )}
            </label>
            <label className="sort-control">
              <SlidersHorizontal size={15} />
              <select
                aria-label="報告排序"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="newest">最近更新</option>
                <option value="oldest">最早更新</option>
              </select>
            </label>
          </div>
        </div>
        <div className="report-table">
          <div className="table-head">
            <span>報告名稱</span>
            <span>分析狀態</span>
            <span>協作部門</span>
            <span>最近更新</span>
            <span />
          </div>
          {filtered.map((r, i) => (
            <a href={`#${r.id}`} key={r.id} className="report-row">
              <div className="report-name">
                <span className={`file-icon file-${i % 3}`}>
                  <FileText size={21} />
                </span>
                <div>
                  <strong>{r.title}</strong>
                  <small>
                    {r.cases.length} 個使用情境 <span>·</span> {r.nodes.length}{" "}
                    項開發工作
                  </small>
                </div>
              </div>
              <Status status={r.status} />
              <div className="department-stack">
                {[...new Set(r.nodes.map((n) => n.data.department))]
                  .slice(0, 3)
                  .map((d, j) => (
                    <span
                      key={d}
                      className={`dept-avatar avatar-${j}`}
                      title={d}
                    >
                      {d.slice(0, 1)}
                    </span>
                  ))}
                <span className="extra-depts">
                  +
                  {Math.max(
                    0,
                    new Set(r.nodes.map((n) => n.data.department)).size - 3,
                  )}
                </span>
              </div>
              <span className="date-text">{r.date.replaceAll("-", " / ")}</span>
              <ChevronRight size={16} />
            </a>
          ))}
          {!filtered.length && (
            <div className="empty-state">
              <Search size={28} />
              <h3>{query ? "沒有符合的報告" : "目前沒有這個狀態的報告"}</h3>
              <p>試試其他關鍵字，或建立一份新的需求分析。</p>
              <Button
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setFilter("全部報告");
                }}
              >
                清除篩選
              </Button>
            </div>
          )}
          <div className="table-footer">
            <span>
              顯示 {filtered.length} 份報告，共 {data.reports.length} 份
            </span>
            <span>
              <span className="live-dot" />
              已儲存在此瀏覽器
            </span>
          </div>
        </div>
      </section>
      <div className="knowledge-reminder">
        <div className="knowledge-icon">
          <BookOpen size={21} />
        </div>
        <div>
          <strong>讓分析更懂你的公司</strong>
          <p>
            已載入 {data.departments.length} 個部門，作為每次分析的共同依據。
          </p>
        </div>
        <a href="#company">
          管理公司資料 <ArrowUpRight size={15} />
        </a>
      </div>
    </>
  );
}
function NewReport({
  onCreate,
  departmentCount,
}: {
  onCreate: (r: Report) => void;
  departmentCount: number;
}) {
  const [title, setTitle] = useState("");
  const [prd, setPrd] = useState("");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [inputMode, setInputMode] = useState("text");
  const [reading, setReading] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );
  const upload = async (file?: File) => {
    if (!file) return;
    setReading(true);
    setError("");
    try {
      setPrd(await readTextFile(file));
      setFileName(file.name);
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReading(false);
    }
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 2 || prd.trim().length < 20) {
      setError("請填寫至少 2 個字的報告名稱，以及至少 20 個字的需求內容。");
      return;
    }
    setError("");
    setBusy(true);
    setStep(0);
    let current = 0;
    timer.current = setInterval(() => {
      current++;
      setStep(current);
      if (current === 3) {
        if (timer.current) clearInterval(timer.current);
        const cases = ["主要使用流程", "例外與權限處理"];
        onCreate({
          id: crypto.randomUUID(),
          title: title.trim(),
          description: prd.trim().slice(0, 90),
          prd,
          status: "待確認",
          date: today(),
          cases,
          useCases: cases.map((name, index) => ({
            id: `case-${index + 1}`,
            name,
            departments: ["前端開發部", "後端開發部"],
            description: index === 0
              ? "使用者進入功能頁面、提供必要資料並提交操作，系統驗證輸入後呈現處理結果。此為示範情境，請依專案需求確認。"
              : "當使用者沒有操作權限、輸入資料有誤或服務暫時無法回應時，系統說明原因並提供修正或重試方式。此為示範情境，請依專案需求確認。",
            feedback: "",
          })),
          nodes: makeNodes(cases),
          edges: makeEdges(),
        });
      }
    }, 650);
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="page-kicker">把需求交進來，把協作理清楚。</div>
          <h1>新增需求分析</h1>
          <p>提供 PRD，開始拆解使用情境、責任邊界與部門交接。</p>
        </div>
      </div>
      <div className="create-layout">
        <form className="form-surface" onSubmit={submit}>
          <div className="form-section-title">
            <span className="form-title-icon">
              <FileText size={20} />
            </span>
            <div>
              <h2>這次，我們要一起做什麼？</h2>
              <p>從一份清楚的需求開始。</p>
            </div>
          </div>
          <label>
            報告名稱 <span className="required">必填</span>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：會員中心改版與權限整合"
              maxLength={80}
              disabled={busy}
            />
          </label>
          <Tabs value={inputMode} onValueChange={setInputMode}>
            <TabsList>
              <TabsTrigger value="text">
                <FileText size={15} />
                貼上需求文字
              </TabsTrigger>
              <TabsTrigger value="file">
                <Upload size={15} />
                上傳 PRD 文件
              </TabsTrigger>
            </TabsList>
            <TabsContent value="file">
              <label
                className="upload-zone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!busy) void upload(e.dataTransfer.files[0]);
                }}
              >
                <Upload size={28} />
                <strong>
                  {reading
                    ? "正在讀取文件…"
                    : fileName || "拖曳文件到這裡，或點擊選擇"}
                </strong>
                <span>支援 TXT、Markdown · 單一文件，最大 1 MB</span>
                <input
                  type="file"
                  aria-label="上傳 PRD 文件"
                  accept=".txt,.md"
                  disabled={busy || reading}
                  onChange={(e) => void upload(e.target.files?.[0])}
                />
              </label>
            </TabsContent>
          </Tabs>
          <label>
            {inputMode === "file" ? "需求內容預覽（可編輯）" : "需求內容"}{" "}
            <span className="required">必填</span>
            <Textarea
              className="prd-input"
              rows={12}
              value={prd}
              onChange={(e) => setPrd(e.target.value)}
              disabled={busy || reading}
              placeholder={
                "描述產品背景、使用者需求與預期成果…\n\n你可以直接貼上完整 PRD，不需要先拆解 use case。"
              }
            />
          </label>
          <div className="input-meta">
            <span>建議包含背景、目標、功能需求與驗收條件。</span>
            <span>{prd.length.toLocaleString()} 字</span>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {busy && (
            <div className="analysis-progress" role="status">
              <div>
                <LoaderCircle className="spinner" size={18} />
                {
                  [
                    "讀取需求內容",
                    "建立示範使用情境",
                    "整理示範協作流程",
                    "完成",
                  ][step]
                }
              </div>
              <progress max={3} value={step + 1} />
            </div>
          )}
          <div className="form-bottom">
            <span>
              <ShieldCheck size={14} />
              資料保存在此瀏覽器
            </span>
            <Button type="submit" size="lg" disabled={busy || reading}>
              {busy ? (
                <LoaderCircle className="spinner" size={16} />
              ) : (
                <Sparkles size={16} />
              )}{" "}
              {busy
                ? "正在建立示範報告…"
                : error
                  ? "重試建立示範分析"
                  : "建立示範分析"}
            </Button>
          </div>
        </form>
        <aside className="create-aside">
          <div className="aside-intro">
            <GitBranch size={26} />
            <h2>
              一份需求，
              <br />
              看見整個協作。
            </h2>
            <p>從誰來做，到怎麼交接，讓需求會議有一個清楚的起點。</p>
          </div>
          <ul className="feature-list">
            <li>
              <Layers size={18} />
              <div>
                <strong>拆解使用情境</strong>
                <p>將需求整理為具體的工作項目。</p>
              </div>
            </li>
            <li>
              <Users size={18} />
              <div>
                <strong>釐清主責與協作</strong>
                <p>看見需要一起參與的部門。</p>
              </div>
            </li>
            <li>
              <GitBranch size={18} />
              <div>
                <strong>建立開發協作流程</strong>
                <p>明確標示前置依賴與交接關係。</p>
              </div>
            </li>
          </ul>
          <div className="demo-note">
            <strong>目前為前端示範</strong>
            <p>
              會依固定範本建立流程，尚未串接 AI。上傳的文字可預覽與保存；
              已載入 {departmentCount} 個部門作為分析依據。
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
function parseDepartments(text: string): CompanyDepartment[] {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { departments?: unknown }).departments)) {
    throw new Error("JSON 必須包含 departments 陣列。");
  }
  const departments = (parsed as { departments: unknown[] }).departments;
  if (!departments.length) throw new Error("部門資料不能是空的。");
  if (
    !departments.every(
      (department) =>
        department &&
        typeof department === "object" &&
        typeof (department as CompanyDepartment).id === "string" &&
        typeof (department as CompanyDepartment).name === "string" &&
        typeof (department as CompanyDepartment).description === "string" &&
        (department as CompanyDepartment).name.trim() &&
        (department as CompanyDepartment).description.trim(),
    )
  ) {
    throw new Error("每個部門都需要 id、name 與 description 欄位。");
  }
  return departments as CompanyDepartment[];
}

function DepartmentCard({
  department,
  selected,
  compact = false,
  onSelect,
}: {
  department: CompanyDepartment;
  selected: boolean;
  compact?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`department-card${selected ? " selected" : ""}${compact ? " compact" : ""}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="department-card-dot" aria-hidden="true" />
      <strong>{department.name}</strong>
      <span>{department.description}</span>
    </button>
  );
}

function Company({
  data,
  setData,
  notify,
}: {
  data: Workspace;
  setData: React.Dispatch<React.SetStateAction<Workspace>>;
  notify: (s: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(data.departments[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = data.departments.find((department) => department.id === selectedId) ?? data.departments[0];
  const names = new Set([
    "總經理室",
    "產品管理部",
    "使用者體驗設計部",
    "研發管理部",
    "客戶成功部",
    "商務營運部",
    "前端開發部",
    "後端開發部",
    "品質保證部",
    "平台與資安部",
  ]);
  const byName = (name: string) => data.departments.find((department) => department.name === name);
  const root = byName("總經理室");
  const leadership = ["產品管理部", "使用者體驗設計部", "研發管理部", "客戶成功部", "商務營運部"]
    .map(byName)
    .filter((department): department is CompanyDepartment => Boolean(department));
  const engineering = ["前端開發部", "後端開發部", "品質保證部", "平台與資安部"]
    .map(byName)
    .filter((department): department is CompanyDepartment => Boolean(department));
  const others = data.departments.filter((department) => !names.has(department.name));
  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const imported = parseDepartments(await file.text());
      setData((prev) => ({ ...prev, departments: imported }));
      setSelectedId(imported[0].id);
      notify(`已重新匯入 ${imported.length} 個部門`);
    } catch (e) {
      setError((e as Error).message || "無法讀取部門資料。");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="page-kicker">讓每一次分析，都有公司的脈絡。</div>
          <h1>公司資料</h1>
          <p>直接查看部門職掌與組織關係，匯入最新資料即可更新整張組織圖。</p>
        </div>
        <div className="company-heading-actions">
          <span className="company-label">
            <Building2 size={17} />
            甩鍋科技 · 示範公司
          </span>
          <label className="department-import-button">
            <Upload size={15} />
            {busy ? "正在匯入…" : "重新匯入部門資料"}
            <input
              aria-label="重新匯入部門資料"
              type="file"
              accept=".json,application/json"
              disabled={busy}
              onChange={(event) => {
                void upload(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
        </div>
      </div>
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="department-summary">
        <div>
          <span className="page-kicker">組織總覽</span>
          <h2>{data.departments.length} 個部門，清楚看見責任邊界</h2>
        </div>
        <span className="department-source">來源：global-memory-software-company.json</span>
      </div>
      <div className="department-visual-layout">
        <section className="department-visual form-surface" aria-label="部門資訊視覺化">
          <div className="section-heading">
            <div>
              <h2>組織關係</h2>
              <p className="muted-copy">點選部門查看完整職掌。連線代表上下隸屬關係。</p>
            </div>
            <Users size={20} aria-hidden="true" />
          </div>
          {root && (
            <div className="department-root">
              <DepartmentCard department={root} selected={selected?.id === root.id} onSelect={() => setSelectedId(root.id)} />
            </div>
          )}
          <div className="department-connector" aria-hidden="true" />
          <div className="department-level">
            {leadership.map((department) => (
              <DepartmentCard key={department.id} department={department} selected={selected?.id === department.id} onSelect={() => setSelectedId(department.id)} />
            ))}
          </div>
          {engineering.length > 0 && (
            <div className="department-team-group">
              <div className="department-team-title"><GitBranch size={15} /> 研發管理部下屬團隊</div>
              <div className="department-level department-children">
                {engineering.map((department) => (
                  <DepartmentCard key={department.id} department={department} compact selected={selected?.id === department.id} onSelect={() => setSelectedId(department.id)} />
                ))}
              </div>
            </div>
          )}
          {others.length > 0 && (
            <div className="department-level department-other">
              {others.map((department) => (
                <DepartmentCard key={department.id} department={department} selected={selected?.id === department.id} onSelect={() => setSelectedId(department.id)} />
              ))}
            </div>
          )}
        </section>
        <aside className="department-detail" aria-live="polite">
          {selected ? (
            <>
              <span className="detail-kicker"><Building2 size={14} /> 部門職掌</span>
              <h2>{selected.name}</h2>
              <p>{selected.description}</p>
              <div className="detail-meta"><span className="live-dot" /> 已載入公司資料</div>
            </>
          ) : (
            <p className="muted-copy">尚未載入部門資料。</p>
          )}
        </aside>
      </div>
      <div className="department-import-note">
        <ShieldCheck size={17} />
        <span>可重新匯入同格式 JSON，系統會以新檔案取代目前的部門清單。</span>
      </div>
    </>
  );
}
