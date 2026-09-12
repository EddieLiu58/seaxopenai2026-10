"use client";

import { useState } from "react";
import { categories, projects, type Category } from "@/content/site";

export function ProjectGallery() {
  const [category, setCategory] = useState<Category>("全部");
  const visible = projects.filter((project) => category === "全部" || project.category === category);
  return (
    <div>
      <div className="filters" role="group" aria-label="作品分類">
        {categories.map((item) => <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}
      </div>
      <p className="sr-only" role="status">顯示 {visible.length} 件概念作品</p>
      <div className="project-grid">
        {visible.map((project) => (
          <article className="project" key={project.id}>
            <div className={`project-art ${project.theme}`} aria-hidden="true"><span>{project.word}</span><small>{project.note}</small><i /></div>
            <div className="project-heading"><h3>{project.name}</h3><span>{project.category}</span></div>
            <p>{project.summary}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
