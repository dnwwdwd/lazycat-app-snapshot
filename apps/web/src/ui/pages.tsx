import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  Archive,
  Bell,
  Calendar,
  Check,
  Database,
  Eye,
  FileCheck2,
  HardDrive,
  Layers3,
  ListChecks,
  Lock,
  LogIn,
  LogOut,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TimerReset,
  User,
} from "lucide-react";
import { api } from "../api/client";
import {
  AppMark,
  apiErrorLabel,
  bytes,
  databaseTypeLabel,
  date,
  Empty,
  Loading,
  ModeBadge,
  PageHeader,
  Pager,
  Panel,
  SearchField,
  scheduleLabel,
  StatusBadge,
  TableIconButton,
  toastMessage,
} from "./components";
import {
  browserNotificationPermission,
  requestBrowserNotificationPermission,
  type BrowserNotificationPermission,
} from "./notifications";

const text = (locale: string, zh: string, en: string) =>
  locale === "zh-CN" ? zh : en;
const appTones = ["blue", "sky", "teal", "cyan", "violet", "orange"];
const appTone = (id = "") =>
  appTones[
    Math.abs([...id].reduce((value, char) => value + char.charCodeAt(0), 0)) %
      appTones.length
  ];
const capable = (value: any) =>
  ["BACKUPABLE", "BACKUPABLE_SHARED_WARNING"].includes(value?.capabilityStatus);
const pagePending = (page: any) =>
  Boolean(page?.loading || (!page?.loaded && !page?.error));

export function OverviewPage({ state, locale, timezone, navigate }: any) {
  const overview = state.overview || {};
  const storage = state.storage || overview.storage || {};
  const total =
    Number(storage.archiveBytes || 0) + Number(storage.availableBytes || 0);
  const percent = total
    ? Math.min(100, (Number(storage.archiveBytes || 0) / total) * 100)
    : 0;
  const activity = overview.recentActivity || state.audit.items || [];
  const applicationCount = Math.max(0, Number(overview.applicationCount) || 0);
  const protectionCounts = [
    {
      key: "protected",
      label: text(locale, "已保护", "Protected"),
      count: Math.max(0, Number(overview.protectedCount) || 0),
      tone: "good",
    },
    {
      key: "unprotected",
      label: text(locale, "待首次备份", "First backup pending"),
      count: Math.max(0, Number(overview.unprotectedCount) || 0),
      tone: "navy",
    },
    {
      key: "unsupported",
      label: text(locale, "数据库不支持", "Unsupported database"),
      count: Math.max(0, Number(overview.unsupportedCount) || 0),
      tone: "danger",
    },
    {
      key: "no-data",
      label: text(locale, "无应用数据", "No application data"),
      count: Math.max(0, Number(overview.noDataCount) || 0),
      tone: "faint",
    },
  ];
  const categorizedCount = protectionCounts.reduce(
    (sum, segment) => sum + segment.count,
    0,
  );
  if (applicationCount > categorizedCount) {
    protectionCounts.push({
      key: "other",
      label: text(locale, "其他状态", "Other status"),
      count: applicationCount - categorizedCount,
      tone: "amber",
    });
  }
  return (
    <div className="page">
      <PageHeader
        title={text(locale, "系统与保护概览", "System & protection overview")}
        desc={text(
          locale,
          "当前账号的应用、计划、任务和网盘信息均来自服务端。",
          "Application, plan, task, and storage information is read from the server for this account.",
        )}
        actions={
          <button
            className="button button-primary"
            onClick={() => navigate("applications")}
          >
            <Archive />
            {text(locale, "立即备份", "Back up now")}
          </button>
        }
      />
      <div className="kpi-grid">
        <Kpi
          label={text(locale, "可见应用", "Visible applications")}
          value={overview.applicationCount ?? 0}
          icon={<Layers3 />}
          tone="blue"
          note={`${overview.backupableCount ?? 0} ${text(locale, "个满足基础条件", "meet baseline requirements")}`}
        />
        <Kpi
          label={text(locale, "可备份应用", "Backupable applications")}
          value={overview.backupableCount ?? 0}
          icon={<FileCheck2 />}
          tone="green"
          note={`${overview.unprotectedCount ?? 0} ${text(locale, "个待首次备份", "await first backup")}`}
        />
        <Kpi
          label={text(locale, "已保护应用", "Protected applications")}
          value={`${overview.protectedCount ?? 0}/${overview.backupableCount ?? 0}`}
          icon={<ShieldCheck />}
          tone="green"
          note={text(locale, "当前备份覆盖", "Current backup coverage")}
        />
        <Kpi
          label={text(locale, "待首次备份", "First backup pending")}
          value={overview.unprotectedCount ?? 0}
          icon={<TimerReset />}
          tone="orange"
          note={text(locale, "仅计入可备份应用", "Backupable apps only")}
        />
        <Kpi
          label={text(locale, "不支持应用", "Unsupported applications")}
          value={overview.unsupportedCount ?? 0}
          icon={<Database />}
          tone="red"
          note={text(locale, "不会创建空快照", "No empty snapshots")}
        />
        <Kpi
          label={text(locale, "24 小时任务", "24-hour tasks")}
          value={`${overview.succeeded24h ?? 0} / ${overview.failed24h ?? 0}`}
          icon={<FileCheck2 />}
          tone="green"
          note={text(locale, "成功 / 失败", "Succeeded / failed")}
        />
        <Kpi
          label={text(locale, "运行中任务", "Running tasks")}
          value={overview.runningTasks ?? 0}
          icon={<ListChecks />}
          tone="navy"
          note={text(locale, "当前服务端执行", "Currently executing on server")}
        />
        <Kpi
          label={text(locale, "归档占用", "Archive storage")}
          value={bytes(storage.archiveBytes, locale)}
          icon={<HardDrive />}
          tone="orange"
          note={`${percent.toFixed(1)}%`}
        />
      </div>
      <div className="overview-grid">
        <div className="stack">
          <Panel
            title={text(locale, "保护概览", "Protection overview")}
            icon="apps"
            action={
              <button
                className="button button-quiet"
                onClick={() => navigate("applications")}
              >
                {text(locale, "查看全部", "View all")}
              </button>
            }
          >
            <div className="donut-layout">
              <ProtectionDonut
                total={applicationCount}
                segments={protectionCounts}
                locale={locale}
              />
            </div>
          </Panel>
          <Panel
            title={text(locale, "最近活动", "Recent activity")}
            icon="archive"
          >
            {activity.length ? (
              <div className="list">
                {activity.slice(0, 8).map((item: any) => (
                  <div className="activity-row" key={item.id}>
                    <span className="activity-line" />
                    <div>
                      <div className="activity-title">{item.action}</div>
                      <div className="activity-time">
                        {date(item.createdAt, locale, timezone)} ·{" "}
                        {item.entityType ||
                          text(locale, "当前账号", "Current account")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty label={text(locale, "暂无活动记录", "No activity yet")} />
            )}
          </Panel>
        </div>
        <div className="stack">
          <Panel
            title={text(
              locale,
              "未来 24 小时计划",
              "Plans in the next 24 hours",
            )}
            icon="archive"
            action={
              <button
                className="button button-quiet"
                onClick={() => navigate("plans")}
              >
                {text(locale, "查看全部", "View all")}
              </button>
            }
          >
            {(overview.nextPlans || state.plans)
              .slice(0, 6)
              .map((plan: any) => (
                <button
                  key={plan.id}
                  className="list-row"
                  onClick={() => navigate("plans")}
                  style={{
                    background: "transparent",
                    textAlign: "left",
                    width: "100%",
                  }}
                >
                  <div className="list-main">
                    <div className="list-title">{plan.name}</div>
                    <div className="list-meta mono">
                      {scheduleLabel(
                        plan.scheduleType,
                        plan.executionTime,
                        plan.cronExpression,
                        locale,
                      )} · {plan.targets?.length || 0} ·{" "}
                      {plan.timezone}
                    </div>
                  </div>
                  <StatusBadge
                    status={plan.enabled === false ? "PAUSED" : "ACTIVE"}
                    locale={locale}
                  />
                  <span className="small mono">
                    {date(plan.nextRunAt, locale, timezone)}
                  </span>
                </button>
              ))}
            {!(overview.nextPlans || state.plans).length && (
              <Empty
                label={text(locale, "暂无已启用计划", "No enabled plans")}
              />
            )}
          </Panel>
          <Panel
            title={text(locale, "风险提醒", "Risk reminders")}
            icon="archive"
            action={
              <button
                className="button button-quiet"
                onClick={() => navigate("alerts")}
              >
                {text(locale, "告警中心", "Alert center")}
              </button>
            }
          >
            {state.alerts.items
              .filter((item: any) => item.status === "OPEN")
              .slice(0, 5)
              .map((alert: any) => (
                <button
                  className="risk-row"
                  key={alert.id}
                  onClick={() => navigate("alerts")}
                  style={{
                    background: "transparent",
                    textAlign: "left",
                    width: "100%",
                  }}
                >
                  <span className="risk-mark tone-orange">
                    <Bell />
                  </span>
                  <div className="risk-copy">
                    <div className="list-title">{alert.title}</div>
                    <div className="list-meta">
                      {alert.referenceId ||
                        date(alert.createdAt, locale, timezone)}
                    </div>
                  </div>
                  <StatusBadge
                    status={alert.level === "INFO" ? "INFO" : alert.level}
                    locale={locale}
                  />
                </button>
              ))}
            {!state.alerts.items.some(
              (item: any) => item.status === "OPEN",
            ) && (
              <Empty
                label={text(locale, "当前没有待处理告警", "No open alerts")}
              />
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, icon, tone, note }: any) {
  return (
    <div className="kpi">
      <div>
        <div className="kpi-label">{label}</div>
        <div className="kpi-value">{value}</div>
        <div className="kpi-note">{note}</div>
      </div>
      <div className={`kpi-icon tone-${tone}`}>{icon}</div>
    </div>
  );
}

type ProtectionSegment = {
  key: string;
  label: string;
  count: number;
  tone: string;
};

function ProtectionDonut({
  total,
  segments,
  locale,
}: {
  total: number;
  segments: ProtectionSegment[];
  locale: string;
}) {
  const [hoveredKey, setHoveredKey] = useState<string>();
  const [selectedKey, setSelectedKey] = useState<string>();
  const visible = segments.filter((segment) => segment.count > 0);
  const chartTotal = visible.reduce((sum, segment) => sum + segment.count, 0);
  const paths = useMemo(() => {
    if (!chartTotal) return [];
    let offset = 0;
    return visible.map((segment) => {
      const fraction = segment.count / chartTotal;
      const start = offset;
      const end = offset + fraction;
      offset = end;
      return {
        ...segment,
        start,
        end,
        path: donutSegmentPath(start, end),
      };
    });
  }, [chartTotal, visible]);
  const activeKey = hoveredKey || selectedKey;
  const active = segments.find((segment) => segment.key === activeKey);
  const chartLabel = active
    ? `${active.label} · ${active.count}`
    : `${text(locale, "全部应用实例", "All application instances")} · ${total}`;
  const select = (key: string) => setSelectedKey((current) => (current === key ? undefined : key));
  const handleKeyDown = (
    event: ReactKeyboardEvent<SVGPathElement>,
    key: string,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select(key);
    }
  };
  return (
    <>
      <div className="donut-chart-wrap">
        <svg
          className="donut-svg"
          viewBox="0 0 160 160"
          role="group"
          aria-label={text(locale, "保护状态分布图", "Protection status distribution")}
        >
          <title>{chartLabel}</title>
          <circle className="donut-track" cx="80" cy="80" r="62" />
          {paths.map((segment) => {
            const activeSegment = activeKey === segment.key;
            return (
              <path
                key={segment.key}
                d={segment.path}
                fill={`var(--${segment.tone})`}
                className={`donut-segment ${activeSegment ? "active" : ""}`}
                tabIndex={0}
                role="button"
                aria-label={`${segment.label}: ${segment.count}`}
                aria-pressed={selectedKey === segment.key}
                onMouseEnter={() => setHoveredKey(segment.key)}
                onMouseLeave={() => setHoveredKey(undefined)}
                onFocus={() => setHoveredKey(segment.key)}
                onBlur={() => setHoveredKey(undefined)}
                onClick={() => select(segment.key)}
                onKeyDown={(event) => handleKeyDown(event, segment.key)}
              />
            );
          })}
          <text className="donut-number" x="80" y="77" textAnchor="middle">
            {active?.count ?? total}
          </text>
          <text className="donut-caption" x="80" y="96" textAnchor="middle">
            {active?.label ||
              (total
                ? text(locale, "应用实例", "instances")
                : text(locale, "暂无数据", "No data"))}
          </text>
        </svg>
      </div>
      <div className="legend">
        {segments.map((segment) => (
          <button
            type="button"
            className={`legend-row donut-legend-button ${activeKey === segment.key ? "active" : ""}`}
            key={segment.key}
            aria-pressed={selectedKey === segment.key}
            onMouseEnter={() => setHoveredKey(segment.key)}
            onMouseLeave={() => setHoveredKey(undefined)}
            onFocus={() => setHoveredKey(segment.key)}
            onBlur={() => setHoveredKey(undefined)}
            onClick={() => select(segment.key)}
          >
            <span className="legend-name">
              <span
                className="legend-dot"
                style={{ background: `var(--${segment.tone})` }}
              />
              {segment.label}
            </span>
            <strong>{segment.count}</strong>
          </button>
        ))}
      </div>
    </>
  );
}

function donutSegmentPath(startFraction: number, endFraction: number) {
  const outerRadius = 62;
  const innerRadius = 40;
  const center = 80;
  const fullTurn = Math.PI * 2;
  const span = Math.max(0, endFraction - startFraction) * fullTurn;
  const gap = Math.min(0.028, span * 0.2);
  const startAngle = startFraction * fullTurn - Math.PI / 2 + gap;
  const endAngle = endFraction * fullTurn - Math.PI / 2 - gap;
  const outerStart = pointOnCircle(center, outerRadius, startAngle);
  const outerEnd = pointOnCircle(center, outerRadius, endAngle);
  const innerEnd = pointOnCircle(center, innerRadius, endAngle);
  const innerStart = pointOnCircle(center, innerRadius, startAngle);
  const largeArc = span - gap * 2 > Math.PI ? 1 : 0;
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

function pointOnCircle(center: number, radius: number, angle: number) {
  return {
    x: center + radius * Math.cos(angle),
    y: center + radius * Math.sin(angle),
  };
}

export function ApplicationsPage({
  state,
  locale,
  timezone,
  setFilter,
  movePage,
  open,
  run,
  initialLoading,
}: any) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [tab, setTab] = useState("all");
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<number | undefined>(undefined);
  const page = state.applications;
  const syncing = state.sync?.state === "RUNNING";
  const applicationsLoading = initialLoading || syncing;
  useEffect(
    () => () => {
      if (noticeTimer.current !== undefined)
        window.clearTimeout(noticeTimer.current);
    },
    [],
  );
  const flash = (message: unknown) => {
    const content = toastMessage(message);
    if (!content) return;
    if (noticeTimer.current !== undefined)
      window.clearTimeout(noticeTimer.current);
    setNotice(content);
    noticeTimer.current = window.setTimeout(() => {
      setNotice("");
      noticeTimer.current = undefined;
    }, 3000);
  };
  const refreshApplications = async () => {
    const refreshed = await run(() => api.syncApplications());
    if (refreshed)
      flash(
        text(
          locale,
          "应用目录刷新已提交，正在同步…",
          "Application refresh started; syncing…",
        ),
      );
  };
  const submitSearch = (value: string) => {
    setQuery(value);
    window.clearTimeout((submitSearch as any).timer);
    (submitSearch as any).timer = window.setTimeout(
      () => setFilter("applications", { q: value }),
      350,
    );
  };
  const selectable = page.items.filter((app: any) => capable(app));
  const allSelected =
    selectable.length > 0 &&
    selectable.every((app: any) => selected.includes(app.deployId));
  const toggle = (deployId: string) =>
    setSelected((current) =>
      current.includes(deployId)
        ? current.filter((id) => id !== deployId)
        : [...current, deployId],
    );
  const runSelected = () =>
    run(async () => {
      const results = await Promise.allSettled(
        selected.map((deployId) => api.startBackup(deployId)),
      );
      const succeeded = results.filter(
        (result) => result.status === "fulfilled",
      ).length;
      window.alert(
        text(
          locale,
          `已提交 ${succeeded} 个实例；${results.length - succeeded} 个实例未能提交。`,
          `${succeeded} instance(s) submitted; ${results.length - succeeded} could not be submitted.`,
        ),
      );
      setSelected([]);
    });
  const reprobeSelected = () =>
    run(async () => {
      const results = await Promise.allSettled(
        selected.map((deployId) => api.probeInstance(deployId)),
      );
      const succeeded = results.filter(
        (result) => result.status === "fulfilled",
      ).length;
      flash(
        text(
          locale,
          `已提交 ${succeeded} 个重新检测，正在同步；${results.length - succeeded} 个实例未能提交。`,
          `${succeeded} re-probe request(s) submitted; syncing. ${results.length - succeeded} could not be submitted.`,
        ),
      );
      setSelected([]);
    });
  const reprobeOne = async (app: any) => {
    const submitted = await run(() => api.probeInstance(app.deployId));
    if (submitted)
      flash(
        text(
          locale,
          `已提交“${app.name}”的重新检测，正在同步…`,
          `Re-probe for “${app.name}” submitted; syncing…`,
        ),
      );
  };
  const chooseTab = (next: string) => {
    setTab(next);
    const filters: Record<string, string | undefined> = {
      capability_status: undefined,
      protection_status: undefined,
    };
    if (next === "backupable") filters.capability_status = "BACKUPABLE";
    if (next === "protected") filters.protection_status = "PROTECTED";
    if (next === "unprotected") filters.protection_status = "UNPROTECTED";
    if (next === "no-data") filters.capability_status = "NO_DATA";
    if (next === "unsupported")
      filters.capability_status = "UNSUPPORTED_DATABASE";
    if (next === "restricted") filters.capability_status = "SYSTEM_UNSUPPORTED";
    if (next === "reprobe") filters.capability_status = "PROBE_FAILED";
    void setFilter("applications", filters);
  };
  return (
    <div className="page">
      <PageHeader
        title={text(locale, "应用", "Applications")}
        desc={text(
          locale,
          "查看当前账号可访问的应用实例、数据特征与可备份状态。",
          "View application instances available to this account, their data characteristics, and backup eligibility.",
        )}
        actions={
          <>
            <button
              className="button button-secondary"
              onClick={() => void refreshApplications()}
            >
              <RefreshCw />
              {text(locale, "重新扫描全部", "Rescan all")}
            </button>
          </>
        }
      />
      <div className="tab-strip">
        {[
          ["all", text(locale, "全部", "All")],
          ["backupable", text(locale, "可备份", "Backupable")],
          ["protected", text(locale, "已保护", "Protected")],
          ["unprotected", text(locale, "未保护", "Unprotected")],
          ["no-data", text(locale, "无应用数据", "No data")],
          ["unsupported", text(locale, "数据库不支持", "Unsupported DB")],
          ["restricted", text(locale, "系统或权限受限", "Restricted")],
          ["reprobe", text(locale, "需要重新检测", "Re-probe needed")],
        ].map(([key, label]) => (
          <button
            className={`tab-button ${tab === key ? "active" : ""}`}
            key={key}
            onClick={() => chooseTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="filter-bar">
        <SearchField
          value={query}
          onChange={submitSearch}
          placeholder={text(
            locale,
            "搜索名称、appid 或 deploy ID",
            "Search name, appid, or deploy ID",
          )}
        />
        <select
          className="select"
          onChange={(event) =>
            setFilter("applications", { mode: event.target.value })
          }
        >
          <option value="">
            {text(locale, "部署模式 · 全部", "Mode · all")}
          </option>
          <option value="single">
            {text(locale, "单实例", "Single-instance")}
          </option>
          <option value="multi">
            {text(locale, "多实例", "Multi-instance")}
          </option>
        </select>
        <select
          className="select"
          onChange={(event) =>
            setFilter("applications", { capability_status: event.target.value })
          }
        >
          <option value="">
            {text(locale, "备份能力 · 全部", "Capability · all")}
          </option>
          <option value="BACKUPABLE">
            {text(locale, "可备份", "Backupable")}
          </option>
          <option value="NO_DATA">
            {text(locale, "无应用数据", "No application data")}
          </option>
          <option value="UNSUPPORTED_DATABASE">
            {text(locale, "数据库不支持", "Unsupported database")}
          </option>
        </select>
        <button
          className="button button-quiet"
          onClick={() => {
            setQuery("");
            setTab("all");
            void setFilter("applications", {
              q: undefined,
              mode: undefined,
              capability_status: undefined,
              protection_status: undefined,
            });
          }}
        >
          {text(locale, "清除筛选", "Clear filters")}
        </button>
      </div>
      {selected.length > 0 && (
        <div className="bulk-bar">
          <span>
            {text(
              locale,
              `已选择 ${selected.length} 个可备份实例`,
              `${selected.length} backupable instance(s) selected`,
            )}
          </span>
          <div className="bulk-actions">
            <button
              className="button button-quiet"
              onClick={() => setSelected([])}
            >
              {text(locale, "清除选择", "Clear selection")}
            </button>
            <button className="button button-primary" onClick={runSelected}>
              <Archive />
              {text(locale, "逐项立即备份", "Back up each")}
            </button>
            <button
              className="button button-secondary"
              onClick={() => open("plan", { initialDeployIds: selected })}
            >
              <Calendar />
              {text(locale, "批量创建计划", "Create plan")}
            </button>
            <button
              className="button button-secondary"
              onClick={reprobeSelected}
            >
              <RefreshCw />
              {text(locale, "批量重新检测", "Re-probe")}
            </button>
          </div>
        </div>
      )}
      <Panel className="table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label={text(
                      locale,
                      "选择当前页全部可备份实例",
                      "Select all backupable instances on this page",
                    )}
                    checked={allSelected}
                    onChange={() =>
                      setSelected(
                        allSelected
                          ? []
                          : selectable.map((app: any) => app.deployId),
                      )
                    }
                  />
                </th>
                <th>{text(locale, "应用", "Application")}</th>
                <th>{text(locale, "部署模式", "Mode")}</th>
                <th>{text(locale, "备份能力", "Capability")}</th>
                <th>{text(locale, "数据概览", "Data overview")}</th>
                <th>{text(locale, "数据库特征", "Database features")}</th>
                <th>{text(locale, "保护状态", "Protection")}</th>
                <th>{text(locale, "最近快照", "Latest snapshot")}</th>
                <th>{text(locale, "下次执行", "Next run")}</th>
                <th>
                  {text(locale, "操作", "Actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {page.items.length ? (
                page.items.map((app: any) => (
                  <tr key={app.deployId}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={text(
                          locale,
                          `选择 ${app.name}`,
                          `Select ${app.name}`,
                        )}
                        checked={selected.includes(app.deployId)}
                        disabled={!capable(app)}
                        onChange={() => toggle(app.deployId)}
                      />
                    </td>
                    <td>
                      <div className="app-cell">
                        <AppMark
                          app={app}
                          name={app.name}
                          tone={appTone(app.deployId)}
                        />
                        <div>
                          <div className="app-cell-name">{app.name}</div>
                          <div className="app-cell-meta mono">
                            {app.appid} · {app.version || "—"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <ModeBadge multi={app.multiInstance} />
                    </td>
                    <td>
                      <StatusBadge
                        status={app.capabilityStatus}
                        locale={locale}
                      />
                      {app.capabilityStatus === "PROBE_FAILED" &&
                        app.probeErrorCode && (
                          <div
                            className="small faint mono"
                            style={{ marginTop: 5 }}
                          >
                            {text(locale, "检测失败码：", "Probe error: ")}
                            {app.probeErrorCode}
                          </div>
                        )}
                    </td>
                    <td>
                      <div className="cell-stack">
                        <strong
                          className="mono"
                          style={{ color: "var(--text)" }}
                        >
                          {bytes(app.totalBytes, locale)}
                        </strong>
                        <span className="faint">
                          {app.fileCount} {text(locale, "文件", "files")}
                        </span>
                        {app.sqliteCount > 0 && (
                          <span className="faint">
                            {app.sqliteCount} SQLite 3
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <DatabaseFeatures
                        findings={app.databaseFindings}
                        locale={locale}
                      />
                    </td>
                    <td>
                      <StatusBadge
                        status={app.protectionStatus}
                        locale={locale}
                      />
                    </td>
                    <td className="mono">
                      {date(app.lastBackupAt, locale, timezone)}
                    </td>
                    <td className="mono">
                      {nextForDeploy(
                        state.plans,
                        app.deployId,
                        locale,
                        timezone,
                      )}
                    </td>
                    <td>
                      <div
                        className="actions-cell"
                        style={{ justifyContent: "flex-start" }}
                      >
                        <TableIconButton
                          label={text(locale, "立即备份", "Back up now")}
                          primary
                          disabled={!capable(app)}
                          onClick={() => open("backup", app)}
                        >
                          <Archive size={15} />
                        </TableIconButton>
                        <TableIconButton
                          label={text(locale, "创建计划", "Create plan")}
                          disabled={!capable(app)}
                          onClick={() =>
                            open("plan", {
                              initialDeployIds: [app.deployId],
                              fixedDeployId: app.deployId,
                            })
                          }
                        >
                          <Calendar size={15} />
                        </TableIconButton>
                        <TableIconButton
                          label={text(locale, "查看详情", "View details")}
                          onClick={() => open("app", app)}
                        >
                          <Eye size={15} />
                        </TableIconButton>
                        <TableIconButton
                          label={text(locale, "重新检测", "Re-probe")}
                          onClick={() => void reprobeOne(app)}
                        >
                          <RefreshCw size={15} />
                        </TableIconButton>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10}>
                    <Empty
                      label={
                        applicationsLoading
                          ? text(
                              locale,
                              "正在同步当前账号的应用目录…",
                              "Syncing applications for this account…",
                            )
                          : text(
                              locale,
                              "没有找到匹配的应用实例",
                              "No matching application instances",
                            )
                      }
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
      <Pager
        page={page}
        locale={locale}
        onMove={(direction) => movePage("applications", direction)}
        onLimit={(limit) => setFilter("applications", { limit: String(limit) })}
      />
      {notice && (
        <div className="toast" role="status" aria-live="polite">
          {notice}
        </div>
      )}
    </div>
  );
}

function nextForDeploy(
  plans: any[],
  deployId: string,
  locale: string,
  timezone: string,
) {
  const next = plans
    .filter(
      (plan) =>
        plan.enabled &&
        plan.targets?.some((target: any) => target.deployId === deployId),
    )
    .map((plan) => plan.nextRunAt)
    .filter(Boolean)
    .sort()[0];
  return date(next, locale, timezone);
}

function DatabaseFeatures({
  findings,
  locale,
}: {
  findings?: any[];
  locale: string;
}) {
  if (!findings?.length)
    return (
      <span className="faint">
        {text(locale, "未检测到数据库", "No database detected")}
      </span>
    );
  const sqlite = findings.filter(
    (finding) =>
      finding.supported &&
      String(finding.type || "").toLowerCase().includes("sqlite"),
  );
  const groups = Array.from(
    findings
      .filter((finding) => !sqlite.includes(finding))
      .reduce((result, finding) => {
        const type = (finding.type || "unknown").toLowerCase();
        const key = `${type}:${finding.supported ? "supported" : "blocked"}`;
        const current = result.get(key) || {
          type,
          supported: finding.supported,
          findings: [],
        };
        current.findings.push(finding);
        result.set(key, current);
        return result;
      }, new Map<string, { type: string; supported: boolean; findings: any[] }>())
      .values(),
  );
  return (
    <div className="cell-stack">
      {sqlite.length > 0 && (
        <span
          className="db-badge db-sqlite"
          title={sqlite.map((finding) => finding.path).join("\n")}
        >
          <Database size={12} />
          SQLite 3 · {sqlite.length}
        </span>
      )}
      {groups.slice(0, sqlite.length ? 1 : 2).map((group) => (
        <span
          className={`db-badge ${group.supported ? "db-plain" : "db-blocked"}`}
          key={`${group.type}-${group.supported ? "supported" : "blocked"}`}
          title={group.findings
            .map(
              (finding) =>
                `${finding.path}${finding.reason ? ` · ${finding.reason}` : ""}`,
            )
            .join("\n")}
        >
          <Database size={12} />
          {databaseTypeLabel(group.type, locale)}
          {group.findings.length > 1 ? ` · ${group.findings.length}` : ""}
          {group.supported
            ? ""
            : ` · ${text(locale, "不支持", "unsupported")}`}
        </span>
      ))}
      {groups.length > (sqlite.length ? 1 : 2) && (
        <span className="faint">
          +{groups.length - (sqlite.length ? 1 : 2)} {text(locale, "类", "types")}
        </span>
      )}
    </div>
  );
}

export function PlansPage({ state, locale, timezone, open }: any) {
  const apps = new Map(
    state.applications.items.map((app: any) => [app.deployId, app]),
  );
  const latest = state.batches.items;
  const failedBatchKey = useMemo(
    () =>
      latest
        .filter((batch: any) => batch.status === "FAILED" && batch.planId)
        .map((batch: any) => batch.id)
        .sort()
        .join(","),
    [latest],
  );
  const [failureReasons, setFailureReasons] = useState<
    Record<string, { codes: string[]; unavailable?: boolean }>
  >({});
  useEffect(() => {
    const batchIDs = failedBatchKey ? failedBatchKey.split(",") : [];
    let active = true;
    if (!batchIDs.length) {
      setFailureReasons({});
      return () => {
        active = false;
      };
    }
    setFailureReasons(
      Object.fromEntries(batchIDs.map((id) => [id, { codes: [] }])),
    );
    void Promise.all(
      batchIDs.map(async (batchID) => {
        try {
          const tasks = await api.tasks(
            new URLSearchParams([
              ["batch_id", batchID],
              ["limit", "200"],
            ]),
          );
          const codes = [
            ...new Set(
              (tasks.items || [])
                .filter(
                  (task: any) =>
                    ["FAILED", "TIMED_OUT", "CANCELLED", "INTERRUPTED"].includes(
                      task.status,
                    ) && task.errorCode,
                )
                .map((task: any) => task.errorCode),
            ),
          ];
          return [batchID, { codes }] as const;
        } catch {
          return [batchID, { codes: [], unavailable: true }] as const;
        }
      }),
    ).then((entries) => {
      if (active) setFailureReasons(Object.fromEntries(entries));
    });
    return () => {
      active = false;
    };
  }, [failedBatchKey]);
  return (
    <div className="page">
      <PageHeader
        title={text(locale, "备份计划", "Backup plans")}
        desc={text(
          locale,
          "计划目标以 deployId 保存；完整读取当前账号的计划集合。",
          "Plans store deployId targets and are read in full for this account.",
        )}
        actions={
          <button
            className="button button-primary"
            onClick={() => open("plan", undefined)}
          >
            <Plus />
            {text(locale, "新建计划", "New plan")}
          </button>
        }
      />
      <div className="plan-list">
        {state.plans.length ? (
          state.plans.map((plan: any) => {
            const result = latest.find(
              (batch: any) => batch.planId === plan.id,
            );
            const failure = result ? failureReasons[result.id] : undefined;
            return (
              <div className="plan-card" key={plan.id}>
                <div className="plan-top">
                  <div>
                    <div className="plan-title-line">
                      <span
                        className={`plan-dot ${plan.enabled ? "" : "paused"}`}
                      />
                      <div className="plan-name">{plan.name}</div>
                      <StatusBadge
                        status={plan.enabled ? "ACTIVE" : "PAUSED"}
                        locale={locale}
                      />
                    </div>
                    <div className="list-meta mono">
                      {plan.id} · {plan.timezone}
                    </div>
                  </div>
                  <div className="plan-actions">
                    <button
                      className="icon-button primary"
                      title={text(locale, "立即执行", "Run now")}
                      aria-label={text(locale, "立即执行", "Run now")}
                      onClick={() =>
                        open("confirm", {
                          action: "run",
                          title: text(locale, "确认立即执行", "Confirm run now"),
                          description: text(
                            locale,
                            "立即执行会创建一次备份批次，不会修改计划的执行频率。",
                            "Run now creates one backup batch and does not change the plan schedule.",
                          ),
                          confirmLabel: text(locale, "立即备份", "Back up now"),
                          operation: () => api.runPlan(plan.id),
                          success: text(
                            locale,
                            "已创建一次备份批次",
                            "Backup batch created",
                          ),
                          failure: text(
                            locale,
                            "备份批次创建失败，请稍后重试",
                            "The backup batch could not be created. Try again later.",
                          ),
                        })
                      }
                    >
                      <Play size={15} />
                    </button>
                    <button
                      className="icon-button"
                      title={
                        plan.enabled
                          ? text(locale, "暂停", "Pause")
                          : text(locale, "启用", "Enable")
                      }
                      aria-label={
                        plan.enabled
                          ? text(locale, "暂停", "Pause")
                          : text(locale, "启用", "Enable")
                      }
                      onClick={() =>
                        open("confirm", {
                          action: plan.enabled ? "pause" : "resume",
                          title: plan.enabled
                            ? text(locale, "确认暂停计划", "Confirm pause plan")
                            : text(locale, "确认恢复计划", "Confirm resume plan"),
                          description: plan.enabled
                            ? text(
                                locale,
                                "暂停只会停止后续计划调度，不会中断已经运行的备份任务。",
                                "Pausing only stops future scheduled runs. Backups already running will continue.",
                              )
                            : text(
                                locale,
                                "恢复后，计划会继续按当前频率创建后续备份任务。",
                                "Resuming lets the plan create future backup tasks on its current schedule.",
                              ),
                          confirmLabel: plan.enabled
                            ? text(locale, "确认暂停", "Pause plan")
                            : text(locale, "确认恢复", "Resume plan"),
                          operation: () =>
                            plan.enabled
                              ? api.pausePlan(plan.id)
                              : api.resumePlan(plan.id),
                          success: plan.enabled
                            ? text(
                                locale,
                                "计划已暂停，正在执行的任务不会受影响",
                                "Plan paused. Running backups were not interrupted.",
                              )
                            : text(locale, "计划已恢复", "Plan resumed"),
                          failure: text(
                            locale,
                            "计划状态更新失败，请稍后重试",
                            "The plan status could not be updated. Try again later.",
                          ),
                        })
                      }
                    >
                      {plan.enabled ? <Pause size={15} /> : <Play size={15} />}
                    </button>
                    <button
                      className="icon-button"
                      title={text(locale, "详情", "Details")}
                      aria-label={text(locale, "详情", "Details")}
                      onClick={() => open("plan-detail", plan)}
                    >
                      <Eye size={15} />
                    </button>
                    <button
                      className="icon-button"
                      title={text(locale, "编辑", "Edit")}
                      aria-label={text(locale, "编辑", "Edit")}
                      onClick={() => open("plan", plan)}
                    >
                      <SlidersHorizontal size={15} />
                    </button>
                  </div>
                </div>
                <div className="plan-summary">
                  <div>
                    <div className="summary-label">
                      {text(locale, "目标实例", "Target instances")}
                    </div>
                    <div className="target-tags">
                      {plan.targets?.map((target: any) => (
                        (() => {
                          const app = apps.get(target.deployId) || target;
                          const name =
                            app?.name ||
                            target.applicationName ||
                            target.deployId;
                          return (
                            <span className="target-tag" key={target.deployId}>
                              <AppMark
                                app={app}
                                name={name}
                                tone={appTone(target.deployId)}
                              />
                              {name}
                            </span>
                          );
                        })()
                      ))}
                    </div>
                  </div>
                  <Summary
                    label={text(locale, "执行频率", "Schedule")}
                    value={scheduleLabel(
                      plan.scheduleType,
                      plan.executionTime,
                      plan.cronExpression,
                      locale,
                    )}
                  />
                  <Summary
                    label={text(locale, "下次执行", "Next run")}
                    value={date(plan.nextRunAt, locale, timezone)}
                  />
                  <div>
                    <div className="summary-label">
                      {text(locale, "最近结果", "Latest result")}
                    </div>
                    {result ? (
                      <StatusBadge status={result.status} locale={locale} />
                    ) : (
                      <span className="small faint">—</span>
                    )}
                  </div>
                </div>
                {result?.status === "FAILED" && (
                  <div
                    className="callout callout-danger"
                    role="status"
                    style={{ marginTop: 14 }}
                  >
                    <div className="summary-label">
                      {text(locale, "失败原因", "Failure reason")}
                    </div>
                    {!failure
                      ? text(
                          locale,
                          "正在读取失败原因…",
                          "Loading failure reason…",
                        )
                      : failure.unavailable
                        ? text(
                            locale,
                            "暂时无法读取失败原因，请在任务中心查看详情。",
                            "The failure reason is temporarily unavailable. View task details in Task Center.",
                          )
                        : failure.codes.length
                          ? failure.codes
                              .map((code) => apiErrorLabel(code, locale))
                              .join(locale === "zh-CN" ? "；" : " · ")
                          : apiErrorLabel("BACKUP_FAILED", locale)}
                  </div>
                )}
                <div className="plan-history">
                  <span className="history-label">
                    {text(locale, "保留策略", "Retention")}
                  </span>
                  <span className="history-chip">
                    {text(locale, "保留最近", "Keep latest")}{" "}
                    {plan.retention?.keepLast}
                  </span>
                  <span className="history-chip">
                    {text(locale, "自动重试", "Retries")}{" "}
                    {plan.retry?.maxRetries}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <Panel>
            <Empty
              label={text(
                locale,
                "还没有备份计划",
                "There are no backup plans yet",
              )}
            />
          </Panel>
        )}
      </div>
    </div>
  );
}
function Summary({ label, value }: any) {
  return (
    <div>
      <div className="summary-label">{label}</div>
      <div className="summary-value mono">{value}</div>
    </div>
  );
}

export function TasksPage({
  state,
  locale,
  timezone,
  setFilter,
  movePage,
  open,
  run,
  navigate,
}: any) {
  const deployId =
    new URLSearchParams(window.location.search).get("deploy_id") || "";
  const [status, setStatus] = useState("");
  const taskPage = state.tasks;
  return (
    <div className="page">
      <PageHeader
        title={text(locale, "任务中心", "Task center")}
        desc={text(
          locale,
          "任务记录以服务端状态为准，可从这里追踪备份结果。",
          "Track backup results from server-backed task records.",
        )}
        actions={
          <>
            <span className="status-badge status-accent">
              {text(locale, "运行中", "Running")} {" "}
              {state.overview?.runningTasks ?? 0}
            </span>
            <span className="status-badge status-danger">
              {text(locale, "24 小时失败", "Failed in 24h")} {" "}
              {state.overview?.failed24h ?? 0}
            </span>
          </>
        }
      />
      <div className="stack">
        <div className="filter-bar">
          {deployId && (
            <button
              className="button button-secondary"
              onClick={() => {
                void setFilter("tasks", { deploy_id: undefined });
                navigate("tasks");
              }}
            >
              <ListChecks />
              {text(locale, "查看全部任务", "View all tasks")}
            </button>
          )}
          <select
            className="select"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setFilter("tasks", { status: event.target.value });
            }}
          >
            <option value="">
              {text(locale, "状态 · 全部", "Status · all")}
            </option>
            <option value="SUCCEEDED">
              {text(locale, "成功", "Succeeded")}
            </option>
            <option value="FAILED">{text(locale, "失败", "Failed")}</option>
          </select>
        </div>
        <TaskTable
          tasks={taskPage.items}
          applications={state.applications.items}
          loading={pagePending(taskPage)}
          locale={locale}
          timezone={timezone}
          open={open}
          run={run}
        />
        <Pager
          page={taskPage}
          locale={locale}
          onMove={(direction) => movePage("tasks", direction)}
          onLimit={(limit) => setFilter("tasks", { limit: String(limit) })}
        />
      </div>
    </div>
  );
}
function TaskTable({
  tasks,
  applications = [],
  loading = false,
  locale,
  timezone,
  open,
  run,
}: any) {
  const appMap = new Map(
    applications.map((app: any) => [app.deployId, app]),
  );
  return (
    <Panel className="table-panel">
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>
                {text(locale, "应用", "Application")}
              </th>
              <th>{text(locale, "状态", "Status")}</th>
              <th>{text(locale, "计划时间", "Scheduled")}</th>
              <th>{text(locale, "开始 / 结束", "Started / finished")}</th>
              <th>{text(locale, "尝试次数", "Attempts")}</th>
              <th>{text(locale, "错误", "Error")}</th>
              <th>
                {text(locale, "操作", "Actions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7}>
                  <Loading
                    label={text(locale, "正在读取任务记录…", "Loading task records…")}
                  />
                </td>
              </tr>
            ) : tasks.length ? (
              tasks.map((task: any) => (
                <tr key={task.id}>
                  <td>
                    <div className="app-cell">
                      <AppMark
                        app={appMap.get(task.deployId) || task}
                        name={task.applicationName || task.appid || task.deployId}
                        tone={appTone(task.deployId)}
                      />
                      <div className="cell-stack">
                        <strong>
                          {task.applicationName || task.appid || task.deployId}
                        </strong>
                        <span className="mono faint">{task.deployId}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <StatusBadge status={task.status} locale={locale} />
                  </td>
                  <td className="mono">
                    {date(task.scheduledAt, locale, timezone)}
                  </td>
                  <td className="mono">
                    {date(task.startedAt, locale, timezone)}
                    <br />
                    {date(task.finishedAt, locale, timezone)}
                  </td>
                  <td>
                    {task.attemptCount}/{task.maxRetries + 1}
                  </td>
                  <td className="faint">
                    {task.errorCode
                      ? apiErrorLabel(task.errorCode, locale)
                      : "—"}
                  </td>
                  <td>
                    <div
                      className="actions-cell"
                      style={{ justifyContent: "flex-start" }}
                    >
                      <TableIconButton
                        label={text(
                          locale,
                          "查看任务详情",
                          "View task details",
                        )}
                        onClick={() => open("task", task)}
                      >
                        <Eye size={15} />
                      </TableIconButton>
                      {[
                        "FAILED",
                        "TIMED_OUT",
                        "INTERRUPTED",
                        "CANCELLED",
                      ].includes(task.status) && (
                        <TableIconButton
                          label={text(locale, "重新尝试", "Retry")}
                          onClick={() => run(() => api.retryTask(task.id))}
                        >
                          <RefreshCw size={15} />
                        </TableIconButton>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7}>
                  <Empty
                    label={text(
                      locale,
                      "当前没有任务",
                      "There are no tasks right now",
                    )}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function BackupsPage({
  state,
  locale,
  timezone,
  movePage,
  setFilter,
  open,
}: any) {
  const page = state.backups;
  const applications = useMemo(
    () =>
      new Map(
        state.applications.items.map((app: any) => [app.deployId, app]),
      ),
    [state.applications.items],
  );
  return (
    <div className="page">
      <PageHeader
        title={text(locale, "备份库", "Backup library")}
        desc={text(
          locale,
          "仅显示当前账号已完成并登记的快照。",
          "Only completed snapshots registered for this account are shown.",
        )}
        actions={
          <span className="status-badge status-info">
            {text(locale, "只读浏览", "Read-only browsing")}
          </span>
        }
      />
      <Panel className="table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>{text(locale, "完成时间", "Finished")}</th>
                <th>{text(locale, "应用", "Application")}</th>
                <th>{text(locale, "部署模式", "Mode")}</th>
                <th>
                  {text(locale, "文件 / 原始大小", "Files / original size")}
                </th>
                <th>{text(locale, "ZIP", "ZIP")}</th>
                <th>SQLite</th>
                <th>{text(locale, "完整性", "Integrity")}</th>
                <th>{text(locale, "最近校验", "Last verified")}</th>
                <th>{text(locale, "保留情况", "Retention state")}</th>
                <th>{text(locale, "存储状态", "Storage status")}</th>
                <th>
                  {text(locale, "操作", "Actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {pagePending(page) ? (
                <tr>
                  <td colSpan={11}>
                    <Loading
                      label={text(
                        locale,
                        "正在读取备份库…",
                        "Loading backup library…",
                      )}
                    />
                  </td>
                </tr>
              ) : page.items.length ? (
                page.items.map((snapshot: any) => (
                  <tr key={snapshot.id}>
                    <td className="mono">
                      {date(snapshot.finishedAt, locale, timezone)}
                    </td>
                    <td>
                      <div className="app-cell">
                        <AppMark
                          app={applications.get(snapshot.deployId) || snapshot}
                          name={snapshot.applicationName || snapshot.appid || snapshot.deployId}
                          tone={appTone(snapshot.deployId)}
                        />
                        <div>
                          <div className="app-cell-name">
                            {snapshot.applicationName}
                          </div>
                          <div className="app-cell-meta mono">
                            {snapshot.appid} ·{" "}
                            {snapshot.applicationVersion || "—"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <ModeBadge
                        multi={snapshot.multiInstance}
                        locale={locale}
                      />
                    </td>
                    <td>
                      {snapshot.fileCount} /{" "}
                      {bytes(snapshot.originalBytes, locale)}
                    </td>
                    <td className="mono">
                      {bytes(snapshot.archiveSize, locale)}
                    </td>
                    <td>{snapshot.sqliteCount}</td>
                    <td>
                      <StatusBadge
                        status={snapshot.verificationStatus}
                        locale={locale}
                      />
                    </td>
                    <td className="mono">
                      {date(snapshot.verifiedAt, locale, timezone)}
                    </td>
                    <td>
                      <StatusBadge
                        status={snapshot.retentionStatus}
                        locale={locale}
                        label={
                          snapshot.retentionStatus === "ACTIVE"
                            ? text(locale, "保留中", "Retained")
                            : snapshot.retentionStatus === "TRASHED"
                              ? text(locale, "已移入回收站", "Moved to trash")
                              : undefined
                        }
                      />
                    </td>
                    <td>
                      <StatusBadge
                        status={snapshot.storageStatus || "AVAILABLE"}
                        locale={locale}
                      />
                    </td>
                    <td>
                      <div
                        className="actions-cell"
                        style={{ justifyContent: "flex-start" }}
                      >
                        <TableIconButton
                          label={text(
                            locale,
                            "查看快照详情",
                            "View snapshot details",
                          )}
                          onClick={() => open("snapshot", snapshot)}
                        >
                          <Eye size={15} />
                        </TableIconButton>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={12}>
                    <Empty
                      label={text(
                        locale,
                        "还没有已完成快照",
                        "There are no completed snapshots yet",
                      )}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
      <Pager
        page={page}
        locale={locale}
        onMove={(direction) => movePage("backups", direction)}
        onLimit={(limit) => setFilter("backups", { limit: String(limit) })}
      />
    </div>
  );
}

export function StoragePage({ state, locale, timezone, run }: any) {
  const storage = state.storage || {};
  const total =
    Number(storage.archiveBytes || 0) + Number(storage.availableBytes || 0);
  const percentage = total
    ? (Number(storage.archiveBytes || 0) / total) * 100
    : 0;
  return (
    <div className="page">
      <PageHeader
        title={text(locale, "存储", "Storage")}
        desc={text(
          locale,
          "查看当前账号网盘备份占用、临时目录与维护状态。",
          "View archive usage, partial directories, and maintenance state for this account.",
        )}
        actions={
          <button
            className="button button-secondary"
            onClick={() => run(() => api.scanStorage())}
          >
            <RefreshCw />
            {text(locale, "立即扫描", "Scan now")}
          </button>
        }
      />
      <Panel className="storage-card">
        <div className="storage-main">
          <div>
            <div className="eyebrow">MimiAppBakcup</div>
            <div className="storage-number">
              {bytes(storage.archiveBytes, locale)}{" "}
              <small>/ {bytes(total, locale)}</small>
            </div>
            <div className="small muted">
              {text(
                locale,
                "当前账号网盘归档",
                "Current-account drive archives",
              )}
            </div>
          </div>
        </div>
        <div className="capacity-track">
          <div className="capacity-fill" style={{ width: `${percentage}%` }} />
        </div>
        <div className="capacity-meta">
          <span>
            {text(locale, "已用", "Used")} {percentage.toFixed(1)}%
          </span>
          <span>
            {text(locale, "可用", "Available")}{" "}
            {bytes(storage.availableBytes, locale)}
          </span>
        </div>
        <div className="storage-stat-grid">
          <Mini
            label={text(locale, "快照数量", "Snapshots")}
            value={storage.snapshotCount || 0}
            note={text(locale, "有效归档", "Active archives")}
          />
          <Mini
            label={text(locale, "ZIP 总大小", "Total ZIP size")}
            value={bytes(storage.archiveBytes, locale)}
            note={text(locale, "服务端汇总", "Server total")}
          />
          <Mini
            label={text(locale, "临时写入", "Partial writes")}
            value={storage.partialCount || 0}
            note={text(locale, "尚未完成", "Not complete")}
          />
          <Mini
            label={text(locale, "最近校验", "Last verified")}
            value={date(storage.lastVerifiedAt, locale, timezone)}
            note={text(locale, "快照记录", "Snapshot record")}
          />
        </div>
      </Panel>
    </div>
  );
}
function Mini({ label, value, note }: any) {
  return (
    <div className="metric-mini">
      <div className="metric-mini-label">{label}</div>
      <div className="metric-mini-value">{value}</div>
      <div className="metric-mini-note">{note}</div>
    </div>
  );
}

export function AlertsPage({
  state,
  locale,
  timezone,
  setFilter,
  movePage,
  open,
  run,
}: any) {
  const [status, setStatus] = useState("");
  const alerts = state.alerts;
  const severity = (alert: any) =>
    alert.level === "INFO"
      ? "INFO"
      : alert.level === "WARNING"
        ? "WARNING"
        : alert.level === "EMERGENCY"
          ? "EMERGENCY"
          : "CRITICAL";
  const viewReference = (alert: any) =>
    run(async () => {
      if (alert.referenceType === "task" && alert.referenceId) {
        const detail = await api.task(alert.referenceId);
        open("task", detail.task);
        return;
      }
      if (alert.referenceType === "snapshot" && alert.referenceId) {
        open("snapshot", await api.backup(alert.referenceId));
        return;
      }
      if (alert.referenceType === "application" && alert.referenceId) {
        open("app", await api.instance(alert.referenceId));
        return;
      }
      open("alert", alert);
    });
  return (
    <div className="page">
      <PageHeader
        title={text(locale, "告警", "Alerts")}
        desc={text(
          locale,
          "处理权限、任务、数据库和存储相关异常。",
          "Resolve permission, task, database, and storage exceptions.",
        )}
        actions={
          <>
            <select
              className="select"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setFilter("alerts", { status: event.target.value });
              }}
            >
              <option value="">
                {text(locale, "状态 · 全部", "Status · all")}
              </option>
              <option value="OPEN">{text(locale, "待处理", "Open")}</option>
              <option value="MUTED">{text(locale, "已静默", "Muted")}</option>
              <option value="RESOLVED">
                {text(locale, "已处理", "Resolved")}
              </option>
            </select>
            <button
              className="button button-secondary"
              onClick={() =>
                void Promise.all(
                  alerts.items
                    .filter((alert: any) => alert.status === "OPEN")
                    .map((alert: any) => run(() => api.readAlert(alert.id))),
                )
              }
            >
              <Check />
              {text(locale, "全部标记为已读", "Mark all read")}
            </button>
          </>
        }
      />
      <div className="stack">
        {pagePending(alerts) ? (
          <Panel>
            <Loading
              label={text(locale, "正在读取告警…", "Loading alerts…")}
            />
          </Panel>
        ) : alerts.items.length ? (
          alerts.items.map((alert: any) => (
            <Panel key={alert.id}>
              <div
                className="panel-body"
                style={{ display: "flex", gap: 13, alignItems: "flex-start" }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                  }}
                >
                  <StatusBadge
                    status="INFO"
                    locale={locale}
                    label={text(locale, "告警", "Alert")}
                  />
                  <StatusBadge status={severity(alert)} locale={locale} />
                  {!alert.readAt && <span className="status-dot" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="list-title">{alert.title}</div>
                  <div className="list-meta">
                    {alert.type} · {date(alert.createdAt, locale, timezone)}
                  </div>
                  <p
                    className="small muted"
                    style={{ lineHeight: 1.6, margin: "9px 0" }}
                  >
                    {alert.message}
                  </p>
                  <div className="callout callout-info">
                    <strong>
                      {text(locale, "修复建议：", "Recommendation: ")}
                    </strong>
                    {text(
                      locale,
                      "请查看关联对象、处理权限或重新检测后再次确认。",
                      "Review the linked resource, resolve the permission issue, or re-probe before confirming.",
                    )}
                  </div>
                  <div
                    className="header-actions"
                    style={{ justifyContent: "flex-start", marginTop: 12 }}
                  >
                    <button
                      className="button button-secondary"
                      onClick={() => viewReference(alert)}
                    >
                      <Eye />
                      {text(locale, "查看关联对象", "View linked item")}
                    </button>
                    <button
                      className="button button-quiet"
                      onClick={() => run(() => api.readAlert(alert.id))}
                    >
                      <Check />
                      {text(locale, "标记已读", "Mark read")}
                    </button>
                    {alert.status !== "RESOLVED" && (
                      <button
                        className="button button-quiet"
                        onClick={() => run(() => api.muteAlert(alert.id))}
                      >
                        <Bell />
                        {text(locale, "临时静默", "Mute temporarily")}
                      </button>
                    )}
                    {alert.referenceType === "task" && alert.referenceId && (
                      <button
                        className="button button-quiet"
                        onClick={() =>
                          run(() => api.retryTask(alert.referenceId))
                        }
                      >
                        <RefreshCw />
                        {text(locale, "立即重试", "Retry now")}
                      </button>
                    )}
                    {alert.status !== "RESOLVED" && (
                      <button
                        className="button button-quiet"
                        onClick={() => run(() => api.resolveAlert(alert.id))}
                      >
                        <Check />
                        {text(locale, "标记已处理", "Resolve")}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </Panel>
          ))
        ) : (
          <Panel>
            <Empty
              label={text(locale, "没有匹配记录", "No matching records")}
            />
          </Panel>
        )}
      </div>
      <Pager
        page={alerts}
        locale={locale}
        onMove={(direction) => movePage("alerts", direction)}
        onLimit={(limit) => setFilter("alerts", { limit: String(limit) })}
      />
    </div>
  );
}

export function SettingsPage({
  state,
  locale,
  setLocale,
  run,
  movePage,
  setFilter,
}: any) {
  const [item, setItem] = useState("account");
  const [draft, setDraft] = useState<any>(state.settings);
  const [notice, setNotice] = useState("");
  const [browserPermission, setBrowserPermission] =
    useState<BrowserNotificationPermission>(browserNotificationPermission);
  const noticeTimer = useRef<number | undefined>(undefined);
  const values = draft || state.settings;
  useEffect(() => {
    if (!state.settings) return;
    setDraft((current: any) =>
      current && current.updatedAt === state.settings.updatedAt
        ? current
        : state.settings,
    );
  }, [state.settings]);
  useEffect(
    () => () => {
      if (noticeTimer.current !== undefined)
        window.clearTimeout(noticeTimer.current);
    },
    [],
  );
  if (!values)
    return (
      <div className="page">
        <PageHeader title={text(locale, "设置", "Settings")} desc="" />
        <Empty label={text(locale, "正在读取设置", "Loading settings")} />
      </div>
    );
  const flash = (message: unknown) => {
    const content = toastMessage(message);
    if (!content) return;
    if (noticeTimer.current !== undefined)
      window.clearTimeout(noticeTimer.current);
    setNotice(content);
    noticeTimer.current = window.setTimeout(() => {
      setNotice("");
      noticeTimer.current = undefined;
    }, 3000);
  };
  const save = async (
    next: any,
    message = text(locale, "设置已自动保存", "Settings saved automatically"),
  ) => {
    setDraft(next);
    if (
      await run(() =>
        api.updateSettings({ ...next, updatedAt: values.updatedAt }),
      )
    )
      flash(message);
  };
  const update = (patch: any, message?: string) =>
    void save({ ...values, ...patch }, message);
  const updateRetry = (maxRetries: number) =>
    update({ retry: { ...values.retry, maxRetries } });
  const enableBrowserNotifications = async () => {
    const permission = await requestBrowserNotificationPermission();
    setBrowserPermission(permission);
    if (permission === "granted") {
      flash(text(locale, "浏览器通知已启用", "Browser notifications enabled"));
      return;
    }
    if (permission === "denied") {
      flash(
        text(
          locale,
          "浏览器已阻止通知，请在浏览器站点设置中允许。",
          "Notifications are blocked. Allow them in this browser's site settings.",
        ),
      );
      return;
    }
    flash(
      text(
        locale,
        "当前页面无法请求浏览器通知。",
        "Browser notifications are unavailable on this page.",
      ),
    );
  };
  const menu = [
    {
      key: "personal",
      title: text(locale, "个人", "Personal"),
      items: [
        {
          key: "account",
          label: text(locale, "账户与登录", "Account & sign-in"),
          icon: User,
        },
        {
          key: "appearance",
          label: text(locale, "外观", "Appearance"),
          icon: Sparkles,
        },
      ],
    },
    {
      key: "preference",
      title: text(locale, "备份偏好", "Backup preferences"),
      items: [
        {
          key: "backupPref",
          label: text(locale, "备份偏好", "Backup preferences"),
          icon: SlidersHorizontal,
        },
        {
          key: "notification",
          label: text(locale, "通知", "Notifications"),
          icon: Bell,
        },
      ],
    },
    {
      key: "maintenance",
      title: text(locale, "维护与记录", "Maintenance & records"),
      items: [
        {
          key: "audit",
          label: text(locale, "维护与审计", "Maintenance & audit"),
          icon: FileCheck2,
        },
        {
          key: "environment",
          label: text(locale, "权限与环境", "Permissions & environment"),
          icon: ShieldCheck,
        },
      ],
    },
  ];
  const pick = (nextItem: string) => setItem(nextItem);
  const renderedDetail = () => {
    if (item === "account")
      return (
        <>
          <div className="section-heading">
            <div>
              <h3>
                {text(locale, "当前 OIDC 登录身份", "Current OIDC identity")}
              </h3>
              <p>
                {text(
                  locale,
                  "会话与当前懒猫入口账户绑定，应用与快照仅属于当前 UID。",
                  "The session is bound to the current Lazycat entrance account; applications and snapshots belong only to the current UID.",
                )}
              </p>
            </div>
            <StatusBadge
              status="ACTIVE"
              locale={locale}
              label={text(locale, "会话有效", "Session active")}
            />
          </div>
          <div className="detail-grid">
            <Detail
              label={text(locale, "显示名称", "Display name")}
              value={state.session?.displayName}
            />
            <Detail
              label={text(locale, "角色", "Role")}
              value={state.session?.role}
            />
            <Detail label="UID" value={state.session?.uid} mono />
            <Detail
              label={text(locale, "会话到期", "Session expiry")}
              value={date(state.session?.expiresAt, locale, values.timezone)}
              mono
            />
            <Detail
              label={text(locale, "身份一致性", "Identity match")}
              value={text(locale, "已验证", "Verified")}
            />
          </div>
          <div
            className="header-actions"
            style={{ justifyContent: "flex-start", marginTop: 18 }}
          >
            <button
              className="button button-secondary"
              onClick={() =>
                window.location.assign(
                  `/auth/login?return_to=${encodeURIComponent(window.location.pathname)}`,
                )
              }
            >
              <LogIn />
              {text(locale, "重新登录", "Sign in again")}
            </button>
            <button
              className="button button-quiet"
              onClick={() =>
                void api
                  .logout()
                  .finally(() => window.location.assign("/auth/login"))
              }
            >
              <LogOut />
              {text(locale, "退出登录", "Sign out")}
            </button>
          </div>
        </>
      );
    if (item === "appearance")
      return (
        <>
          <div className="section-heading">
            <div>
              <h3>
                {text(locale, "语言与区域外观", "Language & regional display")}
              </h3>
              <p>
                {text(
                  locale,
                  "语言与时区修改后立即保存，并影响页面时间展示与目录名。",
                  "Language and time-zone changes are saved immediately and affect displayed times and directory names.",
                )}
              </p>
            </div>
          </div>
          <div className="form-grid">
            <div className="form-field">
              <label className="form-label">
                {text(locale, "页面语言", "Display language")}
              </label>
              <select
                className="select"
                value={values.locale}
                onChange={(event) => {
                  const next = event.target.value;
                  setLocale(next);
                  update(
                    { locale: next },
                    next === "zh-CN"
                      ? "已切换为简体中文"
                      : "Language changed to English",
                  );
                }}
              >
                <option value="zh-CN">简体中文 · zh-CN</option>
                <option value="en-US">English · en-US</option>
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">
                {text(locale, "默认时区", "Default time zone")}
              </label>
              <select
                className="select"
                value={values.timezone}
                onChange={(event) =>
                  update(
                    { timezone: event.target.value },
                    text(locale, "时区设置已保存", "Time zone saved"),
                  )
                }
              >
                <option>Asia/Shanghai</option>
                <option>UTC</option>
                <option>America/New_York</option>
                <option>Europe/London</option>
              </select>
              <div className="form-help">
                {text(
                  locale,
                  "目录时间示例：yyyy-MM-dd_HH-mm-ss.SSS_Asia-Shanghai",
                  "Directory timestamp: yyyy-MM-dd_HH-mm-ss.SSS_Asia-Shanghai",
                )}
              </div>
            </div>
          </div>
        </>
      );
    if (item === "backupPref")
      return (
        <>
          <div className="section-heading">
            <div>
              <h3>
                {text(locale, "全局备份偏好", "Global backup preferences")}
              </h3>
              <p>
                {text(
                  locale,
                  "仅作为新建计划的默认值，单次立即备份始终使用完整备份。",
                  "These values are defaults for new plans; immediate backups always use full backup.",
                )}
              </p>
            </div>
          </div>
          <div className="stack">
            <SettingToggle
              title={text(locale, "错过窗口后自动补跑", "Catch up missed runs")}
              desc={text(
                locale,
                "应用重启后恢复调度器，按计划补跑规则处理错过的批次。",
                "After restart, restore scheduling and apply the plan catch-up policy.",
              )}
              checked={values.catchUp}
              onChange={() => update({ catchUp: !values.catchUp })}
            />
            <SettingToggle
              title={text(locale, "失败后自动重试", "Retry after failure")}
              desc={text(
                locale,
                "最多 3 次，使用退避间隔，不改变备份范围。",
                "Up to three attempts with backoff; the backup scope does not change.",
              )}
              checked={values.retry.maxRetries > 0}
              onChange={() => updateRetry(values.retry.maxRetries > 0 ? 0 : 2)}
            />
            <div className="detail-grid">
              <Detail
                label={text(locale, "默认备份时间", "Default backup time")}
                value={`02:00 · ${values.timezone}`}
                mono
              />
              <Detail
                label={text(locale, "自动重试次数", "Automatic retries")}
                value={values.retry.maxRetries}
              />
            </div>
          </div>
        </>
      );
    if (item === "notification")
      return (
        <>
          <div className="section-heading">
            <div>
              <h3>{text(locale, "通知规则", "Notification rules")}</h3>
              <p>
                {text(
                  locale,
                  "任务终态会发送懒猫平台消息；浏览器通知还需要在当前浏览器中单独授权。未授权时仍保留站内告警。",
                  "Task results send Lazycat platform messages. Browser notifications also need permission in this browser; in-app alerts remain available without it.",
                )}
              </p>
            </div>
          </div>
          <div className="stack">
            <SettingToggle
              title={text(locale, "首次失败", "First failure")}
              desc={text(
                locale,
                "每个计划首次失败时向懒猫消息中心和已授权浏览器通知",
                "Notify Lazycat messages and authorized browsers on the first failure of each plan",
              )}
              checked={values.notifyFirstFailure}
              onChange={() =>
                update({ notifyFirstFailure: !values.notifyFirstFailure })
              }
            />
            <SettingToggle
              title={text(locale, "成功通知", "Success notification")}
              desc={text(
                locale,
                "每次成功完成时向懒猫消息中心和已授权浏览器通知",
                "Notify Lazycat messages and authorized browsers on every successful completion",
              )}
              checked={values.notifySuccess}
              onChange={() => update({ notifySuccess: !values.notifySuccess })}
            />
            <div className="toggle-row">
              <div className="toggle-copy">
                <div className="toggle-title">
                  {text(locale, "浏览器通知", "Browser notifications")}
                </div>
                <div className="toggle-desc">
                  {text(
                    locale,
                    "授权后，页面保持打开且浏览器运行时，成功和失败终态会显示系统级横幅；关闭页面后无法接收。",
                    "When authorized, terminal success and failure results show system-level notifications while this page remains open and the browser is running.",
                  )}
                </div>
              </div>
              <button
                className="button button-secondary"
                disabled={browserPermission !== "default"}
                onClick={() => void enableBrowserNotifications()}
              >
                {browserPermission === "granted"
                  ? text(locale, "已授权", "Authorized")
                  : browserPermission === "denied"
                    ? text(locale, "已被浏览器阻止", "Blocked by browser")
                    : browserPermission === "unsupported"
                      ? text(locale, "当前浏览器不支持", "Unsupported")
                      : text(locale, "授权浏览器通知", "Allow browser notifications")}
              </button>
            </div>
          </div>
        </>
      );
    if (item === "audit")
      return (
        <>
          <div className="section-heading">
            <div>
              <h3>
                {text(locale, "维护与审计记录", "Maintenance & audit records")}
              </h3>
              <p>
                {text(
                  locale,
                  "只读页面，不提供清理、删除、回收站或未接入引擎参数。",
                  "Read-only. It does not offer cleanup, deletion, trash, or unavailable engine parameters.",
                )}
              </p>
            </div>
            <span className="status-badge status-neutral">
              <Lock size={12} />
              {text(locale, "只读", "Read-only")}
            </span>
          </div>
          <div className="detail-grid">
            <Detail
              label={text(locale, "网盘备份根目录", "Drive backup root")}
              value="MimiAppBakcup/"
              mono
            />
            <Detail
              label={text(locale, "临时目录", "Temporary directory")}
              value="MimiAppBakcup/_partial/"
              mono
            />
            <Detail
              label={text(locale, "最近审计记录", "Latest audit record")}
              value={date(
                state.audit.items?.[0]?.createdAt,
                locale,
                values.timezone,
              )}
              mono
            />
          </div>
          <div className="section-heading">
            <div>
              <h3>{text(locale, "最近审计记录", "Recent audit records")}</h3>
            </div>
          </div>
          <div className="list">
            {state.audit.items?.length ? (
              state.audit.items.map((entry: any) => (
                <div className="list-row" key={entry.id}>
                  <div className="list-main">
                    <div className="list-title">{entry.action}</div>
                    <div className="list-meta mono">
                      {date(entry.createdAt, locale, values.timezone)} ·{" "}
                      {entry.entityType} / {entry.entityId}
                    </div>
                  </div>
                  <StatusBadge
                    status="ACTIVE"
                    locale={locale}
                    label={text(locale, "已记录", "Recorded")}
                  />
                </div>
              ))
            ) : (
              <Empty label={text(locale, "暂无审计记录", "No audit records")} />
            )}
          </div>
          <Pager
            page={state.audit}
            locale={locale}
            onMove={(direction) => movePage("audit", direction)}
            onLimit={(limit) => setFilter("audit", { limit: String(limit) })}
          />
        </>
      );
    return (
      <>
        <div className="section-heading">
          <div>
            <h3>
              {text(locale, "权限与环境状态", "Permissions & environment")}
            </h3>
            <p>
              {text(
                locale,
                "当前账号的运行环境投影和后台运行状态。",
                "Runtime projection and background state for the current account.",
              )}
            </p>
          </div>
        </div>
        <div className="list">
          {[
            { label: "appvar.other.read · 只读投影", optional: false },
            { label: "document.write · 当前用户网盘", optional: false },
            { label: "user.notify · 系统通知（可选）", optional: true },
            { label: "appvar 投影 · 当前账号数据目录可读", optional: false },
          ].map(({ label, optional }) => (
            <div className="list-row" key={label}>
              <Lock color="var(--navy)" size={16} />
              <div className="list-main">
                <div className="list-title mono">{label}</div>
              </div>
              <StatusBadge
                status="ACTIVE"
                locale={locale}
                label={
                  optional
                    ? text(locale, "可选", "Optional")
                    : text(locale, "已授权", "Granted")
                }
              />
            </div>
          ))}
        </div>
        <div className="detail-grid" style={{ marginTop: 16 }}>
          <Detail
            label={text(
              locale,
              "当前用户应用数量",
              "Current-account applications",
            )}
            value={
              state.overview?.applicationCount ||
              state.applications.items.length
            }
          />
          <Detail
            label={text(locale, "后台运行", "Background execution")}
            value={text(locale, "正常运行", "Running normally")}
          />
          <Detail
            label={text(locale, "当前租户", "Current tenant")}
            value={state.session?.tenantUid}
            mono
          />
        </div>
      </>
    );
  };
  return (
    <div className="page">
      <PageHeader
        title={text(locale, "设置", "Settings")}
        desc={text(
          locale,
          "管理个人身份、备份偏好、通知与运行环境。",
          "Manage identity, backup preferences, notifications, and runtime environment.",
        )}
      />
      <div className="settings-layout">
        <aside
          className="settings-menu"
          aria-label={text(locale, "设置菜单", "Settings menu")}
        >
          {menu.map((group) => (
            <div key={group.key}>
              <div className="settings-section">{group.title}</div>
              {group.items.map((entry) => {
                const Icon = entry.icon;
                return (
                  <button
                    key={entry.key}
                    className={`settings-item ${item === entry.key ? "active" : ""}`}
                    onClick={() => pick(entry.key)}
                  >
                    <Icon />
                    {entry.label}
                  </button>
                );
              })}
            </div>
          ))}
        </aside>
        <section className="settings-content">
          <Panel>
            <div className="panel-body">{renderedDetail()}</div>
          </Panel>
        </section>
      </div>
      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}

function SettingToggle({
  title,
  desc,
  checked,
  onChange,
}: {
  title: string;
  desc: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="toggle-row">
      <div className="toggle-copy">
        <div className="toggle-title">{title}</div>
        <div className="toggle-desc">{desc}</div>
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
function Detail({ label, value, mono = false }: any) {
  return (
    <div className="detail-item">
      <div className="detail-label">{label}</div>
      <div className={`detail-value ${mono ? "mono" : ""}`}>{value || "—"}</div>
    </div>
  );
}
