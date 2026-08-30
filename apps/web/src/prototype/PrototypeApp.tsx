import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "../api/client";
import { formatBytes, formatDate, loadLocale, storeLocale, storeTimezone, translate, type Locale } from "../i18n";
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
    CANCELLED: t.failedStatus, INTERRUPTED: t.failedStatus, SKIPPED: t.paused, OPEN: t.open, MUTED: t.muted, RESOLVED: t.resolved, AVAILABLE: t.storageAvailable, MISSING: t.storageMissing, INACCESSIBLE: t.storageInaccessible,
    VERIFIED: t.success,
  };
  return map[value || ""] || value || "—";
}

function statusTone(value?: string) {
  if (["BACKUPABLE", "BACKUPABLE_SHARED_WARNING", "PROTECTED", "SUCCEEDED", "SUCCEEDED_WITH_WARNINGS", "VERIFIED", "RESOLVED", "AVAILABLE"].includes(value || "")) return "good";
  if (["FAILED", "TIMED_OUT", "CANCELLED", "INTERRUPTED", "UNSUPPORTED_DATABASE", "CRITICAL", "EMERGENCY", "MISSING", "INACCESSIBLE"].includes(value || "")) return "bad";
  if (["RUNNING", "LEASED", "PRECHECKING", "SCANNING", "SQLITE_SNAPSHOT", "ZIP_WRITING", "VERIFYING", "COMMITTING"].includes(value || "")) return "violet";
  if (["BACKUPABLE_SHARED_WARNING", "UNPROTECTED", "WARNING", "OPEN"].includes(value || "")) return "warn";
  return "neutral";
}

function statusIcon(value?: string) {
  if (["BACKUPABLE", "PROTECTED", "SUCCEEDED", "SUCCEEDED_WITH_WARNINGS", "VERIFIED", "RESOLVED", "AVAILABLE"].includes(value || "")) return "check";
  if (["BACKUPABLE_SHARED_WARNING", "UNPROTECTED", "WARNING", "OPEN"].includes(value || "")) return "warning";
  if (["UNSUPPORTED_DATABASE"].includes(value || "")) return "database";
  if (["NO_DATA"].includes(value || "")) return "info";
  if (["QUEUED", "SKIPPED", "MUTED"].includes(value || "")) return "clock";
  if (["RUNNING", "LEASED", "PRECHECKING", "SCANNING", "SQLITE_SNAPSHOT", "ZIP_WRITING", "VERIFYING", "COMMITTING"].includes(value || "")) return "refresh";
  if (["FAILED", "TIMED_OUT", "CANCELLED", "INTERRUPTED", "MISSING", "INACCESSIBLE"].includes(value || "")) return "close";
  return "info";
}

function scopeLabel(scope?: any) {
  const mode = scope?.mode || "FULL";
  if (mode === "FULL") return scope && !scope.summary ? "旧版完整备份" : "完整备份";
  if (mode === "CORE") return "核心数据";
  return "自定义范围";
}

function ScopeDeclaration({ scope }: { scope?: any }) {
  const value = scope || { mode: "FULL", revision: 1 };
  const selected = [...(value.directories || []).map((path: string) => `目录 · ${path}`), ...(value.files || []).map((path: string) => `文件 · ${path}`)];
  return <div className="scope-declaration"><div><strong>{scopeLabel(value)}</strong></div><p>{value.summary || (value.mode === "FULL" ? "当前应用数据根下全部可支持的数据" : value.mode === "CORE" ? "Notus 核心 SQLite 档案" : "已保存的目录与单文件")}</p>{selected.length > 0 && <ul>{selected.map((item: string) => <li key={item} className="mono">{item}</li>)}</ul>}</div>;
}

function scopeItemVisual(item: any) {
  if (item.type === "directory") return { icon: "folder", label: "目录", tone: "folder" };
  if (item.sqlite) return { icon: "database", label: "SQLite 数据库", tone: "database" };
  const extension = item.path?.split(".").pop()?.toLowerCase() || "";
  if (["json", "yaml", "yml", "toml", "ini", "conf", "env"].includes(extension)) return { icon: "settings", label: "配置文件", tone: "config" };
  if (["md", "txt", "csv", "pdf", "doc", "docx", "xls", "xlsx"].includes(extension)) return { icon: "fileText", label: "文档", tone: "document" };
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "heic", "avif"].includes(extension)) return { icon: "image", label: "图片", tone: "image" };
  if (["js", "jsx", "ts", "tsx", "py", "go", "sh", "sql", "css", "html"].includes(extension)) return { icon: "code", label: "代码文件", tone: "code" };
  return { icon: "file", label: "文件", tone: "file" };
}

type CronDescription = { valid: boolean; title: string; detail?: string };

function cronPartValid(value: string, min: number, max: number, named: Record<string, number> = {}) {
  const atom = (raw: string) => {
    const value = named[raw.toUpperCase()] ?? Number(raw);
    return Number.isInteger(value) && value >= min && value <= max;
  };
  return value.split(",").every((part) => {
    const [base, step] = part.split("/");
    if (part.split("/").length > 2 || (step !== undefined && (!/^\d+$/.test(step) || Number(step) < 1))) return false;
    if (base === "*") return true;
    const range = base.split("-");
    return range.length === 1 ? atom(base) : range.length === 2 && atom(range[0]) && atom(range[1]) && (named[range[0]?.toUpperCase()] ?? Number(range[0])) <= (named[range[1]?.toUpperCase()] ?? Number(range[1]));
  });
}

function cronListLabel(value: string, labels: string[] = []) {
  const named = (raw: string) => {
    const index = Number(raw);
    return labels[index] || raw;
  };
  return value.split(",").map((part) => part.replace(/(\w+)-(\w+)/, (_, start, end) => `${named(start)}至${named(end)}`).replace(/\*/g, "每个")).join("、");
}

function describeCron(expression: string, locale: Locale): CronDescription {
  const chinese = locale === "zh-CN";
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return { valid: false, title: chinese ? "Cron 需要 5 段：分 时 日 月 周" : "Cron needs five fields: minute hour day month weekday" };
  const weekdays = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
  const months = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
  const [minute, hour, day, month, weekday] = fields;
  if (!cronPartValid(minute, 0, 59) || !cronPartValid(hour, 0, 23) || !cronPartValid(day, 1, 31) || !cronPartValid(month, 1, 12, months) || !cronPartValid(weekday, 0, 7, weekdays)) return { valid: false, title: chinese ? "表达式包含不支持的值；可使用数字、*、范围、列表和步长" : "Unsupported value; use numbers, *, ranges, lists, and steps" };
  const pad = (value: string) => value.padStart(2, "0");
  let time = "";
  if (minute.startsWith("*/") && hour === "*") time = chinese ? `每 ${minute.slice(2)} 分钟` : `Every ${minute.slice(2)} minutes`;
  else if (minute === "*" && hour === "*") time = chinese ? "每分钟" : "Every minute";
  else if (hour.startsWith("*/") && /^\d+$/.test(minute)) time = chinese ? `每 ${hour.slice(2)} 小时的第 ${pad(minute)} 分钟` : `Every ${hour.slice(2)} hours at minute ${pad(minute)}`;
  else if (/^\d+$/.test(hour) && /^\d+$/.test(minute)) time = chinese ? `${pad(hour)}:${pad(minute)}` : `${pad(hour)}:${pad(minute)}`;
  else if (hour === "*" && /^\d+$/.test(minute)) time = chinese ? `每小时的第 ${pad(minute)} 分钟` : `At minute ${pad(minute)} of every hour`;
  else time = chinese ? `小时为 ${cronListLabel(hour)}，分钟为 ${cronListLabel(minute)}` : `Hours ${hour}, minutes ${minute}`;
  const weekdayNames = [chinese ? "周日" : "Sun", chinese ? "周一" : "Mon", chinese ? "周二" : "Tue", chinese ? "周三" : "Wed", chinese ? "周四" : "Thu", chinese ? "周五" : "Fri", chinese ? "周六" : "Sat", chinese ? "周日" : "Sun"];
  const monthNames = ["", chinese ? "1 月" : "Jan", chinese ? "2 月" : "Feb", chinese ? "3 月" : "Mar", chinese ? "4 月" : "Apr", chinese ? "5 月" : "May", chinese ? "6 月" : "Jun", chinese ? "7 月" : "Jul", chinese ? "8 月" : "Aug", chinese ? "9 月" : "Sep", chinese ? "10 月" : "Oct", chinese ? "11 月" : "Nov", chinese ? "12 月" : "Dec"];
  const dateParts: string[] = [];
  if (month !== "*") dateParts.push(chinese ? `${cronListLabel(month, monthNames)}` : `in ${month}`);
  if (day !== "*") dateParts.push(chinese ? `每月 ${cronListLabel(day)} 日` : `on day ${day}`);
  if (weekday !== "*") dateParts.push(chinese ? `每${cronListLabel(weekday, weekdayNames)}` : `on ${weekday}`);
  const title = dateParts.length ? `${dateParts.join("，")} ${time}` : (chinese ? `每天 ${time}` : `Every day at ${time}`);
  const detail = day !== "*" && weekday !== "*" ? (chinese ? "日期和星期同时限制时，满足任一条件就会执行。" : "When both day and weekday are limited, either match runs the plan.") : undefined;
  return { valid: true, title, detail };
}

function planScheduleLabel(plan: any, locale: Locale) {
  const chinese = locale === "zh-CN";
  const executionTime = plan.executionTime || "02:00";
  if (plan.scheduleType === "HOURLY") return chinese ? "每小时整点" : "Every hour on the hour";
  if (plan.scheduleType === "DAILY") return chinese ? `每天 ${executionTime}` : `Every day at ${executionTime}`;
  if (plan.scheduleType === "WEEKLY") return chinese ? `每周一 ${executionTime}` : `Every Monday at ${executionTime}`;
  if (plan.scheduleType === "CRON") return describeCron(plan.cronExpression || "", locale).title;
  return chinese ? "仅手动执行" : "Manual only";
}

function Pill({ t, value }: { t: any; value?: string }) {
  return <span className={`pill ${statusTone(value)}`}><Icon name={statusIcon(value)} size={12} />{statusLabel(t, value)}</span>;
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

type DetailEntry =
  | { kind: "application"; data: any }
  | { kind: "batch"; data: any }
  | { kind: "task"; data: any }
  | { kind: "snapshot"; data: any; files: any[]; filesError: string }
  | { kind: "plan"; data: any };

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
  const [appCursor, setAppCursor] = useState("");
  const [nextCursor, setNextCursor] = useState("");
  const [detailStack, setDetailStack] = useState<DetailEntry[]>([]);
  const [planEditor, setPlanEditor] = useState<any>(null);
  const [alertStatus, setAlertStatus] = useState("OPEN");
  const [backupCandidate, setBackupCandidate] = useState<any>(null);
  const loadDataRef = useRef<() => Promise<void>>(async () => undefined);
  const eventRefreshTimerRef = useRef<number | undefined>(undefined);
  const lastEventRefreshRef = useRef(0);
  const detailRequestRef = useRef(0);

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
    if (current.status === "fulfilled") setSession((previous: any) => previous?.uid === current.value.uid && previous?.tenantUid === current.value.tenantUid && previous?.role === current.value.role && previous?.displayName === current.value.displayName ? previous : current.value); else handleError(current.reason);
    if (appData.status === "fulfilled") { setApps(appData.value.items); setNextCursor(appData.value.nextCursor || ""); }
    if (overviewData.status === "fulfilled") setOverview(overviewData.value);
    if (planData.status === "fulfilled") setPlans(planData.value.items);
    if (taskData.status === "fulfilled") setTasks(taskData.value.items);
    if (batchData.status === "fulfilled") setBatches(batchData.value.items);
    if (backupData.status === "fulfilled") setSnapshots(backupData.value.items);
    if (storageData.status === "fulfilled") setStorage(storageData.value);
    if (alertData.status === "fulfilled") setAlerts(alertData.value.items);
    if (settingsData.status === "fulfilled") { setSettings(settingsData.value); storeTimezone(settingsData.value.timezone); setSettingsError(""); } else setSettingsError(settingsData.reason instanceof Error ? settingsData.reason.message : t.failed);
    if (auditData.status === "fulfilled") setAudits(auditData.value.items);
    const failed = results.find((result) => result.status === "rejected") as PromiseRejectedResult | undefined;
    if (!failed) setError(""); else if (!(failed.reason instanceof ApiError && (failed.reason.status === 401 || failed.reason.code === "IDENTITY_MISMATCH"))) setError(failed.reason instanceof Error ? failed.reason.message : t.failed);
    setLoading(false);
  }, [alertStatus, handleError, t.failed]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { loadDataRef.current = loadData; }, [loadData]);
  useEffect(() => {
    if (!session) return;
    let disposed = false;
    let source: EventSource | undefined;
    let reconnectTimer: number | undefined;
    const refresh = () => {
      if (eventRefreshTimerRef.current) return;
      const delay = Math.max(0, 1200 - (Date.now() - lastEventRefreshRef.current));
      eventRefreshTimerRef.current = window.setTimeout(() => {
        eventRefreshTimerRef.current = undefined;
        lastEventRefreshRef.current = Date.now();
        void loadDataRef.current();
      }, delay);
    };
    const connect = () => {
      if (disposed) return;
      source = new EventSource(api.eventsURL());
      ["batch.updated", "task.updated", "snapshot.updated", "alert.created", "storage.updated", "session.expiring"].forEach((name) => source?.addEventListener(name, refresh));
      source.onerror = () => {
        source?.close();
        source = undefined;
        if (!disposed) reconnectTimer = window.setTimeout(connect, 15000);
      };
    };
    connect();
    return () => {
      disposed = true;
      source?.close();
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (eventRefreshTimerRef.current) window.clearTimeout(eventRefreshTimerRef.current);
    };
  }, [Boolean(session)]);
  useEffect(() => {
    if (route !== "applications") return;
    void loadApplications().catch(handleError);
  }, [route, loadApplications, handleError]);

  const navigate = (next: string) => { detailRequestRef.current += 1; setRoute(next); setError(""); setDetailStack([]); };
  const applyLocale = (next: Locale) => { setLocale(next); storeLocale(next); };
  const refresh = () => { void loadData(); };

  const detailKey = (entry: DetailEntry) => {
    const data = entry.data?.task || entry.data;
    return `${entry.kind}:${data?.id || data?.deployId || data?.appid || "unknown"}`;
  };
  const showDetail = (entry: DetailEntry) => setDetailStack((current) => {
    const existing = current.findIndex((item) => detailKey(item) === detailKey(entry));
    return existing >= 0 ? current.slice(0, existing + 1) : [...current, entry];
  });
  const closeDetail = () => { detailRequestRef.current += 1; setDetailStack([]); };
  const backDetail = () => { detailRequestRef.current += 1; setDetailStack((current) => current.length > 1 ? current.slice(0, -1) : []); };

  const openApplication = async (item: any) => {
    const requestId = ++detailRequestRef.current;
    try {
      const detail = await api.instance(item.deployId);
      if (requestId === detailRequestRef.current) showDetail({ kind: "application", data: detail });
    } catch (failure) { if (requestId === detailRequestRef.current) handleError(failure); }
  };
  const probe = async (item: any) => {
    try { await api.probeInstance(item.deployId); notify(t.probe, t.loading); await loadApplications(); } catch (failure) { handleError(failure); }
  };
  const requestBackup = (item: any) => { if (item.capabilityStatus?.includes("BACKUPABLE")) setBackupCandidate(item); };
  const startBackup = async (item: any) => {
    try { await api.startBackup(item.deployId); notify(t.backupNow, t.queued); closeDetail(); await loadData(); } catch (failure) { handleError(failure); }
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
  const openTask = async (item: any) => {
    const requestId = ++detailRequestRef.current;
    try {
      const detail = await api.task(item.id);
      if (requestId === detailRequestRef.current) showDetail({ kind: "task", data: detail });
    } catch (failure) { if (requestId === detailRequestRef.current) handleError(failure); }
  };
  const openBatch = async (item: any) => {
    const requestId = ++detailRequestRef.current;
    try {
      const detail = await api.batch(item.id);
      if (requestId === detailRequestRef.current) showDetail({ kind: "batch", data: detail });
    } catch (failure) { if (requestId === detailRequestRef.current) handleError(failure); }
  };
  const openSnapshot = async (item: any) => {
    const requestId = ++detailRequestRef.current;
    try {
      const detail = await api.backup(item.id);
      if (requestId !== detailRequestRef.current) return;
      showDetail({ kind: "snapshot", data: detail, files: [], filesError: "" });
      try {
        const files = await api.backupFiles(item.id);
        setDetailStack((current) => current.map((entry) => entry.kind === "snapshot" && entry.data.id === detail.id ? { ...entry, files: files.items, filesError: "" } : entry));
      } catch (failure) {
        // Snapshot metadata remains useful even when a legacy file index is unavailable.
        const filesError = failure instanceof Error ? failure.message : t.failed;
        setDetailStack((current) => current.map((entry) => entry.kind === "snapshot" && entry.data.id === detail.id ? { ...entry, filesError } : entry));
      }
    } catch (failure) { handleError(failure); }
  };
  const openSnapshotFromTask = async (item: any) => { if (!item?.id) return; await openSnapshot({ id: item.id }); };
  const openPlan = async (item: any) => {
    const requestId = ++detailRequestRef.current;
    try {
      const detail = await api.plan(item.id);
      if (requestId === detailRequestRef.current) showDetail({ kind: "plan", data: detail });
    } catch (failure) { if (requestId === detailRequestRef.current) handleError(failure); }
  };
  const alertAction = async (item: any, action: "read" | "resolve" | "mute") => {
    try {
      if (action === "read") await api.readAlert(item.id);
      if (action === "resolve") await api.resolveAlert(item.id);
      if (action === "mute") await api.muteAlert(item.id);
      await loadData();
    } catch (failure) { handleError(failure); }
  };
  const saveSettings = async (value: any) => { try { const result = await api.updateSettings(value); setSettings(result); storeTimezone(result.timezone); applyLocale(result.locale); notify(t.settingsSaved); } catch (failure) { handleError(failure); } };
  const logout = async () => { try { await api.logout(); window.location.assign("/auth/login"); } catch (failure) { handleError(failure); } };

  const page = useMemo(() => {
    const base = { t, locale, timezone: settings?.timezone || "Asia/Shanghai", apps, plans, tasks, batches, snapshots, storage, alerts, settings, settingsError, overview, audits, loading, error, refresh };
    if (route === "setup") return <SetupPage {...base} session={session} onSync={async () => { try { await api.syncApplications(); notify(t.setupAction); await loadData(); } catch (failure) { handleError(failure); } }} />;
    if (route === "overview") return <OverviewPage {...base} navigate={navigate} />;
    if (route === "applications") return <ApplicationsPage {...base} filter={applicationFilter} setFilter={(value: any) => { setApplicationFilter(value); setAppCursor(""); }} onOpen={openApplication} onProbe={probe} onBackup={requestBackup} onSync={async () => { try { await api.syncApplications(); notify(t.refresh, t.loading); await loadApplications(); } catch (failure) { handleError(failure); } }} nextCursor={nextCursor} onNext={() => setAppCursor(nextCursor)} />;
    if (route === "plans") return <PlansPage {...base} onNew={() => setPlanEditor({})} onOpen={openPlan} onEdit={(item: any) => setPlanEditor(item)} onOpenBatch={openBatch} onRun={async (id: string) => { try { await api.runPlan(id); notify(t.runNow, t.queued); await loadData(); } catch (failure) { handleError(failure); } }} onPause={async (item: any) => { try { item.enabled ? await api.pausePlan(item.id) : await api.resumePlan(item.id); await loadData(); } catch (failure) { handleError(failure); } }} />;
    if (route === "tasks") return <TasksPage {...base} onOpenTask={openTask} onOpenBatch={openBatch} onAction={taskAction} />;
    if (route === "backups") return <BackupsPage {...base} onOpen={openSnapshot} />;
    if (route === "storage") return <StoragePage {...base} onScan={async () => { try { await api.scanStorage(); notify(t.scan); await loadData(); } catch (failure) { handleError(failure); } }} />;
    if (route === "alerts") return <AlertsPage {...base} status={alertStatus} onStatus={setAlertStatus} onAction={alertAction} />;
    return <SettingsPage {...base} session={session} onSave={saveSettings} onLogout={logout} />;
  // The page factory reads live data and action closures intentionally.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, t, locale, apps, plans, tasks, batches, snapshots, storage, alerts, settings, overview, audits, loading, error, session, applicationFilter, nextCursor, alertStatus, loadApplications, handleError, notify]);

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><img src="assets/lzc-icon.png" alt="Lazycat" /></div><div><div className="brand-title">{t.appName}</div></div></div>
      {nav.map(([section, entries]) => <div className="nav-section" key={section}><div className="nav-label">{t[section as keyof typeof t]}</div>{entries.map((entry) => <button key={entry} className={`nav-item ${route === entry ? "active" : ""}`} onClick={() => navigate(entry)}><Icon name={iconFor[entry]} size={17} /><span>{t[entry as keyof typeof t]}</span>{entry === "alerts" && overview?.unreadAlerts > 0 && <span className="nav-count">{overview.unreadAlerts}</span>}</button>)}</div>)}
      <div className="sidebar-footer"><button className="tenant-card tenant-compact" onClick={() => navigate("settings")} title={t.account}><span className="avatar">{session?.displayName?.slice(0, 1) || "·"}</span><span className="tenant-name">{session?.displayName || "—"}</span><span className="tenant-role">{session?.role || "—"}</span></button></div>
    </aside>
    <main className="main">{page}</main>
    <nav className="mobile-nav" aria-label="Navigation"><div className="mobile-nav-scroll">{nav.flatMap(([, entries]) => entries).map((entry) => <button key={entry} className={`mobile-nav-item ${route === entry ? "active" : ""}`} onClick={() => navigate(entry)}><Icon name={iconFor[entry]} size={17} /><span>{t[entry as keyof typeof t]}</span></button>)}</div></nav>
    {detailStack.length > 0 && (() => {
      const current = detailStack[detailStack.length - 1];
      const shared = { t, locale, timezone: settings?.timezone || "Asia/Shanghai", close: closeDetail, onBack: backDetail, canBack: detailStack.length > 1, backLabel: locale === "zh-CN" ? "返回上一层" : "Back" };
      if (current.kind === "application") return <ApplicationDetail {...shared} app={current.data} tasks={tasks} plans={plans} onOpenTask={openTask} />;
      if (current.kind === "batch") return <BatchDetail {...shared} batch={current.data} tasks={tasks.filter((item) => item.batchId === current.data.id)} onOpenTask={openTask} />;
      if (current.kind === "task") return <TaskDetail {...shared} detail={current.data} onAction={taskAction} onOpenSnapshot={openSnapshotFromTask} />;
      if (current.kind === "snapshot") return <SnapshotDetail {...shared} snapshot={current.data} files={current.files} filesError={current.filesError} tasks={tasks} onOpenTask={openTask} />;
      return <PlanDetail {...shared} plan={current.data} />;
    })()}
    {planEditor && <PlanEditor t={t} locale={locale} apps={apps} defaults={settings} plan={planEditor} close={() => setPlanEditor(null)} onSave={savePlan} />}
    {backupCandidate && <BackupConfirmDialog t={t} locale={locale} item={backupCandidate} close={() => setBackupCandidate(null)} onConfirm={() => { const item = backupCandidate; setBackupCandidate(null); void startBackup(item); }} />}
    {toast && <div className="toast-stack"><div className="toast"><Icon name="check" size={15} /><div><strong>{toast.title}</strong>{toast.copy && <p>{toast.copy}</p>}</div></div></div>}
  </div>;
}

function PageHead({ title, copy, action }: any) { return <div className="page-head"><div><h1>{title}</h1><p className="page-sub">{copy}</p></div>{action}</div>; }

function SetupPage({ t, session, apps, loading, error, onSync }: any) {
  return <div className="page"><PageHead eyebrow="V1 · Setup" title={t.setupTitle} copy={t.setupCopy} action={<button className="btn btn-primary" disabled={loading} onClick={onSync}><Icon name="refresh" size={14} />{t.setupAction}</button>} /><ErrorPanel error={error} /><div className="dashboard-grid"><div className="card card-pad"><div className="section-label">{t.setupStepIdentity}</div><div className="setting-row"><div><strong>{session?.displayName || "—"}</strong><p className="mono">{session?.uid || "—"}</p></div><Pill t={t} value={session?.identityVerified ? "VERIFIED" : "FAILED"} /></div><div className="section-label">{t.setupStepPermissions}</div><div className="notice good"><Icon name="shield" size={15} /><span>{t.safeScope}<br />appvar.other.read · document.write · {t.readonly}</span></div></div><div className="card card-pad"><div className="section-label">{t.setupStepScan}</div><div className="storage-kpis"><Metric label={t.discovered} value={apps.length} /><Metric label={t.backupableCount} value={apps.filter((item: any) => item.capabilityStatus?.includes("BACKUPABLE")).length} /><Metric label={t.unsupported} value={apps.filter((item: any) => item.capabilityStatus === "UNSUPPORTED_DATABASE").length} /></div><div className="notice" style={{ marginTop: 16 }}><Icon name="info" size={15} /><span>{t.setupStepBackup}: {t.applications} → {t.backupNow}</span></div></div></div></div>;
}

function Metric({ label, value }: any) { return <div className="storage-kpi stat-card"><span>{label}</span><strong>{value}</strong></div>; }

function OverviewPage({ t, locale, timezone, overview, loading, error, navigate }: any) {
  const data = overview || {};
  return <div className="page overview-page"><PageHead eyebrow="Overview · Current tenant" title={t.overviewTitle} copy={t.overviewCopy} action={<div className="head-actions"><button className="btn btn-secondary" onClick={() => navigate("tasks")}><Icon name="tasks" size={14} />{t.tasks}</button><button className="btn btn-primary" onClick={() => navigate("applications")}><Icon name="apps" size={14} />{t.applications}</button></div>} /><ErrorPanel error={error} /><div className="stats-grid"><Stat label={t.discovered} value={data.applicationCount ?? "—"} icon="apps" /><Stat label={t.backupableCount} value={data.backupableCount ?? "—"} icon="shield" /><Stat label={t.protectedCount} value={data.protectedCount ?? "—"} icon="check" /><Stat label={t.task24} value={`${data.succeeded24h ?? 0} / ${data.failed24h ?? 0}`} icon="tasks" /><Stat label={t.storageUsed} value={formatBytes(locale, data.storage?.archiveBytes || 0)} icon="harddrive" /></div><div className="dashboard-grid overview-priority-grid"><div className="card card-pad"><Section title={t.nextPlans} /><div className="mini-list">{data.nextPlans?.length ? data.nextPlans.map((plan: any) => <div className="mini-row" key={plan.id}><div><strong>{plan.name}</strong><p>{formatDate(locale, plan.nextRunAt, timezone)}</p></div><Pill t={t} value={plan.enabled ? "PROTECTED" : "PAUSED"} /></div>) : <Empty title={t.empty} />}</div></div><div className="card card-pad"><Section title={t.risks} /><div className="risk-list">{data.unreadAlerts ? <div className="risk-item"><Icon name="warning" size={15} /><span>{data.unreadAlerts} {t.openAlerts}</span></div> : <div className="risk-item"><Icon name="check" size={15} /><span>{t.noAlerts}</span></div>}<div className="risk-item"><Icon name="tasks" size={15} /><span>{t.queuedTasks}: {data.queuedTasks || 0} / {data.runningTasks || 0}</span></div><div className="risk-item"><Icon name="archive" size={15} /><span>{t.unprotectedCount}: {data.unprotectedCount || 0}</span></div></div></div></div><div className="section-label">{t.activity}</div><div className="card card-pad">{data.recentActivity?.length ? data.recentActivity.map((item: any) => <div className="setting-row" key={item.id}><div><strong>{formatAction(item.action)}</strong><p>{formatDate(locale, item.createdAt, timezone)}</p></div><span className="mono">{item.entityId || "—"}</span></div>) : <Empty title={t.empty} />}</div>{loading && <Empty title={t.loading} />}</div>;
}

function Stat({ label, value, icon }: any) { return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className="stat-icon"><Icon name={icon} size={15} /></span></div><div className="stat-value">{value}</div></div>; }
function Section({ title, action }: any) { return <div className="card-head"><div className="card-title">{title}</div>{action}</div>; }

function ApplicationsPage({ t, locale, timezone, apps, loading, error, filter, setFilter, onOpen, onProbe, onBackup, onSync, nextCursor, onNext }: any) {
  return <div className="page"><PageHead eyebrow="Applications · Current tenant" title={t.applicationTitle} copy={t.applicationCopy} action={<button className="btn btn-secondary" onClick={onSync}><Icon name="refresh" size={14} />{t.refresh}</button>} /><ErrorPanel error={error} /><div className="filter-bar"><label className="global-search"><Icon name="search" size={15} /><input value={filter.q} placeholder={t.searchApps} onChange={(event) => setFilter({ ...filter, q: event.target.value })} /></label><Dropdown value={filter.mode} onChange={(event: any) => setFilter({ ...filter, mode: event.target.value })} aria-label={t.instance} options={[{ value: "", label: t.all }, { value: "single", label: t.single }, { value: "multi", label: t.multi }]} /><Dropdown value={filter.capability} onChange={(event: any) => setFilter({ ...filter, capability: event.target.value })} aria-label={t.status} options={[{ value: "", label: t.all }, { value: "BACKUPABLE", label: t.backupable }, { value: "NO_DATA", label: t.noData }, { value: "UNSUPPORTED_DATABASE", label: t.unsupported }]} /></div><div className="card table-card"><div className="table-wrap"><table className="has-actions"><thead><tr><th>{t.application}</th><th>{t.instance}</th><th>{t.dataSize}</th><th>{t.status}</th><th>{t.lastBackup}</th><th className="actions-column">{t.actions}</th></tr></thead><tbody>{apps.map((item: any) => <tr key={item.deployId}><td><div className="app-cell"><CatalogAppIcon app={item} /><div><strong>{item.name}</strong><div className="mono subtle">{item.appid} · {item.version || "—"}</div></div></div></td><td><div className="mono">{item.deployId}</div><div className="subtle">{item.multiInstance ? t.multi : t.single}</div></td><td>{formatBytes(locale, item.totalBytes)}<div className="subtle">{item.fileCount} {t.fileCount}</div></td><td><Pill t={t} value={item.capabilityStatus} /></td><td>{formatDate(locale, item.lastBackupAt, timezone)}</td><td className="actions-column"><div className="row-actions"><button className="icon-btn" title={t.details} onClick={() => onOpen(item)}><Icon name="eye" size={15} /></button><button className="icon-btn" title={t.probe} onClick={() => onProbe(item)}><Icon name="refresh" size={15} /></button><button className="icon-btn" title={t.backupNow} disabled={!item.capabilityStatus?.includes("BACKUPABLE")} onClick={() => onBackup(item)}><Icon name="zap" size={15} /></button></div></td></tr>)}</tbody></table></div>{!loading && apps.length === 0 && <Empty title={t.noApplications} />}{loading && <Empty title={t.loading} />}<div className="row-actions" style={{ justifyContent: "flex-end", margin: 14 }}><button className="btn btn-secondary btn-small" disabled={!nextCursor} onClick={onNext}>{t.nextPlans} <Icon name="arrow" size={12} /></button></div></div></div>;
}

function PlansPage({ t, locale, timezone, plans, batches, loading, error, onNew, onOpen, onEdit, onOpenBatch, onRun, onPause }: any) {
  return <div className="page plans-page">
    <PageHead title={t.planTitle} copy={t.planCopy} action={<button className="btn btn-primary" onClick={onNew}><Icon name="plus" size={14} />{t.newPlan}</button>} />
    <ErrorPanel error={error} />
    <section className="card table-card plans-list-card">
      <Section title={t.planList} action={<span className="section-count">{plans.length}</span>} />
      <div className="table-wrap"><table className="has-actions"><thead><tr><th>{t.name}</th><th>{t.targets} / 范围</th><th>{t.schedule}</th><th>{t.status}</th><th>{t.scheduledAt}</th><th className="actions-column">{t.actions}</th></tr></thead><tbody>{plans.map((item: any) => <tr key={item.id}><td><strong>{item.name}</strong><div className="mono subtle">{item.id}</div></td><td><strong>{item.targets.length} 个应用</strong><div className="subtle">{item.targets.map((target: any) => scopeLabel(target.scope)).join(" · ")}</div></td><td><div className="plan-schedule"><strong>{planScheduleLabel(item, locale)}</strong>{item.scheduleType === "CRON" && <small className="mono">{item.cronExpression}</small>}</div></td><td><Pill t={t} value={item.enabled ? "PROTECTED" : "PAUSED"} />{item.pauseReason && <div className="scope-pause-copy">{item.pauseReason.deployId} · {item.pauseReason.path || "已选范围"}</div>}</td><td>{formatDate(locale, item.nextRunAt, timezone)}</td><td className="actions-column"><div className="row-actions"><button className="icon-btn" title={t.details} aria-label={t.details} onClick={() => onOpen(item)}><Icon name="eye" size={15} /></button>{item.enabled && <button className="icon-btn" title={t.runNow} aria-label={t.runNow} onClick={() => onRun(item.id)}><Icon name="play" size={15} /></button>}<button className="icon-btn" title={item.pauseReason ? "重新选择范围" : item.enabled ? t.pause : t.resume} aria-label={item.pauseReason ? "重新选择范围" : item.enabled ? t.pause : t.resume} onClick={() => item.pauseReason ? onEdit(item) : onPause(item)}><Icon name={item.pauseReason ? "folder" : item.enabled ? "pause" : "play"} size={15} /></button><button className="icon-btn" title={t.edit} aria-label={t.edit} onClick={() => onEdit(item)}><Icon name="edit" size={15} /></button></div></td></tr>)}</tbody></table></div>
      {!loading && plans.length === 0 && <Empty title={t.empty} copy={t.planWizardCopy} />}
    </section>
    <section className="card plans-recent-card">
      <Section title={t.recentRuns} action={<span className="section-count">{Math.min(batches.length, 5)}</span>} />
      <div className="recent-run-list">{batches.slice(0, 5).map((item: any) => { const done = item.succeeded + item.failed + item.skipped; return <button className="recent-run-row" key={item.id} onClick={() => onOpenBatch(item)}><span className={`batch-status-icon ${statusTone(item.status)}`}><Icon name={statusIcon(item.status)} size={15} /></span><span><strong>{item.planName || t.manual}</strong><small>{formatDate(locale, item.scheduledAt, timezone)}</small></span><span className="recent-run-result"><strong>{done} / {item.totalTasks}</strong><Pill t={t} value={item.status} /></span><Icon name="chevron" size={15} /></button>; })}{!loading && !batches.length && <Empty title={t.empty} />}</div>
    </section>
  </div>;
}

function TasksPage({ t, locale, tasks, batches, loading, error, onOpenTask, onOpenBatch, onAction }: any) {
  const running = tasks.filter((item: any) => ["RUNNING", "LEASED", "PRECHECKING", "SCANNING", "SQLITE_SNAPSHOT", "ZIP_WRITING", "VERIFYING", "COMMITTING"].includes(item.status)).length;
  const failed = tasks.filter((item: any) => ["FAILED", "TIMED_OUT", "CANCELLED", "INTERRUPTED"].includes(item.status)).length;
  const queued = tasks.filter((item: any) => item.status === "QUEUED").length;
  const active = batches.filter((item: any) => (item.succeeded + item.failed + item.skipped) < item.totalTasks);
  const focusBatches = (active.length ? active : batches).slice(0, 3);
  return <div className="page task-center"><PageHead eyebrow="Tasks · Current tenant" title={t.taskTitle} copy={t.taskCopy} /><ErrorPanel error={error} />
    <div className="task-overview"><Metric label={t.running} value={running} /><Metric label={t.queued} value={queued} /><Metric label={t.failedStatus} value={failed} /></div>
    <section className="card task-batch-panel"><Section title={active.length ? t.currentExecution : t.recentExecution} action={<span className="section-count">{focusBatches.length}</span>} /><div className="batch-list">{focusBatches.map((item: any) => { const done = item.succeeded + item.failed + item.skipped; const percent = item.totalTasks ? Math.round(done / item.totalTasks * 100) : 0; return <button className="batch-row" key={item.id} onClick={() => onOpenBatch(item)}><span className={`batch-status-icon ${statusTone(item.status)}`}><Icon name={statusIcon(item.status)} size={16} /></span><span className="batch-summary"><strong>{item.planName || t.manual}</strong><small>{formatDate(locale, item.scheduledAt)}</small></span><span className="batch-progress"><span className="batch-progress-meta"><strong>{done} / {item.totalTasks}</strong><em>{percent}%</em></span><i><b style={{ width: `${percent}%` }} /></i></span><span className="batch-result"><Pill t={t} value={item.status} /></span><span className="batch-open" aria-hidden="true"><Icon name="chevron" size={16} /></span></button>; })}{!loading && !batches.length && <Empty title={t.empty} />}</div></section>
    <section className="card table-card task-history"><Section title={t.history} /><div className="table-wrap"><table className="has-actions"><thead><tr><th>{t.application}</th><th>{t.status}</th><th>{t.attempts}</th><th>{t.scheduledAt}</th><th>{t.error}</th><th className="actions-column">{t.actions}</th></tr></thead><tbody>{tasks.map((item: any) => <tr key={item.id}><td><strong>{item.applicationName}</strong><div className="mono subtle">{item.deployId}</div></td><td><Pill t={t} value={item.status} /></td><td>{item.attemptCount} / {item.maxRetries + 1}</td><td>{formatDate(locale, item.scheduledAt)}</td><td className="mono">{item.errorCode || "—"}</td><td className="actions-column"><div className="row-actions"><button className="icon-btn" title={t.taskDetail} onClick={() => onOpenTask(item)}><Icon name="eye" size={15} /></button>{["FAILED", "TIMED_OUT", "CANCELLED", "INTERRUPTED"].includes(item.status) && <button className="icon-btn" title={t.retry} onClick={() => onAction(item, "retry")}><Icon name="refresh" size={15} /></button>}{["QUEUED", "LEASED", "PRECHECKING"].includes(item.status) && <button className="icon-btn" title={t.cancel} onClick={() => onAction(item, "cancel")}><Icon name="close" size={15} /></button>}</div></td></tr>)}</tbody></table></div>{!loading && tasks.length === 0 && <Empty title={t.noTasks} />}</section></div>;
}

function BackupsPage({ t, locale, timezone, snapshots, loading, error, onOpen }: any) { return <div className="page"><PageHead eyebrow="Backup library · Current tenant" title={t.backupTitle} copy={t.backupCopy} /><ErrorPanel error={error} /><div className="card table-card"><div className="table-wrap"><table className="has-actions"><thead><tr><th>{t.application}</th><th>{t.capturedAt}</th><th>{t.archiveSize}</th><th>{t.sqliteCount}</th><th>{t.integrity}</th><th className="actions-column">{t.actions}</th></tr></thead><tbody>{snapshots.map((item: any) => <tr key={item.id}><td><strong>{item.applicationName}</strong><div className="mono subtle">{item.deployId}</div></td><td>{formatDate(locale, item.capturedAt, timezone)}</td><td>{formatBytes(locale, item.archiveSize)}</td><td>{item.sqliteCount}</td><td><Pill t={t} value={item.verificationStatus} /></td><td className="actions-column"><div className="row-actions"><button className="icon-btn" title={t.details} onClick={() => onOpen(item)}><Icon name="eye" size={15} /></button></div></td></tr>)}</tbody></table></div>{!loading && snapshots.length === 0 && <Empty title={t.noBackups} />}</div></div>; }

function StoragePage({ t, locale, storage, loading, error, onScan }: any) {
  const used = storage?.archiveBytes || 0;
  const available = storage?.availableBytes || 0;
  const capacity = used + available;
  const rawPercent = capacity ? Math.min(100, used / capacity * 100) : 0;
  const percentageLabel = rawPercent === 0 ? "0%" : rawPercent < 0.1 ? "<0.1%" : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(rawPercent)}%`;
  const verificationTone = storage?.missingCount ? "bad" : "good";
  const partialTone = storage?.partialCount ? "warn" : "good";
  return <div className="page storage-page"><PageHead eyebrow="Storage · Current tenant" title={t.storageTitle} copy={t.storageNoCleanupCopy} /><ErrorPanel error={error} />
    <section className="storage-usage-card card"><div className="storage-usage-head"><div className="storage-hero-main"><span className="storage-hero-icon"><Icon name="harddrive" size={21} /></span><div><span className="subtle">{t.storageDirectory}</span><strong>MimiAppBakcup</strong></div></div><button className="btn btn-scan" onClick={onScan}><Icon name="refresh" size={14} />{t.scan}</button></div><div className="storage-usage-value"><span>{t.storageUsed}</span><strong>{formatBytes(locale, used)}</strong><small>{percentageLabel} · {t.storageCapacity}</small></div><div className="storage-meter"><div><span>{percentageLabel}</span><span>{formatBytes(locale, used)} / {formatBytes(locale, capacity)}</span></div><i className={used > 0 ? "has-usage" : ""}><b style={{ width: `${rawPercent}%` }} /></i></div><div className="storage-usage-meta"><span><small>{t.availableStorage}</small><strong>{formatBytes(locale, available)}</strong></span><span><small>{t.snapshots}</small><strong>{storage?.snapshotCount ?? 0}</strong></span></div></section>
    <div className="storage-dashboard"><section className="card storage-summary-card"><Section title={t.snapshots} /><div className="storage-summary-grid"><Metric label={t.snapshots} value={storage?.snapshotCount ?? 0} /><Metric label={t.storageUsed} value={formatBytes(locale, used)} /><Metric label={t.availableStorage} value={formatBytes(locale, available)} /></div><div className="storage-check"><span><Icon name="check" size={15} /></span><div><strong>{t.lastVerified}</strong><p>{formatDate(locale, storage?.lastVerifiedAt)}</p></div></div></section><section className="card storage-status-card"><Section title={t.storageStatus} /><div className="storage-status-list"><div className={`storage-status-row ${verificationTone}`}><span><Icon name={storage?.missingCount ? "warning" : "check"} size={16} /></span><strong>{t.verificationIssues}</strong><b>{storage?.missingCount ?? 0}</b></div><div className={`storage-status-row ${partialTone}`}><span><Icon name="archive" size={16} /></span><strong>{t.partial}</strong><b>{storage?.partialCount ?? 0}</b></div></div></section></div>{loading && <Empty title={t.loading} />}</div>;
}

function AlertsPage({ t, locale, alerts, loading, error, status, onStatus, onAction }: any) { return <div className="page"><PageHead eyebrow="Alerts · Current tenant" title={t.alertsTitle} copy={t.alertsCopy} /><ErrorPanel error={error} /><div className="filter-bar"><Dropdown value={status} onChange={(event: any) => onStatus(event.target.value)} aria-label={t.status} options={[{ value: "OPEN", label: t.openAlerts }, { value: "RESOLVED", label: t.resolvedAlerts }, { value: "MUTED", label: t.mutedAlerts }, { value: "ALL", label: t.allAlerts }]} /></div><div className="card table-card"><div className="table-wrap"><table className="has-actions"><thead><tr><th>{t.alertType}</th><th>{t.status}</th><th>{t.application}</th><th>{t.createdAt}</th><th className="actions-column">{t.actions}</th></tr></thead><tbody>{alerts.map((item: any) => <tr key={item.id}><td><strong>{item.title}</strong><div className="subtle">{item.message}</div><div className="mono subtle">{item.code}</div></td><td><Pill t={t} value={item.status} /></td><td className="mono">{item.referenceId || "—"}</td><td>{formatDate(locale, item.createdAt)}</td><td className="actions-column"><div className="row-actions">{!item.readAt && <button className="btn btn-secondary btn-small" onClick={() => onAction(item, "read")}>{t.markRead}</button>}{item.status === "OPEN" && <><button className="btn btn-secondary btn-small" onClick={() => onAction(item, "mute")}>{t.mute}</button><button className="btn btn-primary btn-small" onClick={() => onAction(item, "resolve")}>{t.resolve}</button></>}</div></td></tr>)}</tbody></table></div>{!loading && alerts.length === 0 && <Empty title={t.noAlertsList} />}</div></div>; }

function SettingsPage({ t, locale, settings, settingsError, session, audits, loading, error, onSave, onLogout }: any) {
  const [draft, setDraft] = useState<any>(settings);
  const [section, setSection] = useState("overview");
  useEffect(() => setDraft(settings), [settings]);
  if (!draft) return <div className="page"><Empty title={settingsError || t.failed} copy={settingsError ? undefined : t.empty} /></div>;
  const update = (path: string, value: any) => {
    const next = structuredClone(draft);
    const [root, child] = path.split(".");
    child ? next[root][child] = value : next[root] = value;
    setDraft(next);
    void onSave(next);
  };
  const items = [
    ["personal", t.personal, [["account", "user", t.account, t.accountCopy], ["appearance", "globe", t.appearance, t.appearanceCopy], ["notification", "bell", t.notification, t.notificationCopy]]],
    ["backup", t.backupPreferences, [["schedule", "clock", t.backupSchedule, t.backupScheduleCopy], ["retention", "archive", t.storageRetention, t.storageRetentionCopy]]],
    ["maintenance", t.maintenance, [["audit", "tasks", t.audit, t.auditCopy]]],
  ] as const;
  const selected = items.flatMap(([, , entries]) => entries).find(([id]) => id === section);
  const group = items.find(([id]) => id === section);
  const overview = <>{items.map(([id, title, entries]) => <section className="settings-list-group" key={id}><div className="settings-group-title"><Icon name={id === "personal" ? "user" : id === "backup" ? "archive" : "tasks"} size={17} />{title}</div><div className="settings-row-list">{entries.map(([entryId, icon, label, copy]) => <button className="settings-list-row" key={entryId} onClick={() => setSection(entryId)}><span className="settings-row-icon"><Icon name={icon} size={18} /></span><span><strong>{label}</strong><small>{copy}</small></span><Icon name="chevron" size={16} /></button>)}</div></section>)}</>;
  const personalLanding = <section className="settings-detail-card settings-section-landing"><div className="settings-row-list">{items[0][2].map(([entryId, icon, label, copy]) => <button className="settings-list-row" key={entryId} onClick={() => setSection(entryId)}><span className="settings-row-icon"><Icon name={icon} size={18} /></span><span><strong>{label}</strong><small>{copy}</small></span><Icon name="chevron" size={16} /></button>)}</div></section>;
  const backupLanding = <section className="settings-detail-card settings-section-landing"><div className="settings-row-list">{items[1][2].map(([entryId, icon, label, copy]) => <button className="settings-list-row" key={entryId} onClick={() => setSection(entryId)}><span className="settings-row-icon"><Icon name={icon} size={18} /></span><span><strong>{label}</strong><small>{copy}</small></span><Icon name="chevron" size={16} /></button>)}</div></section>;
  const editor = section === "account" ? <section className="settings-detail-card"><div className="setting-row"><div><strong>{session?.displayName || "—"}</strong><p className="mono">{session?.uid || "—"} · {session?.role || "—"}</p></div><span className="settings-row-icon"><Icon name="user" size={18} /></span></div><button className="btn btn-secondary" onClick={onLogout}>{t.signOut}</button></section> : section === "appearance" ? <section className="settings-detail-card settings-detail-fields"><div className="field"><label>{t.language}</label><Dropdown value={draft.locale} onChange={(event: any) => update("locale", event.target.value)} aria-label={t.language} options={[{ value: "zh-CN", label: t.localeZh }, { value: "en-US", label: t.localeEn }]} /></div><div className="field"><label>{t.timezone}</label><Dropdown value={draft.timezone} onChange={(event: any) => update("timezone", event.target.value)} aria-label={t.timezone} options={["Asia/Shanghai", "UTC"]} /></div></section> : section === "notification" ? <section className="settings-detail-card"><div className="notification-options"><label className="notification-option"><input className="check" type="checkbox" checked={draft.notifyFirstFailure} onChange={(event) => update("notifyFirstFailure", event.target.checked)} /><span className="notification-option-copy"><strong>{t.notifyFailure}</strong></span></label><label className="notification-option"><input className="check" type="checkbox" checked={draft.notifySuccess} onChange={(event) => update("notifySuccess", event.target.checked)} /><span className="notification-option-copy"><strong>{t.notifySuccess}</strong></span></label></div></section> : section === "schedule" ? <section className="settings-detail-card settings-detail-fields"><div className="settings-switch-row"><span><strong>{t.catchUp}</strong><small>{t.catchUpCopy}</small></span><span className="settings-switch-control"><input type="checkbox" aria-label={t.catchUp} checked={draft.catchUp} onChange={(event) => update("catchUp", event.target.checked)} /><i /></span></div><div className="settings-field-grid"><SettingsNumber label={t.retries} value={draft.retry.maxRetries} onChange={(value: number) => update("retry.maxRetries", value)} min={0} max={8} /><SettingsNumber label={t.backoff} value={draft.retry.backoffSeconds} onChange={(value: number) => update("retry.backoffSeconds", value)} min={1} max={86400} /></div></section> : section === "retention" ? <section className="settings-detail-card settings-detail-fields"><div className="settings-field-grid settings-field-grid-four"><SettingsNumber label={t.keepLast} value={draft.retention.keepLast} onChange={(value: number) => update("retention.keepLast", value)} min={1} max={10000} /><SettingsNumber label={t.keepDaily} value={draft.retention.keepDaily} onChange={(value: number) => update("retention.keepDaily", value)} min={0} max={10000} /><SettingsNumber label={t.keepWeekly} value={draft.retention.keepWeekly} onChange={(value: number) => update("retention.keepWeekly", value)} min={0} max={10000} /><SettingsNumber label={t.keepMonthly} value={draft.retention.keepMonthly} onChange={(value: number) => update("retention.keepMonthly", value)} min={0} max={10000} /></div><SettingsNumber label={t.trashGrace} value={draft.retention.trashGraceHours} onChange={(value: number) => update("retention.trashGraceHours", value)} min={1} max={8760} /></section> : <section className="settings-detail-card audit-list">{audits.length ? audits.map((item: any) => <div className="setting-row" key={item.id}><div><strong>{formatAction(item.action)}</strong><p>{formatDate(locale, item.createdAt, draft.timezone)}</p></div><span className="mono">{item.entityId || "—"}</span></div>) : <Empty title={t.empty} />}</section>;
  const headingIcon = selected?.[1] || (group?.[0] === "personal" ? "user" : group?.[0] === "backup" ? "archive" : "tasks");
  const headingTitle = selected?.[2] || group?.[1];
  const headingCopy = selected?.[3] || (group?.[0] === "personal" ? t.accountCopy : group?.[0] === "backup" ? t.planCopy : t.auditCopy);
  return <div className="page settings-page settings-directory"><div className="settings-page-title"><h1>{t.settingsTitle}</h1></div><ErrorPanel error={error} /><div className="settings-directory-layout"><aside className="settings-directory-nav">{items.map(([id, title]) => <button className={section === "overview" && id === "personal" || section === id || (id === "personal" && ["account", "appearance", "notification"].includes(section)) || (id === "backup" && ["schedule", "retention"].includes(section)) || (id === "maintenance" && section === "audit") ? "active" : ""} key={id} onClick={() => setSection(id)}><Icon name={id === "personal" ? "user" : id === "backup" ? "archive" : "tasks"} size={16} /><span>{title}</span><Icon name="chevron" size={13} /></button>)}</aside><main className="settings-directory-content">{section === "overview" ? overview : <><button className="settings-back" onClick={() => setSection("overview")}><Icon name="arrow" size={14} />{t.backToSettings}</button><div className="settings-detail-heading"><span className="settings-row-icon"><Icon name={headingIcon || "settings"} size={19} /></span><div><h2>{headingTitle}</h2><p>{headingCopy}</p></div></div>{section === "personal" ? personalLanding : section === "backup" ? backupLanding : editor}</>}</main></div>{loading && <Empty title={t.loading} />}</div>;
}

const numberFieldHelp: Record<string, string> = {
  "最近保留": "始终保留最新的 N 份快照。",
  "Keep latest": "Always keep the newest N snapshots.",
  "每日保留": "每天额外保留一份，最多保留 N 天。",
  "Keep daily": "Keep one additional snapshot per day for N days.",
  "每周保留": "每周额外保留一份，最多保留 N 周。",
  "Keep weekly": "Keep one additional snapshot per week for N weeks.",
  "每月保留": "每月额外保留一份，最多保留 N 个月。",
  "Keep monthly": "Keep one additional snapshot per month for N months.",
  "回收站宽限期（小时）": "删除的快照在回收站保留 N 小时后清理。",
  "Trash grace (hours)": "Deleted snapshots remain in trash for N hours.",
  "自动重试": "一次备份失败后，最多再尝试 N 次。",
  "Automatic retries": "After a failure, retry the backup up to N times.",
  "重试间隔（秒）": "每次失败后等待 N 秒再重试。",
  "Retry delay (seconds)": "Wait N seconds between retry attempts.",
};

function SettingsNumber({ label, value, onChange, min, max }: any) { return <div className="field"><label>{label}</label><input type="number" value={value} min={min} max={max} onChange={(event) => onChange(Number(event.target.value))} />{numberFieldHelp[label] && <small className="field-help">{numberFieldHelp[label]}</small>}</div>; }

function ApplicationDetail({ t, locale, timezone, app, tasks, plans, close, onOpenTask, onBack, canBack, backLabel }: any) {
  const history = tasks.filter((item: any) => item.deployId === app.deployId).sort((a: any, b: any) => String(b.scheduledAt).localeCompare(String(a.scheduledAt)));
  const scheduled = plans.filter((plan: any) => plan.enabled && plan.nextRunAt && plan.targets?.some((target: any) => target.deployId === app.deployId));
  return <DetailModal title={app.name} subtitle={app.deployId === app.appid ? "" : app.deployId} close={close} onBack={onBack} canBack={canBack} backLabel={backLabel} className="application-detail-modal"><div className="detail-app-heading"><CatalogAppIcon app={app} size="large" /><div><div className="mono subtle">{app.appid}</div><div className="subtle">{app.version || "—"}</div></div></div><div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}><Pill t={t} value={app.capabilityStatus} /><Pill t={t} value={app.multiInstance ? "PROTECTED" : "OPEN"} /></div>{!app.multiInstance && <div className="notice warn"><Icon name="warning" size={15} /><span><strong>{t.sharedRisk}</strong><br />{t.sharedRiskCopy}</span></div>}<div className="section-label">{t.application}</div><div className="storage-kpis"><Metric label={t.dataSize} value={formatBytes(locale, app.totalBytes)} /><Metric label={t.fileCount} value={app.fileCount} /><Metric label={t.sqliteCount} value={app.sqliteCount} /></div><div className="section-label">{t.database}</div><div className="mini-list">{app.databaseFindings?.length ? app.databaseFindings.map((finding: any) => <div className="mini-row" key={finding.path}><div><strong>{finding.type}</strong><p className="mono">{finding.path}</p></div><Pill t={t} value={finding.supported ? "VERIFIED" : "FAILED"} /></div>) : <Empty title={t.empty} />}</div><div className="section-label">{t.tasks}</div><div className="mini-list">{history.length ? history.map((item: any) => <button className="setting-row detail-link" key={item.id} onClick={() => onOpenTask(item)}><div><strong>{formatDate(locale, item.scheduledAt, timezone)}</strong><p className="mono">{item.id}</p></div><Pill t={t} value={item.status} /></button>) : <Empty title={t.noTasks} />}</div><div className="section-label">{t.nextPlans}</div><div className="mini-list">{scheduled.length ? scheduled.map((plan: any) => <div className="mini-row" key={plan.id}><div><strong>{plan.name}</strong><p>{formatDate(locale, plan.nextRunAt, timezone)}</p></div><Pill t={t} value="PROTECTED" /></div>) : <Empty title={t.empty} />}</div></DetailModal>;
}

function BackupConfirmDialog({ t, locale, item, close, onConfirm }: any) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><div className="modal backup-confirm"><div className="modal-head"><div><div className="eyebrow">{t.backupNow}</div><div className="modal-title">{t.backupConfirmTitle}</div><div className="modal-copy">{t.backupConfirmCopy}</div></div><button className="icon-btn" onClick={close} aria-label={t.close}><Icon name="close" size={15} /></button></div><div className="modal-body"><div className="backup-confirm-target"><CatalogAppIcon app={item} /><div><strong>{item.name}</strong><p className="mono">{item.deployId}</p></div><Pill t={t} value={item.capabilityStatus} /></div><div className="storage-kpis"><Metric label={t.dataSize} value={formatBytes(locale, item.totalBytes)} /><Metric label={t.fileCount} value={item.fileCount} /><Metric label={t.sqliteCount} value={item.sqliteCount} /></div>{!item.multiInstance && <div className="notice warn"><Icon name="warning" size={15} /><span>{t.backupConfirmRisk}</span></div>}</div><div className="modal-foot"><button className="btn btn-secondary" onClick={close}>{t.cancel}</button><button className="btn btn-primary" onClick={onConfirm}><Icon name="zap" size={14} />{t.confirm}</button></div></div></div>;
}

function shortIdentifier(value?: string) {
  if (!value) return "—";
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

function TaskDetail({ t, locale, timezone, detail, close, onAction, onOpenSnapshot, onBack, canBack, backLabel }: any) {
  const task = detail?.task || {};
  const attempts = detail?.attempts || [];
  const canRetry = ["FAILED", "TIMED_OUT", "CANCELLED", "INTERRUPTED"].includes(task.status);
  return <DetailModal title={t.taskDetail} subtitle={task.id} close={close} onBack={onBack} canBack={canBack} backLabel={backLabel} className="task-detail-modal">
    <div className="detail-hero task-detail-hero">
      <div className={`detail-hero-icon ${statusTone(task.status)}`}><Icon name={statusIcon(task.status)} size={22} /></div>
      <div className="detail-hero-copy"><h2>{task.applicationName || "—"}</h2><p className="mono">{task.deployId || task.id || "—"}</p></div>
      <Pill t={t} value={task.status} />
    </div>
    <div className="task-quick-facts">
      <InfoRow label={t.attempts} value={`${task.attemptCount ?? 0} / ${(task.maxRetries ?? 0) + 1}`} />
      <InfoRow label={t.finished} value={formatDate(locale, task.finishedAt, timezone)} />
      <InfoRow label={t.snapshot} value={task.snapshotId ? <button type="button" className="detail-inline-link" onClick={() => onOpenSnapshot?.({ id: task.snapshotId })}>{t.createdSnapshot}<Icon name="chevron" size={12} /></button> : t.noSnapshot} title={task.snapshotId} />
    </div>
    <section className="detail-section compact-detail-section">
      <div className="detail-section-head"><h3>{t.taskTiming}</h3><Icon name="clock" size={17} /></div>
      <div className="detail-info-grid task-timing-grid"><InfoRow label={t.scheduledAt} value={formatDate(locale, task.scheduledAt, timezone)} /><InfoRow label={t.started} value={formatDate(locale, task.startedAt, timezone)} />{task.errorCode && <InfoRow label={t.error} value={task.errorCode} />}</div>
    </section>
    <section className="detail-section compact-detail-section"><div className="detail-section-head"><div><span className="detail-kicker">计划要求备份什么</span><h3>{scopeLabel(task.scope)}</h3></div><Icon name="folder" size={17} /></div><ScopeDeclaration scope={task.scope} />{task.errorCode === "BACKUP_SCOPE_PATH_MISSING" && <div className="notice bad detail-notice"><Icon name="warning" size={15} /><span>目录或文件已删除或移动：<code>{task.scopeValidation?.path || "已选范围"}</code>。范围校验失败后，计划已暂停；重新选择范围并保存后才能恢复。</span></div>}{task.errorCode === "PLAN_PAUSED_SCOPE_INVALID" && <div className="notice warn detail-notice"><Icon name="info" size={15} /><span>此任务未启动：同一计划的另一应用范围已失效（{task.scopeValidation?.path || "已选范围"}）。</span></div>}</section>
    <section className="detail-section compact-detail-section">
      <div className="detail-section-head"><h3>{t.attemptHistory}</h3><strong className="detail-section-count">{attempts.length}</strong></div>
      <div className="attempt-list">{attempts.length ? attempts.map((item: any, index: number) => <div className="attempt-row" key={item.id}><span className="attempt-index">{index + 1}</span><div><strong>{formatDate(locale, item.startedAt, timezone)}</strong><p className="mono">{shortIdentifier(item.id)}</p></div><Pill t={t} value={item.status} /></div>) : <Empty title={t.empty} />}</div>
    </section>
    {canRetry && <div className="detail-modal-actions"><button className="btn btn-primary" onClick={() => onAction(task, "retry")}><Icon name="refresh" size={14} />{t.retry}</button></div>}
  </DetailModal>;
}

function BatchDetail({ t, locale, timezone, batch, tasks, close, onOpenTask, onBack, canBack, backLabel }: any) {
  const done = (batch?.succeeded || 0) + (batch?.failed || 0) + (batch?.skipped || 0);
  const percent = batch?.totalTasks ? Math.round(done / batch.totalTasks * 100) : 0;
  return <DetailModal title={t.batchDetail} subtitle={batch.id} close={close} onBack={onBack} canBack={canBack} backLabel={backLabel} className="batch-detail-modal">
    <div className="detail-hero">
      <div className={`detail-hero-icon ${statusTone(batch.status)}`}><Icon name={statusIcon(batch.status)} size={22} /></div>
      <div className="detail-hero-copy"><span className="detail-kicker">{t.batchDetail}</span><h2>{batch.planName || t.manual}</h2><p>{formatDate(locale, batch.scheduledAt, timezone)}</p></div>
      <Pill t={t} value={batch.status} />
    </div>
    <section className="batch-detail-summary"><div className="batch-detail-progress"><span><strong>{done} / {batch.totalTasks}</strong><em>{percent}%</em></span><i><b style={{ width: `${percent}%` }} /></i></div><span><small>{t.success}</small><strong className="tone-good">{batch.succeeded || 0}</strong></span><span><small>{t.failedStatus}</small><strong className="tone-bad">{batch.failed || 0}</strong></span></section>
    <section className="detail-section compact-detail-section"><div className="detail-section-head"><h3>{t.batchTasks}</h3><strong className="detail-section-count">{tasks.length}</strong></div><div className="batch-task-list">{tasks.length ? tasks.map((item: any) => <button className="batch-task-row" key={item.id} onClick={() => onOpenTask(item)}><span className={`batch-task-icon ${statusTone(item.status)}`}><Icon name={statusIcon(item.status)} size={15} /></span><span><strong>{item.applicationName}</strong><small className="mono">{item.deployId}</small></span><Pill t={t} value={item.status} /><Icon name="chevron" size={15} /></button>) : <Empty title={t.noTasks} />}</div></section>
  </DetailModal>;
}

function PlanDetail({ t, locale, timezone, plan, close, onBack, canBack, backLabel }: any) {
  const chinese = locale === "zh-CN";
  const labels = chinese ? { schedule: "执行安排", next: "下次执行", targets: "保护目标", timezone: "时区", cron: "Cron 表达式", paused: "暂停原因", scope: "备份范围" } : { schedule: "Schedule", next: "Next run", targets: "Protected targets", timezone: "Time zone", cron: "Cron expression", paused: "Pause reason", scope: "Backup scope" };
  return <DetailModal title={plan.name} subtitle={plan.id} close={close} onBack={onBack} canBack={canBack} backLabel={backLabel} className="plan-detail-modal">
    <div className="detail-hero"><div className="detail-hero-icon violet"><Icon name="calendar" size={22} /></div><div className="detail-hero-copy"><span className="detail-kicker">{t.planTitle}</span><h2>{planScheduleLabel(plan, locale)}</h2><p>{plan.timezone || timezone}</p></div><Pill t={t} value={plan.enabled ? "PROTECTED" : "PAUSED"} /></div>
    <section className="detail-section compact-detail-section"><div className="detail-section-head"><h3>{labels.schedule}</h3><Icon name="clock" size={17} /></div><div className="detail-info-grid plan-detail-facts"><InfoRow label={t.schedule} value={planScheduleLabel(plan, locale)} /><InfoRow label={labels.timezone} value={plan.timezone || timezone} /><InfoRow label={labels.next} value={formatDate(locale, plan.nextRunAt, plan.timezone || timezone)} />{plan.scheduleType === "CRON" && <InfoRow label={labels.cron} value={plan.cronExpression || "—"} />}</div></section>
    {plan.pauseReason && <section className="detail-section compact-detail-section"><div className="detail-section-head"><h3>{labels.paused}</h3><Icon name="warning" size={17} /></div><div className="notice warn detail-notice"><Icon name="warning" size={15} /><span>{plan.pauseReason.deployId} · {plan.pauseReason.path || (chinese ? "已选范围" : "selected scope")}</span></div></section>}
    <section className="detail-section compact-detail-section"><div className="detail-section-head"><h3>{labels.targets}</h3><strong className="detail-section-count">{plan.targets?.length || 0}</strong></div><div className="plan-detail-targets">{plan.targets?.map((target: any) => <div key={target.deployId}><Icon name="apps" size={15} /><span><strong>{target.deployId}</strong><small>{labels.scope} · {scopeLabel(target.scope)}</small></span></div>)}</div></section>
  </DetailModal>;
}

function SnapshotDetail({ t, locale, timezone, snapshot, files, filesError, tasks, close, onOpenTask, onBack, canBack, backLabel }: any) {
  const storageStatus = snapshot.storageStatus || (filesError ? "INACCESSIBLE" : "AVAILABLE");
  const storagePath = snapshot.storagePath ? `/lzcapp/document/MimiAppBakcup/${snapshot.storagePath}` : "/lzcapp/document/MimiAppBakcup";
  const shownFiles = files.slice(0, 30);
  const preview = t.fileIndexPreview.replace("{shown}", String(shownFiles.length)).replace("{total}", String(snapshot.fileCount || files.length));
  const relatedTaskId = snapshot.taskId || tasks?.find((item: any) => item.snapshotId === snapshot.id || item.backupJobId === snapshot.jobId || (snapshot.batchId && item.batchId === snapshot.batchId && item.deployId === snapshot.deployId))?.id;
  return <DetailModal title={snapshot.applicationName || t.snapshot} subtitle={snapshot.id} close={close} onBack={onBack} canBack={canBack} backLabel={backLabel} className="snapshot-detail-modal">
    <div className="detail-hero snapshot-detail-hero"><div className="detail-hero-icon good"><Icon name="archive" size={22} /></div><div className="detail-hero-copy"><span className="detail-kicker">{t.snapshot}</span><h2>{formatDate(locale, snapshot.capturedAt, timezone)}</h2><p className="mono">{snapshot.deployId}</p></div><Pill t={t} value={snapshot.verificationStatus} /></div>
    <div className="detail-stat-grid snapshot-stat-grid"><div className="detail-stat"><span>{t.archiveSize}</span><strong>{formatBytes(locale, snapshot.archiveSize)}</strong></div><div className="detail-stat"><span>{t.fileCount}</span><strong>{snapshot.fileCount}</strong></div><div className="detail-stat"><span>{t.sqliteCount}</span><strong>{snapshot.sqliteCount}</strong></div></div>
    <section className="detail-section compact-detail-section snapshot-content-section"><div className="detail-section-head"><div><span className="detail-kicker">{t.backupContent}</span><h3>{scopeLabel(snapshot.scope)} · {snapshot.scope?.mode === "FULL" ? "完整" : "部分"}快照</h3></div><Pill t={t} value={snapshot.verificationStatus} /></div><ScopeDeclaration scope={snapshot.scope} /><div className="detail-info-grid snapshot-content-facts"><InfoRow label={t.actualArchived} value={`${snapshot.fileCount || 0} 个文件 · ${snapshot.directoryCount || 0} 个目录`} /><InfoRow label={t.sqliteProcessing} value={`${snapshot.sqliteCount || 0} 个在线一致性快照`} /></div><p className="detail-note">{t.recordedIntegrity}：{statusLabel(t, snapshot.verificationStatus)} · {snapshot.verifiedAt ? formatDate(locale, snapshot.verifiedAt, timezone) : t.notRecorded}</p></section>
    <section className="detail-section compact-detail-section"><div className="detail-section-head"><h3>{t.cloudDirectory}</h3><Pill t={t} value={storageStatus} /></div><div className="full-storage-path"><Icon name="folder" size={16} /><code>{storagePath}</code></div>{storageStatus === "MISSING" && <div className="notice bad detail-notice"><Icon name="warning" size={15} /><span>{t.storageMissingCopy}</span></div>}{storageStatus === "INACCESSIBLE" && <div className="notice warn detail-notice"><Icon name="info" size={15} /><span>{t.storageInaccessibleCopy}</span></div>}{relatedTaskId && <button type="button" className="detail-related-link" onClick={() => onOpenTask?.({ id: relatedTaskId })}><span><Icon name="tasks" size={14} />{t.taskDetail}</span><Icon name="chevron" size={14} /></button>}</section>
    <section className="detail-section compact-detail-section"><div className="detail-section-head"><div><h3>{t.fileIndex}</h3><p className="detail-note">{preview}</p></div><Icon name="file" size={17} /></div>{storageStatus === "MISSING" ? <div className="detail-empty-state"><Icon name="folder" size={18} /><span>{t.filesUnavailableMissing}</span></div> : filesError ? <div className="detail-empty-state"><Icon name="warning" size={18} /><span>{t.fileIndexUnavailable}</span></div> : <div className="file-index snapshot-file-index">{shownFiles.map((item: any) => <div className="snapshot-file" key={item.path}><span><Icon name={item.type?.toLowerCase().includes("sqlite") ? "database" : "file"} size={14} /></span><div><strong>{item.path}</strong><p>{item.type}</p></div><b>{formatBytes(locale, item.size)}</b></div>)}{files.length === 0 && <Empty title={t.empty} />}</div>}</section>
  </DetailModal>;
}

function InfoRow({ label, value, title }: any) { return <div className="detail-info-item" title={title}><span>{label}</span>{typeof value === "string" ? <strong>{value}</strong> : <div className="detail-info-value">{value}</div>}</div>; }
function DetailModal({ title, subtitle, close, onBack, canBack, backLabel = "Back", children, className = "" }: any) { return <div className="detail-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><section className={`detail-modal ${className}`} role="dialog" aria-modal="true" aria-label={title}><div className="detail-modal-head"><div className="detail-modal-heading">{canBack && <button type="button" className="detail-back-btn" onClick={onBack} aria-label={backLabel} title={backLabel}><Icon name="arrow" size={14} /></button>}<div><div className="modal-title">{title}</div><div className="detail-sub mono">{subtitle}</div></div></div><button className="icon-btn" onClick={close} aria-label="Close"><Icon name="close" size={15} /></button></div><div className="detail-modal-body">{children}</div></section></div>; }

function LegacyPlanEditor({ t, apps, defaults, plan, close, onSave }: any) {
  const [draft, setDraft] = useState<any>(() => plan?.id ? { ...plan, targetKind: "EXPLICIT", targets: plan.targets || [] } : { name: "", targetKind: "EXPLICIT", targets: [], scheduleType: "DAILY", cronExpression: "0 2 * * *", timezone: defaults?.timezone || "Asia/Shanghai", enabled: true, catchUp: defaults?.catchUp ?? true, maxCatchUpSeconds: defaults?.maxCatchUpSeconds || 86400, retry: defaults?.retry || { maxRetries: 2, backoffSeconds: 60 }, retention: defaults?.retention || { keepLast: 7, keepDaily: 7, keepWeekly: 4, keepMonthly: 3, trashGraceHours: 168 } });
  const [query, setQuery] = useState("");
  const [advanced, setAdvanced] = useState(draft.scheduleType === "CRON");
  const selected = new Set(draft.targets.map((item: any) => item.deployId));
  const backupableApps = apps.filter((item: any) => item.capabilityStatus?.includes("BACKUPABLE"));
  const visibleApps = backupableApps.filter((item: any) => `${item.name} ${item.appid} ${item.deployId}`.toLowerCase().includes(query.trim().toLowerCase()));
  const toggleTarget = (item: any) => setDraft((current: any) => ({ ...current, targets: selected.has(item.deployId) ? current.targets.filter((target: any) => target.deployId !== item.deployId) : [...current.targets, { deployId: item.deployId, scope: { mode: "FULL", revision: 1, directories: [], files: [] } }] }));
  const setScope = (deployId: string, scope: any) => setDraft((current: any) => ({ ...current, targets: current.targets.map((target: any) => target.deployId === deployId ? { ...target, scope } : target) }));
  const update = (key: string, value: any) => setDraft((current: any) => ({ ...current, [key]: value }));
  const cannotSave = !draft.targets.length;
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><div className="modal plan-modal plan-editor"><div className="modal-head"><div><div className="eyebrow">{plan?.id ? t.edit : t.newPlan}</div><div className="modal-title">{t.planTitle}</div><div className="modal-copy">选择应用和频率；保留与重试收进高级设置。</div></div><button className="icon-btn" onClick={close}><Icon name="close" size={15} /></button></div><div className="modal-body"><div className="field"><label>{t.name}</label><input value={draft.name} maxLength={120} placeholder="例如：工作应用每日备份" onChange={(event) => update("name", event.target.value)} /></div><section className="plan-step"><div className="plan-step-heading"><span>1</span><div><strong>{t.targets}</strong><p>支持一次添加多个应用。</p></div></div><label className="global-search plan-search"><Icon name="search" size={15} /><input value={query} placeholder={t.searchApps} onChange={(event) => setQuery(event.target.value)} /></label>{selected.size > 0 && <div className="selected-targets">{backupableApps.filter((item: any) => selected.has(item.deployId)).map((item: any) => <button type="button" key={item.deployId} onClick={() => toggleTarget(item)}><CatalogAppIcon app={item} /><span>{item.name}</span><Icon name="close" size={12} /></button>)}</div>}<div className="plan-app-list">{visibleApps.map((item: any) => <button type="button" className={`plan-app-option ${selected.has(item.deployId) ? "selected" : ""}`} key={item.deployId} onClick={() => toggleTarget(item)}><CatalogAppIcon app={item} /><span><strong>{item.name}</strong><small>{item.deployId}</small></span><span className="plan-check"><Icon name={selected.has(item.deployId) ? "check" : "plus"} size={14} /></span></button>)}{!visibleApps.length && <Empty title={t.noApplications} />}</div></section><section className="plan-step"><div className="plan-step-heading"><span>2</span><div><strong>{t.schedule}</strong><p>按当前选择的时区执行。</p></div></div><div className="schedule-cards">{[["HOURLY", t.hourly, "每个整点"], ["DAILY", t.daily, "每天 02:00"], ["WEEKLY", t.weekly, "每周一 02:00"]].map(([value, label, copy]) => <button type="button" key={value} className={draft.scheduleType === value && !advanced ? "active" : ""} onClick={() => { setAdvanced(false); update("scheduleType", value); }}><strong>{label}</strong><span>{copy}</span></button>)}<button type="button" className={advanced ? "active" : ""} onClick={() => { setAdvanced(true); update("scheduleType", "CRON"); }}><strong>{t.cron}</strong><span>高级设置</span></button></div>{advanced && <div className="field plan-cron"><label>{t.cron}</label><input value={draft.cronExpression} placeholder="0 2 * * *" onChange={(event) => update("cronExpression", event.target.value)} /></div>}<div className="form-grid"><div className="field"><label>{t.timezone}</label><Dropdown value={draft.timezone} onChange={(event: any) => update("timezone", event.target.value)} aria-label={t.timezone} options={["Asia/Shanghai", "UTC"]} /></div><label className="checkline"><input className="check" type="checkbox" checked={draft.catchUp} onChange={(event) => update("catchUp", event.target.checked)} />{t.catchUp}</label></div></section><details className="plan-advanced"><summary>{t.retention}、{t.retries}</summary><div className="form-grid"><SettingsNumber label={t.keepLast} value={draft.retention.keepLast} onChange={(value: number) => setDraft((current: any) => ({ ...current, retention: { ...current.retention, keepLast: value } }))} /><SettingsNumber label={t.keepWeekly} value={draft.retention.keepWeekly} onChange={(value: number) => setDraft((current: any) => ({ ...current, retention: { ...current.retention, keepWeekly: value } }))} /><SettingsNumber label={t.retries} value={draft.retry.maxRetries} onChange={(value: number) => setDraft((current: any) => ({ ...current, retry: { ...current.retry, maxRetries: value } }))} /></div></details></div><div className="modal-foot"><button className="btn btn-secondary" onClick={close}>{t.cancel}</button><button className="btn btn-secondary" disabled={cannotSave} onClick={() => onSave(draft, false)}>{t.save}</button><button className="btn btn-primary" disabled={cannotSave} onClick={() => onSave(draft, true)}>{t.saveAndRun}</button></div></div></div>;
}

function LegacyPlanEditorV2({ t, apps, defaults, plan, close, onSave }: any) {
  const [draft, setDraft] = useState<any>(() => plan?.id ? { ...plan, targetKind: "EXPLICIT", executionTime: plan.executionTime || "02:00", targets: plan.targets || [] } : { name: "", targetKind: "EXPLICIT", targets: [], scheduleType: "DAILY", executionTime: "02:00", cronExpression: "0 2 * * *", timezone: defaults?.timezone || "Asia/Shanghai", enabled: true, catchUp: defaults?.catchUp ?? true, maxCatchUpSeconds: defaults?.maxCatchUpSeconds || 86400, retry: defaults?.retry || { maxRetries: 2, backoffSeconds: 60 }, retention: defaults?.retention || { keepLast: 7, keepDaily: 7, keepWeekly: 4, keepMonthly: 3, trashGraceHours: 168 } });
  const [query, setQuery] = useState("");
  const [advancedCron, setAdvancedCron] = useState(draft.scheduleType === "CRON");
  const selected = new Set(draft.targets.map((item: any) => item.deployId));
  const backupableApps = apps.filter((item: any) => item.capabilityStatus?.includes("BACKUPABLE"));
  const visibleApps = backupableApps.filter((item: any) => `${item.name} ${item.appid} ${item.deployId}`.toLowerCase().includes(query.trim().toLowerCase()));
  const update = (key: string, value: any) => setDraft((current: any) => ({ ...current, [key]: value }));
  const toggleTarget = (item: any) => setDraft((current: any) => ({ ...current, targets: selected.has(item.deployId) ? current.targets.filter((target: any) => target.deployId !== item.deployId) : [...current.targets, { deployId: item.deployId }] }));
  const setRetry = (key: string, value: number) => setDraft((current: any) => ({ ...current, retry: { ...current.retry, [key]: value } }));
  const requiresTime = ["DAILY", "WEEKLY"].includes(draft.scheduleType);
  const cannotSave = !draft.targets.length;
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><div className="modal plan-modal plan-editor"><div className="modal-head"><div><div className="modal-title">{plan?.id ? t.edit : t.newPlan}</div><div className="modal-copy">{t.planCopy}</div></div><button className="icon-btn" onClick={close} aria-label={t.close}><Icon name="close" size={15} /></button></div><div className="modal-body"><div className="field"><label>{t.name}</label><input value={draft.name} maxLength={120} placeholder="例如：工作应用每日备份" onChange={(event) => update("name", event.target.value)} /></div><section className="plan-step"><div className="plan-step-heading"><span>1</span><div><strong>{t.targets}</strong><p>支持一次添加多个应用。</p></div></div><label className="global-search plan-search"><Icon name="search" size={15} /><input value={query} placeholder={t.searchApps} onChange={(event) => setQuery(event.target.value)} /></label>{selected.size > 0 && <div className="selected-targets">{backupableApps.filter((item: any) => selected.has(item.deployId)).map((item: any) => <button type="button" key={item.deployId} onClick={() => toggleTarget(item)}><CatalogAppIcon app={item} /><span>{item.name}</span><Icon name="close" size={12} /></button>)}</div>}<div className="plan-app-list">{visibleApps.map((item: any) => <button type="button" className={`plan-app-option ${selected.has(item.deployId) ? "selected" : ""}`} key={item.deployId} onClick={() => toggleTarget(item)}><CatalogAppIcon app={item} /><span><strong>{item.name}</strong><small>{item.deployId}</small></span><span className="plan-check"><Icon name={selected.has(item.deployId) ? "check" : "plus"} size={14} /></span></button>)}{!visibleApps.length && <Empty title={t.noApplications} />}</div></section><section className="plan-step"><div className="plan-step-heading"><span>2</span><div><strong>{t.schedule}</strong></div></div><div className="schedule-cards">{[["HOURLY", t.hourly, "每个整点"], ["DAILY", t.daily, "每天执行"], ["WEEKLY", t.weekly, "每周一执行"]].map(([value, label, copy]) => <button type="button" key={value} className={draft.scheduleType === value && !advancedCron ? "active" : ""} onClick={() => { setAdvancedCron(false); update("scheduleType", value); }}><strong>{label}</strong><span>{copy}</span></button>)}<button type="button" className={advancedCron ? "active" : ""} onClick={() => { setAdvancedCron(true); update("scheduleType", "CRON"); }}><strong>{t.cron}</strong><span>自定义表达式</span></button></div>{advancedCron && <div className="field plan-cron"><label>{t.cron}</label><input value={draft.cronExpression} placeholder="0 2 * * *" onChange={(event) => update("cronExpression", event.target.value)} /></div>}{requiresTime && <div className="plan-schedule-details"><div className="field"><label>执行时间</label><input type="time" value={draft.executionTime} onChange={(event) => update("executionTime", event.target.value)} /></div><div className="field"><label>{t.timezone}</label><Dropdown value={draft.timezone} onChange={(event: any) => update("timezone", event.target.value)} aria-label={t.timezone} options={["Asia/Shanghai", "UTC"]} /></div></div>}<div className="plan-switch"><span><strong>{t.catchUp}</strong><small>{t.catchUpCopy}</small></span><span className="plan-switch-control"><input type="checkbox" aria-label={t.catchUp} checked={draft.catchUp} onChange={(event) => update("catchUp", event.target.checked)} /><i /></span></div></section><section className="plan-step plan-options"><div className="plan-step-heading"><span>3</span><div><strong>{t.retries}</strong><p>失败任务只按策略重试，不会自动删除任何快照或目录。</p></div></div><div className="plan-options-grid"><SettingsNumber label={t.retries} value={draft.retry.maxRetries} min={0} max={8} onChange={(value: number) => setRetry("maxRetries", value)} /><SettingsNumber label={t.backoff} value={draft.retry.backoffSeconds} min={1} max={86400} onChange={(value: number) => setRetry("backoffSeconds", value)} /></div></section></div><div className="modal-foot"><button className="btn btn-secondary" onClick={close}>{t.cancel}</button><button className="btn btn-primary" disabled={cannotSave} onClick={() => onSave(draft, false)}>{t.save}</button><button className="btn btn-primary" disabled={cannotSave} onClick={() => onSave(draft, true)}>{t.saveAndRun}</button></div></div></div>;
}

function LegacyScopePlanEditor({ t, apps, defaults, plan, close, onSave }: any) {
  const [draft, setDraft] = useState<any>(() => plan?.id ? { ...plan, targets: plan.targets || [] } : { name: "", targetKind: "EXPLICIT", targets: [], scheduleType: "DAILY", executionTime: "02:00", cronExpression: "0 2 * * *", timezone: defaults?.timezone || "Asia/Shanghai", enabled: true, catchUp: defaults?.catchUp ?? true, maxCatchUpSeconds: defaults?.maxCatchUpSeconds || 86400, retry: defaults?.retry || { maxRetries: 2, backoffSeconds: 60 }, retention: defaults?.retention || { keepLast: 7, keepDaily: 7, keepWeekly: 4, keepMonthly: 3, trashGraceHours: 168 } });
  const [activeTarget, setActiveTarget] = useState(0);
  const [scopeItems, setScopeItems] = useState<any[]>([]);
  const targets = draft.targets || [];
  const active = targets[activeTarget];
  const addTarget = (app: any) => setDraft((current: any) => current.targets.some((target: any) => target.deployId === app.deployId) ? current : ({ ...current, targets: [...current.targets, { deployId: app.deployId, scope: { mode: "FULL", revision: 1, directories: [], files: [] } }] }));
  const updateScope = (value: any) => setDraft((current: any) => ({ ...current, targets: current.targets.map((target: any, index: number) => index === activeTarget ? { ...target, scope: value } : target) }));
  const selectMode = async (mode: string) => {
    if (!active) return;
    if (mode === "CORE" && activeApp?.appid !== "cloud.lazycat.notus") return;
    const next = { ...(active.scope || {}), mode, revision: Math.max(1, Number(active.scope?.revision || 0) + 1), directories: mode === "CUSTOM" ? active.scope?.directories || [] : [], files: mode === "CUSTOM" ? active.scope?.files || [] : [] };
    updateScope(next);
    if (mode === "CUSTOM" && scopeItems.length === 0) { try { const result: any = await api.backupScope(active.deployId); setScopeItems(result.items || []); } catch { setScopeItems([]); } }
  };
  const togglePath = (item: any) => {
    if (!active) return;
    const scope = active.scope || { mode: "CUSTOM", revision: 1, directories: [], files: [] };
    const key = item.type === "directory" ? "directories" : "files";
    const values = scope[key] || [];
    updateScope({ ...scope, mode: "CUSTOM", [key]: values.includes(item.path) ? values.filter((value: string) => value !== item.path) : [...values, item.path] });
  };
  const activeApp = apps.find((item: any) => item.deployId === active?.deployId);
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><div className="modal plan-modal scope-plan-editor"><div className="modal-head"><div><div className="modal-title">{plan?.id ? t.edit : t.newPlan}</div><div className="modal-copy">每个应用都有自己的保护范围；范围失效时，计划会暂停等待你确认。</div></div><button className="icon-btn" onClick={close}><Icon name="close" size={15} /></button></div><div className="modal-body scope-plan-workspace"><aside className="scope-target-pane"><label className="field"><span>{t.name}</span><input value={draft.name} maxLength={120} placeholder="例如：工作应用每日备份" onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><strong>应用目标</strong>{targets.map((target: any, index: number) => { const item = apps.find((app: any) => app.deployId === target.deployId); return <button key={target.deployId} className={`scope-target ${activeTarget === index ? "active" : ""}`} onClick={() => setActiveTarget(index)}><span>{item?.name || target.deployId}</span><small>{target.scope?.mode === "FULL" ? "完整" : target.scope?.mode === "CORE" ? "核心" : "自定义"}</small></button>; })}<div className="plan-app-list">{apps.filter((item: any) => item.capabilityStatus?.includes("BACKUPABLE") && !targets.some((target: any) => target.deployId === item.deployId)).slice(0, 5).map((item: any) => <button type="button" className="plan-app-option" key={item.deployId} onClick={() => addTarget(item)}><CatalogAppIcon app={item} /><span><strong>{item.name}</strong><small>{item.deployId}</small></span><Icon name="plus" size={14} /></button>)}</div></aside><section className="scope-main-pane">{active ? <><div className="scope-app-heading"><CatalogAppIcon app={activeApp} /><div><strong>{activeApp?.name}</strong><p>{activeApp?.fileCount || 0} 个文件 · {activeApp?.sqliteCount || 0} 个 SQLite</p></div></div><div className="scope-mode-grid">{[["FULL", "完整备份", "所有可支持数据"], ["CORE", "核心数据", activeApp?.appid?.includes("notus") ? "Notus 配置、数据与 SQLite" : "仅在应用档案可用时使用"], ["CUSTOM", "自定义", "按目录或单文件选择"]].map(([mode, label, copy]) => <button key={mode} className={active.scope?.mode === mode ? "active" : ""} onClick={() => void selectMode(mode)}><strong>{label}</strong><span>{copy}</span></button>)}</div>{active.scope?.mode === "CUSTOM" && <div className="scope-tree"><div className="scope-tree-head"><strong>已选范围</strong><span>{(active.scope?.directories?.length || 0) + (active.scope?.files?.length || 0)} 项</span></div>{scopeItems.length ? scopeItems.map((item: any) => { const selected = (item.type === "directory" ? active.scope?.directories : active.scope?.files)?.includes(item.path); return <button key={item.path} className={`scope-tree-row ${selected ? "selected" : ""}`} onClick={() => togglePath(item)}><input type="checkbox" checked={!!selected} readOnly /><Icon name={item.sqlite ? "database" : item.type === "directory" ? "folder" : "file"} size={14} /><span>{item.path}</span><small>{item.sqlite ? "SQLite 整体快照" : item.type}</small></button>; }) : <p className="subtle">正在读取当前应用可选择的相对路径。</p>}</div>}<div className="notice warn"><Icon name="warning" size={15} /><span>选中的目录或单文件不在原路径、类型改变或无法读取时，整个计划会暂停。目录内部文件的日常变化不会暂停计划。</span></div></> : <Empty title="先添加一个可备份应用" />}</section><aside className="scope-schedule-pane"><strong>执行设置</strong><label className="field"><span>{t.schedule}</span><Dropdown value={draft.scheduleType} onChange={(event: any) => setDraft({ ...draft, scheduleType: event.target.value })} aria-label={t.schedule} options={[{ value: "HOURLY", label: t.hourly }, { value: "DAILY", label: t.daily }, { value: "WEEKLY", label: t.weekly }, { value: "CRON", label: t.cron }]} /></label>{["DAILY", "WEEKLY"].includes(draft.scheduleType) && <label className="field"><span>执行时间</span><input type="time" value={draft.executionTime} onChange={(event) => setDraft({ ...draft, executionTime: event.target.value })} /></label>}{draft.scheduleType === "CRON" && <label className="field"><span>{t.cron}</span><input value={draft.cronExpression} onChange={(event) => setDraft({ ...draft, cronExpression: event.target.value })} /></label>}<label className="field"><span>{t.timezone}</span><Dropdown value={draft.timezone} onChange={(event: any) => setDraft({ ...draft, timezone: event.target.value })} aria-label={t.timezone} options={["Asia/Shanghai", "UTC"]} /></label><label className="checkline"><input className="check" type="checkbox" checked={draft.catchUp} onChange={(event) => setDraft({ ...draft, catchUp: event.target.checked })} />{t.catchUp}</label><div className="scope-summary"><span>保护目标</span><strong>{targets.length} 个应用</strong><span>完整备份</span><strong>{targets.filter((target: any) => (target.scope?.mode || "FULL") === "FULL").length} 个</strong><span>部分备份</span><strong>{targets.filter((target: any) => ["CORE", "CUSTOM"].includes(target.scope?.mode)).length} 个</strong></div></aside></div><div className="modal-foot"><button className="btn btn-secondary" onClick={close}>{t.cancel}</button><button className="btn btn-primary" disabled={!draft.name.trim() || !targets.length} onClick={() => onSave(draft, false)}>{t.save}</button><button className="btn btn-primary" disabled={!draft.name.trim() || !targets.length} onClick={() => onSave(draft, true)}>{t.saveAndRun}</button></div></div></div>;
}

function PlanEditor({ t, locale, apps, defaults, plan, close, onSave }: any) {
  const [draft, setDraft] = useState<any>(() => plan?.id ? { ...plan, targets: plan.targets || [] } : {
    name: "", targetKind: "EXPLICIT", targets: [], scheduleType: "DAILY", executionTime: "02:00", cronExpression: "0 2 * * *",
    timezone: defaults?.timezone || "Asia/Shanghai", enabled: true, catchUp: defaults?.catchUp ?? true,
    maxCatchUpSeconds: defaults?.maxCatchUpSeconds || 86400, retry: defaults?.retry || { maxRetries: 2, backoffSeconds: 60 },
    retention: defaults?.retention || { keepLast: 7, keepDaily: 7, keepWeekly: 4, keepMonthly: 3, trashGraceHours: 168 },
  });
  const [step, setStep] = useState(1);
  const [backupKind, setBackupKind] = useState<"FULL" | "SELECTIVE">(() => (plan?.targets || []).some((target: any) => (target.scope?.mode || "FULL") !== "FULL") ? "SELECTIVE" : "FULL");
  const [query, setQuery] = useState("");
  const [scopeTargetIndex, setScopeTargetIndex] = useState(0);
  const [scopeItems, setScopeItems] = useState<Record<string, any[]>>({});
  const [scopeLoading, setScopeLoading] = useState("");
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});
  const targets = draft.targets || [];
  const backupableApps = apps.filter((item: any) => item.capabilityStatus?.includes("BACKUPABLE"));
  const selected = new Set(targets.map((target: any) => target.deployId));
  const visibleApps = backupableApps.filter((item: any) => `${item.name} ${item.appid} ${item.deployId}`.toLowerCase().includes(query.trim().toLowerCase()));
  const active = targets[scopeTargetIndex];
  const activeApp = apps.find((item: any) => item.deployId === active?.deployId);
  const activeScope = active?.scope || { mode: "FULL", revision: 1, directories: [], files: [] };
  const customCount = (scope: any) => (scope?.directories?.length || 0) + (scope?.files?.length || 0);
  const customScopesReady = targets.every((target: any) => (target.scope?.mode || "FULL") !== "CUSTOM" || customCount(target.scope) > 0);

  const update = (key: string, value: any) => setDraft((current: any) => ({ ...current, [key]: value }));
  const setKind = (kind: "FULL" | "SELECTIVE") => {
    setBackupKind(kind);
    if (kind === "FULL") setDraft((current: any) => ({ ...current, targets: current.targets.map((target: any) => ({ ...target, scope: { mode: "FULL", revision: target.scope?.revision || 1, directories: [], files: [] } })) }));
  };
  const toggleTarget = (app: any) => setDraft((current: any) => {
    const exists = current.targets.some((target: any) => target.deployId === app.deployId);
    const next = exists ? current.targets.filter((target: any) => target.deployId !== app.deployId) : [...current.targets, { deployId: app.deployId, scope: { mode: "FULL", revision: 1, directories: [], files: [] } }];
    return { ...current, targets: next };
  });
  const updateActiveScope = (scope: any) => setDraft((current: any) => ({ ...current, targets: current.targets.map((target: any, index: number) => index === scopeTargetIndex ? { ...target, scope } : target) }));
  const loadScope = async (deployId: string) => {
    if (scopeItems[deployId] || scopeLoading === deployId) return;
    setScopeLoading(deployId);
    try {
      const result: any = await api.backupScope(deployId);
      const items = result.items || [];
      setScopeItems((current) => ({ ...current, [deployId]: items }));
      setExpandedPaths((current) => {
        const next = { ...current };
        items.filter((item: any) => item.type === "directory" && !item.path.includes("/")).forEach((item: any) => {
          if (next[item.path] === undefined) next[item.path] = true;
        });
        return next;
      });
    }
    catch { setScopeItems((current) => ({ ...current, [deployId]: [] })); }
    finally { setScopeLoading(""); }
  };
  const selectMode = async (mode: "FULL" | "CUSTOM") => {
    if (!active) return;
    const next = { ...activeScope, mode, directories: mode === "CUSTOM" ? activeScope.directories || [] : [], files: mode === "CUSTOM" ? activeScope.files || [] : [] };
    updateActiveScope(next);
    if (mode === "CUSTOM") await loadScope(active.deployId);
  };
  const selectedAncestor = (path: string) => (activeScope.directories || []).filter((directory: string) => path.startsWith(`${directory}/`)).sort((a: string, b: string) => b.length - a.length)[0];
  const pathSelected = (item: any) => (item.type === "directory" ? activeScope.directories || [] : activeScope.files || []).includes(item.path) || !!selectedAncestor(item.path);
  const togglePath = (item: any) => {
    const directories = [...(activeScope.directories || [])];
    const files = [...(activeScope.files || [])];
    const inheritedBy = selectedAncestor(item.path);
    if (item.type === "directory") {
      if (directories.includes(item.path)) {
        updateActiveScope({ ...activeScope, mode: "CUSTOM", directories: directories.filter((path: string) => path !== item.path), files });
        return;
      }
      if (inheritedBy) {
        updateActiveScope({ ...activeScope, mode: "CUSTOM", directories: directories.filter((path: string) => path !== inheritedBy), files });
        return;
      }
      updateActiveScope({ ...activeScope, mode: "CUSTOM", directories: [...directories.filter((path: string) => !path.startsWith(`${item.path}/`)), item.path], files: files.filter((path: string) => !path.startsWith(`${item.path}/`)) });
      return;
    }
    if (files.includes(item.path)) {
      updateActiveScope({ ...activeScope, mode: "CUSTOM", directories, files: files.filter((path: string) => path !== item.path) });
      return;
    }
    if (inheritedBy) {
      updateActiveScope({ ...activeScope, mode: "CUSTOM", directories: directories.filter((path: string) => path !== inheritedBy), files });
      return;
    }
    updateActiveScope({ ...activeScope, mode: "CUSTOM", directories, files: [...files, item.path] });
  };
  useEffect(() => {
    if (step === 3 && backupKind === "SELECTIVE" && active?.scope?.mode === "CUSTOM") void loadScope(active.deployId);
  }, [step, backupKind, active?.deployId, active?.scope?.mode]);
  const switchScopeTarget = (index: number) => { setScopeTargetIndex(index); const target = targets[index]; if (target?.scope?.mode === "CUSTOM") void loadScope(target.deployId); };
  const goNext = () => {
    if (step === 1 && !draft.name.trim()) return;
    if (step === 2 && !targets.length) return;
    if (step === 3 && backupKind === "SELECTIVE" && !customScopesReady) return;
    setStep((current) => Math.min(4, current + 1));
  };
  const fullCount = targets.filter((target: any) => (target.scope?.mode || "FULL") === "FULL").length;
  const partialCount = targets.length - fullCount;
  const currentItems = active ? scopeItems[active.deployId] || [] : [];
  const scopeTree = useMemo(() => {
    type Node = { path: string; name: string; item?: any; children: Node[] };
    const roots: Node[] = [];
    const nodes = new Map<string, Node>();
    [...currentItems].sort((left: any, right: any) => left.path.localeCompare(right.path)).forEach((item: any) => {
      const parts = item.path.split("/").filter(Boolean);
      let parent = roots;
      let currentPath = "";
      parts.forEach((name: string, index: number) => {
        currentPath = currentPath ? `${currentPath}/${name}` : name;
        let node = nodes.get(currentPath);
        if (!node) {
          node = { path: currentPath, name, children: [] };
          nodes.set(currentPath, node);
          parent.push(node);
        }
        if (index === parts.length - 1) node.item = item;
        parent = node.children;
      });
    });
    const sortNodes = (items: Node[]) => {
      items.sort((left, right) => Number(right.item?.type === "directory") - Number(left.item?.type === "directory") || left.name.localeCompare(right.name));
      items.forEach((item) => sortNodes(item.children));
    };
    sortNodes(roots);
    return roots;
  }, [currentItems]);
  const stepNames = ["备份模式", "添加应用", "配置范围", "计划设置"];
  const cronDescription = describeCron(draft.cronExpression || "", locale);
  const renderScopeNodes = (nodes: any[], depth = 0): React.ReactNode => nodes.map((node: any) => {
    const item = node.item || { path: node.path, type: "directory", selectable: false };
    const canExpand = node.children.length > 0;
    const explicit = (item.type === "directory" ? activeScope.directories || [] : activeScope.files || []).includes(item.path);
    const inherited = !explicit && !!selectedAncestor(item.path);
    const checked = explicit || inherited;
    const visual = scopeItemVisual(item);
    return <React.Fragment key={node.path}>
      <div className={`scope-tree-row ${checked ? "selected" : ""} ${inherited ? "inherited" : ""}`} style={{ paddingLeft: 12 + depth * 20 }}>
        {canExpand ? <button type="button" className="scope-tree-expander" aria-label={`${expandedPaths[node.path] ? "收起" : "展开"}${node.name}`} aria-expanded={!!expandedPaths[node.path]} onClick={() => setExpandedPaths((current) => ({ ...current, [node.path]: !current[node.path] }))}><Icon name="chevron" size={13} /></button> : <span className="scope-tree-indent" />}
        <button type="button" className="scope-tree-select" role="checkbox" aria-checked={checked} disabled={item.selectable === false} onClick={() => togglePath(item)}>
          <span className="scope-tree-checkbox"><Icon name={checked ? "check" : "plus"} size={11} /></span>
          <span className={`scope-file-icon ${visual.tone}`}><Icon name={visual.icon} size={15} /></span>
          <span className="scope-tree-name">{node.name}</span>
          <small>{inherited ? "由上级目录覆盖" : visual.label}</small>
        </button>
      </div>
      {canExpand && expandedPaths[node.path] && renderScopeNodes(node.children, depth + 1)}
    </React.Fragment>;
  });

  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <div className="modal plan-modal scope-wizard-editor">
      <div className="modal-head scope-wizard-head">
        <div><div className="modal-title scope-wizard-plan-title">{plan?.id ? t.edit : t.newPlan}</div><div className="modal-copy">{stepNames[step - 1]} · 每个应用的范围都会单独保存。</div></div>
        <button className="icon-btn" onClick={close} aria-label={t.close}><Icon name="close" size={15} /></button>
      </div>
      <div className="scope-wizard-progress" aria-label="计划创建步骤">{stepNames.map((name, index) => <button key={name} type="button" className={step === index + 1 ? "active" : step > index + 1 ? "done" : ""} onClick={() => index + 1 < step && setStep(index + 1)}><i>{step > index + 1 ? <Icon name="check" size={12} /> : index + 1}</i><span>{name}</span></button>)}</div>
      <div className="modal-body scope-wizard-body">
        {step === 1 && <section className="scope-wizard-stage">
          <div className="field"><label>{t.name}</label><input value={draft.name} maxLength={120} placeholder="例如：工作应用每日备份" onChange={(event) => update("name", event.target.value)} autoFocus /></div>
          <div className="wizard-intro"><strong>备份模式</strong></div>
          <div className="backup-kind-cards">
            <button type="button" className={backupKind === "FULL" ? "active" : ""} onClick={() => setKind("FULL")}><span className="backup-kind-icon full"><Icon name="archive" size={19} /></span><strong>整个应用备份</strong><p>每次保存当前应用数据根下所有可支持的数据和 SQLite。</p></button>
            <button type="button" className={backupKind === "SELECTIVE" ? "active" : ""} onClick={() => setKind("SELECTIVE")}><span className="backup-kind-icon selective"><Icon name="folder" size={19} /></span><strong>选择性备份</strong><p>批量添加应用后，逐个选择目录或单文件；原路径失效会暂停计划。</p></button>
          </div>
        </section>}
        {step === 2 && <section className="scope-wizard-stage">
          <div className="wizard-stage-heading"><div><strong>批量添加应用</strong><p>一次勾选多个可备份应用。{backupKind === "FULL" ? "它们都会完整备份。" : "下一步会逐个配置范围。"}</p></div><span>{targets.length} 个已选</span></div>
          <label className="global-search plan-search"><Icon name="search" size={15} /><input value={query} placeholder={t.searchApps} onChange={(event) => setQuery(event.target.value)} /></label>
          {targets.length > 0 && <div className="selected-targets">{backupableApps.filter((app: any) => selected.has(app.deployId)).map((app: any) => <button type="button" key={app.deployId} onClick={() => toggleTarget(app)}><CatalogAppIcon app={app} /><span>{app.name}</span><Icon name="close" size={12} /></button>)}</div>}
          <div className="wizard-app-list">{visibleApps.map((app: any) => <button type="button" className={selected.has(app.deployId) ? "selected" : ""} key={app.deployId} onClick={() => toggleTarget(app)}><CatalogAppIcon app={app} /><span><strong>{app.name}</strong><small>{app.deployId}</small><em>{app.fileCount || 0} 个文件 · {app.sqliteCount || 0} 个 SQLite</em></span><i className="plan-check"><Icon name={selected.has(app.deployId) ? "check" : "plus"} size={14} /></i></button>)}{!visibleApps.length && <Empty title={t.noApplications} />}</div>
        </section>}
        {step === 3 && <section className="scope-wizard-stage">
          {backupKind === "FULL" ? <><div className="wizard-stage-heading"><div><strong>确认完整备份范围</strong><p>已选应用会按完整备份处理，无需逐个选择文件。</p></div><span>{targets.length} 个应用</span></div><div className="full-scope-list">{targets.map((target: any) => { const app = apps.find((item: any) => item.deployId === target.deployId); return <div key={target.deployId}><CatalogAppIcon app={app} /><span><strong>{app?.name || target.deployId}</strong><small>当前数据根下全部可支持数据</small></span><b>完整备份</b></div>; })}</div></> : <>
            <div className="wizard-stage-heading"><div><strong>逐个设定保护范围</strong><p>正在配置 {scopeTargetIndex + 1} / {targets.length}。每个应用可独立选择完整或自定义。</p></div><span>{scopeTargetIndex + 1} / {targets.length}</span></div>
            <div className="scope-target-tabs">{targets.map((target: any, index: number) => { const app = apps.find((item: any) => item.deployId === target.deployId); return <button type="button" key={target.deployId} className={scopeTargetIndex === index ? "active" : ""} onClick={() => switchScopeTarget(index)}><CatalogAppIcon app={app} /><span>{app?.name || target.deployId}</span><small>{scopeLabel(target.scope)}</small></button>; })}</div>
            {active && <><div className="scope-app-heading"><CatalogAppIcon app={activeApp} size="large" /><div><strong>{activeApp?.name}</strong><p>{activeApp?.fileCount || 0} 个文件 · {activeApp?.sqliteCount || 0} 个 SQLite · 范围健康</p></div></div>
              <div className="scope-mode-grid"><button type="button" className={activeScope.mode === "FULL" ? "active" : ""} onClick={() => void selectMode("FULL")}><strong>完整备份</strong><span>全部可支持数据</span></button><button type="button" className={activeScope.mode === "CUSTOM" ? "active" : ""} onClick={() => void selectMode("CUSTOM")}><strong>自定义</strong><span>选择目录与单文件</span></button></div>
              {activeScope.mode === "CUSTOM" && <div className="scope-tree"><div className="scope-tree-head"><strong>选择目录或文件</strong><span>{customCount(activeScope)} 项已选</span></div>{scopeLoading === active.deployId && <p className="subtle">正在读取可选择的相对路径。</p>}{!scopeLoading && renderScopeNodes(scopeTree)}{!scopeLoading && !currentItems.length && <p className="subtle">没有可选择的项目，或读取范围失败。请返回应用列表后重试。</p>}</div>}
              <div className="notice warn"><Icon name="warning" size={15} /><span>目录内部文件增减不会暂停。已选目录、单文件或源根被删除、移动、类型变化或无法读取时，整项计划暂停。</span></div>
            </>}
          </>}
        </section>}
        {step === 4 && <section className="scope-wizard-stage">
          <div className="wizard-stage-heading"><div><strong>计划设置与确认</strong><p>确认运行频率后保存。文件索引会记录每次实际写入 ZIP 的内容。</p></div></div>
          <div className="schedule-cards">{[["HOURLY", t.hourly, "每个整点"], ["DAILY", t.daily, "每天执行"], ["WEEKLY", t.weekly, "每周执行"], ["CRON", t.cron, "自定义表达式"]].map(([value, label, copy]) => <button type="button" key={value} className={draft.scheduleType === value ? "active" : ""} onClick={() => update("scheduleType", value)}><strong>{label}</strong><span>{copy}</span></button>)}</div>
          <div className={`wizard-schedule-grid ${draft.scheduleType === "CRON" ? "cron-schedule-grid" : ""}`}>{["DAILY", "WEEKLY"].includes(draft.scheduleType) && <label className="field"><span>执行时间</span><input type="time" value={draft.executionTime} onChange={(event) => update("executionTime", event.target.value)} /></label>}{draft.scheduleType === "CRON" && <label className="field cron-field"><span>{t.cron}</span><input className={!cronDescription.valid ? "cron-invalid" : ""} value={draft.cronExpression} placeholder="0 2 * * *" spellCheck={false} onChange={(event) => update("cronExpression", event.target.value)} /><div className={`cron-description ${cronDescription.valid ? "valid" : "invalid"}`}><Icon name={cronDescription.valid ? "clock" : "warning"} size={14} /><span><strong>{cronDescription.title}</strong>{cronDescription.detail && <small>{cronDescription.detail}</small>}</span></div><small className="cron-format">5 段格式：分 时 日 月 周，例如 <code>0 2 * * 1-5</code></small></label>}<label className="field"><span>{t.timezone}</span><Dropdown value={draft.timezone} onChange={(event: any) => update("timezone", event.target.value)} aria-label={t.timezone} options={["Asia/Shanghai", "UTC"]} /></label></div>
          <label className="plan-switch"><span><strong>{t.catchUp}</strong><small>{t.catchUpCopy}</small></span><span className="plan-switch-control"><input type="checkbox" checked={draft.catchUp} onChange={(event) => update("catchUp", event.target.checked)} /><i /></span></label>
          <div className="scope-summary wizard-summary"><span>保护目标</span><strong>{targets.length} 个应用</strong><span>完整备份</span><strong>{fullCount} 个</strong><span>部分备份</span><strong>{partialCount} 个</strong>{targets.map((target: any) => { const app = apps.find((item: any) => item.deployId === target.deployId); return <React.Fragment key={target.deployId}><span>{app?.name || target.deployId}</span><strong>{scopeLabel(target.scope)}</strong></React.Fragment>; })}</div>
          {plan?.id && <div className="notice warn"><Icon name="info" size={15} /><span>保存范围调整会取消尚未启动的旧修订任务；运行中的任务仍按原范围安全完成。</span></div>}
        </section>}
      </div>
      <div className="modal-foot scope-wizard-foot"><button className="btn btn-secondary btn-cancel" onClick={close}>{t.cancel}</button>{step > 1 && <button className="btn btn-secondary btn-back" onClick={() => setStep((current) => current - 1)}>上一步</button>}{step < 4 ? <button className="btn btn-primary" disabled={(step === 1 && !draft.name.trim()) || (step === 2 && !targets.length) || (step === 3 && backupKind === "SELECTIVE" && !customScopesReady)} onClick={goNext}>下一步</button> : <button className="btn btn-primary btn-save" disabled={!targets.length} onClick={() => onSave(draft, false)}>{t.save}</button>}</div>
    </div>
  </div>;
}

export default App;
