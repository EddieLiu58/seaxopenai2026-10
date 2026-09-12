'use client';
import { useState } from 'react';
import {
	ArrowUpRight,
	ChevronRight,
	FileText,
	Plus,
	Search,
} from 'lucide-react';
import { Button } from './ui/button';
import { projectHref } from '@/lib/workspace-router';
import { initialWorkspace } from '@/lib/workspace-data';
import type { Project } from '@/lib/api/types';
import { displayDate, ErrorNotice, Loading, ProjectStatus } from './api-shared';
export const demoId = 'demo-report';
export function ProjectList({
	projects,
	loading,
	error,
	refresh,
}: {
	projects: Project[];
	loading: boolean;
	error: string;
	refresh: () => void;
}) {
	const [filter, setFilter] = useState('ALL');
	const [query, setQuery] = useState('');
	const [sort, setSort] = useState('newest');
	const filtered = projects
		.filter(
			(p) =>
				(filter === 'ALL' || p.status === filter) &&
				p.name.toLowerCase().includes(query.toLowerCase()),
		)
		.sort((a, b) =>
			sort === 'newest'
				? b.createdAt.localeCompare(a.createdAt)
				: a.createdAt.localeCompare(b.createdAt),
		);
	const demo = initialWorkspace.reports[0];
	return (
		<>
			<div className='page-heading'>
				<div>
					<div className='page-kicker'>讓每個需求，都找到對的人。</div>
					<h1>分析報告</h1>
					<p>從需求拆解到分工共識，讓跨部門協作更有方向。</p>
				</div>
				<Button size='lg' asChild>
					<a href='#new'>
						<Plus size={18} />
						新增專案分析
					</a>
				</Button>
			</div>
			<section className='overview-strip' aria-label='專案狀態總覽'>
				{[
					['ALL', '全部專案', projects.length],
					[
						'OPEN',
						'開放中',
						projects.filter((p) => p.status === 'OPEN').length,
					],
					[
						'CLOSED',
						'已結案',
						projects.filter((p) => p.status === 'CLOSED').length,
					],
				].map(([key, label, count]) => (
					<button
						className='overview-item'
						key={key}
						onClick={() => setFilter(String(key))}
					>
						<div className='overview-label'>
							{label}
							<ArrowUpRight size={16} />
						</div>
						<strong>{loading ? '—' : count}</strong>
						<small>不包含前端示範報告</small>
					</button>
				))}
			</section>
			<section className='reports-section'>
				<div className='section-heading'>
					<h2>你的專案分析</h2>
					<Button variant='outline' disabled={loading} onClick={refresh}>
						重新載入
					</Button>
				</div>
				<ErrorNotice message={error} />
				<div className='report-filters'>
					<div className='filter-tabs' role='group' aria-label='依報告狀態篩選'>
						{[
							['ALL', '全部報告'],
							['OPEN', '開放中'],
							['CLOSED', '已結案'],
						].map(([key, label]) => (
							<button
								key={key}
								className={filter === key ? 'active' : ''}
								aria-pressed={filter === key}
								onClick={() => setFilter(key)}
							>
								{label}
							</button>
						))}
					</div>
					<div className='search-sort'>
						<label className='search-input'>
							<Search size={16} />
							<input
								aria-label='搜尋報告'
								placeholder='搜尋專案名稱…'
								value={query}
								onChange={(e) => setQuery(e.target.value)}
							/>
						</label>
						<label className='sort-control'>
							<select
								aria-label='報告排序'
								value={sort}
								onChange={(e) => setSort(e.target.value)}
							>
								<option value='newest'>最近建立</option>
								<option value='oldest'>最早建立</option>
							</select>
						</label>
					</div>
				</div>
				{loading && <Loading />}
				<div className='report-table'>
					<div className='table-head api-project-columns'>
						<span>專案名稱</span>
						<span>狀態</span>
						<span>建立時間</span>
						<span />
					</div>
					{filtered.map((project) => (
						<a
							href={projectHref(project.id)}
							className='report-row api-project-columns'
							key={project.id}
						>
							<div className='report-name'>
								<span className='file-icon'>
									<FileText size={21} />
								</span>
								<strong>{project.name}</strong>
							</div>
							<ProjectStatus closed={project.status === 'CLOSED'} />
							<span className='date-text'>
								{displayDate(project.createdAt)}
							</span>
							<ChevronRight size={16} />
						</a>
					))}
					{!loading && !error && !filtered.length && (
						<div className='empty-state'>
							<h2>{query ? '沒有符合的報告' : '尚無專案'}</h2>
							<p>建立專案分析，開始釐清工作分工。</p>
						</div>
					)}
					<div className='table-footer'>
						{error
							? '資料載入失敗；若有顯示既有列表，可能不是最新資料。'
							: `顯示 ${filtered.length} 份，共 ${projects.length} 份專案`}
					</div>
				</div>
			</section>
			<section className='reports-section' aria-label='前端示範報告'>
				<div className='section-heading'>
					<h2>先看看報告範例</h2>
					<span>前端示範 · 可新增流程 · 本機保存</span>
				</div>
				<a
					href={projectHref(demoId)}
					className='report-row api-project-columns'
				>
					<div className='report-name'>
						<span className='file-icon'>
							<FileText size={21} />
						</span>
						<strong>{demo.title}</strong>
					</div>
					<span className='status'>示範報告</span>
					<span>可操作範例</span>
					<ChevronRight size={16} />
				</a>
			</section>
		</>
	);
}
