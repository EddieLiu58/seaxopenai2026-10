"use client";

import { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { getUseCases, type Report } from "@/lib/workspace-data";

export default function UseCaseReport({ report, onChange, storageError }: {
  report: Report;
  onChange: (report: Report) => void;
  storageError: string;
}) {
  const cases = getUseCases(report);
  const completed = cases.filter((item) => item.feedback.trim()).length;
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      let closest = 0;
      let distance = Infinity;
      for (let index = 0; index < cases.length; index++) {
        const card = document.getElementById(`use-case-${index}`);
        if (!card) continue;
        const next = Math.abs(card.getBoundingClientRect().top - 24);
        if (next < distance) { distance = next; closest = index; }
      }
      const atBottom = window.scrollY > 0 &&
        window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      setActiveIndex(atBottom ? Math.max(0, cases.length - 1) : closest);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [cases.length, report.id]);
  return (
    <div className="use-case-layout">
      {cases.length > 0 && (
        <nav className="use-case-steps" aria-label="Use Case 步驟列">
          <ol>
            {cases.map((item, index) => (
              <li key={item.id} className={index === activeIndex ? "is-current" : ""}>
                <button type="button" aria-current={index === activeIndex ? "step" : undefined} onClick={() => {
                  setActiveIndex(index);
                  const card = document.getElementById(`use-case-${index}`);
                  card?.focus({ preventScroll: true });
                  card?.scrollIntoView({
                    block: "start",
                    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
                      ? "instant" : "smooth",
                  });
                }}>
                  <span className="use-case-step-number">{String(index + 1).padStart(2, "0")}</span>
                  <span className="use-case-step-name">{item.name}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}
      <section className="use-case-list" aria-label="Use Case 分析結果">
        <div className="use-case-summary">
          <span>{cases.length} 個 Use Case</span>
          <span>已填回饋 {completed} / {cases.length}</span>
        </div>
        {cases.map((item, index) => (
          <article className="use-case-card" key={item.id} id={`use-case-${index}`} tabIndex={-1}>
            <header>
              <span className="use-case-number">{String(index + 1).padStart(2, "0")}</span>
              <h2>{item.name}</h2>
            </header>
            <div>
              <h3>建議協作部門</h3>
              <ul className="use-case-tags" aria-label={`${item.name}的建議協作部門`}>
                {item.departments.map((department) => <li key={department}>{department}</li>)}
                {!item.departments.length && <li>待確認</li>}
              </ul>
            </div>
            <div>
              <h3>Use Case Description</h3>
              <p className="use-case-description">{item.description}</p>
            </div>
            <div className="use-case-feedback">
              <label htmlFor={`feedback-${item.id}`}>使用者回饋</label>
              <Textarea
                id={`feedback-${item.id}`}
                aria-label={`${item.name}的使用者回饋`}
                aria-describedby={`save-${item.id}`}
                placeholder="補充情境、調整協作部門，或提出需要釐清的問題…"
                rows={4}
                value={item.feedback}
                onChange={(event) => onChange({
                  ...report,
                  useCases: cases.map((current) => current.id === item.id
                    ? { ...current, feedback: event.target.value } : current),
                })}
              />
              <span id={`save-${item.id}`} className={storageError ? "save-error" : ""}>
                {storageError ? "尚未儲存，請匯出備份" : item.feedback ? "已儲存在此瀏覽器" : "輸入後自動儲存"}
              </span>
            </div>
          </article>
        ))}
        {!cases.length && <div className="empty-state"><h2>尚無 Use Case</h2><p>此報告尚未包含分析結果。</p></div>}
      </section>
    </div>
  );
}
