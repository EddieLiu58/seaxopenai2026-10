"use client";
import { useState } from "react";
import { Building2, GitBranch, Users } from "lucide-react";
import type { Department, GlobalMemory } from "@/lib/api/types";
import {
  departmentHierarchy,
  type DepartmentNode,
} from "@/lib/department-hierarchy";

function DepartmentCard({
  department,
  selected,
  select,
  compact = false,
}: {
  department: Department;
  selected: boolean;
  select: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      className={`department-card${selected ? " selected" : ""}${compact ? " compact" : ""}`}
      aria-pressed={selected}
      aria-controls="department-detail"
      onClick={() => select(department.id)}
    >
      <span className="department-card-dot" aria-hidden="true" />
      <strong>{department.name}</strong>
      <span>{department.description}</span>
    </button>
  );
}
function ChildGroups({
  node,
  selectedId,
  select,
}: {
  node: DepartmentNode;
  selectedId?: string;
  select: (id: string) => void;
}) {
  return (
    <>
      {node.children
        .filter((child) => child.children.length > 0)
        .map((child) => (
          <section
            className="department-team-group"
            key={child.department.id}
            aria-label={`${child.department.name}下屬團隊`}
          >
            <h3 className="department-team-title">
              <GitBranch size={15} aria-hidden="true" />
              {child.department.name}下屬團隊
            </h3>
            <div className="department-level department-children">
              {child.children.map((team) => (
                <DepartmentCard
                  key={team.department.id}
                  department={team.department}
                  compact
                  selected={selectedId === team.department.id}
                  select={select}
                />
              ))}
            </div>
            <ChildGroups node={child} selectedId={selectedId} select={select} />
          </section>
        ))}
    </>
  );
}
export function DepartmentChart({ memory }: { memory: GlobalMemory }) {
  const hierarchy = departmentHierarchy(
    memory.departments,
    memory.relationshipsDescription,
  );
  const [selectedId, setSelectedId] = useState("");
  const selected =
    memory.departments.find((department) => department.id === selectedId) ??
    hierarchy.roots[0]?.department ??
    memory.departments[0];
  return (
    <>
      <div className="department-summary">
        <div>
          <span className="page-kicker">組織總覽</span>
          <h2>{memory.departments.length} 個部門，清楚看見責任邊界</h2>
        </div>
        <span className="department-source">
          組織職能 · 版本 {memory.version}
        </span>
      </div>
      <div className="department-visual-layout">
        <section
          className="department-visual form-surface"
          aria-label="部門資訊視覺化"
        >
          <div className="section-heading">
            <div>
              <h2>組織架構</h2>
              <p className="muted-copy">
                點選部門查看完整職掌。連線代表上下隸屬關係。
              </p>
            </div>
            <Users size={20} aria-hidden="true" />
          </div>
          {hierarchy.roots.map((root) => (
            <section
              className="department-tree"
              key={root.department.id}
              aria-label={`${root.department.name}組織架構`}
            >
              <div className="department-root">
                <DepartmentCard
                  department={root.department}
                  selected={selected?.id === root.department.id}
                  select={setSelectedId}
                />
              </div>
              {root.children.length > 0 && (
                <>
                  <div className="department-connector" aria-hidden="true" />
                  <div
                    className="department-level"
                    role="group"
                    aria-label={`${root.department.name}直屬部門`}
                  >
                    {root.children.map((child) => (
                      <DepartmentCard
                        key={child.department.id}
                        department={child.department}
                        selected={selected?.id === child.department.id}
                        select={setSelectedId}
                      />
                    ))}
                  </div>
                  <ChildGroups
                    node={root}
                    selectedId={selected?.id}
                    select={setSelectedId}
                  />
                </>
              )}
            </section>
          ))}
          {hierarchy.unplaced.length > 0 && (
            <section aria-label="未標示隸屬關係的部門">
              <h3 className="department-team-title">未標示隸屬關係的部門</h3>
              <div className="department-level department-other">
                {hierarchy.unplaced.map((department) => (
                  <DepartmentCard
                    key={department.id}
                    department={department}
                    selected={selected?.id === department.id}
                    select={setSelectedId}
                  />
                ))}
              </div>
            </section>
          )}
        </section>
        <aside
          className="department-detail"
          id="department-detail"
          aria-label="部門職掌"
          aria-live="polite"
        >
          {selected && (
            <>
              <span className="detail-kicker">
                <Building2 size={14} aria-hidden="true" />
                部門職掌
              </span>
              <h2>{selected.name}</h2>
              <p>{selected.description}</p>
              <div className="detail-meta">
                <span className="live-dot" />
                已載入部門清單
              </div>
            </>
          )}
        </aside>
      </div>
      <details className="department-relationship-notes">
        <summary>查看完整組織關係說明</summary>
        <p className="use-case-description">
          {memory.relationshipsDescription || "尚無組織關係說明。"}
        </p>
      </details>
    </>
  );
}
