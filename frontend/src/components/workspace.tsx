"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
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
  History,
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
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  makeNodes,
  makeEdges,
  today,
  type Workspace,
  type Report,
  type CompanyDoc,
} from "@/lib/workspace-data";
const WorkflowEditor = dynamic(() => import("./workflow-editor"), {
  ssr: false,
  loading: () => (
    <div className="loading-state">
      <LoaderCircle className="spinner" />
      正在載入協作流程…
    </div>
  ),
});
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
  const [confirm, setConfirm] = useState(false);
  const [agreed, setAgreed] = useState(false);
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
  const finalize = () => {
    if (!report || !agreed) return;
    const date = today();
    const final = { ...report, status: "已準備開案" as const, date };
    setData((prev) => ({
      ...prev,
      reports: prev.reports.map((r) => (r.id === report.id ? final : r)),
      memories: [
        {
          id: crypto.randomUUID(),
          reportId: report.id,
          title: report.title,
          date,
          content: `適用情境：${report.description}\n\n${report.nodes.map((n) => `${n.data.label}｜主責：${n.data.department}｜協作：${n.data.collaborators}\n範圍：${n.data.scope}\n交付：${n.data.delivery}\n原始建議：${n.data.originalDepartment}\n調整紀錄：${n.data.history.join("；") || "沿用建議"}`).join("\n\n")}\n\n最終交接：\n${report.edges.map((e) => `${report.nodes.find((n) => n.id === e.source)?.data.label} → ${report.nodes.find((n) => n.id === e.target)?.data.label}`).join("\n")}`,
        },
        ...prev.memories,
      ],
    }));
    setConfirm(false);
    setAgreed(false);
    notify("已準備開案，最終分工已加入公司記憶");
  };
  const pending =
    report?.nodes.filter((n) => n.data.pending.trim()).length || 0;
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "is-open" : ""}`}>
        <a href="#reports" className="brand">
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
            <strong>拾序科技</strong>
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
            className={
              view === "company" || view === "company-memory"
                ? "nav-item active"
                : "nav-item"
            }
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
          <a href="#company-memory">
            查看公司記憶 <ArrowUpRight size={14} />
          </a>
        </div>
        <div className="sidebar-bottom">
          <button onClick={() => setHelp(true)}>
            <HelpCircle size={17} />
            使用說明 <ArrowUpRight size={14} />
          </button>
          <div className="profile">
            <span className="user-avatar">林</span>
            <div>
              <strong>林以安</strong>
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
              {view === "new"
                ? "新增需求分析"
                : view === "company" || view === "company-memory"
                  ? "公司資料"
                  : "分析報告"}
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
            <span className="user-avatar small">林</span>
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
          className={report ? "report-main" : "main-content"}
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
              docCount={data.docs.length}
            />
          ) : view === "company" || view === "company-memory" ? (
            <Company
              key={view}
              initialTab={view === "company-memory" ? "memory" : "documents"}
              data={data}
              setData={setData}
              notify={notify}
              navigate={navigate}
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
                    {report.cases.length} 個使用情境 <span>·</span>{" "}
                    {new Set(report.nodes.map((n) => n.data.department)).size}{" "}
                    個協作部門 <span>·</span> 更新於 {report.date}
                  </p>
                </div>
                <div className="heading-actions">
                  <Button variant="outline" onClick={() => setShowPrd(true)}>
                    <FileText size={16} />
                    原始 PRD
                  </Button>
                  <Button
                    disabled={report.status === "已準備開案"}
                    onClick={() => {
                      setAgreed(false);
                      setConfirm(true);
                    }}
                  >
                    <CircleCheck size={16} />
                    {report.status === "已準備開案" ? "已準備開案" : "準備開案"}
                  </Button>
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
            <>
              <div
                className={`report-notice ${report.status === "已準備開案" ? "complete" : ""}`}
              >
                <Sparkles size={16} />
                <span>
                  {report.status === "已準備開案"
                    ? "本次分工已確認，結果已累積至公司記憶。此報告保留為共識快照。"
                    : "以下為示範協作建議。請在需求會議中確認各部門分工，記錄調整原因後再準備開案。"}
                </span>
              </div>
              <WorkflowEditor
                key={report.id}
                report={report}
                onChange={updateReport}
                notify={notify}
              />
            </>
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
                選取工作調整分工、交付內容與原因，也可新增或刪除工作及連線。
              </p>
            </li>
            <li>
              <strong>確認共識，準備開案</strong>
              <p>完成會議與待確認事項後，將最終分工存入此公司的本機記憶。</p>
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
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認共識，準備開案</AlertDialogTitle>
            <AlertDialogDescription>
              完成後將保留本次報告快照，並將最終分工與調整原因加入此公司的記憶。此示範版本完成後不再編輯。
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pending > 0 ? (
            <div className="attention-box">
              <strong>還有 {pending} 項待確認事項</strong>
              <p>請先回到工作詳情，確認並清空已解決的待確認事項。</p>
            </div>
          ) : report?.nodes.length === 0 ? (
            <p>請先新增至少一項工作。</p>
          ) : (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              我已與相關部門開會，並確認最終流程與分工。
            </label>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>返回檢視</AlertDialogCancel>
            <AlertDialogAction
              disabled={!agreed || pending > 0 || !report?.nodes.length}
              onClick={finalize}
            >
              確認，準備開案
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
            已加入 {data.docs.length} 份公司資料、{data.memories.length}{" "}
            筆協作記憶。持續累積，讓責任邊界更清楚。
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
  docCount,
}: {
  onCreate: (r: Report) => void;
  docCount: number;
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
              {docCount} 份公司資料與記憶尚未用於真實推論。
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
function Company({
  data,
  setData,
  notify,
  navigate,
  initialTab,
}: {
  initialTab: string;
  data: Workspace;
  setData: React.Dispatch<React.SetStateAction<Workspace>>;
  notify: (s: string) => void;
  navigate: (v: string) => void;
}) {
  const [tab, setTab] = useState(initialTab);
  const [category, setCategory] = useState("組織架構");
  const [editing, setEditing] = useState<CompanyDoc | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    try {
      const docs: CompanyDoc[] = [];
      for (const f of Array.from(files)) {
        docs.push({
          id: crypto.randomUUID(),
          name: f.name,
          category,
          date: today(),
          content: await readTextFile(f),
        });
      }
      setData((prev) => ({ ...prev, docs: [...docs, ...prev.docs] }));
      notify(`已加入 ${docs.length} 份文件，請檢視內容`);
    } catch (e) {
      setError((e as Error).message);
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
          <p>管理組織職掌與開發流程，累積團隊確認過的協作經驗。</p>
        </div>
        <span className="company-label">
          <Building2 size={17} />
          拾序科技 · 示範公司
        </span>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="company-tabs">
          <TabsTrigger value="documents">
            <Building2 size={16} />
            組織與職掌 <span>{data.docs.length}</span>
          </TabsTrigger>
          <TabsTrigger value="memory">
            <BookOpen size={16} />
            公司記憶 <span>{data.memories.length}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="documents">
          <div className="company-layout">
            <section className="form-surface company-docs">
              <div className="section-heading">
                <h2>分析的共同依據</h2>
                <span>{data.docs.length} 份文件</span>
              </div>
              <p className="muted-copy">
                直接使用公司既有資料，不需要重新整理格式。
              </p>
              <div className="upload-controls">
                <label>
                  資料類型
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option>組織架構</option>
                    <option>部門職掌</option>
                    <option>既有流程</option>
                  </select>
                </label>
              </div>
              <label
                className="upload-zone compact"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!busy) void upload(e.dataTransfer.files);
                }}
              >
                <Upload size={25} />
                <strong>
                  {busy ? "正在讀取文件…" : "拖曳公司資料，或點擊上傳"}
                </strong>
                <span>支援多份 TXT、Markdown 文件，每份最大 1 MB</span>
                <input
                  aria-label="上傳公司資料"
                  type="file"
                  accept=".txt,.md"
                  multiple
                  disabled={busy}
                  onChange={(e) => {
                    void upload(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
              <div className="document-list">
                {data.docs.map((d) => (
                  <div className="document-row" key={d.id}>
                    <span className="file-icon">
                      <FileText size={21} />
                    </span>
                    <button
                      className="document-open"
                      onClick={() => setEditing({ ...d })}
                    >
                      <strong>{d.name}</strong>
                      <small>
                        {d.category} · {d.date}
                      </small>
                    </button>
                    <span className="review-label">待人工檢視</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`刪除 ${d.name}`}
                      onClick={() => setDeleting(d.id)}
                    >
                      <X size={16} />
                    </Button>
                  </div>
                ))}
                {!data.docs.length && (
                  <div className="empty-state">
                    <FileText />
                    <h3>先加入第一份公司資料</h3>
                    <p>從組織架構或部門職掌開始。</p>
                  </div>
                )}
              </div>
            </section>
            <aside className="create-aside">
              <div className="aside-intro">
                <Building2 size={25} />
                <h2>
                  清楚的分工，
                  <br />
                  來自共同的理解。
                </h2>
              </div>
              <ul className="feature-list">
                <li>
                  <Users size={18} />
                  <div>
                    <strong>組織架構</strong>
                    <p>公司有哪些團隊、彼此如何協作。</p>
                  </div>
                </li>
                <li>
                  <ShieldCheck size={18} />
                  <div>
                    <strong>部門職掌</strong>
                    <p>各部門負責什麼、責任到哪裡。</p>
                  </div>
                </li>
                <li>
                  <GitBranch size={18} />
                  <div>
                    <strong>既有流程</strong>
                    <p>沿用有效的開發、交接與驗收方式。</p>
                  </div>
                </li>
              </ul>
              <div className="demo-note">
                <strong>資料仍需人工檢視</strong>
                <p>
                  目前保存文字原文，尚未自動整理或偵測職掌衝突。請點選文件檢視與修正內容。
                </p>
              </div>
            </aside>
          </div>
        </TabsContent>
        <TabsContent value="memory">
          <div className="memory-banner">
            <BookOpen size={26} />
            <div>
              <h2>把這次的共識，留給下一次協作。</h2>
              <p>只有「準備開案」後的最終分工，才會加入這間公司的記憶。</p>
            </div>
            <span>{data.memories.length} 筆經驗</span>
          </div>
          <div className="memory-list">
            {data.memories.map((m) => (
              <article className="memory-item" key={m.id}>
                <div className="memory-title">
                  <span className="memory-check">
                    <CircleCheck size={19} />
                  </span>
                  <div>
                    <h3>{m.title}</h3>
                    <span>已確認的協作共識 · {m.date}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(m.reportId)}
                  >
                    來源報告
                    <ArrowUpRight size={14} />
                  </Button>
                </div>
                <pre>{m.content}</pre>
              </article>
            ))}
            {!data.memories.length && (
              <div className="empty-state">
                <History />
                <h3>每一份共識，都值得留下</h3>
                <p>完成首份報告的「準備開案」，即可建立公司記憶。</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="wide-dialog">
          <DialogHeader>
            <DialogTitle>檢視與修正公司資料</DialogTitle>
            <DialogDescription>
              確認原始內容，儲存你對職掌與流程的修正。
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <>
              <label>
                文件名稱
                <Input
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                />
              </label>
              <label>
                文件內容
                <Textarea
                  rows={12}
                  value={editing.content}
                  onChange={(e) =>
                    setEditing({ ...editing, content: e.target.value })
                  }
                />
              </label>
              <Button
                disabled={!editing.name.trim() || !editing.content.trim()}
                onClick={() => {
                  setData((prev) => ({
                    ...prev,
                    docs: prev.docs.map((d) =>
                      d.id === editing.id ? { ...editing, date: today() } : d,
                    ),
                  }));
                  setEditing(null);
                  notify("已儲存公司資料");
                }}
              >
                儲存文件
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除這份公司資料？</AlertDialogTitle>
            <AlertDialogDescription>
              「{data.docs.find((d) => d.id === deleting)?.name}
              」將從此瀏覽器移除。已確認的報告與記憶仍會保留。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setData((prev) => ({
                  ...prev,
                  docs: prev.docs.filter((d) => d.id !== deleting),
                }));
                setDeleting(null);
                notify("已刪除公司資料");
              }}
            >
              確認刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
