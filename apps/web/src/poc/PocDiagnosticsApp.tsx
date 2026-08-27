import { useCallback, useEffect, useMemo, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Database,
  FileText,
  Folder,
  HardDriveDownload,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Server,
} from 'lucide-react';
import { PLATFORM_RESOLVER_NO_PROJECTION, RUNTIME_APPVAR_PROJECTION_NOT_VISIBLE, PocApiError, pocApi, type PocApplication, type PocIdentity, type PocRead, type PocSnapshot, type PocSource, type PocSourceCapability } from './api';

type ActionState = 'idle' | 'loading' | 'ready' | 'error';

function describeError(error: unknown): string {
  if (error instanceof PocApiError) return `${error.code}: ${error.message}`;
  return '无法连接 POC 服务，请检查应用运行状态。';
}

function StateBadge({ ok, label, pendingLabel = '待验证' }: { ok: boolean; label?: string; pendingLabel?: string }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
      <CheckCircle2 className="h-3.5 w-3.5" />{label ?? '已就绪'}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
      <AlertTriangle className="h-3.5 w-3.5" />{pendingLabel}
    </span>
  );
}

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-sm font-bold text-slate-900">{title}</h2>{action}</div>
      {children}
    </section>
  );
}

function ErrorNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{message}</span></div>;
}

function LoadingButton({ loading, children, className, disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { loading: boolean }) {
  return <button {...props} disabled={loading || disabled} className={`inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 ${className ?? ''}`}>{loading && <LoaderCircle className="h-4 w-4 animate-spin" />}{children}</button>;
}

function statusLabel(status: string): string {
  switch (status) {
    case 'BACKUPABLE': return '可备份';
    case 'UNSUPPORTED_DATABASE': return '数据库不支持';
    case 'NO_DATA': return '无应用数据';
    case 'SOURCE_NOT_READY': return '源未就绪';
    case PLATFORM_RESOLVER_NO_PROJECTION: return '平台未提供只读源';
    case RUNTIME_APPVAR_PROJECTION_NOT_VISIBLE: return '运行时 appvar 投影不可见';
    case 'SOURCE_CONTRACT_UNSUPPORTED': return '平台读取接口不支持';
    case 'SOURCE_NOT_READONLY': return '源不是只读';
    case 'PERMISSION_DENIED': return '读取被拒绝';
    default: return status || '未知';
  }
}

function sourceErrorText(error: string): string {
  if (error === PLATFORM_RESOLVER_NO_PROJECTION) {
    return '应用目录已接通，但当前设备没有把这个 appvar 以业务容器可见的只读源提供给本应用。请让 Lazycat 运行时提供正式的 deploy_id 绑定只读目录、文件句柄或流式读取接口。';
  }
  if (error.startsWith(RUNTIME_APPVAR_PROJECTION_NOT_VISIBLE)) {
    return 'LZCOS 运行时 appvar 投影不可见，请确认 PERM_OTHER_APP_DATA_ADMIN 已授权并重建应用实例。';
  }
  if (error.startsWith('SOURCE_NOT_READY')) {
    return '当前应用的数据源尚未就绪，请检查应用目录和平台源配置。';
  }
  if (error.startsWith('SOURCE_CONTRACT_UNSUPPORTED')) {
    return '当前 Lazycat SDK 没有提供按 deploy_id 读取 appvar 的正式接口。';
  }
  if (error.startsWith('SOURCE_NOT_READONLY')) {
    return '平台提供的 appvar 源没有通过只读校验，读取和快照已停止。';
  }
  return error;
}

function blockingReasonText(reason?: string): string {
  if (reason === PLATFORM_RESOLVER_NO_PROJECTION) {
    return '平台目录已接通，当前设备尚未提供业务容器可见的 appvar 只读源。';
  }
  if (reason === RUNTIME_APPVAR_PROJECTION_NOT_VISIBLE) {
    return 'LZCOS 运行时 appvar 投影不可见，请确认兼容权限已授权并重建应用实例。';
  }
  if (reason === 'INVALID_RUNTIME_APPVAR_ROOT') {
    return '运行时 appvar 根目录配置无效，服务只允许使用 LZCOS 容器内固定路径。';
  }
  if (reason === 'NO_OFFICIAL_APPVAR_SOURCE_CONTRACT') {
    return '等待 Lazycat 提供正式的 appvar 源投影或读取 API。';
  }
  if (reason === 'SOURCE_CONTRACT_UNSUPPORTED') {
    return '当前 Lazycat SDK 没有按 deploy_id 读取 appvar 的正式接口。';
  }
  return reason || '';
}

function readOnlyModeText(mode?: string): string {
  if (mode === 'service-enforced') return '应用层只读（兼容投影）';
  if (mode === 'filesystem') return '内核只读挂载';
  if (mode === 'fixture') return '测试夹具';
  return mode || '待验证';
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 1024) return `${value || 0} B`;
  const units = ['KiB', 'MiB', 'GiB'];
  let amount = value / 1024;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) { amount /= 1024; index += 1; }
  return `${amount.toFixed(amount >= 10 ? 0 : 1)} ${units[index]}`;
}

export function PocDiagnosticsApp() {
  const [identity, setIdentity] = useState<PocIdentity | null>(null);
  const [capability, setCapability] = useState<PocSourceCapability | null>(null);
  const [applications, setApplications] = useState<PocApplication[]>([]);
  const [selected, setSelected] = useState<PocApplication | null>(null);
  const [source, setSource] = useState<PocSource | null>(null);
  const [read, setRead] = useState<PocRead | null>(null);
  const [snapshot, setSnapshot] = useState<PocSnapshot | null>(null);
  const [relativePath, setRelativePath] = useState('');
  const [pageState, setPageState] = useState<ActionState>('loading');
  const [sourceState, setSourceState] = useState<ActionState>('idle');
  const [readState, setReadState] = useState<ActionState>('idle');
  const [snapshotState, setSnapshotState] = useState<ActionState>('idle');
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (signal?: AbortSignal) => {
    setPageState('loading');
    setError(null);
    try {
      const [identityResult, capabilityResult, applicationsResult] = await Promise.all([
        pocApi.identity(signal),
        pocApi.sourceCapability(signal),
        pocApi.applications(signal),
      ]);
      setIdentity(identityResult);
      setCapability(capabilityResult);
      setApplications(applicationsResult.applications ?? []);
      setSelected((current) => {
        if (current) return applicationsResult.applications.find((item) => item.deployID === current.deployID) ?? null;
        return applicationsResult.applications[0] ?? null;
      });
      setPageState('ready');
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setPageState('error');
      setError(describeError(cause));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadPage(controller.signal);
    return () => controller.abort();
  }, [loadPage]);

  const selectApplication = useCallback((application: PocApplication) => {
    setSelected(application);
    setSource(null);
    setRead(null);
    setSnapshot(null);
    setRelativePath('');
    setSourceState('idle');
    setReadState('idle');
    setSnapshotState('idle');
    setError(null);
  }, []);

  const inspectSource = useCallback(async () => {
    if (!selected) return;
    setSourceState('loading');
    setError(null);
    try {
      const result = await pocApi.source(selected.deployID);
      setSource(result);
      setSourceState('ready');
    } catch (cause) {
      setSource(null);
      setSourceState('error');
      setError(describeError(cause));
    }
  }, [selected]);

  const hashFile = useCallback(async () => {
    if (!selected || !relativePath.trim()) return;
    setReadState('loading');
    setError(null);
    try {
      const result = await pocApi.read(selected.deployID, relativePath.trim());
      setRead(result);
      setReadState('ready');
    } catch (cause) {
      setRead(null);
      setReadState('error');
      setError(describeError(cause));
    }
  }, [relativePath, selected]);

  const createSnapshot = useCallback(async () => {
    if (!selected || selected.status !== 'BACKUPABLE') return;
    setSnapshotState('loading');
    setError(null);
    try {
      const result = await pocApi.snapshot(selected.deployID);
      setSnapshot(result);
      setSnapshotState('ready');
    } catch (cause) {
      setSnapshot(null);
      setSnapshotState('error');
      setError(describeError(cause));
    }
  }, [selected]);

  const selectedStatus = useMemo(() => selected ? statusLabel(selected.status) : '请选择应用', [selected]);
  const identityLoading = pageState === 'loading';

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 rounded-2xl bg-slate-900 p-6 text-white shadow-lg sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3"><div className="h-12 w-12 overflow-hidden rounded-xl"><img src="/lazycat-backup-icon.png" alt="" className="h-full w-full object-cover" /></div><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Mimi App Backup</p><h1 className="mt-1 text-xl font-bold">应用 appvar 读取与手动备份 POC</h1><p className="mt-1 text-sm text-slate-300">选择当前用户拥有的应用，递归查看数据并写入自己的懒猫网盘。</p></div></div>
          <LoadingButton loading={identityLoading} onClick={() => void loadPage()} className="bg-white/10 hover:bg-white/20"><RefreshCw className="h-4 w-4" />刷新状态</LoadingButton>
        </header>

          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" /><p>服务端只接受已校验的 deploy ID 和相对路径。源 appvar 只读，快照写入当前用户的懒猫网盘目录，不返回文件正文。</p></div>
        <ErrorNotice message={error} />

        <div className="grid gap-6 lg:grid-cols-3">
          <Card title="运行时身份"><div className="space-y-3 text-sm"><div className="flex items-center justify-between"><span>租户身份</span><StateBadge ok={identity?.identityConfigured === true} pendingLabel="未配置" /></div>{identity?.identityConfigured && <dl className="space-y-2 rounded-lg bg-slate-50 p-3 text-xs"><div className="flex justify-between gap-3"><dt className="text-slate-500">Tenant UID</dt><dd className="font-mono">{identity.tenantUID}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">应用目录</dt><dd>{identity.catalogConfigured ? '可用' : '不可用'}</dd></div></dl>}</div></Card>
          <Card title="权限声明"><div className="space-y-3 text-sm"><StateBadge ok={identity?.requiredPermissions?.length === 2} label="已声明 appvar.other.read + document.write" pendingLabel="待检查" /><div className="flex flex-wrap gap-2">{(identity?.requiredPermissions ?? []).map((permission) => <span key={permission} className="rounded-full bg-emerald-50 px-2.5 py-1 font-mono text-xs text-emerald-800">{permission}</span>)}</div><p className="text-xs text-slate-500">可选权限：{(identity?.optionalPermissions ?? []).join(', ') || '无'}</p></div></Card>
          <Card title="源 Provider"><div className="space-y-3 text-sm"><div className="flex items-center justify-between"><span>{capability?.providerKind ?? '加载中'}</span><StateBadge ok={capability?.providerStatus === 'READY' || capability?.providerStatus === 'FIXTURE_READY'} label={capability?.providerStatus === 'FIXTURE_READY' ? '本地夹具' : '已就绪'} /></div><dl className="space-y-2 rounded-lg bg-slate-50 p-3 text-xs"><div className="flex justify-between gap-3"><dt className="text-slate-500">版本</dt><dd className="font-mono">{capability?.providerVersion || '—'}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">只读保障</dt><dd>{readOnlyModeText(capability?.readOnlyMode)}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">隔离证据</dt><dd>{capability?.isolationVerified ? '已验证' : '待真机验证'}</dd></div></dl>{capability?.blockingReason && <p className="text-xs text-amber-700">{blockingReasonText(capability.blockingReason)}</p>}</div></Card>
        </div>

        <Card title={`应用与实例（${applications.length}）`} action={<span className="text-xs text-slate-500">仅展示当前租户 owner 匹配项</span>}>
          {applications.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{pageState === 'loading' ? '正在读取应用目录…' : '没有可展示的应用实例。'}</div> : <div className="grid gap-3 md:grid-cols-2">{applications.map((application) => <button key={application.deployID} type="button" onClick={() => selectApplication(application)} className={`rounded-xl border p-4 text-left transition ${selected?.deployID === application.deployID ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-100' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold text-slate-900">{application.name || application.appid}</p><p className="mt-1 truncate font-mono text-xs text-slate-500">{application.deployID}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${application.status === 'BACKUPABLE' ? 'bg-emerald-100 text-emerald-700' : application.status === 'SOURCE_NOT_READY' || application.status === PLATFORM_RESOLVER_NO_PROJECTION ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>{statusLabel(application.status)}</span></div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span>{application.multiInstance ? '多实例' : '单实例（POC 警告）'}</span><span>{application.fileCount} 个文件</span><span>{formatBytes(application.totalBytes)}</span></div></button>)}</div>}
        </Card>

        {selected && <>
          {selected.sourceWarning && <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><p>{selected.sourceWarning}</p></div>}
          <Card title={`目标应用：${selected.name || selected.appid}`} action={<LoadingButton loading={sourceState === 'loading'} disabled={['SOURCE_NOT_READY', PLATFORM_RESOLVER_NO_PROJECTION, RUNTIME_APPVAR_PROJECTION_NOT_VISIBLE, 'SOURCE_CONTRACT_UNSUPPORTED', 'SOURCE_NOT_READONLY'].includes(selected.status)} onClick={() => void inspectSource()}><Server className="h-4 w-4" />递归探测 appvar</LoadingButton>}>
            <div className="grid gap-4 sm:grid-cols-4"><div><p className="text-xs text-slate-500">状态</p><p className="mt-1 font-semibold">{selectedStatus}</p></div><div><p className="text-xs text-slate-500">目录条目</p><p className="mt-1 font-semibold">{source?.entryCount ?? selected.entryCount}</p></div><div><p className="text-xs text-slate-500">文件大小</p><p className="mt-1 font-semibold">{formatBytes(source?.totalBytes ?? selected.totalBytes)}</p></div><div><p className="text-xs text-slate-500">数据库特征</p><p className="mt-1 font-semibold">{selected.databaseFindings?.length ?? 0}</p></div></div>
            {selected.sourceError && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{sourceErrorText(selected.sourceError)}</p>}
            {source && <div className="mt-5 space-y-4"><div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-3 text-sm"><span className="font-mono text-slate-700">{source.sourceDeployID}</span><StateBadge ok={source.readOnly} pendingLabel="源非只读，已停止" /><span className="text-slate-500">{source.sourceProjection || source.sourceAdapter}</span><span className="text-slate-500">{readOnlyModeText(source.readOnlyMode)}</span></div><div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-3 py-2">名称</th><th className="px-3 py-2">类型</th><th className="px-3 py-2 text-right">大小</th></tr></thead><tbody>{source.entries.map((entry) => <tr key={entry.name} className="border-t border-slate-100"><td className="px-3 py-2 font-mono text-xs"><span className="mr-2 inline-block align-middle">{entry.type === 'directory' ? <Folder className="h-4 w-4 text-amber-500" /> : <FileText className="h-4 w-4 text-slate-500" />}</span>{entry.name}</td><td className="px-3 py-2 text-slate-600">{entry.type}</td><td className="px-3 py-2 text-right font-mono text-xs text-slate-600">{entry.size == null ? '—' : formatBytes(entry.size)}</td></tr>)}</tbody></table></div></div>}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="文件 SHA-256（只返回摘要）"><div className="grid gap-3 sm:grid-cols-[1fr_auto]"><label className="space-y-1 text-sm font-medium text-slate-700">相对文件路径<input value={relativePath} onChange={(event) => setRelativePath(event.target.value)} placeholder="例如 poc/marker.txt" className="block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none ring-emerald-500 focus:ring-2" /></label><div className="flex items-end"><LoadingButton loading={readState === 'loading'} disabled={!relativePath.trim()} onClick={() => void hashFile()}>计算 SHA-256</LoadingButton></div></div>{read && <dl className="mt-5 grid gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-2"><div><dt className="text-xs text-slate-500">读取字节数</dt><dd className="mt-1 font-mono">{read.bytesRead}</dd></div><div><dt className="text-xs text-slate-500">哈希范围</dt><dd className="mt-1 font-mono">{read.hashScope}{read.truncated ? '（前缀）' : ''}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-slate-500">SHA-256</dt><dd className="mt-1 break-all font-mono text-xs">{read.sha256}</dd></div></dl>}</Card>
            <Card title="手动只读快照"><div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4"><Archive className="mt-0.5 h-5 w-5 text-slate-600" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-900">tar.gz + manifest.json</p><p className="mt-1 text-xs leading-5 text-slate-500">归档写入当前用户懒猫网盘的公共文稿目录 <span className="font-mono">/lzcapp/document</span>。SQLite 在本轮按 raw-read POC 处理，不声明 Online Backup 一致性。</p><LoadingButton loading={snapshotState === 'loading'} disabled={selected.status !== 'BACKUPABLE'} onClick={() => void createSnapshot()} className="mt-3"><HardDriveDownload className="h-4 w-4" />执行手动快照</LoadingButton></div></div>{snapshot && <div className="mt-4 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" />快照已写入网盘</div><p className="break-all font-mono text-xs">网盘目录：LazycatAppBackup/poc</p><p className="break-all font-mono text-xs">{snapshot.archivePath}</p><p className="text-xs">{snapshot.fileCount} 个文件 · {formatBytes(snapshot.archiveBytes)} · SHA-256 {snapshot.archiveSha256}</p></div>}</Card>
          </div>
          {selected.databaseFindings?.length > 0 && <Card title="数据库特征"><div className="space-y-2">{selected.databaseFindings.map((finding) => <div key={`${finding.path}-${finding.type}`} className="flex items-start gap-3 rounded-lg bg-slate-50 p-3 text-sm"><Database className="mt-0.5 h-4 w-4 text-slate-500" /><div><p className="font-mono text-xs">{finding.path}</p><p className={`mt-1 text-xs ${finding.supported ? 'text-emerald-700' : 'text-rose-700'}`}>{finding.type} · {finding.supported ? 'POC 可读取' : finding.reason || 'V1 不支持'}</p></div></div>)}</div></Card>}
        </>}

        <footer className="flex items-center gap-2 px-1 text-xs text-slate-500"><HardDriveDownload className="h-4 w-4" />快照目标：当前用户懒猫网盘 · <span className="font-mono">/lzcapp/document/LazycatAppBackup/poc</span></footer>
      </div>
    </main>
  );
}
