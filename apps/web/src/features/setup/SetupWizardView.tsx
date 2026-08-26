import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, File, Folder, HardDrive, RefreshCw, ShieldCheck, XCircle, Zap } from 'lucide-react';
import { usePocApplications } from '../../hooks/usePocApplications';
import { usePocDiagnostics } from '../../hooks/usePocDiagnostics';

const statusText: Record<string, string> = {
  BACKUPABLE: '可创建快照',
  NO_DATA: '无数据',
  UNSUPPORTED_DATABASE: '数据库阻断',
  SOURCE_NOT_READY: '源目录未就绪',
  PERMISSION_DENIED: '读取被拒绝',
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}

function statusClass(status: string) {
  if (status === 'BACKUPABLE') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (status === 'UNSUPPORTED_DATABASE' || status === 'PERMISSION_DENIED') return 'bg-rose-50 text-rose-800 border-rose-200';
  return 'bg-amber-50 text-amber-800 border-amber-200';
}

export function SetupWizardView() {
  const [selectedDeployID, setSelectedDeployID] = useState('');
  const [probePath, setProbePath] = useState('');
  const {
    applications,
    selected,
    error: applicationsError,
    loading: applicationsLoading,
    snapshot,
    snapshotError,
    snapshotLoading,
    refresh: refreshApplications,
    selectApplication,
    createSnapshot,
  } = usePocApplications();
  const { identity, error: identityError, probeResult, probeError, probe, refresh: refreshIdentity } = usePocDiagnostics();

  useEffect(() => {
    if (!selectedDeployID && applications[0]) {
      setSelectedDeployID(applications[0].deployID);
    }
  }, [applications, selectedDeployID]);

  useEffect(() => {
    if (selectedDeployID) void selectApplication(selectedDeployID);
  }, [selectedDeployID, selectApplication]);

  const firstFile = useMemo(() => selected?.entries.find(entry => entry.type === 'file'), [selected]);

  useEffect(() => {
    if (firstFile && !probePath) setProbePath(firstFile.name);
  }, [firstFile, probePath]);

  const select = (deployID: string) => {
    setSelectedDeployID(deployID);
    setProbePath('');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/95 px-5 py-4 sm:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-slate-950"><ShieldCheck className="h-5 w-5" /></div>
            <div>
              <div className="flex items-center gap-2 text-sm font-bold"><span>懒猫应用备份</span><span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-amber-300">POC</span></div>
              <div className="text-xs text-slate-400">选择应用 → 全量探测 appvar / 数据库 → 手动快照</div>
            </div>
          </div>
          <button onClick={() => { void refreshApplications(); void refreshIdentity(); }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-emerald-500 hover:text-emerald-300">
            <RefreshCw className="h-3.5 w-3.5" />重新探测
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-5 py-6 sm:px-8">
        <section>
          <h1 className="text-xl font-bold tracking-tight text-slate-50">应用与数据库全量探测</h1>
          <p className="mt-1 text-xs text-slate-400">从当前用户拥有的应用开始，查看 appvar 全量目录、数据库类型和只读快照结果。</p>
        </section>
        <section className="grid gap-3 sm:grid-cols-4">
          <Diagnostic label="当前租户" value={identity?.tenantUID || '未注入'} ok={Boolean(identity?.identityConfigured)} />
          <Diagnostic label="权限" value="appvar.other.read" ok={identity?.requiredPermission === 'appvar.other.read'} />
          <Diagnostic label="应用目录" value={identity?.catalogConfigured ? '已接入目录' : '等待 resolver'} ok={Boolean(identity?.catalogConfigured)} />
          <Diagnostic label="appvar 源投影" value={identity?.sourceConfigured ? '已提供' : '未配置'} ok={Boolean(identity?.sourceConfigured)} />
        </section>

        {(identityError || applicationsError) && (
          <section className="rounded-xl border border-amber-500/40 bg-amber-400/10 p-4 text-sm text-amber-100">
            <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><div>
              <div className="font-semibold">{applicationsError?.code || identityError?.code || 'APPLICATION_CATALOG_NOT_READY'}</div>
              <div className="mt-1 text-xs leading-5 text-amber-200/80">{applicationsError?.message || identityError?.message || '平台应用目录或只读 appvar resolver 尚未提供，页面不会伪造应用数据。'}</div>
            </div></div>
          </section>
        )}

        <section className="grid gap-5 lg:grid-cols-[minmax(280px,360px)_1fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="mb-3 flex items-center justify-between"><div><h1 className="text-sm font-bold">选择当前用户的应用</h1><p className="mt-1 text-[11px] text-slate-400">仅显示 owner UID 匹配的目录项；单实例会标记共享数据风险</p></div><HardDrive className="h-4 w-4 text-emerald-400" /></div>
            {applicationsLoading && <div className="flex items-center gap-2 py-8 text-xs text-slate-400"><RefreshCw className="h-4 w-4 animate-spin" />正在读取应用目录…</div>}
            {!applicationsLoading && applications.length === 0 && !applicationsError && <div className="rounded-lg border border-dashed border-slate-700 p-4 text-xs leading-5 text-slate-400">没有可探测应用。请先让平台 resolver 返回当前用户拥有的应用目录。</div>}
            <div className="space-y-2">
              {applications.map(app => <button key={app.deployID} onClick={() => select(app.deployID)} className={`w-full rounded-xl border p-3 text-left transition ${selectedDeployID === app.deployID ? 'border-emerald-400 bg-emerald-400/10' : 'border-slate-800 bg-slate-950 hover:border-slate-600'}`}>
                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-100">{app.name || app.appid}</div><div className="mt-1 truncate font-mono text-[10px] text-slate-500">{app.appid} · {app.deployID}</div></div><span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClass(app.status)}`}>{statusText[app.status] || app.status}</span></div>
                <div className="mt-2 flex gap-3 text-[11px] text-slate-400"><span>{app.fileCount} 文件</span><span>{formatBytes(app.totalBytes)}</span><span>{app.sqliteCount} SQLite</span></div>
              </button>)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            {!selected && <div className="flex min-h-[360px] flex-col items-center justify-center text-center text-slate-500"><Zap className="mb-3 h-7 w-7 text-emerald-500" /><div className="text-sm font-semibold text-slate-300">选择一个应用开始全量探测</div><div className="mt-1 max-w-md text-xs leading-5">服务端会重新校验 deploy ID、owner、多实例状态和源目录边界，浏览器不会提交绝对路径。</div></div>}
            {selected && <>
              <div className="flex flex-col justify-between gap-3 border-b border-slate-800 pb-4 sm:flex-row sm:items-start"><div><div className="flex items-center gap-2"><h2 className="text-base font-bold">{selected.name || selected.appid}</h2><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClass(selected.status)}`}>{statusText[selected.status] || selected.status}</span></div><div className="mt-1 font-mono text-[10px] text-slate-500">{selected.appid} · deploy_id={selected.deployID} · owner={selected.ownerUID}</div></div><button disabled={selected.status !== 'BACKUPABLE' || snapshotLoading} title={selected.status === 'SOURCE_NOT_READY' ? '平台尚未提供 appvar 只读源，暂时无法生成快照' : undefined} onClick={() => void createSnapshot()} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"><Zap className="h-3.5 w-3.5" />{snapshotLoading ? '快照生成中…' : '执行手动快照'}</button></div>
              {selected.sourceWarning && <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-400/10 p-3 text-xs leading-5 text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><span>{selected.sourceWarning}</span></div>}
              {selected.sourceError && <div className="mt-3 rounded-lg bg-amber-400/10 p-3 text-xs leading-5 text-amber-200"><div>{selected.sourceError === 'platform source resolver is not configured' ? '平台已返回这个应用的目录信息，但没有把 appvar 以业务容器可见的只读源投影提供出来。当前包不会猜宿主路径，也不会添加宿主挂载。' : selected.sourceError}</div><div className="mt-1 text-[10px] text-amber-200/70">这属于 Lazycat 平台 source resolver 配置缺口；应用目录本身已经接通。源投影接通后，状态会变为“可创建快照”，手动备份按钮才会启用。</div></div>}
              {!selected.sourceError && !selected.readOnly && <div className="mt-3 rounded-lg bg-amber-400/10 p-3 text-xs text-amber-200">当前源目录所在文件系统可写；POC 过程不会向源目录写入内容。真机验收仍需确认 `appvar.other.read` 投影本身为只读。</div>}
              <div className="grid grid-cols-2 gap-2 py-4 sm:grid-cols-5"><Metric label="目录条目" value={String(selected.entryCount)} /><Metric label="文件" value={String(selected.fileCount)} /><Metric label="总大小" value={formatBytes(selected.totalBytes)} /><Metric label="跳过" value={String(selected.skippedCount)} /><Metric label="源只读" value={selected.readOnly ? '是' : '否'} /></div>
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="overflow-hidden rounded-xl border border-slate-800"><div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2 text-xs font-semibold"><Folder className="h-3.5 w-3.5 text-emerald-400" />appvar 全量目录（最多 200 条）</div><div className="max-h-80 overflow-y-auto divide-y divide-slate-800">{selected.entries.slice(0, 200).map(entry => <div key={`${entry.type}:${entry.name}`} className="flex items-center justify-between gap-3 px-3 py-2 text-[11px]"><span className="flex min-w-0 items-center gap-2 truncate font-mono text-slate-300">{entry.type === 'directory' ? <Folder className="h-3 w-3 shrink-0 text-emerald-400" /> : <File className="h-3 w-3 shrink-0 text-slate-500" />}{entry.name}</span><span className="shrink-0 text-slate-500">{entry.type} · {formatBytes(entry.size)}</span></div>)}{selected.entries.length === 0 && <div className="p-4 text-xs text-slate-500">源目录为空</div>}</div></div>
                <div className="space-y-4"><div className="overflow-hidden rounded-xl border border-slate-800"><div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2 text-xs font-semibold"><Database className="h-3.5 w-3.5 text-emerald-400" />数据库识别</div>{selected.databaseFindings.length === 0 ? <div className="p-3 text-xs text-slate-500">未发现数据库特征</div> : <div className="divide-y divide-slate-800">{selected.databaseFindings.map(finding => <div key={`${finding.type}:${finding.path}`} className="flex items-center justify-between gap-3 px-3 py-2 text-[11px]"><span className="truncate font-mono text-slate-300">{finding.path}</span><span className={finding.supported ? 'shrink-0 text-emerald-300' : 'shrink-0 text-rose-300'}>{finding.type} · {finding.supported ? '支持' : '阻断'}</span></div>)}</div>}</div>
                  <div className="rounded-xl border border-slate-800 p-3"><div className="mb-2 text-xs font-semibold">文件 SHA-256 探针</div><div className="flex gap-2"><input value={probePath} onChange={event => setProbePath(event.target.value)} placeholder="相对路径，例如 data/app.sqlite" className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 font-mono text-[11px] text-slate-200 outline-none focus:border-emerald-400" /><button onClick={() => void probe(probePath, selected.deployID)} className="rounded-lg bg-slate-700 px-3 py-2 text-[11px] font-semibold hover:bg-slate-600">计算</button></div>{probeResult && <div className="mt-2 break-all font-mono text-[10px] text-emerald-300">sha256={probeResult.sha256} · {probeResult.bytesRead} bytes{probeResult.truncated ? ' · 已截断' : ''}</div>}{probeError && <div className="mt-2 text-[10px] text-rose-300">{probeError.code || 'SOURCE_READ_FAILED'}：{probeError.message}</div>}</div></div>
              </div>
              {snapshot && <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-400/10 p-3 text-xs text-emerald-100"><div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" />手动快照已完成</div><div className="mt-2 space-y-1 text-[11px]"><div>归档：<span className="break-all font-mono">{snapshot.archivePath}</span></div><div>manifest：<span className="break-all font-mono">{snapshot.manifestPath}</span></div><div>SHA-256：<span className="break-all font-mono">{snapshot.archiveSha256}</span></div><div>{snapshot.fileCount} 个文件 · {formatBytes(snapshot.archiveBytes)} · {snapshot.consistency}</div></div></div>}
              {snapshotError && <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-400/10 p-3 text-xs text-rose-200"><XCircle className="mt-0.5 h-4 w-4 shrink-0" />{snapshotError.code || 'SNAPSHOT_BLOCKED'}：{snapshotError.message}</div>}
            </>}
          </div>
        </section>
      </main>
    </div>
  );
}

function Diagnostic({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-3"><div className="text-[11px] text-slate-500">{label}</div><div className={`mt-1 flex items-center gap-1.5 text-xs font-semibold ${ok ? 'text-emerald-300' : 'text-amber-300'}`}>{ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}<span className="truncate font-mono">{value}</span></div></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-950 px-2.5 py-2"><div className="text-[10px] text-slate-500">{label}</div><div className="mt-1 text-sm font-semibold text-slate-200">{value}</div></div>;
}
