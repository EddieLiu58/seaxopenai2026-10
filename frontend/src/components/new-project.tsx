'use client';
import { useRef, useState } from 'react';
import {
	FileText,
	GitBranch,
	LoaderCircle,
	Sparkles,
	Upload,
} from 'lucide-react';
import { api, errorMessage, rememberJob, validateText } from '@/lib/api/client';
import { projectHref } from '@/lib/workspace-router';
import { refreshWorkspace } from '@/lib/workspace-store';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { ErrorNotice } from './api-shared';
export function NewProject({
	enabled,
	departmentCount,
}: {
	enabled: boolean;
	departmentCount: number;
}) {
	const [title, setTitle] = useState('');
	const [prd, setPrd] = useState('');
	const [busy, setBusy] = useState(false);
	const lock = useRef(false);
	const [error, setError] = useState('');
	const [reading, setReading] = useState(false);
	const submit = async (event: React.FormEvent) => {
		event.preventDefault();
		if (lock.current || !enabled) return;
		try {
			validateText(title, '專案名稱', 200);
			validateText(prd, '需求內容', 100000);
		} catch (error) {
			setError(errorMessage(error));
			return;
		}
		lock.current = true;
		setBusy(true);
		setError('');
		try {
			const result = await api.createProject({
				name: title.trim(),
				userDoc: { content: prd },
			});
			rememberJob(result.job);
			void refreshWorkspace();
			location.hash = projectHref(result.project.id);
		} catch (error) {
			setError(errorMessage(error));
		} finally {
			lock.current = false;
			setBusy(false);
		}
	};
	const upload = async (file?: File) => {
		if (!file) return;
		setReading(true);
		setError('');
		try {
			if (!/\.(txt|md)$/i.test(file.name))
				throw new Error('請選擇 TXT 或 Markdown 文件。');
			if (file.size > 10 * 1024 * 1024)
				throw new Error('文件太大，請使用不超過 100,000 字的文字文件。');
			const text = await file.text();
			validateText(text, '需求內容', 100000);
			setPrd(text);
			if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''));
		} catch (error) {
			setError(errorMessage(error));
		} finally {
			setReading(false);
		}
	};
	return (
		<>
			<div className='page-heading'>
				<div>
					<div className='page-kicker'>把需求交進來，把協作理清楚。</div>
					<h1>新增專案分析</h1>
					<p>提供 PRD，由 AI 拆解工作、分析部門歸屬。</p>
				</div>
			</div>
			<div className='create-layout'>
				<form className='form-surface' onSubmit={submit}>
					<div className='form-section-title'>
						<FileText size={24} />
						<div>
							<h2>這次，我們要一起做什麼？</h2>
							<p>從一份清楚的需求開始。</p>
						</div>
					</div>
					<label>
						專案名稱
						<Input
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							disabled={busy}
							placeholder='例如：會員中心改版與權限整合'
						/>
					</label>
					<label className='upload-zone'>
						<Upload size={22} />
						<strong>
							{reading ? '正在讀取…' : '選擇 TXT 或 Markdown 文件'}
						</strong>
						<span>也可以直接在下方貼上需求，最多 100,000 字。</span>
						<input
							type='file'
							accept='.txt,.md'
							aria-label='上傳 PRD 文件'
							disabled={busy || reading}
							onChange={(e) => void upload(e.target.files?.[0])}
						/>
					</label>
					<label>
						需求內容
						<Textarea
							className='prd-input'
							rows={12}
							value={prd}
							onChange={(e) => setPrd(e.target.value)}
							disabled={busy || reading}
							placeholder='描述產品背景、使用者需求與預期成果…'
						/>
					</label>
					<div className='input-meta'>
						<span>文件將以純文字送出。</span>
						<span>{[...prd].length.toLocaleString()} / 100,000 字</span>
					</div>
					<ErrorNotice message={error} />
					{!enabled && (
						<p className='api-notice'>
							請先確認服務連線及<a href='#company'>部門清單</a>，再建立分析。
						</p>
					)}
					<div className='form-bottom'>
						<span>需求與結果保存在伺服器</span>
						<Button
							size='lg'
							type='submit'
							disabled={!enabled || busy || reading}
						>
							{busy ? (
								<LoaderCircle className='spinner' size={16} />
							) : (
								<Sparkles size={16} />
							)}
							{busy ? '正在提交需求…' : error ? '重試建立分析' : '建立分析'}
						</Button>
					</div>
				</form>
				<aside className='create-aside'>
					<div className='aside-intro'>
						<GitBranch size={26} />
						<h2>
							一份需求，
							<br />
							看見整個協作。
						</h2>
						<p>提交後會顯示真正的分析狀態，完成後即可檢視及調整分工。</p>
					</div>
					<div className='demo-note'>
						<strong>以公司職能為共同依據</strong>
						<p>
							已載入 {departmentCount}{' '}
							個部門。無法確定的歸屬會明確標示「不知道」，供你繼續釐清。
						</p>
					</div>
				</aside>
			</div>
		</>
	);
}
