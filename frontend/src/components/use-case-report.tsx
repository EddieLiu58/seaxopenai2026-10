"use client";

import { useEffect, useState } from "react";
import { getUseCases, type Report } from "@/lib/workspace-data";

export default function UseCaseReport({ report }: { report: Report }) {
  const cases = getUseCases(report);
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
        if (next < distance) {
          distance = next;
          closest = index;
        }
      }
      const atBottom =
        window.scrollY > 0 &&
        window.scrollY + window.innerHeight >=
          document.documentElement.scrollHeight - 2;
      setActiveIndex(atBottom ? Math.max(0, cases.length - 1) : closest);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
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
        <nav className="use-case-steps" aria-label="流程步驟列">
          <ol>
            {cases.map((item, index) => (
              <li
                key={item.id}
                className={index === activeIndex ? "is-current" : ""}
              >
                <button
                  type="button"
                  aria-current={index === activeIndex ? "step" : undefined}
                  onClick={() => {
                    setActiveIndex(index);
                    const card = document.getElementById(`use-case-${index}`);
                    card?.focus({ preventScroll: true });
                    card?.scrollIntoView({
                      block: "start",
                      behavior: window.matchMedia(
                        "(prefers-reduced-motion: reduce)",
                      ).matches
                        ? "instant"
                        : "smooth",
                    });
                  }}
                >
                  <span className="use-case-step-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="use-case-step-name">{item.name}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}
      <section className="use-case-list" aria-label="流程分析結果">
        <div className="use-case-summary">
          <span>{cases.length} 個流程</span>
          <span>前端示範 · 本機保存</span>
        </div>
        {cases.map((item, index) => (
          <article
            className="use-case-card"
            key={item.id}
            id={`use-case-${index}`}
            tabIndex={-1}
          >
            <header>
              <span className="use-case-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h2>{item.name}</h2>
            </header>
            <div>
              <h3>建議協作部門</h3>
              <ul
                className="use-case-tags"
                aria-label={`${item.name}的建議協作部門`}
              >
                {item.departments.map((department) => (
                  <li key={department}>{department}</li>
                ))}
                {!item.departments.length && (
                  <li>
                    {item.assignmentStatus === "UNKNOWN" ? "不知道" : "未歸屬"}
                  </li>
                )}
              </ul>
            </div>
            <div>
              <h3>流程描述</h3>
              <p className="use-case-description">{item.description}</p>
            </div>
            {item.reason && (
              <div>
                <h3>新增理由</h3>
                <p className="use-case-description">{item.reason}</p>
              </div>
            )}
          </article>
        ))}
        {!cases.length && (
          <div className="empty-state">
            <h2>尚無流程</h2>
            <p>此報告尚未包含分析結果。</p>
          </div>
        )}
      </section>
    </div>
  );
}
