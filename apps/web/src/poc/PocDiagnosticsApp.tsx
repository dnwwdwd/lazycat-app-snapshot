import { useCallback, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Folder, LoaderCircle, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import { PocApiError, pocApi, type PocIdentity, type PocRead, type PocSource } from './api';

type ActionState = 'idle' | 'loading' | 'ready' | 'error';

function describeError(error: unknown): string {
  if (error instanceof PocApiError) {
    return `${error.code}: ${error.message}`;
  }
  return '无法连接 POC 诊断服务。';
}

function StateBadge({ ok, pendingLabel = '待验证' }: { ok: boolean; pendingLabel?: string }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
      <CheckCircle2 className="h-3.5 w-3.5" />已就绪
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
      <AlertTriangle className="h-3.5 w-3.5" />{pendingLabel}
    </span>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-bold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

function ErrorNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function LoadingButton({ loading, children, className, disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { loading: boolean }) {
  return (
    <button
      {...props}
      disabled={loading || disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 ${className ?? ''}`}
    >
      {loading && <LoaderCircle className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function PocDiagnosticsApp() {
  const [identity, setIdentity] = useState<PocIdentity | null>(null);
  const [identityState, setIdentityState] = useState<ActionState>('loading');
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [deployID, setDeployID] = useState('');
  const [relativePath, setRelativePath] = useState('');
  const [source, setSource] = useState<PocSource | null>(null);
  const [read, setRead] = useState<PocRead | null>(null);
  const [sourceState, setSourceState] = useState<ActionState>('idle');
  const [readState, setReadState] = useState<ActionState>('idle');
  const [actionError, setActionError] = useState<string | null>(null);

  const loadIdentity = useCallback(async (signal?: AbortSignal) => {
    setIdentityState('loading');
    setIdentityError(null);
    try {
      const result = await pocApi.identity(signal);
      setIdentity(result);
      setDeployID((current) => current || result.configuredSourceDeployID || '');
      setIdentityState('ready');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setIdentityState('error');
      setIdentityError(describeError(error));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadIdentity(controller.signal);
    return () => controller.abort();
  }, [loadIdentity]);

  const inspectSource = useCallback(async () => {
    setSourceState('loading');
    setActionError(null);
    setRead(null);
    try {
      const result = await pocApi.source(deployID);
      setSource(result);
      setSourceState('ready');
    } catch (error) {
      setSource(null);
      setSourceState('error');
      setActionError(describeError(error));
    }
  }, [deployID]);

  const hashFixtureFile = useCallback(async () => {
    setReadState('loading');
    setActionError(null);
    try {
      const result = await pocApi.read(deployID, relativePath);
      setRead(result);
      setReadState('ready');
    } catch (error) {
      setRead(null);
      setReadState('error');
      setActionError(describeError(error));
    }
  }, [deployID, relativePath]);

  const loadingIdentity = identityState === 'loading';
  const canInspect = deployID.trim() !== '' && identityState === 'ready';
  const canRead = canInspect && relativePath.trim() !== '';

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-col gap-4 rounded-2xl bg-slate-900 p-6 text-white shadow-lg sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-emerald-500/20 p-2.5"><ShieldCheck className="h-7 w-7 text-emerald-300" /></div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Lazycat App Backup</p>
              <h1 className="mt-1 text-xl font-bold">租户隔离 POC 诊断</h1>
              <p className="mt-1 text-sm text-slate-300">只读验证身份、权限声明和 appvar 源投影。</p>
            </div>
          </div>
          <LoadingButton loading={loadingIdentity} onClick={() => void loadIdentity()} className="bg-white/10 hover:bg-white/20">
            <RefreshCw className="h-4 w-4" />刷新状态
          </LoadingButton>
        </header>

        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" />
          <p>这是验证平台隔离能力的 POC，不会创建备份、复制文件、恢复数据或向目标应用写入任何内容。</p>
        </div>

        <ErrorNotice message={identityError || actionError} />

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="备份实例身份">
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between"><span>运行时身份</span><StateBadge ok={identity?.identityConfigured === true} pendingLabel="配置异常" /></div>
              {identity?.identityConfigured ? (
                <dl className="space-y-2 rounded-lg bg-slate-50 p-3 text-xs">
                  <div className="flex justify-between gap-4"><dt className="text-slate-500">Tenant UID</dt><dd className="font-mono text-slate-900">{identity.tenantUID}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-slate-500">Backup deploy ID</dt><dd className="font-mono text-slate-900">{identity.backupDeployID}</dd></div>
                </dl>
              ) : (
                <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">身份未完成配置；服务仅提供不含租户数据的诊断，源探测已停止。</p>
              )}
            </div>
          </Card>

          <Card title="权限与适配器状态">
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between"><span>源适配器</span><StateBadge ok={identity?.sourceConfigured === true} /></div>
              <p className="text-xs leading-5 text-slate-500">当前为 <code className="rounded bg-slate-100 px-1 py-0.5">{identity?.sourceAdapter ?? '加载中'}</code>。它只接收服务端预配的夹具，不会推断或显示 appvar 绝对路径。</p>
              <div className="flex flex-wrap gap-2">
                {(identity?.requiredPermissions ?? []).map((permission) => <span key={permission} className="rounded-full bg-emerald-50 px-2.5 py-1 font-mono text-xs text-emerald-800">声明：{permission}</span>)}
                {(identity?.optionalPermissions ?? []).map((permission) => <span key={permission} className="rounded-full bg-slate-100 px-2.5 py-1 font-mono text-xs text-slate-600">可选：{permission}</span>)}
              </div>
            </div>
          </Card>
        </div>

        <Card title="源投影探测">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="space-y-1 text-sm font-medium text-slate-700">
              目标 deploy ID
              <input value={deployID} onChange={(event) => setDeployID(event.target.value)} placeholder="由测试人员提供的夹具 deploy ID" className="block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none ring-emerald-500 focus:ring-2" />
            </label>
            <div className="flex items-end"><LoadingButton loading={sourceState === 'loading'} disabled={!canInspect} onClick={() => void inspectSource()}>检查源投影</LoadingButton></div>
          </div>
          {source && (
            <div className="mt-5 space-y-4">
              <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-3 text-sm">
                <span className="font-mono text-slate-700">{source.sourceDeployID}</span>
                <StateBadge ok={source.readOnly} pendingLabel="非只读：停止后续开发" />
                <span className="text-slate-500">{source.entryCount} 个根目录条目</span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-3 py-2">名称</th><th className="px-3 py-2">类型</th><th className="px-3 py-2 text-right">大小</th></tr></thead><tbody>
                  {source.entries.map((entry) => <tr key={entry.name} className="border-t border-slate-100"><td className="px-3 py-2 font-mono text-xs"><span className="mr-2 inline-block align-middle">{entry.type === 'directory' ? <Folder className="h-4 w-4 text-amber-500" /> : <FileText className="h-4 w-4 text-slate-500" />}</span>{entry.name}</td><td className="px-3 py-2 text-slate-600">{entry.type}</td><td className="px-3 py-2 text-right font-mono text-xs text-slate-600">{entry.size ?? '—'}</td></tr>)}
                </tbody></table>
              </div>
            </div>
          )}
        </Card>

        <Card title="已知夹具文件哈希">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="space-y-1 text-sm font-medium text-slate-700">
              相对文件路径
              <input value={relativePath} onChange={(event) => setRelativePath(event.target.value)} placeholder="例如 known.txt" className="block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none ring-emerald-500 focus:ring-2" />
            </label>
            <div className="flex items-end"><LoadingButton loading={readState === 'loading'} disabled={!canRead} onClick={() => void hashFixtureFile()}>计算 SHA-256</LoadingButton></div>
          </div>
          {read && <dl className="mt-5 grid gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-3"><div><dt className="text-xs text-slate-500">读取字节数</dt><dd className="mt-1 font-mono">{read.bytesRead}</dd></div><div><dt className="text-xs text-slate-500">哈希范围</dt><dd className="mt-1 font-mono">{read.hashScope}</dd></div><div className="sm:col-span-3"><dt className="text-xs text-slate-500">SHA-256（不返回文件正文）</dt><dd className="mt-1 break-all font-mono text-xs text-slate-800">{read.sha256}</dd></div></dl>}
        </Card>
      </div>
    </main>
  );
}
