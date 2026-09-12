'use client';
import { useEffect, useState } from 'react';
import {
	ArrowUpRight,
	Building2,
	ChevronRight,
	CookingPot,
	FileText,
	GitBranch,
	LayoutGrid,
	Menu,
	Plus,
	ShieldCheck,
} from 'lucide-react';
import { useWorkspaceStore, refreshWorkspace } from '@/lib/workspace-store';
import { useWorkspaceRoute } from '@/lib/workspace-router';
import { Button } from './ui/button';
import { ProjectList, demoId } from './project-list';
import { NewProject } from './new-project';
import { ProjectReport } from './project-report';
import { CompanyMemory } from './company-memory';
import { ErrorNotice } from './api-shared';
import { DemoReport } from './demo-report';
export default function WorkspaceApp() {
	const state = useWorkspaceStore();
	const route = useWorkspaceRoute();
	const [mobileNav, setMobileNav] = useState(false);
	useEffect(() => {
		const close = () => setMobileNav(false);
		window.addEventListener('hashchange', close);
		return () => window.removeEventListener('hashchange', close);
	}, []);
	const isDemo =
		route.page === 'project' &&
		(route.projectId === demoId ||
			(route.legacy && route.projectId === 'report-1'));
	const pageTitle =
		route.page === 'new'
			? '新增專案分析'
			: route.page === 'company'
				? '部門清單'
				: '分析報告';
	return (
		<div className='app-shell'>
			<aside className={`sidebar ${mobileNav ? 'is-open' : ''}`}>
				<a href='#new' className='brand'>
					<span className='brand-icon'>
						<CookingPot size={24} />
					</span>
					<span>
						這是誰的鍋
						<span className='brand-sub'>把分工理清，讓協作發生。</span>
					</span>
				</a>
				<div className='workspace-switch'>
					<span className='company-avatar'>S</span>
					<div>
						<strong>公司工作空間</strong>
						<small>共用組織職能與分析報告</small>
					</div>
				</div>
				<div className='nav-label'>工作空間</div>
				<nav aria-label='主要導覽'>
					<a
						href='#new'
						className={`nav-item ${route.page === 'new' ? 'active' : ''}`}
					>
						<Plus size={18} />
						<span>新增專案分析</span>
					</a>
					<a
						href='#reports'
						className={`nav-item ${route.page === 'reports' || route.page === 'project' ? 'active' : ''}`}
					>
						<LayoutGrid size={18} />
						<span>專案報告清單</span>
						<span className='nav-count'>{state.projects.length}</span>
					</a>
					<a
						href='#company'
						className={`nav-item ${route.page === 'company' ? 'active' : ''}`}
					>
						<Building2 size={18} />
						<span>部門清單</span>
					</a>
				</nav>
				<div className='sidebar-tip'>
					<div className='tip-mark'>
						<GitBranch size={21} />
					</div>
					<strong>好協作，從清楚的分工開始</strong>
					<p>每一次確認的共識，都是下一次分析的起點。</p>
					<a href='#company'>
						查看部門資料
						<ArrowUpRight size={14} />
					</a>
				</div>
			</aside>
			{mobileNav && (
				<button
					className='nav-scrim'
					aria-label='關閉導覽'
					onClick={() => setMobileNav(false)}
				/>
			)}
			<div className='main-shell'>
				<header className='topbar'>
					<div className='breadcrumbs'>
						<Button
							variant='ghost'
							size='icon'
							className='mobile-menu'
							aria-label='開啟導覽'
							onClick={() => setMobileNav(!mobileNav)}
						>
							<Menu size={20} />
						</Button>
						<span>工作空間</span>
						<ChevronRight size={14} />
						<strong>{pageTitle}</strong>
					</div>
					<div className='topbar-right'>
						<span className='demo-badge'>
							<span />
							{isDemo
								? '前端示範報告'
								: state.memoryError || state.projectsError
									? '服務連線待確認'
									: state.loading
										? '正在同步…'
										: '共用工作空間'}
						</span>
					</div>
				</header>
				<main id='main' tabIndex={-1} className='main-content'>
					{route.page !== 'company' && !isDemo && (
						<ErrorNotice
							message={state.memoryError}
							retry={() => void refreshWorkspace()}
						/>
					)}
					{route.page === 'reports' ? (
						<ProjectList
							projects={state.projects}
							loading={state.loading || !state.ready}
							error={state.projectsError}
							refresh={() => void refreshWorkspace()}
						/>
					) : route.page === 'new' ? (
						<NewProject
							enabled={state.ready && !!state.memory && !state.memoryError}
							departmentCount={state.memory?.departments.length || 0}
						/>
					) : route.page === 'company' ? (
						<CompanyMemory
							memory={state.memory}
							loading={state.loading || !state.ready}
							loadError={state.memoryError}
						/>
					) : isDemo ? (
						<DemoReport />
					) : route.page === 'project' ? (
						<ProjectReport
							key={route.projectId}
							projectId={route.projectId}
							departments={state.memory?.departments || []}
							memoryAvailable={!!state.memory && !state.memoryError}
						/>
					) : (
						<div className='empty-state'>
							<FileText />
							<h2>找不到這份報告</h2>
							<Button asChild variant='outline'>
								<a href='#reports'>回到報告列表</a>
							</Button>
						</div>
					)}
				</main>
				<footer className='app-footer'>
					<span>少一點「這是誰的鍋」，多一點「我們一起做」。</span>
					<span>
						<ShieldCheck size={13} />
						{isDemo ? '示範修改僅保存在此瀏覽器' : '專案資料由伺服器保存'}
					</span>
				</footer>
			</div>
		</div>
	);
}
