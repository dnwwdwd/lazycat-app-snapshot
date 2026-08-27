import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api/client";
import { formatBytes, formatDate, loadLocale, storeLocale, translate, type Locale } from "../i18n";
import { Dropdown, Icon } from "./components";

const nav = [
  ["workspace", ["overview", "applications", "plans", "tasks"]],
  ["assets", ["backups", "storage", "alerts"]],
  ["preferences", ["settings"]],
] as const;

const iconFor: Record<string, string> = { overview: "grid", applications: "apps", plans: "calendar", tasks: "tasks", backups: "archive", storage: "harddrive", alerts: "bell", settings: "settings" };

function statusLabel(t: any, value?: string) {
  const map: Record<string, string> = {
    BACKUPABLE: t.backupable, BACKUPABLE_SHARED_WARNING: t.sharedWarning, PROTECTED: t.protected, UNPROTECTED: t.unprotected,
    NO_DATA: t.noData, UNSUPPORTED_DATABASE: t.unsupported, QUEUED: t.queued, LEASED: t.running, PRECHECKING: t.running,
    SCANNING: t.running, SQLITE_SNAPSHOT: t.running, ZIP_WRITING: t.running, VERIFYING: t.running, COMMITTING: t.running,
    RUNNING: t.running, SUCCEEDED: t.success, SUCCEEDED_WITH_WARNINGS: t.success, FAILED: t.failedStatus, TIMED_OUT: t.failedStatus,
    CANCELLED: t.failedStatus, INTERRUPTED: t.failedStatus, SKIPPED: t.paused, OPEN: t.open, MUTED: t.muted, RESOLVED: t.resolved,
    VERIFIED: t.success,
  };
  return map[value || ""] || value || "—";
}

function statusTone(value?: string) {
  if (["BACKUPABLE", "BACKUPABLE_SHARED_WARNING", "PROTECTED", "SUCCEEDED", "SUCCEEDED_WITH_WARNINGS", "VERIFIED", "RESOLVED"].includes(value || "")) return "good";
  if (["FAILED", "TIMED_OUT", "CANCELLED", "INTERRUPTED", "UNSUPPORTED_DATABASE", "CRITICAL", "EMERGENCY"].includes(value || "")) return "bad";
  if (["RUNNING", "LEASED", "PRECHECKING", "SCANNING", "SQLITE_SNAPSHOT", "ZIP_WRITING", "VERIFYING", "COMMITTING"].includes(value || "")) return "violet";
  if (["BACKUPABLE_SHARED_WARNING", "UNPROTECTED", "WARNING", "OPEN"].includes(value || "")) return "warn";
  return "neutral";
}

function Pill({ t, value }: { t: any; value?: string }) {
  return <span className={`pill ${statusTone(value)}`}><span className="pill-dot" />{statusLabel(t, value)}</span>;
}

function CatalogAppIcon({ app, size = "normal" }: { app: any; size?: "normal" | "large" }) {
  const [failed, setFailed] = useState(false);
  const label = (app.name || app.appid || "?").trim().slice(0, 1).toUpperCase();
  return <div className={`app-avatar app-catalog-icon ${size === "large" ? "large" : ""}`} aria-label={`${app.name} icon`}>
    {app.icon && !failed ? <img src={app.icon} alt="" onError={() => setFailed(true)} /> : label}
  </div>;
}

function ErrorPanel({ error, onRetry }: { error?: string; onRetry?: () => void }) {
  if (!error) return null;
  return <div className="notice bad"><Icon name="warning" size={15} /><span><strong>{error}</strong>{onRetry && <button className="btn btn-ghost btn-small" onClick={onRetry}>Retry</button>}</span></div>;
}

function Empty({ title, copy }: { title: string; copy?: string }) {
  return <div className="empty"><div className="empty-icon"><Icon name="archive" size={18} /></div><strong>{title}</strong>{copy && <p>{copy}</p>}</div>;
}

function formatAction(action: string) {
  return action.replaceAll(".", " · ").replaceAll("_", " ");
}

function App() {
  const [locale, setLocale] = useState<Locale>(loadLocale);
  const t = translate(locale);
  const [route, setRoute] = useState("overview");
  const [session, setSession] = useState<any>(null);
  const [apps, setApps] = useState<any[]>([]);
  const [overview, setOverview] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [storage, setStorage] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [settingsError, setSettingsError] = useState("");
  const [audits, setAudits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<any>(null);
  const [applicationFilter, setApplicationFilter] = useState({ q: "", mode: "", capability: "" });
  const [globalQuery, setGlobalQuery] = useState("");
  const [appCursor, setAppCursor] = useState("");
  const [nextCursor, setNextCursor] = useState("");
  const [selectedApp, setSelectedApp] = useState<any>(null);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [selectedBatch, setSelectedBatch] = useState<any>(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState<any>(null);
  const [snapshotFiles, setSnapshotFiles] = useState<any[]>([]);
  const [planEditor, setPlanEditor] = useState<any>(null);
  const [alertStatus, setAlertStatus] = useState("OPEN");

  const handleError = useCallback((value: unknown) => {
    const failure = value as ApiError;
    if (failure instanceof ApiError && failure.status === 401) {
      window.location.assign(`/auth/login?return_to=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    if (failure instanceof ApiError && failure.code === "IDENTITY_MISMATCH") {
      window.location.assign(`/auth/login?reason=identity_mismatch&return_to=${encodeURIComponent("/")}`);
      return;
    }
    setError(failure instanceof Error ? failure.message : t.failed);
  }, [t.failed, t.identityMismatch]);

  const notify = useCallback((title: string, copy?: string) => {
    setToast({ id: Date.now(), title, copy });
    window.setTimeout(() => setToast(null), 3600);
  }, []);

  const loadApplications = useCallback(async () => {
    const params = new URLSearchParams({ limit: "50" });
    if (appCursor) params.set("cursor", appCursor);
    if (applicationFilter.q.trim()) params.set("q", applicationFilter.q.trim());
    if (applicationFilter.mode) params.set("mode", applicationFilter.mode);
    if (applicationFilter.capability) params.set("capability_status", applicationFilter.capability);
    const result = await api.applications(params);
    setApps(result.items);
    setNextCursor(result.nextCursor || "");
  }, [appCursor, applicationFilter]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      api.session(), api.applications(new URLSearchParams({ limit: "50" })), api.overview(), api.plans(), api.tasks(), api.batches(), api.backups(), api.storage(), api.alerts(new URLSearchParams({ limit: "50", status: alertStatus })), api.settings(), api.audit(),
    ]);
    const [current, appData, overviewData, planData, taskData, batchData, backupData, storageData, alertData, settingsData, auditData] = results;
    if (current.status === "fulfilled") setSession(current.value); else handleError(current.reason);
    if (appData.status === "fulfilled") { setApps(appData.value.items); setNextCursor(appData.value.nextCursor || ""); }
    if (overviewData.status === "fulfilled") setOverview(overviewData.value);
    if (planData.status === "fulfilled") setPlans(planData.value.items);
    if (taskData.status === "fulfilled") setTasks(taskData.value.items);
    if (batchData.status === "fulfilled") setBatches(batchData.value.items);
    if (backupData.status === "fulfilled") setSnapshots(backupData.value.items);
    if (storageData.status === "fulfilled") setStorage(storageData.value);
    if (alertData.status === "fulfilled") setAlerts(alertData.value.items);
    if (settingsData.status === "fulfilled") { setSettings(settingsData.value); setSettingsError(""); } else setSettingsError(settingsData.reason instanceof Error ? settingsData.reason.message : t.failed);
    if (auditData.status === "fulfilled") setAudits(auditData.value.items);
    const failed = results.find((result) => result.status === "rejected") as PromiseRejectedResult | undefined;
    if (!failed) setError(""); else if (!(failed.reason instanceof ApiError && (failed.reason.status === 401 || failed.reason.code === "IDENTITY_MISMATCH"))) setError(failed.reason instanceof Error ? failed.reason.message : t.failed);
    setLoading(false);
  }, [alertStatus, handleError, t.failed]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    if (!session) return;
    const source = new EventSource(api.eventsURL());
    const refresh = () => { void loadData(); };
    ["batch.updated", "task.updated", "snapshot.updated", "alert.created", "storage.updated", "session.expiring"].forEach((name) => source.addEventListener(name, refresh));
    source.onerror = () => { source.close(); };
    return () => source.close();
  }, [session, loadData]);
  useEffect(() => {
    if (route !== "applications") return;
    void loadApplications().catch(handleError);
  }, [route, loadApplications, handleError]);

  const navigate = (next: string) => { setRoute(next); setError(""); setSelectedApp(null); setSelectedTask(null); setSelectedBatch(null); setSelectedSnapshot(null); };
  const changeLocale = (next: Locale) => { setLocale(next); storeLocale(next); };
  const refresh = () => { void loadData(); };

  const openApplication = async (item: any) => {
    try { setSelectedApp(await api.instance(item.deployId)); } catch (failure) { handleError(failure); }
  };
  const probe = async (item: any) => {
    try { await api.probeInstance(item.deployId); notify(t.probe, t.loading); await loadApplications(); } catch (failure) { handleError(failure); }
  };
  const startBackup = async (item: any) => {
    try { await api.startBackup(item.deployId); notify(t.backupNow, t.queued); setSelectedApp(null); await loadData(); } catch (failure) { handleError(failure); }
  };
  const savePlan = async (input: any, runNow: boolean) => {
    try {
      const result = planEditor?.id ? await api.updatePlan(planEditor.id, input) : await api.createPlan(input);
      if (runNow) await api.runPlan(result.id);
      notify(planEditor?.id ? t.planUpdated : t.planCreated, runNow ? t.queued : undefined);
      setPlanEditor(null); await loadData();
    } catch (failure) { handleError(failure); }
  };
  const taskAction = async (item: any, action: "cancel" | "retry") => {
    try { action === "cancel" ? await api.cancelTask(item.id) : await api.retryTask(item.id); notify(action === "cancel" ? t.cancel : t.retry, t.queued); await loadData(); } catch (failure) { handleError(failure); }
  };
  const openTask = async (item: any) => { try { setSelectedTask(await api.task(item.id)); } catch (failure) { handleError(failure); } };
  const openBatch = async (item: any) => { try { setSelectedBatch(await api.batches(200).then((data) => data.items.find((entry: any) => entry.id === item.id) || item)); } catch (failure) { handleError(failure); } };
  const openSnapshot = async (item: any) => { try { const [detail, files] = await Promise.all([api.backup(item.id), api.backupFiles(item.id)]); setSelectedSnapshot(detail); setSnapshotFiles(files.items); } catch (failure) { handleError(failure); } };
  const snapshotAction = async (id: string, action: "verify" | "full" | "export" | "delete") => {
    try {
      if (action === "verify") await api.verifyBackup(id);
      if (action === "full") await api.verifyBackupFull(id);
      if (action === "export") await api.exportBackup(id);
      if (action === "delete") await api.deleteBackup(id);
      notify(action === "delete" ? t.trash : action === "export" ? t.exportDone : t.success); setSelectedSnapshot(null); await loadData();
    } catch (failure) { handleError(failure); }
  };
  const alertAction = async (item: any, action: "read" | "resolve" | "mute") => {
    try {
      if (action === "read") await api.readAlert(item.id);
      if (action === "resolve") await api.resolveAlert(item.id);
      if (action === "mute") await api.muteAlert(item.id);
      await loadData();
    } catch (failure) { handleError(failure); }
  };
  const saveSettings = async (value: any) => { try { const result = await api.updateSettings(value); setSettings(result); changeLocale(result.locale); notify(t.settingsSaved); await loadData(); } catch (failure) { handleError(failure); } };
  const logout = async () => { try { await api.logout(); window.location.assign("/auth/login"); } catch (failure) { handleError(failure); } };

  const page = useMemo(() => {
    const base = { t, locale, apps, plans, tasks, batches, snapshots, storage, alerts, settings, settingsError, overview, audits, loading, error, refresh };
    if (route === "setup") return <SetupPage {...base} session={session} onSync={async () => { try { await api.syncApplications(); notify(t.setupAction); await loadData(); } catch (failure) { handleError(failure); } }} />;
    if (route === "overview") return <OverviewPage {...base} navigate={navigate} />;
    if (route === "applications") return <ApplicationsPage {...base} filter={applicationFilter} setFilter={(value: any) => { setApplicationFilter(value); setAppCursor(""); }} onOpen={openApplication} onProbe={probe} onBackup={startBackup} onSync={async () => { try { await api.syncApplications(); notify(t.refresh, t.loading); await loadApplications(); } catch (failure) { handleError(failure); } }} nextCursor={nextCursor} onNext={() => setAppCursor(nextCursor)} />;
    if (route === "plans") return <PlansPage {...base} onNew={() => setPlanEditor({})} onEdit={(item: any) => setPlanEditor(item)} onRun={async (id: string) => { try { await api.runPlan(id); notify(t.runNow, t.queued); await loadData(); } catch (failure) { handleError(failure); } }} onPause={async (item: any) => { try { item.enabled ? await api.pausePlan(item.id) : await api.resumePlan(item.id); await loadData(); } catch (failure) { handleError(failure); } }} />;
    if (route === "tasks") return <TasksPage {...base} onOpenTask={openTask} onOpenBatch={openBatch} onAction={taskAction} />;
    if (route === "backups") return <BackupsPage {...base} onOpen={openSnapshot} onAction={snapshotAction} />;
    if (route === "storage") return <StoragePage {...base} onScan={async () => { try { await api.scanStorage(); notify(t.scan); await loadData(); } catch (failure) { handleError(failure); } }} onCleanup={async () => { try { await api.cleanupStorage(); notify(t.cleanup); await loadData(); } catch (failure) { handleError(failure); } }} />;
    if (route === "alerts") return <AlertsPage {...base} status={alertStatus} onStatus={setAlertStatus} onAction={alertAction} />;
    return <SettingsPage {...base} session={session} onSave={saveSettings} onLogout={logout} />;
  // The page factory reads live data and action closures intentionally.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, t, locale, apps, plans, tasks, batches, snapshots, storage, alerts, settings, overview, audits, loading, error, session, applicationFilter, nextCursor, alertStatus, loadApplications, handleError, notify]);

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><img src="assets/lzc-icon.png" alt="Lazycat" /></div><div><div className="brand-title">{t.appName}</div><div className="brand-sub">Mimi backup · V1</div></div></div>
      {nav.map(([section, entries]) => <div className="nav-section" key={section}><div className="nav-label">{t[section as keyof typeof t]}</div>{entries.map((entry) => <button key={entry} className={`nav-item ${route === entry ? "active" : ""}`} onClick={() => navigate(entry)}><Icon name={iconFor[entry]} size={17} /><span>{t[entry as keyof typeof t]}</span>{entry === "alerts" && overview?.unreadAlerts > 0 && <span className="nav-count">{overview.unreadAlerts}</span>}</button>)}</div>)}
      <div className="sidebar-footer"><div className="tenant-card"><div className="tenant-row"><div className="avatar">{session?.displayName?.slice(0, 1) || "·"}</div><div><div className="tenant-name">{session?.displayName || "—"}</div><div className="tenant-uid">{session?.uid || "—"} · {session?.role || "—"}</div></div></div><div className="tenant-check"><Icon name="shield" size={13} /> {session ? t.identityVerified : "—"}</div></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="top-actions"><label className="global-search"><Icon name="search" size={15} /><input value={globalQuery} placeholder={t.searchApps} onChange={(event) => setGlobalQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { setApplicationFilter({ q: globalQuery, mode: "", capability: "" }); setAppCursor(""); navigate("applications"); } }} /></label><button className="top-btn" onClick={() => navigate("alerts")} title={t.alerts}><Icon name="bell" size={16} />{overview?.unreadAlerts > 0 && <span className="alert-dot" />}</button><Dropdown className="lang-switch" value={locale} onChange={(event: any) => changeLocale(event.target.value as Locale)} aria-label={t.language} options={[{ value: "zh-CN", label: t.localeZh }, { value: "en-US", label: t.localeEn }]} /><button className="user-menu" onClick={() => navigate("settings")}><span className="avatar" style={{ width: 31, height: 31, fontSize: 11 }}>{session?.displayName?.slice(0, 1) || "·"}</span><span className="user-meta"><strong>{session?.displayName || "—"}</strong><span>{session?.role || "—"}</span></span></button></div></header>
      {page}
    </main>
    <nav className="mobile-nav" aria-label="Navigation"><div className="mobile-nav-scroll">{nav.flatMap(([, entries]) => entries).map((entry) => <button key={entry} className={`mobile-nav-item ${route === entry ? "active" : ""}`} onClick={() => navigate(entry)}><Icon name={iconFor[entry]} size={17} /><span>{t[entry as keyof typeof t]}</span></button>)}</div></nav>
    {selectedApp && <ApplicationDetail t={t} locale={locale} app={selectedApp} tasks={tasks} plans={plans} close={() => setSelectedApp(null)} onProbe={probe} onBackup={startBackup} onOpenTask={openTask} />}
    {selectedTask && <TaskDetail t={t} locale={locale} detail={selectedTask} close={() => setSelectedTask(null)} onAction={taskAction} />}
    {selectedBatch && <BatchDetail t={t} locale={locale} batch={selectedBatch} tasks={tasks.filter((item) => item.batchId === selectedBatch.id)} close={() => setSelectedBatch(null)} onOpenTask={openTask} />}
    {selectedSnapshot && <SnapshotDetail t={t} locale={locale} snapshot={selectedSnapshot} files={snapshotFiles} close={() => setSelectedSnapshot(null)} onAction={snapshotAction} />}
    {planEditor && <PlanEditor t={t} apps={apps} defaults={settings} plan={planEditor} close={() => setPlanEditor(null)} onSave={savePlan} />}
    {toast && <div className="toast-stack"><div className="toast"><Icon name="check" size={15} /><div><strong>{toast.title}</strong>{toast.copy && <p>{toast.copy}</p>}</div></div></div>}
  </div>;
}

function PageHead({ eyebrow, title, copy, action }: any) { return <div className="page-head"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p className="page-sub">{copy}</p></div>{action}</div>; }

function SetupPage({ t, session, apps, loading, error, onSync }: any) {
  return <div className="page"><PageHead eyebrow="V1 · Setup" title={t.setupTitle} copy={t.setupCopy} action={<button className="btn btn-primary" disabled={loading} onClick={onSync}><Icon name="refresh" size={14} />{t.setupAction}</button>} /><ErrorPanel error={error} /><div className="dashboard-grid"><div className="card card-pad"><div className="section-label">{t.setupStepIdentity}</div><div className="setting-row"><div><strong>{session?.displayName || "—"}</strong><p className="mono">{session?.uid || "—"}</p></div><Pill t={t} value={session?.identityVerified ? "VERIFIED" : "FAILED"} /></div><div className="section-label">{t.setupStepPermissions}</div><div className="notice good"><Icon name="shield" size={15} /><span>{t.safeScope}<br />appvar.other.read · document.write · {t.readonly}</span></div></div><div className="card card-pad"><div className="section-label">{t.setupStepScan}</div><div className="storage-kpis"><Metric label={t.discovered} value={apps.length} /><Metric label={t.backupableCount} value={apps.filter((item: any) => item.capabilityStatus?.includes("BACKUPABLE")).length} /><Metric label={t.unsupported} value={apps.filter((item: any) => item.capabilityStatus === "UNSUPPORTED_DATABASE").length} /></div><div className="notice" style={{ marginTop: 16 }}><Icon name="info" size={15} /><span>{t.setupStepBackup}: {t.applications} → {t.backupNow}</span></div></div></div></div>;
}

function Metric({ label, value }: any) { return <div className="storage-kpi stat-card"><span>{label}</span><strong>{value}</strong></div>; }

function OverviewPage({ t, locale, overview, loading, error, navigate }: any) {
  const data = overview || {};
  return <div className="page"><PageHead eyebrow="Overview · Current tenant" title={t.overviewTitle} copy={t.overviewCopy} action={<div className="head-actions"><button className="btn btn-secondary" onClick={() => navigate("tasks")}><Icon name="tasks" size={14} />{t.tasks}</button><button className="btn btn-primary" onClick={() => navigate("applications")}><Icon name="apps" size={14} />{t.applications}</button></div>} /><ErrorPanel error={error} /><div className="stats-grid"><Stat label={t.discovered} value={data.applicationCount ?? "—"} icon="apps" /><Stat label={t.backupableCount} value={data.backupableCount ?? "—"} icon="shield" /><Stat label={t.protectedCount} value={data.protectedCount ?? "—"} icon="check" /><Stat label={t.task24} value={`${data.succeeded24h ?? 0} / ${data.failed24h ?? 0}`} icon="tasks" /><Stat label={t.storageUsed} value={formatBytes(locale, data.storage?.archiveBytes || 0)} icon="harddrive" /></div><div className="dashboard-grid"><div className="card card-pad"><Section title={t.nextPlans} /><div className="mini-list">{data.nextPlans?.length ? data.nextPlans.map((plan: any) => <div className="mini-row" key={plan.id}><div><strong>{plan.name}</strong><p>{formatDate(locale, plan.nextRunAt)}</p></div><Pill t={t} value={plan.enabled ? "PROTECTED" : "PAUSED"} /></div>) : <Empty title={t.empty} />}</div></div><div className="card card-pad"><Section title={t.risks} /><div className="risk-list">{data.unreadAlerts ? <div className="risk-item"><Icon name="warning" size={15} /><span>{data.unreadAlerts} {t.openAlerts}</span></div> : <div className="risk-item"><Icon name="check" size={15} /><span>{t.noAlerts}</span></div>}<div className="risk-item"><Icon name="tasks" size={15} /><span>{t.queuedTasks}: {data.queuedTasks || 0} / {data.runningTasks || 0}</span></div><div className="risk-item"><Icon name="archive" size={15} /><span>{t.unprotectedCount}: {data.unprotectedCount || 0}</span></div></div></div></div><div className="section-label">{t.activity}</div><div className="card card-pad">{data.recentActivity?.length ? data.recentActivity.map((item: any) => <div className="setting-row" key={item.id}><div><strong>{formatAction(item.action)}</strong><p>{formatDate(locale, item.createdAt)}</p></div><span className="mono">{item.entityId || "—"}</span></div>) : <Empty title={t.empty} />}</div>{loading && <Empty title={t.loading} />}</div>;
}

function Stat({ label, value, icon }: any) { return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className="stat-icon"><Icon name={icon} size={15} /></span></div><div className="stat-value">{value}</div></div>; }
function Section({ title, action }: any) { return <div className="card-head"><div className="card-title">{title}</div>{action}</div>; }

function ApplicationsPage({ t, locale, apps, loading, error, filter, setFilter, onOpen, onProbe, onBackup, onSync, nextCursor, onNext }: any) {
  return <div className="page"><PageHead eyebrow="Applications · Current tenant" title={t.applicationTitle} copy={t.applicationCopy} action={<button className="btn btn-secondary" onClick={onSync}><Icon name="refresh" size={14} />{t.refresh}</button>} /><ErrorPanel error={error} /><div className="filter-bar"><label className="global-search"><Icon name="search" size={15} /><input value={filter.q} placeholder={t.searchApps} onChange={(event) => setFilter({ ...filter, q: event.target.value })} /></label><Dropdown value={filter.mode} onChange={(event: any) => setFilter({ ...filter, mode: event.target.value })} aria-label={t.instance} options={[{ value: "", label: t.all }, { value: "single", label: t.single }, { value: "multi", label: t.multi }]} /><Dropdown value={filter.capability} onChange={(event: any) => setFilter({ ...filter, capability: event.target.value })} aria-label={t.status} options={[{ value: "", label: t.all }, { value: "BACKUPABLE", label: t.backupable }, { value: "NO_DATA", label: t.noData }, { value: "UNSUPPORTED_DATABASE", label: t.unsupported }]} /></div><div className="card table-card"><div className="table-wrap"><table><thead><tr><th>{t.application}</th><th>{t.instance}</th><th>{t.dataSize}</th><th>{t.status}</th><th>{t.lastBackup}</th><th /></tr></thead><tbody>{apps.map((item: any) => <tr key={item.deployId}><td><div className="app-cell"><CatalogAppIcon app={item} /><div><strong>{item.name}</strong><div className="mono subtle">{item.appid} · {item.version || "—"}</div></div></div></td><td><div className="mono">{item.deployId}</div><div className="subtle">{item.multiInstance ? t.multi : t.single}</div></td><td>{formatBytes(locale, item.totalBytes)}<div className="subtle">{item.fileCount} {t.fileCount}</div></td><td><Pill t={t} value={item.capabilityStatus} /></td><td>{formatDate(locale, item.lastBackupAt)}</td><td><div className="row-actions"><button className="icon-btn" title={t.details} onClick={() => onOpen(item)}><Icon name="eye" size={15} /></button><button className="icon-btn" title={t.probe} onClick={() => onProbe(item)}><Icon name="refresh" size={15} /></button>{item.capabilityStatus?.includes("BACKUPABLE") && <button className="icon-btn" title={t.backupNow} onClick={() => onBackup(item)}><Icon name="zap" size={15} /></button>}</div></td></tr>)}</tbody></table></div>{!loading && apps.length === 0 && <Empty title={t.noApplications} />}{loading && <Empty title={t.loading} />}<div className="row-actions" style={{ justifyContent: "flex-end", margin: 14 }}><button className="btn btn-secondary btn-small" disabled={!nextCursor} onClick={onNext}>{t.nextPlans} <Icon name="arrow" size={12} /></button></div></div></div>;
}

function PlansPage({ t, locale, plans, batches, loading, error, onNew, onEdit, onRun, onPause }: any) { return <div className="page"><PageHead eyebrow="Plans · Current tenant" title={t.planTitle} copy={t.planCopy} action={<button className="btn btn-primary" onClick={onNew}><Icon name="plus" size={14} />{t.newPlan}</button>} /><ErrorPanel error={error} /><div className="card table-card"><div className="table-wrap"><table><thead><tr><th>{t.name}</th><th>{t.targets}</th><th>{t.schedule}</th><th>{t.status}</th><th>{t.scheduledAt}</th><th /></tr></thead><tbody>{plans.map((item: any) => <tr key={item.id}><td><strong>{item.name}</strong><div className="mono subtle">{item.id}</div></td><td>{item.targetKind === "ALL_BACKUPABLE" ? t.allBackupable : `${item.targets.length}`}</td><td>{item.scheduleType === "CRON" ? item.cronExpression : item.scheduleType}</td><td><Pill t={t} value={item.enabled ? "PROTECTED" : "PAUSED"} /></td><td>{formatDate(locale, item.nextRunAt)}</td><td><div className="row-actions"><button className="btn btn-secondary btn-small" onClick={() => onRun(item.id)}>{t.runNow}</button><button className="btn btn-secondary btn-small" onClick={() => onPause(item)}>{item.enabled ? t.pause : t.resume}</button><button className="icon-btn" onClick={() => onEdit(item)} title={t.edit}><Icon name="more" size={15} /></button></div></td></tr>)}</tbody></table></div>{!loading && plans.length === 0 && <Empty title={t.empty} copy={t.planWizardCopy} />}</div><div className="section-label">{t.batches}</div><div className="card table-card"><div className="table-wrap"><table><thead><tr><th>{t.plan}</th><th>{t.scheduledAt}</th><th>{t.progress}</th><th>{t.status}</th></tr></thead><tbody>{batches.slice(0, 10).map((item: any) => <tr key={item.id}><td>{item.planName || t.manual}</td><td>{formatDate(locale, item.scheduledAt)}</td><td>{item.succeeded + item.failed + item.skipped} / {item.totalTasks}</td><td><Pill t={t} value={item.status} /></td></tr>)}</tbody></table></div></div></div>; }

function TasksPage({ t, locale, tasks, batches, loading, error, onOpenTask, onOpenBatch, onAction }: any) { return <div className="page"><PageHead eyebrow="Tasks · Current tenant" title={t.taskTitle} copy={t.taskCopy} /><ErrorPanel error={error} /><div className="section-label">{t.batches}</div><div className="card table-card"><div className="table-wrap"><table><thead><tr><th>{t.plan}</th><th>{t.scheduledAt}</th><th>{t.progress}</th><th>{t.status}</th><th /></tr></thead><tbody>{batches.map((item: any) => <tr key={item.id}><td>{item.planName || t.manual}</td><td>{formatDate(locale, item.scheduledAt)}</td><td>{item.succeeded + item.failed + item.skipped} / {item.totalTasks}</td><td><Pill t={t} value={item.status} /></td><td><button className="icon-btn" onClick={() => onOpenBatch(item)} title={t.batchDetail}><Icon name="eye" size={15} /></button></td></tr>)}</tbody></table></div></div><div className="section-label">{t.history}</div><div className="card table-card"><div className="table-wrap"><table><thead><tr><th>{t.application}</th><th>{t.status}</th><th>{t.attempts}</th><th>{t.scheduledAt}</th><th>{t.error}</th><th /></tr></thead><tbody>{tasks.map((item: any) => <tr key={item.id}><td><strong>{item.applicationName}</strong><div className="mono subtle">{item.deployId}</div></td><td><Pill t={t} value={item.status} /></td><td>{item.attemptCount} / {item.maxRetries + 1}</td><td>{formatDate(locale, item.scheduledAt)}</td><td className="mono">{item.errorCode || "—"}</td><td><div className="row-actions"><button className="icon-btn" title={t.taskDetail} onClick={() => onOpenTask(item)}><Icon name="eye" size={15} /></button>{["FAILED", "TIMED_OUT", "CANCELLED", "INTERRUPTED"].includes(item.status) && <button className="icon-btn" title={t.retry} onClick={() => onAction(item, "retry")}><Icon name="refresh" size={15} /></button>}{["QUEUED", "LEASED", "PRECHECKING"].includes(item.status) && <button className="icon-btn" title={t.cancel} onClick={() => onAction(item, "cancel")}><Icon name="close" size={15} /></button>}</div></td></tr>)}</tbody></table></div>{!loading && tasks.length === 0 && <Empty title={t.noTasks} />}</div></div>; }

function BackupsPage({ t, locale, snapshots, loading, error, onOpen, onAction }: any) { return <div className="page"><PageHead eyebrow="Backup library · Current tenant" title={t.backupTitle} copy={t.backupCopy} /><ErrorPanel error={error} /><div className="card table-card"><div className="table-wrap"><table><thead><tr><th>{t.application}</th><th>{t.capturedAt}</th><th>{t.archiveSize}</th><th>{t.sqliteCount}</th><th>{t.integrity}</th><th /></tr></thead><tbody>{snapshots.map((item: any) => <tr key={item.id}><td><strong>{item.applicationName}</strong><div className="mono subtle">{item.deployId}</div></td><td>{formatDate(locale, item.capturedAt)}</td><td>{formatBytes(locale, item.archiveSize)}</td><td>{item.sqliteCount}</td><td><Pill t={t} value={item.verificationStatus} /></td><td><div className="row-actions"><button className="icon-btn" title={t.details} onClick={() => onOpen(item)}><Icon name="eye" size={15} /></button><button className="icon-btn" title={t.verify} onClick={() => onAction(item.id, "verify")}><Icon name="shield" size={15} /></button></div></td></tr>)}</tbody></table></div>{!loading && snapshots.length === 0 && <Empty title={t.noBackups} />}</div></div>; }

function StoragePage({ t, locale, storage, loading, error, onScan, onCleanup }: any) { return <div className="page"><PageHead eyebrow="Storage · Current tenant" title={t.storageTitle} copy={t.storageCopy} action={<div className="head-actions"><button className="btn btn-secondary" onClick={onScan}>{t.scan}</button><button className="btn btn-primary" onClick={onCleanup}>{t.cleanup}</button></div>} /><ErrorPanel error={error} /><div className="storage-kpis"><Metric label={t.snapshots} value={storage?.snapshotCount ?? 0} /><Metric label={t.storageUsed} value={formatBytes(locale, storage?.archiveBytes || 0)} /><Metric label={t.availableStorage} value={formatBytes(locale, storage?.availableBytes || 0)} /><Metric label={t.partial} value={storage?.partialCount ?? 0} /><Metric label={t.trashCount} value={storage?.trashCount ?? 0} /><Metric label={t.verificationIssues} value={storage?.missingCount ?? 0} /></div><div className="card card-pad" style={{ marginTop: 18 }}><div className="setting-row"><div><strong>{t.lastVerified}</strong><p>{formatDate(locale, storage?.lastVerifiedAt)}</p></div><Icon name="shield" size={16} /></div></div>{loading && <Empty title={t.loading} />}</div>; }

function AlertsPage({ t, locale, alerts, loading, error, status, onStatus, onAction }: any) { return <div className="page"><PageHead eyebrow="Alerts · Current tenant" title={t.alertsTitle} copy={t.alertsCopy} /><ErrorPanel error={error} /><div className="filter-bar"><Dropdown value={status} onChange={(event: any) => onStatus(event.target.value)} aria-label={t.status} options={[{ value: "OPEN", label: t.openAlerts }, { value: "RESOLVED", label: t.resolvedAlerts }, { value: "MUTED", label: t.mutedAlerts }, { value: "ALL", label: t.allAlerts }]} /></div><div className="card table-card"><div className="table-wrap"><table><thead><tr><th>{t.alertType}</th><th>{t.status}</th><th>{t.application}</th><th>{t.createdAt}</th><th /></tr></thead><tbody>{alerts.map((item: any) => <tr key={item.id}><td><strong>{item.title}</strong><div className="subtle">{item.message}</div><div className="mono subtle">{item.code}</div></td><td><Pill t={t} value={item.status} /></td><td className="mono">{item.referenceId || "—"}</td><td>{formatDate(locale, item.createdAt)}</td><td><div className="row-actions">{!item.readAt && <button className="btn btn-secondary btn-small" onClick={() => onAction(item, "read")}>{t.markRead}</button>}{item.status === "OPEN" && <><button className="btn btn-secondary btn-small" onClick={() => onAction(item, "mute")}>{t.mute}</button><button className="btn btn-primary btn-small" onClick={() => onAction(item, "resolve")}>{t.resolve}</button></>}</div></td></tr>)}</tbody></table></div>{!loading && alerts.length === 0 && <Empty title={t.noAlertsList} />}</div></div>; }

function SettingsPage({ t, locale, settings, settingsError, session, audits, loading, error, onSave, onLogout }: any) {
  const [draft, setDraft] = useState<any>(settings);
  useEffect(() => setDraft(settings), [settings]);
  if (!draft) return <div className="page"><Empty title={settingsError || t.failed} copy={settingsError ? undefined : t.empty} /></div>;
  const update = (path: string, value: any) => { const next = structuredClone(draft); const [root, child] = path.split("."); child ? next[root][child] = value : next[root] = value; setDraft(next); };
  return <div className="page"><PageHead eyebrow="Settings · Current tenant" title={t.settingsTitle} copy={t.settingsCopy} action={<button className="btn btn-primary" onClick={() => onSave(draft)}>{t.save}</button>} /><ErrorPanel error={error} /><div className="dashboard-grid"><div className="card card-pad"><Section title={t.account} /><div className="setting-row"><div><strong>{session?.displayName || "—"}</strong><p className="mono">{session?.uid || "—"} · {session?.role || "—"}</p></div><Pill t={t} value="VERIFIED" /></div><div className="notice good"><Icon name="shield" size={15} /><span>{t.identityVerified}</span></div><button className="btn btn-secondary" style={{ marginTop: 14 }} onClick={onLogout}>{t.signOut}</button></div><div className="card card-pad"><Section title={t.language} /><div className="field"><label>{t.language}</label><Dropdown value={draft.locale} onChange={(event: any) => update("locale", event.target.value)} aria-label={t.language} options={[{ value: "zh-CN", label: t.localeZh }, { value: "en-US", label: t.localeEn }]} /></div><div className="field"><label>{t.timezone}</label><Dropdown value={draft.timezone} onChange={(event: any) => update("timezone", event.target.value)} aria-label={t.timezone} options={["Asia/Shanghai", "UTC"]} /></div><label className="checkline"><input className="check" type="checkbox" checked={draft.catchUp} onChange={(event) => update("catchUp", event.target.checked)} />{t.catchUp}</label></div></div><div className="dashboard-grid"><div className="card card-pad"><Section title={t.retries} /><SettingsNumber label={t.retries} value={draft.retry.maxRetries} onChange={(value: number) => update("retry.maxRetries", value)} min={0} max={8} /><SettingsNumber label={t.backoff} value={draft.retry.backoffSeconds} onChange={(value: number) => update("retry.backoffSeconds", value)} min={1} max={86400} /><SettingsNumber label={t.trashGrace} value={draft.retention.trashGraceHours} onChange={(value: number) => update("retention.trashGraceHours", value)} min={1} max={8760} /></div><div className="card card-pad"><Section title={t.retention} /><SettingsNumber label={t.keepLast} value={draft.retention.keepLast} onChange={(value: number) => update("retention.keepLast", value)} min={1} max={10000} /><SettingsNumber label={t.keepDaily} value={draft.retention.keepDaily} onChange={(value: number) => update("retention.keepDaily", value)} min={0} max={10000} /><SettingsNumber label={t.keepWeekly} value={draft.retention.keepWeekly} onChange={(value: number) => update("retention.keepWeekly", value)} min={0} max={10000} /><SettingsNumber label={t.keepMonthly} value={draft.retention.keepMonthly} onChange={(value: number) => update("retention.keepMonthly", value)} min={0} max={10000} /></div></div><div className="card card-pad"><Section title={t.notification} /><label className="checkline"><input className="check" type="checkbox" checked={draft.notifyFirstFailure} onChange={(event) => update("notifyFirstFailure", event.target.checked)} />{t.notifyFailure}</label><label className="checkline"><input className="check" type="checkbox" checked={draft.notifySuccess} onChange={(event) => update("notifySuccess", event.target.checked)} />{t.notifySuccess}</label><div className="notice" style={{ marginTop: 14 }}><Icon name="info" size={15} /><span>{t.environment}: appvar.other.read · document.write · {t.readonly}</span></div></div><div className="section-label">{t.audit}</div><div className="card card-pad">{audits.length ? audits.map((item: any) => <div className="setting-row" key={item.id}><div><strong>{formatAction(item.action)}</strong><p>{formatDate(locale, item.createdAt)}</p></div><span className="mono">{item.entityId || "—"}</span></div>) : <Empty title={t.empty} />}</div>{loading && <Empty title={t.loading} />}</div>;
}

function SettingsNumber({ label, value, onChange, min, max }: any) { return <div className="field"><label>{label}</label><input type="number" value={value} min={min} max={max} onChange={(event) => onChange(Number(event.target.value))} /></div>; }

function ApplicationDetail({ t, locale, app, tasks, plans, close, onProbe, onBackup, onOpenTask }: any) {
  const backupable = app.capabilityStatus?.includes("BACKUPABLE");
  const history = tasks.filter((item: any) => item.deployId === app.deployId).sort((a: any, b: any) => String(b.scheduledAt).localeCompare(String(a.scheduledAt)));
  const scheduled = plans.filter((plan: any) => plan.enabled && plan.nextRunAt && (plan.targetKind === "ALL_BACKUPABLE" ? backupable : plan.targets?.some((target: any) => target.deployId === app.deployId)));
  return <Drawer title={app.name} subtitle={app.deployId === app.appid ? "" : app.deployId} close={close}><div className="drawer-app-heading"><CatalogAppIcon app={app} size="large" /><div><div className="mono subtle">{app.appid}</div><div className="subtle">{app.version || "—"}</div></div></div><div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}><Pill t={t} value={app.capabilityStatus} /><Pill t={t} value={app.multiInstance ? "PROTECTED" : "OPEN"} /></div>{!app.multiInstance && <div className="notice warn"><Icon name="warning" size={15} /><span><strong>{t.sharedRisk}</strong><br />{t.sharedRiskCopy}</span></div>}<div className="section-label">{t.application}</div><div className="storage-kpis"><Metric label={t.dataSize} value={formatBytes(locale, app.totalBytes)} /><Metric label={t.fileCount} value={app.fileCount} /><Metric label={t.sqliteCount} value={app.sqliteCount} /></div><div className="section-label">{t.database}</div><div className="mini-list">{app.databaseFindings?.length ? app.databaseFindings.map((finding: any) => <div className="mini-row" key={finding.path}><div><strong>{finding.type}</strong><p className="mono">{finding.path}</p></div><Pill t={t} value={finding.supported ? "VERIFIED" : "FAILED"} /></div>) : <Empty title={t.empty} />}</div><div className="section-label">{t.tasks}</div><div className="mini-list">{history.length ? history.map((item: any) => <button className="setting-row drawer-link" key={item.id} onClick={() => onOpenTask(item)}><div><strong>{formatDate(locale, item.scheduledAt)}</strong><p className="mono">{item.id}</p></div><Pill t={t} value={item.status} /></button>) : <Empty title={t.noTasks} />}</div><div className="section-label">{t.nextPlans}</div><div className="mini-list">{scheduled.length ? scheduled.map((plan: any) => <div className="mini-row" key={plan.id}><div><strong>{plan.name}</strong><p>{formatDate(locale, plan.nextRunAt)}</p></div><Pill t={t} value="PROTECTED" /></div>) : <Empty title={t.empty} />}</div><div className="drawer-actions"><button className="btn btn-secondary" onClick={() => onProbe(app)}><Icon name="refresh" size={14} />{t.probe}</button><button className="btn btn-primary" disabled={!backupable} onClick={() => onBackup(app)}><Icon name="zap" size={14} />{t.backupNow}</button></div></Drawer>;
}

function TaskDetail({ t, locale, detail, close, onAction }: any) { const task = detail.task; return <Drawer title={t.taskDetail} subtitle={task.id} close={close}><div className="setting-row"><div><strong>{task.applicationName}</strong><p className="mono">{task.deployId}</p></div><Pill t={t} value={task.status} /></div><div className="mini-list"><InfoRow label={t.scheduledAt} value={formatDate(locale, task.scheduledAt)} /><InfoRow label={t.started} value={formatDate(locale, task.startedAt)} /><InfoRow label={t.finished} value={formatDate(locale, task.finishedAt)} /><InfoRow label={t.error} value={task.errorCode || "—"} /></div><div className="section-label">{t.attempts}</div>{detail.attempts.length ? detail.attempts.map((item: any) => <div className="setting-row" key={item.id}><div><strong>#{item.attempt}</strong><p>{formatDate(locale, item.startedAt)}</p></div><Pill t={t} value={item.status} /></div>) : <Empty title={t.empty} />}{["FAILED", "TIMED_OUT", "CANCELLED", "INTERRUPTED"].includes(task.status) && <button className="btn btn-primary" style={{ width: "100%", marginTop: 16 }} onClick={() => onAction(task, "retry")}>{t.retry}</button>}</Drawer>; }

function BatchDetail({ t, locale, batch, tasks, close, onOpenTask }: any) { return <Drawer title={t.batchDetail} subtitle={batch.id} close={close}><div className="storage-kpis"><Metric label={t.success} value={batch.succeeded} /><Metric label={t.failedStatus} value={batch.failed} /><Metric label={t.queued} value={batch.queued + batch.running} /></div><div className="section-label">{t.history}</div>{tasks.length ? tasks.map((item: any) => <button className="setting-row drawer-link" key={item.id} onClick={() => onOpenTask(item)}><div><strong>{item.applicationName}</strong><p className="mono">{item.deployId}</p></div><Pill t={t} value={item.status} /></button>) : <Empty title={t.noTasks} />}</Drawer>; }

function SnapshotDetail({ t, locale, snapshot, files, close, onAction }: any) { return <Drawer title={t.snapshot} subtitle={snapshot.id} close={close}><div className="storage-kpis"><Metric label={t.archiveSize} value={formatBytes(locale, snapshot.archiveSize)} /><Metric label={t.fileCount} value={snapshot.fileCount} /><Metric label={t.sqliteCount} value={snapshot.sqliteCount} /></div><div className="section-label">{t.integrity}</div><Pill t={t} value={snapshot.verificationStatus} /><div className="drawer-actions"><button className="btn btn-secondary" onClick={() => onAction(snapshot.id, "verify")}>{t.verify}</button><button className="btn btn-secondary" onClick={() => onAction(snapshot.id, "full")}>{t.fullVerify}</button><button className="btn btn-secondary" onClick={() => onAction(snapshot.id, "export")}>{t.export}</button></div><div className="section-label">{t.files}</div><div className="file-index">{files.slice(0, 100).map((item: any) => <div className="setting-row" key={item.path}><div><strong>{item.path}</strong><p>{item.type}</p></div><span>{formatBytes(locale, item.size)}</span></div>)}{files.length === 0 && <Empty title={t.empty} />}</div><button className="btn btn-ghost" style={{ width: "100%", marginTop: 16 }} onClick={() => onAction(snapshot.id, "delete")}>{t.trash}</button></Drawer>; }

function InfoRow({ label, value }: any) { return <div className="setting-row"><span className="subtle">{label}</span><strong>{value}</strong></div>; }
function Drawer({ title, subtitle, close, children }: any) { return <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><aside className="drawer"><div className="drawer-head"><div><div className="drawer-title">{title}</div><div className="drawer-sub mono">{subtitle}</div></div><button className="icon-btn" onClick={close}><Icon name="close" size={15} /></button></div><div className="drawer-body">{children}</div></aside></div>; }

function PlanEditor({ t, apps, defaults, plan, close, onSave }: any) {
  const [draft, setDraft] = useState<any>(() => plan?.id ? { ...plan, targets: plan.targets || [] } : { name: "", targetKind: "EXPLICIT", targets: [], scheduleType: "DAILY", cronExpression: "0 2 * * *", timezone: defaults?.timezone || "Asia/Shanghai", enabled: true, catchUp: defaults?.catchUp ?? true, maxCatchUpSeconds: defaults?.maxCatchUpSeconds || 86400, retry: defaults?.retry || { maxRetries: 2, backoffSeconds: 60 }, retention: defaults?.retention || { keepLast: 7, keepDaily: 7, keepWeekly: 4, keepMonthly: 3, trashGraceHours: 168 } });
  const selected = new Set(draft.targets.map((item: any) => item.deployId));
  const toggleTarget = (item: any) => setDraft((current: any) => ({ ...current, targets: selected.has(item.deployId) ? current.targets.filter((target: any) => target.deployId !== item.deployId) : [...current.targets, { deployId: item.deployId }] }));
  const update = (key: string, value: any) => setDraft((current: any) => ({ ...current, [key]: value }));
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><div className="modal plan-modal"><div className="modal-head"><div><div className="eyebrow">{plan?.id ? t.edit : t.newPlan}</div><div className="modal-title">{t.planTitle}</div><div className="modal-copy">{t.planWizardCopy}</div></div><button className="icon-btn" onClick={close}><Icon name="close" size={15} /></button></div><div className="modal-body"><div className="field"><label>{t.name}</label><input value={draft.name} maxLength={120} onChange={(event) => update("name", event.target.value)} /></div><div className="field"><label>{t.targets}</label><label className="checkline"><input className="check" type="checkbox" checked={draft.targetKind === "ALL_BACKUPABLE"} onChange={(event) => update("targetKind", event.target.checked ? "ALL_BACKUPABLE" : "EXPLICIT")} />{t.allBackupable}</label>{draft.targetKind === "EXPLICIT" && <div className="plan-target-list">{apps.filter((item: any) => item.capabilityStatus?.includes("BACKUPABLE")).map((item: any) => <label className="setting-row" key={item.deployId}><span><input className="check" type="checkbox" checked={selected.has(item.deployId)} onChange={() => toggleTarget(item)} /> <strong>{item.name}</strong><p className="mono">{item.deployId}</p></span><Pill t={t} value={item.capabilityStatus} /></label>)}</div>}</div><div className="form-grid"><div className="field"><label>{t.schedule}</label><Dropdown value={draft.scheduleType} onChange={(event: any) => update("scheduleType", event.target.value)} aria-label={t.schedule} options={[{ value: "MANUAL", label: t.manual }, { value: "HOURLY", label: t.hourly }, { value: "DAILY", label: t.daily }, { value: "WEEKLY", label: t.weekly }, { value: "CRON", label: t.cron }]} /></div><div className="field"><label>{t.timezone}</label><Dropdown value={draft.timezone} onChange={(event: any) => update("timezone", event.target.value)} aria-label={t.timezone} options={["Asia/Shanghai", "UTC"]} /></div></div>{draft.scheduleType === "CRON" && <div className="field"><label>{t.cron}</label><input value={draft.cronExpression} placeholder="0 2 * * *" onChange={(event) => update("cronExpression", event.target.value)} /></div>}<label className="checkline"><input className="check" type="checkbox" checked={draft.catchUp} onChange={(event) => update("catchUp", event.target.checked)} />{t.catchUp}</label><div className="section-label">{t.retention}</div><div className="form-grid"><SettingsNumber label={t.keepLast} value={draft.retention.keepLast} onChange={(value: number) => setDraft((current: any) => ({ ...current, retention: { ...current.retention, keepLast: value } }))} /><SettingsNumber label={t.keepWeekly} value={draft.retention.keepWeekly} onChange={(value: number) => setDraft((current: any) => ({ ...current, retention: { ...current.retention, keepWeekly: value } }))} /><SettingsNumber label={t.retries} value={draft.retry.maxRetries} onChange={(value: number) => setDraft((current: any) => ({ ...current, retry: { ...current.retry, maxRetries: value } }))} /></div></div><div className="modal-foot"><button className="btn btn-secondary" onClick={close}>{t.cancel}</button><button className="btn btn-secondary" disabled={draft.targetKind === "EXPLICIT" && !draft.targets.length} onClick={() => onSave(draft, false)}>{t.save}</button><button className="btn btn-primary" disabled={draft.targetKind === "EXPLICIT" && !draft.targets.length} onClick={() => onSave(draft, true)}>{t.saveAndRun}</button></div></div></div>;
}

export default App;
