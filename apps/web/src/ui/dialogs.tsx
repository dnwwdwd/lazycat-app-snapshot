import { useEffect, useState } from "react";
import {
  Archive,
  ArrowLeft,
  Check,
  ChevronRight,
  Database,
  FileText,
  Folder,
  ListChecks,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { api } from "../api/client";
import { AppMark, bytes, date, ModeBadge, StatusBadge } from "./components";

const tx = (locale: string, zh: string, en: string) =>
  locale === "zh-CN" ? zh : en;
const cn = (...names: Array<string | false | undefined>) =>
  names.filter(Boolean).join(" ");

export function Dialog({
  kind,
  data,
  close,
  state,
  locale,
  timezone,
  run,
  scope,
  applications,
  open,
  back,
  canBack,
}: any) {
  const plan = kind === "plan" && data?.id ? data : undefined;
  const title =
    kind === "app"
      ? `${tx(locale, "应用详情", "Application details")} · ${data.name}`
      : kind === "backup"
        ? tx(locale, "立即备份", "Back up now")
        : kind === "plan"
          ? plan
            ? tx(locale, "编辑备份计划", "Edit backup plan")
            : tx(locale, "新建备份计划", "New backup plan")
          : kind === "plan-detail"
            ? tx(locale, "计划详情", "Plan details")
            : kind === "task"
              ? tx(locale, "任务详情", "Task details")
              : kind === "batch"
                ? tx(locale, "批次详情", "Batch details")
                : kind === "snapshot"
                  ? tx(locale, "快照详情", "Snapshot details")
                  : tx(locale, "告警详情", "Alert details");
  const wide = [
    "app",
    "task",
    "batch",
    "snapshot",
    "plan",
    "plan-detail",
  ].includes(kind);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <div
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-head">
          <div className="modal-title-wrap">
            {canBack && (
              <button className="button button-quiet" onClick={back}>
                <ArrowLeft />
                {tx(locale, "返回上一级", "Back")}
              </button>
            )}
            <div className="modal-title">{title}</div>
          </div>
          <button
            className="icon-button"
            onClick={close}
            aria-label={tx(locale, "关闭", "Close")}
            title={tx(locale, "关闭", "Close")}
          >
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          {kind === "app" && (
            <AppDetails
              app={data}
              locale={locale}
              timezone={timezone}
              plans={state.plans}
              open={open}
            />
          )}
          {kind === "backup" && (
            <BackupConfirm app={data} locale={locale} close={close} run={run} />
          )}
          {kind === "plan" && (
            <PlanWizard
              initial={plan}
              initialDeployIds={data?.initialDeployIds}
              apps={state.applications.items}
              settings={state.settings}
              locale={locale}
              timezone={timezone}
              close={close}
              run={run}
              scope={scope}
              applications={applications}
            />
          )}
          {kind === "plan-detail" && (
            <PlanDetails
              plan={data}
              apps={state.applications.items}
              locale={locale}
              timezone={timezone}
            />
          )}
          {kind === "task" && (
            <TaskDetails
              task={data}
              locale={locale}
              timezone={timezone}
              open={open}
            />
          )}
          {kind === "batch" && (
            <BatchDetails
              batch={data}
              locale={locale}
              timezone={timezone}
              open={open}
            />
          )}
          {kind === "snapshot" && (
            <SnapshotDetails
              snapshot={data}
              locale={locale}
              timezone={timezone}
              open={open}
            />
          )}
          {kind === "alert" && (
            <AlertDetails alert={data} locale={locale} timezone={timezone} />
          )}
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value, mono = false }: any) {
  return (
    <div className="detail-item">
      <div className="detail-label">{label}</div>
      <div className={`detail-value ${mono ? "mono" : ""}`}>{value ?? "—"}</div>
    </div>
  );
}

function AppDetails({ app, locale, timezone, plans, open }: any) {
  const related = plans.filter((plan: any) =>
    plan.targets?.some((target: any) => target.deployId === app.deployId),
  );
  return (
    <div>
      <div className="app-cell" style={{ marginBottom: 16 }}>
        <AppMark app={app} name={app.name} />
        <div>
          <div className="page-title" style={{ fontSize: 18 }}>
            {app.name}
          </div>
          <div className="list-meta mono">
            {app.appid} · {app.version || "—"}
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <StatusBadge status={app.capabilityStatus} locale={locale} />
        </div>
      </div>
      {!app.multiInstance && (
        <div className="callout callout-warning">
          {tx(
            locale,
            "单实例共享数据提示：该实例可能包含共享数据，备份范围仅限平台向当前账号开放的目录。",
            "Shared-data notice: this single-instance application may contain shared data. The backup scope is limited to the directory exposed to this account.",
          )}
        </div>
      )}
      <div className="section-heading">
        <div>
          <h3>{tx(locale, "基本信息", "Basic information")}</h3>
        </div>
      </div>
      <div className="detail-grid">
        <Detail label="appid" value={app.appid} mono />
        <Detail label="deploy_id" value={app.deployId} mono />
        <Detail
          label={tx(locale, "部署模式", "Deployment mode")}
          value={<ModeBadge multi={app.multiInstance} />}
        />
        <Detail
          label={tx(locale, "备份能力", "Capability")}
          value={<StatusBadge status={app.capabilityStatus} locale={locale} />}
        />
        <Detail
          label={tx(locale, "最近检测", "Last probed")}
          value={date(app.lastProbedAt || app.lastSyncedAt, locale, timezone)}
          mono
        />
        <Detail
          label={tx(locale, "最近快照", "Latest snapshot")}
          value={date(app.lastBackupAt, locale, timezone)}
          mono
        />
        <Detail
          label={tx(locale, "数据概览", "Data overview")}
          value={`${bytes(app.totalBytes, locale)} · ${app.fileCount} ${tx(locale, "文件", "files")} · ${app.sqliteCount} SQLite`}
        />
        <Detail
          label={tx(locale, "保护状态", "Protection")}
          value={<StatusBadge status={app.protectionStatus} locale={locale} />}
        />
      </div>
      <div className="section-heading">
        <div>
          <h3>{tx(locale, "数据库检测", "Database findings")}</h3>
          <p>
            {tx(
              locale,
              "仅显示服务端检测到的类型和安全相对路径。",
              "Only server-detected types and safe relative paths are shown.",
            )}
          </p>
        </div>
      </div>
      {app.databaseFindings?.length ? (
        <div className="tree">
          {app.databaseFindings.map((finding: any) => (
            <div className="tree-row" key={`${finding.path}-${finding.type}`}>
              <Database className="tree-icon" />
              <span className="mono">{finding.path}</span>
              <span className="tree-size">
                {finding.type}
                {finding.supported
                  ? ""
                  : ` · ${finding.reason || tx(locale, "不支持", "unsupported")}`}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">
          {tx(locale, "没有数据库检测结果", "No database findings")}
        </div>
      )}
      <div className="section-heading">
        <div>
          <h3>{tx(locale, "关联计划", "Related plans")}</h3>
        </div>
      </div>
      <div className="list">
        {related.length ? (
          related.map((plan: any) => (
            <div className="list-row" key={plan.id}>
              <div className="list-main">
                <div className="list-title">{plan.name}</div>
                <div className="list-meta mono">{plan.id}</div>
              </div>
              <StatusBadge
                status={plan.enabled ? "ACTIVE" : "PAUSED"}
                locale={locale}
              />
            </div>
          ))
        ) : (
          <div className="empty">
            {tx(locale, "未配置计划", "No plan configured")}
          </div>
        )}
      </div>
      <div
        className="header-actions"
        style={{ justifyContent: "flex-start", marginTop: 16 }}
      >
        <button
          className="button button-secondary"
          onClick={() => open("plan", { initialDeployIds: [app.deployId] })}
          disabled={
            !["BACKUPABLE", "BACKUPABLE_SHARED_WARNING"].includes(
              app.capabilityStatus,
            )
          }
        >
          <SlidersHorizontal />
          {tx(locale, "创建计划", "Create plan")}
        </button>
      </div>
    </div>
  );
}

function BackupConfirm({ app, locale, close, run }: any) {
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    try {
      if (await run(() => api.startBackup(app.deployId))) close();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <div
        className={
          app.multiInstance ? "callout callout-info" : "callout callout-warning"
        }
      >
        <div className="app-cell">
          <AppMark app={app} name={app.name} />
          <div>
            <div className="list-title">{app.name}</div>
            <div className="list-meta mono">
              {app.deployId} · {bytes(app.totalBytes, locale)}
            </div>
          </div>
        </div>
        <p>
          {app.multiInstance
            ? tx(
                locale,
                "系统将为当前实例创建备份任务。",
                "A backup task will be created for this instance.",
              )
            : tx(
                locale,
                "该应用为单实例，可能存在共享数据；备份范围仅限平台向当前账号开放的目录。",
                "This is a single-instance application and may contain shared data; scope is limited to the directory exposed to this account.",
              )}
        </p>
      </div>
      <div className="modal-foot" style={{ margin: "20px -20px -20px" }}>
        <button className="button button-secondary" onClick={close}>
          {tx(locale, "取消", "Cancel")}
        </button>
        <button
          className="button button-primary"
          disabled={busy}
          onClick={start}
        >
          <Archive />
          {tx(locale, "立即入队", "Queue now")}
        </button>
      </div>
    </div>
  );
}

function PlanWizard({
  initial,
  initialDeployIds,
  apps,
  settings,
  locale,
  timezone,
  close,
  run,
  scope,
  applications,
}: any) {
  const initialTargets = initial?.targets || [];
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<"FULL" | "CUSTOM">(
    initialTargets.some((target: any) => target.scope?.mode === "CUSTOM")
      ? "CUSTOM"
      : "FULL",
  );
  const [selected, setSelected] = useState<string[]>(
    initialTargets.length
      ? initialTargets.map((target: any) => target.deployId)
      : initialDeployIds || [],
  );
  const [name, setName] = useState(initial?.name || "");
  const [scheduleType, setScheduleType] = useState(
    initial?.scheduleType || "DAILY",
  );
  const [executionTime, setExecutionTime] = useState(
    initial?.executionTime || "02:00",
  );
  const [cronExpression, setCronExpression] = useState(
    initial?.cronExpression || "0 2 * * *",
  );
  const [windowMinutes, setWindowMinutes] = useState(
    Math.max(
      60,
      Math.round(
        (initial?.maxCatchUpSeconds ?? settings?.maxCatchUpSeconds ?? 7200) /
          60,
      ),
    ),
  );
  const [catchUp, setCatchUp] = useState(
    initial?.catchUp ?? settings?.catchUp ?? true,
  );
  const [retryEnabled, setRetryEnabled] = useState(
    (initial?.retry?.maxRetries ?? settings?.retry?.maxRetries ?? 2) > 0,
  );
  const [notify, setNotify] = useState(settings?.notifyFirstFailure ?? true);
  const [targetScopes, setTargetScopes] = useState<Record<string, any>>(() =>
    Object.fromEntries(
      initialTargets.map((target: any) => [target.deployId, target.scope]),
    ),
  );
  const [targetSearch, setTargetSearch] = useState("");
  const [catalogs, setCatalogs] = useState<Record<string, any>>({});
  const [queries, setQueries] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [candidatePage, setCandidatePage] = useState<any>({
    items: [],
    nextCursor: undefined,
  });
  const [resolved, setResolved] = useState<any[]>([]);
  const candidates = Array.from(
    new Map(
      [...apps, ...(candidatePage.items || []), ...resolved].map((app: any) => [
        app.deployId,
        app,
      ]),
    ).values(),
  );
  const eligible = candidates.filter((app: any) =>
    ["BACKUPABLE", "BACKUPABLE_SHARED_WARNING"].includes(app.capabilityStatus),
  );
  const selectedApps = selected
    .map((deployId) => eligible.find((app: any) => app.deployId === deployId))
    .filter(Boolean);
  const validCron =
    scheduleType !== "CRON" ||
    /^\S+\s+\S+\s+\S+\s+\S+\s+\S+$/.test(cronExpression.trim());

  const toggleTarget = (deployId: string) =>
    setSelected((current) =>
      current.includes(deployId)
        ? current.filter((item) => item !== deployId)
        : [...current, deployId],
    );
  const scopeFor = (deployId: string) =>
    targetScopes[deployId] || { mode, directories: [], files: [], revision: 1 };
  const loadCandidates = async (cursor?: string) => {
    const params = new URLSearchParams([
      ["limit", "15"],
      ["capability_status", "BACKUPABLE"],
    ]);
    if (targetSearch) params.set("q", targetSearch);
    if (cursor) params.set("cursor", cursor);
    const result = await applications(params);
    setCandidatePage(result);
  };
  const loadCatalog = async (deployId: string, cursor?: string) => {
    const result = await scope(deployId, queries[deployId] || "", cursor);
    setCatalogs((current) => ({ ...current, [deployId]: result }));
  };
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams([
      ["limit", "15"],
      ["capability_status", "BACKUPABLE"],
    ]);
    if (targetSearch) params.set("q", targetSearch);
    void applications(params)
      .then((result: any) => active && setCandidatePage(result))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [applications, targetSearch]);
  useEffect(() => {
    let active = true;
    const known = new Set(candidates.map((app: any) => app.deployId));
    selected
      .filter((deployId) => !known.has(deployId))
      .forEach((deployId) => {
        const params = new URLSearchParams([
          ["limit", "1"],
          ["q", deployId],
          ["capability_status", "BACKUPABLE"],
        ]);
        void applications(params)
          .then((result: any) => {
            if (!active) return;
            setResolved((current) => [
              ...current,
              ...(result.items || []).filter(
                (app: any) =>
                  !current.some((item) => item.deployId === app.deployId),
              ),
            ]);
          })
          .catch(() => undefined);
      });
    return () => {
      active = false;
    };
  }, [applications, candidates, selected]);
  useEffect(() => {
    if (step !== 3) return;
    selectedApps.forEach((app: any) => {
      if (scopeFor(app.deployId).mode === "CUSTOM" && !catalogs[app.deployId])
        void loadCatalog(app.deployId).catch(() => undefined);
    });
  }, [step, selectedApps, targetScopes, catalogs]);
  const setScopeMode = (deployId: string, nextMode: "FULL" | "CUSTOM") => {
    setTargetScopes((current) => ({
      ...current,
      [deployId]: {
        ...(current[deployId] || { revision: 1 }),
        mode: nextMode,
        directories:
          nextMode === "CUSTOM" ? current[deployId]?.directories || [] : [],
        files: nextMode === "CUSTOM" ? current[deployId]?.files || [] : [],
      },
    }));
    if (nextMode === "CUSTOM" && !catalogs[deployId])
      void loadCatalog(deployId);
  };
  const toggleEntry = (deployId: string, entry: any) =>
    setTargetScopes((current) => {
      const currentScope = current[deployId] || {
        mode: "CUSTOM",
        directories: [],
        files: [],
        revision: 1,
      };
      const field = entry.type === "directory" ? "directories" : "files";
      const values = currentScope[field] || [];
      return {
        ...current,
        [deployId]: {
          ...currentScope,
          mode: "CUSTOM",
          [field]: values.includes(entry.path)
            ? values.filter((item: string) => item !== entry.path)
            : [...values, entry.path],
          revision: Math.max(1, Number(currentScope.revision || 0) + 1),
        },
      };
    });
  const save = async () => {
    setSaving(true);
    try {
      const input = {
        name,
        targetKind: "EXPLICIT",
        targets: selected.map((deployId) => ({
          deployId,
          scope:
            scopeFor(deployId).mode === "CUSTOM"
              ? scopeFor(deployId)
              : { mode: "FULL", revision: 1 },
        })),
        scheduleType,
        executionTime,
        cronExpression: scheduleType === "CRON" ? cronExpression : "",
        timezone,
        enabled: initial?.enabled ?? true,
        catchUp,
        maxCatchUpSeconds: windowMinutes * 60,
        retry: {
          ...(initial?.retry || settings?.retry || { backoffSeconds: 60 }),
          maxRetries: retryEnabled
            ? Math.max(
                1,
                initial?.retry?.maxRetries ?? settings?.retry?.maxRetries ?? 3,
              )
            : 0,
        },
        retention: initial?.retention ??
          settings?.retention ?? {
            keepLast: 7,
            keepDaily: 7,
            keepWeekly: 4,
            keepMonthly: 3,
            trashGraceHours: 168,
          },
      };
      if (
        await run(async () => {
          await (initial
            ? api.updatePlan(initial.id, input)
            : api.createPlan(input));
          if (settings && settings.notifyFirstFailure !== notify)
            await api.updateSettings({
              ...settings,
              notifyFirstFailure: notify,
            });
        })
      )
        close();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="wizard-steps">
        {[
          [tx(locale, "模式", "Mode"), 1],
          [tx(locale, "应用", "Applications"), 2],
          [tx(locale, "范围", "Scope"), 3],
          [tx(locale, "计划", "Schedule"), 4],
        ].map(([label, number]: any) => (
          <div
            className={cn(
              "wizard-step",
              step === number && "current",
              step > number && "done",
            )}
            key={number}
          >
            {step > number ? "✓ " : ""}
            {tx(locale, "步骤", "Step")} {number} · {label}
          </div>
        ))}
      </div>
      {step === 1 && (
        <div>
          <div className="section-heading">
            <div>
              <h3>{tx(locale, "选择备份模式", "Choose backup mode")}</h3>
              <p>
                {tx(
                  locale,
                  "立即备份固定使用完整备份；计划可选择自定义范围。",
                  "Immediate backups are full backups; plans can use a custom scope.",
                )}
              </p>
            </div>
          </div>
          <div className="choice-grid">
            <button
              className={cn("choice-card", mode === "FULL" && "selected")}
              onClick={() => setMode("FULL")}
            >
              <span className="choice-icon">
                <Archive size={16} />
              </span>
              <div className="choice-title">
                {tx(locale, "完整备份", "Full backup")}
              </div>
              <div className="choice-desc">
                {tx(
                  locale,
                  "归档当前应用数据根下全部可支持的普通文件和标准 SQLite。",
                  "Archive all supported regular files and standard SQLite data under the application root.",
                )}
              </div>
            </button>
            <button
              className={cn("choice-card", mode === "CUSTOM" && "selected")}
              onClick={() => setMode("CUSTOM")}
            >
              <span className="choice-icon">
                <SlidersHorizontal size={16} />
              </span>
              <div className="choice-title">
                {tx(locale, "自定义范围", "Custom scope")}
              </div>
              <div className="choice-desc">
                {tx(
                  locale,
                  "按应用选择目录和单文件。选择父目录会覆盖当前及后续新增的全部后代。",
                  "Choose directories and individual files per application. Selecting a parent includes its descendants.",
                )}
              </div>
            </button>
          </div>
          <div className="callout callout-info" style={{ marginTop: 12 }}>
            {tx(
              locale,
              "不接受绝对路径、..、越界符号链接、特殊文件或 SQLite WAL、SHM、Journal 伴随文件。",
              "Absolute paths, .., escaping symlinks, special files, and SQLite WAL, SHM, or journal sidecars are not accepted.",
            )}
          </div>
        </div>
      )}
      {step === 2 && (
        <div>
          <div className="section-heading">
            <div>
              <h3>{tx(locale, "添加目标应用", "Add target applications")}</h3>
              <p>
                {tx(
                  locale,
                  "只接受当前可备份的显式实例，不包含未来新出现的应用。",
                  "Only explicitly selected, currently backupable instances are included.",
                )}
              </p>
            </div>
            <div className="search-field" style={{ maxWidth: 230 }}>
              <Search />
              <input
                value={targetSearch}
                onChange={(event) => setTargetSearch(event.target.value)}
                placeholder={tx(locale, "搜索应用", "Search applications")}
              />
            </div>
          </div>
          <div
            className="list"
            style={{
              border: "1px solid var(--line)",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            {eligible
              .filter(
                (app: any) =>
                  !targetSearch ||
                  `${app.name}${app.deployId}`
                    .toLowerCase()
                    .includes(targetSearch.toLowerCase()),
              )
              .map((app: any) => (
                <label
                  className="list-row"
                  key={app.deployId}
                  style={{ cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(app.deployId)}
                    onChange={() => toggleTarget(app.deployId)}
                  />
                  <AppMark app={app} name={app.name} />
                  <div className="list-main">
                    <div className="list-title">{app.name}</div>
                    <div className="list-meta">
                      {app.appid} · {app.deployId} ·{" "}
                      {app.multiInstance
                        ? tx(locale, "用户隔离", "user isolated")
                        : tx(locale, "单实例共享风险", "shared-instance risk")}
                    </div>
                  </div>
                  <StatusBadge status={app.capabilityStatus} locale={locale} />
                </label>
              ))}
          </div>
          {candidatePage.nextCursor && (
            <div
              className="header-actions"
              style={{ justifyContent: "flex-start", marginTop: 10 }}
            >
              <button
                className="button button-secondary"
                onClick={() =>
                  void loadCandidates(candidatePage.nextCursor).catch(
                    () => undefined,
                  )
                }
              >
                {tx(locale, "下一页", "Next page")}
                <ChevronRight />
              </button>
            </div>
          )}
          {selectedApps.length === 0 && (
            <div className="callout callout-danger" style={{ marginTop: 12 }}>
              {tx(
                locale,
                "至少选择一个可备份应用。",
                "Select at least one backupable application.",
              )}
            </div>
          )}
        </div>
      )}
      {step === 3 && (
        <div>
          <div className="section-heading">
            <div>
              <h3>{tx(locale, "配置备份范围", "Configure backup scope")}</h3>
              <p>
                {tx(
                  locale,
                  "每个目标可分别选择完整或自定义范围。",
                  "Each target can use a full or custom scope.",
                )}
              </p>
            </div>
          </div>
          {selectedApps.map((app: any) => {
            const current = scopeFor(app.deployId);
            const catalog = catalogs[app.deployId];
            return (
              <div key={app.deployId} style={{ marginBottom: 14 }}>
                <div
                  className="list-row"
                  style={{ padding: "10px 0", borderBottom: 0 }}
                >
                  <AppMark app={app} name={app.name} />
                  <div className="list-main">
                    <div className="list-title">{app.name}</div>
                    <div className="list-meta mono">{app.deployId}</div>
                  </div>
                  {!app.multiInstance && (
                    <StatusBadge
                      status="WARNING"
                      label={tx(locale, "共享实例风险", "shared-instance risk")}
                    />
                  )}
                </div>
                <select
                  className="select"
                  value={current.mode}
                  onChange={(event) =>
                    setScopeMode(
                      app.deployId,
                      event.target.value as "FULL" | "CUSTOM",
                    )
                  }
                >
                  <option value="FULL">
                    {tx(
                      locale,
                      "完整备份 · 全部可支持数据",
                      "Full backup · all supported data",
                    )}
                  </option>
                  <option value="CUSTOM">
                    {tx(
                      locale,
                      "自定义范围 · 选择目录与文件",
                      "Custom scope · choose directories and files",
                    )}
                  </option>
                </select>
                {current.mode === "CUSTOM" && (
                  <>
                    <div className="filter-bar" style={{ marginTop: 8 }}>
                      <div className="search-field">
                        <Search />
                        <input
                          value={queries[app.deployId] || ""}
                          onChange={(event) =>
                            setQueries((items) => ({
                              ...items,
                              [app.deployId]: event.target.value,
                            }))
                          }
                          placeholder={tx(
                            locale,
                            "搜索安全相对路径",
                            "Search safe relative paths",
                          )}
                        />
                      </div>
                      <button
                        className="button button-secondary"
                        onClick={() => void loadCatalog(app.deployId)}
                      >
                        {tx(locale, "查询", "Search")}
                      </button>
                    </div>
                    <div className="tree">
                      {catalog?.items?.map((entry: any) => {
                        const selectedPaths =
                          entry.type === "directory"
                            ? current.directories
                            : current.files;
                        return (
                          <label
                            className={`tree-row ${entry.selectable ? "" : "tree-skip"}`}
                            key={`${entry.type}-${entry.path}`}
                          >
                            <input
                              type="checkbox"
                              disabled={!entry.selectable}
                              checked={(selectedPaths || []).includes(
                                entry.path,
                              )}
                              onChange={() => toggleEntry(app.deployId, entry)}
                            />
                            {entry.type === "directory" ? (
                              <Folder className="tree-icon" />
                            ) : (
                              <FileText className="tree-icon" />
                            )}
                            <span className="mono">{entry.path}</span>
                            <span className="tree-size">
                              {entry.selectable
                                ? entry.type === "directory"
                                  ? tx(locale, "目录", "Directory")
                                  : bytes(entry.size, locale)
                                : tx(locale, "不可选择", "Not selectable")}
                            </span>
                          </label>
                        );
                      })}
                      {catalog?.nextCursor && (
                        <button
                          className="button button-quiet"
                          onClick={() =>
                            void loadCatalog(app.deployId, catalog.nextCursor)
                          }
                        >
                          {tx(locale, "下一页", "Next page")}
                        </button>
                      )}
                      {!catalog && (
                        <div className="empty">
                          {tx(
                            locale,
                            "正在读取安全目录…",
                            "Loading safe directory…",
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
          {selectedApps.some((app: any) => !app.multiInstance) && (
            <div className="callout callout-warning">
              {tx(
                locale,
                "该应用使用单实例运行，当前范围以本账号可读取的数据目录为准。继续保存即表示已了解共享数据风险。",
                "This application runs as a single instance. Its scope is limited to data readable by the current account. Saving confirms that you understand the shared-data risk.",
              )}
            </div>
          )}
        </div>
      )}
      {step === 4 && (
        <div>
          <div className="form-grid">
            <div className="form-field full">
              <label className="form-label">
                {tx(locale, "计划名称", "Plan name")}
              </label>
              <input
                className="text-input"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="form-field">
              <label className="form-label">
                {tx(locale, "执行频率", "Schedule")}
              </label>
              <select
                className="select"
                value={scheduleType}
                onChange={(event) => setScheduleType(event.target.value)}
              >
                <option value="HOURLY">{tx(locale, "每小时", "Hourly")}</option>
                <option value="DAILY">{tx(locale, "每天", "Daily")}</option>
                <option value="WEEKLY">{tx(locale, "每周", "Weekly")}</option>
                <option value="CRON">Cron</option>
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">
                {tx(locale, "默认时区", "Default time zone")}
              </label>
              <select
                className="select"
                value={timezone}
                onChange={() => undefined}
              >
                <option>{timezone}</option>
              </select>
            </div>
            {scheduleType === "CRON" ? (
              <div className="form-field full">
                <label className="form-label">
                  {tx(locale, "五段 Cron", "Five-field cron")}
                </label>
                <input
                  className="text-input mono"
                  value={cronExpression}
                  onChange={(event) => setCronExpression(event.target.value)}
                />
                <div className={cn("form-help", !validCron && "status-danger")}>
                  {validCron
                    ? tx(locale, "Cron 格式有效。", "Cron format is valid.")
                    : tx(
                        locale,
                        "Cron 需要包含 5 个字段：分 时 日 月 周。",
                        "Cron requires five fields: minute, hour, day, month, weekday.",
                      )}
                </div>
              </div>
            ) : (
              <div className="form-field">
                <label className="form-label">
                  {tx(locale, "执行时间", "Execution time")}
                </label>
                <input
                  className="text-input mono"
                  type="time"
                  value={executionTime}
                  onChange={(event) => setExecutionTime(event.target.value)}
                />
              </div>
            )}
            <div className="form-field">
              <label className="form-label">
                {tx(locale, "备份窗口", "Backup window")}
              </label>
              <select
                className="select"
                value={windowMinutes}
                onChange={(event) =>
                  setWindowMinutes(Number(event.target.value))
                }
              >
                <option value={60}>60 {tx(locale, "分钟", "minutes")}</option>
                <option value={120}>120 {tx(locale, "分钟", "minutes")}</option>
                <option value={240}>240 {tx(locale, "分钟", "minutes")}</option>
              </select>
            </div>
          </div>
          <div className="stack" style={{ marginTop: 16 }}>
            <SettingToggle
              checked={catchUp}
              onChange={() => setCatchUp((value) => !value)}
              title={tx(
                locale,
                "错过计划窗口后补跑",
                "Catch up missed schedule windows",
              )}
              description={tx(
                locale,
                "关闭后，错过计划的批次直接标记为已跳过。",
                "When off, missed scheduled batches are skipped.",
              )}
            />
            <SettingToggle
              checked={retryEnabled}
              onChange={() => setRetryEnabled((value) => !value)}
              title={tx(locale, "失败自动重试", "Retry failed backups")}
              description={tx(
                locale,
                "最多 3 次，带退避间隔。",
                "Up to three attempts with a backoff interval.",
              )}
            />
            <SettingToggle
              checked={notify}
              onChange={() => setNotify((value) => !value)}
              title={tx(locale, "失败时发送系统通知", "Notify on failures")}
              description={tx(
                locale,
                "通知规则也可在设置中修改。",
                "Notification rules can also be changed in Settings.",
              )}
            />
          </div>
          <div className="callout callout-info" style={{ marginTop: 14 }}>
            {tx(
              locale,
              "计划保存只创建或更新定义，不会立即创建执行任务。",
              "Saving only creates or updates the plan; it does not immediately create a task.",
            )}
          </div>
        </div>
      )}
      {step === 3 &&
        selectedApps.some((app: any) => {
          const current = scopeFor(app.deployId);
          return (
            current.mode === "CUSTOM" &&
            !(current.directories?.length || current.files?.length)
          );
        }) && (
          <div className="callout callout-warning" style={{ marginTop: 12 }}>
            {tx(
              locale,
              "每个自定义范围至少选择一个目录或文件后才能保存。",
              "Select at least one directory or file for every custom scope before saving.",
            )}
          </div>
        )}
      <div className="modal-foot" style={{ margin: "20px -20px -20px" }}>
        <button className="button button-secondary" onClick={close}>
          {tx(locale, "取消", "Cancel")}
        </button>
        {step > 1 && (
          <button
            className="button button-secondary"
            onClick={() => setStep(step - 1)}
          >
            <ArrowLeft />
            {tx(locale, "上一步", "Back")}
          </button>
        )}
        {step < 4 ? (
          <button
            className="button button-primary"
            disabled={step === 2 && selectedApps.length === 0}
            onClick={() => setStep(step + 1)}
          >
            {tx(locale, "下一步", "Next")}
            <ChevronRight />
          </button>
        ) : (
          <button
            className="button button-primary"
            disabled={
              !name.trim() ||
              !selectedApps.length ||
              selectedApps.length !== selected.length ||
              !validCron ||
              selectedApps.some((app: any) => {
                const current = scopeFor(app.deployId);
                return (
                  current.mode === "CUSTOM" &&
                  !(current.directories?.length || current.files?.length)
                );
              }) ||
              saving
            }
            onClick={save}
          >
            <Check />
            {tx(locale, "保存计划", "Save plan")}
          </button>
        )}
      </div>
    </div>
  );
}

function SettingToggle({ checked, onChange, title, description }: any) {
  return (
    <div className="toggle-row">
      <div className="toggle-copy">
        <div className="toggle-title">{title}</div>
        <div className="toggle-desc">{description}</div>
      </div>
      <button
        className={`toggle ${checked ? "on" : ""}`}
        onClick={onChange}
        aria-label={title}
        aria-pressed={checked}
      >
        <span />
      </button>
    </div>
  );
}

function PlanDetails({ plan, apps, locale, timezone }: any) {
  const targets = plan.targets || [];
  return (
    <div>
      <div className="detail-grid">
        <Detail label={tx(locale, "计划 ID", "Plan ID")} value={plan.id} mono />
        <Detail
          label={tx(locale, "状态", "Status")}
          value={
            <StatusBadge
              status={plan.enabled ? "ACTIVE" : "PAUSED"}
              locale={locale}
            />
          }
        />
        <Detail
          label={tx(locale, "执行频率", "Schedule")}
          value={`${plan.scheduleType} · ${plan.executionTime || plan.cronExpression || "—"}`}
          mono
        />
        <Detail
          label={tx(locale, "时区", "Time zone")}
          value={plan.timezone}
          mono
        />
        <Detail
          label={tx(locale, "下次执行", "Next run")}
          value={date(plan.nextRunAt, locale, timezone)}
          mono
        />
        <Detail
          label={tx(locale, "重试次数", "Retries")}
          value={plan.retry?.maxRetries}
        />
        <Detail
          label={tx(locale, "补跑规则", "Catch-up")}
          value={
            plan.catchUp
              ? tx(locale, "错过窗口后补跑", "Run after a missed window")
              : tx(locale, "错过窗口后跳过", "Skip after a missed window")
          }
        />
        <Detail
          label={tx(locale, "备份窗口", "Backup window")}
          value={`${Math.round((plan.maxCatchUpSeconds || 0) / 60)} ${tx(locale, "分钟", "minutes")}`}
        />
        <Detail
          label={tx(locale, "保留策略", "Retention")}
          value={`${tx(locale, "保留最近", "Keep latest")} ${plan.retention?.keepLast || 0}`}
        />
      </div>
      <div className="section-heading">
        <div>
          <h3>{tx(locale, "目标实例", "Target instances")}</h3>
        </div>
      </div>
      <div className="list">
        {targets.map((target: any) => {
          const app = apps.find(
            (item: any) => item.deployId === target.deployId,
          );
          return (
            <div className="list-row" key={target.deployId}>
              <AppMark app={app} name={app?.name || target.deployId} />
              <div className="list-main">
                <div className="list-title">{app?.name || target.deployId}</div>
                <div className="list-meta mono">
                  {target.deployId} · {target.scope?.mode || "FULL"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TaskDetails({ task, locale, timezone, open }: any) {
  const [detail, setDetail] = useState<any>();
  useEffect(() => {
    void api.task(task.id).then(setDetail);
  }, [task.id]);
  const item = detail?.task || task;
  return (
    <div>
      <div className="detail-grid">
        <Detail
          label={tx(locale, "任务状态", "Task status")}
          value={<StatusBadge status={item.status} locale={locale} />}
        />
        <Detail label={tx(locale, "任务 ID", "Task ID")} value={item.id} mono />
        <Detail label="deploy_id" value={item.deployId} mono />
        <Detail
          label={tx(locale, "计划时间", "Scheduled")}
          value={date(item.scheduledAt, locale, timezone)}
          mono
        />
        <Detail
          label={tx(locale, "开始时间", "Started")}
          value={date(item.startedAt, locale, timezone)}
          mono
        />
        <Detail
          label={tx(locale, "完成时间", "Finished")}
          value={date(item.finishedAt, locale, timezone)}
          mono
        />
        <Detail
          label={tx(locale, "尝试次数", "Attempts")}
          value={`${item.attemptCount}/${item.maxRetries + 1}`}
        />
        <Detail
          label={tx(locale, "快照 ID", "Snapshot ID")}
          value={item.snapshotId || "—"}
          mono
        />
        <Detail
          label={tx(locale, "错误", "Error")}
          value={item.errorCode || "—"}
          mono
        />
      </div>
      <div className="section-heading">
        <div>
          <h3>{tx(locale, "执行记录", "Attempts")}</h3>
        </div>
      </div>
      <div className="list">
        {detail?.attempts?.length ? (
          detail.attempts.map((attempt: any) => (
            <div className="list-row" key={attempt.id}>
              <div className="list-main">
                <div className="list-title">
                  {tx(locale, "第", "Attempt ")}
                  {attempt.attempt}
                  {locale === "zh-CN" ? " 次" : ""}
                </div>
                <div className="list-meta mono">
                  {date(attempt.startedAt, locale, timezone)} ·{" "}
                  {date(attempt.finishedAt, locale, timezone)}
                </div>
              </div>
              <StatusBadge status={attempt.status} locale={locale} />
            </div>
          ))
        ) : (
          <div className="empty">
            {tx(locale, "暂无执行记录", "No attempt records")}
          </div>
        )}
      </div>
      {item.snapshotId && (
        <div
          className="header-actions"
          style={{ justifyContent: "flex-start", marginTop: 16 }}
        >
          <button
            className="button button-secondary"
            onClick={() =>
              void api
                .backup(item.snapshotId)
                .then((snapshot) => open("snapshot", snapshot))
            }
          >
            <Archive />
            {tx(locale, "查看关联快照", "View linked snapshot")}
          </button>
        </div>
      )}
    </div>
  );
}

function BatchDetails({ batch, locale, timezone, open }: any) {
  const [tasks, setTasks] = useState<any[]>([]);
  useEffect(() => {
    const params = new URLSearchParams([
      ["batch_id", batch.id],
      ["limit", "50"],
    ]);
    void api.tasks(params).then((result) => setTasks(result.items || []));
  }, [batch.id]);
  return (
    <div>
      <div className="detail-grid">
        <Detail
          label={tx(locale, "批次 ID", "Batch ID")}
          value={batch.id}
          mono
        />
        <Detail
          label={tx(locale, "状态", "Status")}
          value={<StatusBadge status={batch.status} locale={locale} />}
        />
        <Detail
          label={tx(locale, "创建时间", "Created")}
          value={date(batch.createdAt, locale, timezone)}
          mono
        />
        <Detail
          label={tx(locale, "任务总数", "Tasks")}
          value={batch.totalTasks}
        />
        <Detail
          label={tx(locale, "成功 / 失败", "Succeeded / failed")}
          value={`${batch.succeeded} / ${batch.failed}`}
        />
        <Detail
          label={tx(locale, "执行中 / 排队", "Running / queued")}
          value={`${batch.running} / ${batch.queued}`}
        />
      </div>
      <div className="section-heading">
        <div>
          <h3>{tx(locale, "实例任务", "Instance tasks")}</h3>
        </div>
      </div>
      <div className="list">
        {tasks.map((task) => (
          <button
            className="list-row"
            key={task.id}
            onClick={() => open("task", task)}
            style={{
              background: "transparent",
              textAlign: "left",
              width: "100%",
            }}
          >
            <div className="list-main">
              <div className="list-title">{task.applicationName}</div>
              <div className="list-meta mono">
                {task.deployId} · {task.id}
              </div>
            </div>
            <StatusBadge status={task.status} locale={locale} />
          </button>
        ))}
      </div>
    </div>
  );
}

function SnapshotDetails({ snapshot, locale, timezone, open }: any) {
  const [files, setFiles] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  useEffect(() => {
    void api
      .backupFiles(snapshot.id)
      .then((result) => setFiles(result.items || []));
  }, [snapshot.id]);
  return (
    <div>
      <div className="app-cell" style={{ marginBottom: 16 }}>
        <AppMark name={snapshot.applicationName} />
        <div>
          <div className="page-title" style={{ fontSize: 18 }}>
            {snapshot.applicationName}
          </div>
          <div className="list-meta mono">
            {snapshot.appid} · {snapshot.applicationVersion || "—"}
          </div>
        </div>
      </div>
      <div className="detail-grid">
        <Detail label="deploy_id" value={snapshot.deployId} mono />
        <Detail
          label={tx(locale, "完成时间", "Finished")}
          value={date(snapshot.finishedAt, locale, timezone)}
          mono
        />
        <Detail
          label={tx(locale, "捕获时间", "Captured")}
          value={date(snapshot.capturedAt, locale, timezone)}
          mono
        />
        <Detail
          label={tx(locale, "部署模式", "Deployment mode")}
          value={<ModeBadge multi={snapshot.multiInstance} locale={locale} />}
        />
        <Detail
          label="snapshot.zip"
          value={bytes(snapshot.archiveSize, locale)}
          mono
        />
        <Detail
          label={tx(locale, "归档 SHA-256", "Archive SHA-256")}
          value={snapshot.archiveSha256}
          mono
        />
        <Detail
          label={tx(locale, "原始大小", "Original size")}
          value={bytes(snapshot.originalBytes, locale)}
          mono
        />
        <Detail
          label={tx(locale, "文件 / SQLite", "Files / SQLite")}
          value={`${snapshot.fileCount} / ${snapshot.sqliteCount}`}
        />
        <Detail
          label={tx(locale, "完整性", "Integrity")}
          value={
            <StatusBadge status={snapshot.verificationStatus} locale={locale} />
          }
        />
        <Detail
          label={tx(locale, "存储状态", "Storage status")}
          value={
            <StatusBadge
              status={snapshot.storageStatus || "AVAILABLE"}
              locale={locale}
            />
          }
        />
        <Detail
          label={tx(locale, "存储路径", "Storage path")}
          value={snapshot.storagePath}
          mono
        />
        <Detail
          label={tx(locale, "范围", "Scope")}
          value={`${snapshot.scope?.mode || "FULL"} · ${snapshot.scope?.directories?.length || 0} ${tx(locale, "目录", "directories")} · ${snapshot.scope?.files?.length || 0} ${tx(locale, "文件", "files")}`}
        />
        <Detail
          label={tx(locale, "跳过 / 警告", "Skipped / warnings")}
          value={`${snapshot.skippedCount || 0} / ${snapshot.warningCount || 0}`}
        />
        <Detail
          label={tx(locale, "计划 ID", "Plan ID")}
          value={snapshot.planId || "—"}
          mono
        />
        <Detail
          label={tx(locale, "批次 ID", "Batch ID")}
          value={snapshot.batchId || "—"}
          mono
        />
        <Detail
          label={tx(locale, "任务 ID", "Task ID")}
          value={snapshot.taskId || "—"}
          mono
        />
      </div>
      <div className="section-heading">
        <div>
          <h3>{tx(locale, "文件索引", "File index")}</h3>
          <p>
            {tx(
              locale,
              "真实归档路径、类型、大小和修改时间。",
              "Actual archive path, type, size, and modification time.",
            )}
          </p>
        </div>
        <div className="search-field" style={{ maxWidth: 230 }}>
          <Search />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tx(locale, "搜索路径", "Search paths")}
          />
        </div>
      </div>
      <div className="table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>{tx(locale, "路径", "Path")}</th>
                <th>{tx(locale, "类型", "Type")}</th>
                <th>{tx(locale, "大小", "Size")}</th>
                <th>{tx(locale, "修改时间", "Modified")}</th>
              </tr>
            </thead>
            <tbody>
              {files
                .filter((file) =>
                  file.path.toLowerCase().includes(query.toLowerCase()),
                )
                .slice(0, 30)
                .map((file) => (
                  <tr key={file.path}>
                    <td className="mono">{file.path}</td>
                    <td>{file.type}</td>
                    <td className="mono">{bytes(file.size, locale)}</td>
                    <td className="mono">
                      {date(file.modified, locale, timezone)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      {snapshot.taskId && (
        <div
          className="header-actions"
          style={{ justifyContent: "flex-start", marginTop: 16 }}
        >
          <button
            className="button button-secondary"
            onClick={() =>
              void api
                .task(snapshot.taskId)
                .then((detail) => open("task", detail.task))
            }
          >
            <ListChecks />
            {tx(locale, "查看关联任务", "View linked task")}
          </button>
        </div>
      )}
    </div>
  );
}

function AlertDetails({ alert, locale, timezone }: any) {
  return (
    <div>
      <div className="callout callout-warning">
        <strong>{alert.title}</strong>
        <br />
        {alert.message}
      </div>
      <div className="detail-grid" style={{ marginTop: 16 }}>
        <Detail label={tx(locale, "类型", "Type")} value={alert.type} />
        <Detail
          label={tx(locale, "状态", "Status")}
          value={<StatusBadge status={alert.status} locale={locale} />}
        />
        <Detail
          label={tx(locale, "发生时间", "Created")}
          value={date(alert.createdAt, locale, timezone)}
          mono
        />
        <Detail
          label={tx(locale, "关联类型", "Reference type")}
          value={alert.referenceType || "—"}
        />
        <Detail
          label={tx(locale, "关联 ID", "Reference ID")}
          value={alert.referenceId || "—"}
          mono
        />
      </div>
    </div>
  );
}
