import { useState, type ReactNode } from "react";
import {
  Archive,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Database,
  Folder,
  Info,
  Layers3,
  LoaderCircle,
  Lock,
  Search,
  XCircle,
} from "lucide-react";

export function cn(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(" ");
}
export function toastMessage(value: unknown) {
  const message = typeof value === "string" ? value.trim() : "";
  return ["zh-CN", "en-US"].includes(message) ? "" : message;
}
export function bytes(value?: number, locale = "zh-CN") {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: index > 1 ? 1 : 0 }).format(value / 1024 ** index)} ${units[index]}`;
}
export function date(
  value?: string,
  locale = "zh-CN",
  timezone = "Asia/Shanghai",
) {
  return value
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: timezone,
      }).format(new Date(value))
    : "—";
}
export function statusTone(status = "") {
  if (
    [
      "BACKUPABLE",
      "PROTECTED",
      "SUCCEEDED",
      "SUCCEEDED_WITH_WARNINGS",
      "VERIFIED",
      "RESOLVED",
      "AVAILABLE",
      "ACTIVE",
    ].includes(status)
  )
    return "status-good";
  if (
    [
      "BACKUPABLE_SHARED_WARNING",
      "UNPROTECTED",
      "WARNING",
      "OPEN",
      "MUTED",
      "SYSTEM_UNSUPPORTED",
    ].includes(status)
  )
    return "status-warning";
  if (
    [
      "FAILED",
      "TIMED_OUT",
      "CANCELLED",
      "INTERRUPTED",
      "UNSUPPORTED_DATABASE",
      "CRITICAL",
      "EMERGENCY",
      "MISSING",
      "INACCESSIBLE",
      "TRASHED",
    ].includes(status)
  )
    return "status-danger";
  if (
    [
      "LEASED",
      "PRECHECKING",
      "SCANNING",
      "SQLITE_SNAPSHOT",
      "ZIP_WRITING",
      "VERIFYING",
      "COMMITTING",
      "RUNNING",
    ].includes(status)
  )
    return "status-accent";
  return "status-neutral";
}
export function statusLabel(status = "", locale = "zh-CN") {
  const zh: Record<string, string> = {
    BACKUPABLE: "可备份",
    BACKUPABLE_SHARED_WARNING: "可备份 · 共享风险",
    PROTECTED: "已保护",
    UNPROTECTED: "待首次备份",
    NO_DATA: "无应用数据",
    UNSUPPORTED_DATABASE: "数据库不支持",
    SYSTEM_UNSUPPORTED: "系统或权限受限",
    SOURCE_NOT_READY: "源未就绪",
    PROBE_FAILED: "需要重新检测",
    QUEUED: "排队中",
    LEASED: "执行中",
    PRECHECKING: "预检中",
    SCANNING: "扫描中",
    SQLITE_SNAPSHOT: "创建 SQLite 快照",
    ZIP_WRITING: "写入归档",
    VERIFYING: "校验中",
    COMMITTING: "提交中",
    SUCCEEDED: "成功",
    SUCCEEDED_WITH_WARNINGS: "成功但有警告",
    FAILED: "失败",
    CANCELLED: "已取消",
    TIMED_OUT: "已超时",
    SKIPPED: "已跳过",
    INTERRUPTED: "已中断",
    OPEN: "待处理",
    MUTED: "已静默",
    RESOLVED: "已处理",
    INFO: "提示",
    WARNING: "警告",
    CRITICAL: "严重",
    EMERGENCY: "紧急",
    VERIFIED: "已校验",
    AVAILABLE: "目录可访问",
    MISSING: "目录已删除",
    INACCESSIBLE: "目录不可访问",
    ACTIVE: "已启用",
    TRASHED: "已移入回收站",
    PAUSED: "已暂停",
  };
  const en: Record<string, string> = {
    BACKUPABLE: "Backupable",
    BACKUPABLE_SHARED_WARNING: "Backupable · shared-data risk",
    PROTECTED: "Protected",
    UNPROTECTED: "First backup pending",
    NO_DATA: "No application data",
    UNSUPPORTED_DATABASE: "Unsupported database",
    SYSTEM_UNSUPPORTED: "System or permission restricted",
    SOURCE_NOT_READY: "Source not ready",
    PROBE_FAILED: "Re-probe needed",
    QUEUED: "Queued",
    LEASED: "Running",
    PRECHECKING: "Prechecking",
    SCANNING: "Scanning",
    SQLITE_SNAPSHOT: "SQLite snapshot",
    ZIP_WRITING: "Writing archive",
    VERIFYING: "Verifying",
    COMMITTING: "Committing",
    SUCCEEDED: "Succeeded",
    SUCCEEDED_WITH_WARNINGS: "Succeeded with warnings",
    FAILED: "Failed",
    CANCELLED: "Cancelled",
    TIMED_OUT: "Timed out",
    SKIPPED: "Skipped",
    INTERRUPTED: "Interrupted",
    OPEN: "Open",
    MUTED: "Muted",
    RESOLVED: "Resolved",
    INFO: "Info",
    WARNING: "Warning",
    CRITICAL: "Critical",
    EMERGENCY: "Emergency",
    VERIFIED: "Verified",
    AVAILABLE: "Directory available",
    MISSING: "Directory deleted",
    INACCESSIBLE: "Directory unavailable",
    ACTIVE: "Enabled",
    TRASHED: "Moved to trash",
    PAUSED: "Paused",
  };
  return (locale === "zh-CN" ? zh : en)[status] || status || "—";
}
export function databaseTypeLabel(type = "", locale = "zh-CN") {
  const raw = String(type || "");
  const value = raw.toLowerCase();
  const labels: Record<string, [string, string]> = {
    sqlite: ["SQLite 3", "SQLite 3"],
    unknown: ["未知数据库", "Unknown database"],
    mysql: ["MySQL", "MySQL"],
    mariadb: ["MariaDB", "MariaDB"],
    postgresql: ["PostgreSQL", "PostgreSQL"],
    mongodb: ["MongoDB", "MongoDB"],
    redis: ["Redis", "Redis"],
  };
  return labels[value]?.[locale === "zh-CN" ? 0 : 1] || raw || "—";
}
export function scheduleLabel(
  scheduleType = "",
  executionTime = "",
  cronExpression = "",
  locale = "zh-CN",
) {
  const time = executionTime ? ` · ${executionTime}` : "";
  switch (String(scheduleType).toUpperCase()) {
    case "MANUAL":
      return locale === "zh-CN" ? "手动执行" : "Manual";
    case "HOURLY":
      return locale === "zh-CN" ? "每小时" : "Hourly";
    case "DAILY":
      return `${locale === "zh-CN" ? "每天" : "Daily"}${time}`;
    case "WEEKLY":
      return `${locale === "zh-CN" ? "每周一" : "Every Monday"}${time}`;
    case "CRON":
      return `${locale === "zh-CN" ? "自定义 Cron" : "Custom Cron"}${
        cronExpression ? ` · ${cronExpression}` : ""
      }`;
    default:
      return [scheduleType, executionTime || cronExpression]
        .filter(Boolean)
        .join(" · ") || "—";
  }
}
export function BrandLogo({ small = false }: { small?: boolean }) {
  return (
    <img
      className="brand-image"
      src="/lzc-icon.png"
      alt="Lazycat"
      style={small ? { width: 30, height: 30, borderRadius: 9 } : undefined}
    />
  );
}
export function StatusBadge({
  status,
  locale,
  label,
}: {
  status?: string;
  locale?: string;
  label?: string;
}) {
  return (
    <span className={cn("status-badge", statusTone(status))}>
      {[
        "FAILED",
        "CRITICAL",
        "EMERGENCY",
        "UNSUPPORTED_DATABASE",
        "TIMED_OUT",
        "CANCELLED",
        "INTERRUPTED",
      ].includes(status || "") ? (
        <XCircle />
      ) : [
          "WARNING",
          "OPEN",
          "BACKUPABLE_SHARED_WARNING",
          "PAUSED",
          "SYSTEM_UNSUPPORTED",
        ].includes(status || "") ? (
        <CircleAlert />
      ) : status === "NO_DATA" ? (
        <Info />
      ) : (
        <CheckCircle2 />
      )}
      {label || statusLabel(status, locale)}
    </span>
  );
}
export function ModeBadge({
  multi,
  locale,
}: {
  multi?: boolean;
  locale?: string;
}) {
  const language = locale || document.documentElement.lang || "zh-CN";
  return (
    <span className={cn("mode-badge", multi ? "mode-multi" : "mode-single")}>
      {multi ? <Lock size={12} /> : <CircleAlert size={12} />}
      {multi
        ? language === "zh-CN"
          ? "用户隔离 · 多实例"
          : "User-isolated · multi-instance"
        : language === "zh-CN"
          ? "单实例"
          : "Single-instance"}
    </span>
  );
}
export function apiErrorLabel(code = "REQUEST_FAILED", locale = "zh-CN") {
  const zh: Record<string, string> = {
    REQUEST_FAILED: "请求未完成，请稍后重试。",
    REQUEST_TIMEOUT: "请求等待超时，请重新加载。",
    SYNC_START_FAILED: "应用目录同步未能启动，请稍后重试。",
    IDENTITY_MISMATCH: "当前登录会话与懒猫账号不一致，请重新登录。",
    SESSION_REQUIRED: "登录会话已失效，请重新登录。",
    RESOURCE_NOT_FOUND: "当前账号下未找到所需资源。",
    INVALID_CURSOR: "列表分页状态已失效，请重新加载。",
    INVALID_LIMIT: "每页数量必须在 1 到 200 之间。",
    APPLICATION_CATALOG_UNAVAILABLE: "应用目录暂时不可用，请稍后重新检测。",
    BACKUP_ALREADY_RUNNING: "该实例已有正在进行的备份。",
    INSTANCE_NOT_BACKUPABLE: "当前探测结果不允许创建备份。",
    INSTANCE_ALREADY_QUEUED: "该实例已在备份队列中。",
    SHARED_INSTANCE_CONFIRMATION_REQUIRED:
      "该单实例可能包含共享数据，需要确认风险后才能备份。",
    NO_APPLICATION_DATA: "目标应用当前没有可备份的数据。",
    UNSUPPORTED_DATABASE: "检测到当前版本不支持的数据库，备份已停止。",
    BACKUP_PRECHECK_FAILED: "备份预检未通过，请重新检测目标应用。",
    SQLITE_SOURCE_LOCKED:
      "目标应用持续占用 SQLite；请暂停目标应用后重新执行备份。",
    SQLITE_SNAPSHOT_FAILED:
      "无法创建一致的 SQLite 快照，请检查目标应用后重试。",
    SOURCE_FILE_CHANGED: "源文件在备份过程中发生变化，请稍后重试。",
    SOURCE_READ_FAILED: "读取目标应用数据失败，请检查应用状态和权限。",
    SOURCE_PERMISSION_DENIED: "没有读取目标应用数据的权限。",
    SOURCE_PROJECTION_UNAVAILABLE:
      "无法访问目标应用的数据投影，请检查平台权限和应用状态。",
    RUNTIME_APPVAR_PROJECTION_NOT_VISIBLE:
      "当前环境没有显示目标应用的数据投影。",
    SOURCE_INSTANCE_NOT_FOUND: "未找到目标应用实例的数据目录。",
    SOURCE_NOT_READY: "目标应用数据尚未准备完成，请稍后重试。",
    SOURCE_OWNER_MISMATCH: "目标应用数据不属于当前可访问范围。",
    SOURCE_MAPPING_AMBIGUOUS: "无法确定目标应用的数据目录，请重新检测。",
    SOURCE_ENTRY_LIMIT_EXCEEDED:
      "目标应用的数据目录过大，当前版本无法安全扫描。",
    PROBE_FAILED: "目标应用检测未完成，请稍后重新检测。",
    BACKUP_SCOPE_PATH_MISSING:
      "所选备份范围已变更或不存在，请检查计划范围。",
    INVALID_BACKUP_SCOPE: "备份范围无效，请重新选择文件或目录。",
    CORE_SCOPE_PROFILE_UNAVAILABLE: "核心备份范围暂不可用，请重新选择范围。",
    PLAN_PAUSED_SCOPE_INVALID:
      "计划已暂停：所选备份范围已失效，请修正范围后再启用。",
    SCOPE_REVISION_SUPERSEDED:
      "计划范围已更新，未执行的旧任务已取消。",
    BACKUP_QUEUE_FULL: "备份队列暂时繁忙，请稍后重试。",
    QUEUE_PERSIST_FAILED: "备份任务无法写入队列，请稍后重试。",
    WORKER_INTERRUPTED: "备份服务重启或中断，任务将重新排队。",
    MANUAL_RETRY: "任务已加入手动重试队列。",
    TASK_CANCELLED: "任务已取消。",
    BACKUP_CANCELLED: "备份已取消。",
    BACKUP_TIMED_OUT: "备份超过允许时间，已停止。",
    BACKUP_INTERRUPTED: "备份服务中断，备份未能完成。",
    BACKUP_FAILED: "备份未能完成，请稍后重试。",
    BACKUP_CACHE_UNAVAILABLE:
      "备份临时目录不可用，请检查应用存储空间后重试。",
    CONTROL_DATABASE_WRITE_FAILED: "备份记录保存失败，请稍后重试。",
    ARCHIVE_PATH_UNSAFE: "归档路径不符合安全规则，任务已停止。",
    ARCHIVE_WRITE_FAILED: "归档文件写入失败，请检查存储空间后重试。",
    ARCHIVE_DIGEST_FAILED: "归档校验摘要生成失败，请稍后重试。",
    MANIFEST_WRITE_FAILED: "备份清单写入失败，请稍后重试。",
    SNAPSHOT_VERIFICATION_FAILED: "生成的快照未通过校验。",
    STORAGE_WRITE_FAILED: "写入备份存储失败，请检查网盘状态后重试。",
    STORAGE_COMMIT_FAILED: "提交备份到网盘失败，请稍后重试。",
    SETTINGS_LOOKUP_FAILED: "无法读取备份设置，请稍后重试。",
    INVALID_PLAN_NAME: "计划名称无效。",
    INVALID_PLAN_TARGETS: "请选择当前账号下可备份的应用实例。",
    INVALID_SCHEDULE: "执行频率无效。",
    INVALID_CRON: "Cron 表达式无效。",
    INVALID_TIMEZONE: "时区无效。",
    INVALID_SETTINGS: "设置内容无效，请检查后重新保存。",
    INVALID_ALERT_STATUS: "告警状态无效。",
    PHASE4_SERVICE_UNAVAILABLE: "计划与备份库服务暂时不可用。",
    PHASE5_SERVICE_UNAVAILABLE: "运营服务暂时不可用。",
    EVENT_STREAM_UNAVAILABLE: "当前服务不支持实时状态更新。",
  };
  const en: Record<string, string> = {
    REQUEST_FAILED: "The request did not complete. Please try again.",
    REQUEST_TIMEOUT: "The request timed out. Reload the page.",
    SYNC_START_FAILED: "Application sync could not start. Please try again.",
    IDENTITY_MISMATCH:
      "The signed-in identity does not match this application instance. Sign in again.",
    SESSION_REQUIRED: "Your sign-in session has expired. Sign in again.",
    RESOURCE_NOT_FOUND:
      "The requested resource was not found for this account.",
    INVALID_CURSOR: "The list cursor is no longer valid. Reload the page.",
    INVALID_LIMIT: "The page size must be between 1 and 200.",
    APPLICATION_CATALOG_UNAVAILABLE:
      "The application catalog is temporarily unavailable. Try rescanning later.",
    BACKUP_ALREADY_RUNNING: "This instance already has a backup in progress.",
    INSTANCE_NOT_BACKUPABLE:
      "The current probe result does not allow a backup.",
    INSTANCE_ALREADY_QUEUED: "This instance is already in the backup queue.",
    SHARED_INSTANCE_CONFIRMATION_REQUIRED:
      "This single-instance application may contain shared data. Confirm the risk before backing it up.",
    NO_APPLICATION_DATA: "The target application has no data to back up.",
    UNSUPPORTED_DATABASE:
      "A database unsupported by this version was detected, so the backup was stopped.",
    BACKUP_PRECHECK_FAILED:
      "The backup precheck did not pass. Rescan the target application.",
    SQLITE_SOURCE_LOCKED:
      "The target application is continuously locking SQLite. Pause it, then run the backup again.",
    SQLITE_SNAPSHOT_FAILED:
      "A consistent SQLite snapshot could not be created. Check the target application and try again.",
    SOURCE_FILE_CHANGED:
      "A source file changed while it was being backed up. Try again later.",
    SOURCE_READ_FAILED:
      "The target application data could not be read. Check its state and permissions.",
    SOURCE_PERMISSION_DENIED:
      "This account does not have permission to read the target application data.",
    SOURCE_PROJECTION_UNAVAILABLE:
      "The target application data projection is unavailable. Check platform permissions and the application state.",
    RUNTIME_APPVAR_PROJECTION_NOT_VISIBLE:
      "The target application data projection is not visible in this environment.",
    SOURCE_INSTANCE_NOT_FOUND:
      "The target application instance data directory was not found.",
    SOURCE_NOT_READY: "The target application data is not ready yet. Try again later.",
    SOURCE_OWNER_MISMATCH:
      "The target application data is outside the current accessible scope.",
    SOURCE_MAPPING_AMBIGUOUS:
      "The target application data directory could not be determined. Rescan the application.",
    SOURCE_ENTRY_LIMIT_EXCEEDED:
      "The target application data directory is too large for this version to scan safely.",
    PROBE_FAILED: "The target application check did not complete. Try rescanning later.",
    BACKUP_SCOPE_PATH_MISSING:
      "The selected backup scope changed or no longer exists. Check the plan scope.",
    INVALID_BACKUP_SCOPE:
      "The backup scope is invalid. Select the files or directories again.",
    CORE_SCOPE_PROFILE_UNAVAILABLE:
      "The core backup scope is unavailable. Select the scope again.",
    PLAN_PAUSED_SCOPE_INVALID:
      "The plan was paused because its selected backup scope is no longer valid. Fix the scope, then enable it again.",
    SCOPE_REVISION_SUPERSEDED:
      "The plan scope was updated, so pending tasks from the previous scope were cancelled.",
    BACKUP_QUEUE_FULL: "The backup queue is busy. Try again later.",
    QUEUE_PERSIST_FAILED: "The backup task could not be added to the queue. Try again later.",
    WORKER_INTERRUPTED:
      "The backup worker restarted or was interrupted. The task will be queued again.",
    MANUAL_RETRY: "The task has been queued for a manual retry.",
    TASK_CANCELLED: "The task was cancelled.",
    BACKUP_CANCELLED: "The backup was cancelled.",
    BACKUP_TIMED_OUT: "The backup exceeded its allowed time and was stopped.",
    BACKUP_INTERRUPTED: "The backup service was interrupted before the backup completed.",
    BACKUP_FAILED: "The backup did not complete. Try again later.",
    BACKUP_CACHE_UNAVAILABLE:
      "The backup temporary directory is unavailable. Check application storage space and try again.",
    CONTROL_DATABASE_WRITE_FAILED:
      "The backup record could not be saved. Try again later.",
    ARCHIVE_PATH_UNSAFE: "An archive path did not meet safety rules, so the task was stopped.",
    ARCHIVE_WRITE_FAILED:
      "The archive could not be written. Check available storage and try again.",
    ARCHIVE_DIGEST_FAILED: "The archive checksum could not be created. Try again later.",
    MANIFEST_WRITE_FAILED: "The backup manifest could not be written. Try again later.",
    SNAPSHOT_VERIFICATION_FAILED: "The created snapshot did not pass verification.",
    STORAGE_WRITE_FAILED:
      "The backup could not be written to storage. Check cloud-drive status and try again.",
    STORAGE_COMMIT_FAILED:
      "The backup could not be committed to the cloud drive. Try again later.",
    SETTINGS_LOOKUP_FAILED: "Backup settings could not be read. Try again later.",
    INVALID_PLAN_NAME: "The plan name is invalid.",
    INVALID_PLAN_TARGETS: "Choose a backupable instance from this account.",
    INVALID_SCHEDULE: "The schedule is invalid.",
    INVALID_CRON: "The Cron expression is invalid.",
    INVALID_TIMEZONE: "The time zone is invalid.",
    INVALID_SETTINGS: "The settings are invalid. Review them and save again.",
    INVALID_ALERT_STATUS: "The alert status is invalid.",
    PHASE4_SERVICE_UNAVAILABLE:
      "Plans and backup-library services are temporarily unavailable.",
    PHASE5_SERVICE_UNAVAILABLE:
      "Operations services are temporarily unavailable.",
    EVENT_STREAM_UNAVAILABLE: "Live updates are unavailable on this server.",
  };
  return (locale === "zh-CN" ? zh : en)[code] ||
    (locale === "zh-CN"
      ? "备份任务未能完成，请查看任务详情后重试。"
      : "The backup task did not complete. Review the task details, then try again.");
}
function applicationIcon(icon?: string, appid?: string) {
  const value = icon?.trim();
  const fallback = appid?.trim() ? systemIconURL(appid.trim()) : undefined;
  if (!value) return fallback;
  if (/^data:image\/(?:avif|gif|jpe?g|png|svg\+xml|webp);/i.test(value))
    return value;
  if (!/^(?:https?:)?\/\//i.test(value) && !value.startsWith("/"))
    return fallback;
  try {
    const candidate = new URL(value, window.location.origin);
    if (
      candidate.protocol === "http:" &&
      window.location.protocol === "https:"
    )
      return fallback;
    return ["http:", "https:"].includes(candidate.protocol)
      ? candidate.href
      : fallback;
  } catch {
    return fallback;
  }
}

function systemIconURL(appid: string) {
  const host = window.location.hostname;
  const labels = host.split(".").filter(Boolean);
  const boxIndex = labels.indexOf("box");
  const boxHost =
    boxIndex >= 0
      ? labels.slice(boxIndex).join(".")
      : labels.length > 2
        ? labels.slice(1).join(".")
        : host;
  return `${window.location.protocol}//${boxHost}/sys/icons/${encodeURIComponent(appid)}.png`;
}
export function AppMark({
  app,
  name = "?",
  tone = "blue",
}: {
  app?: { icon?: string; name?: string; appid?: string };
  name?: string;
  tone?: string;
}) {
  const label = app?.name || name;
  const icon = applicationIcon(app?.icon, app?.appid);
  const [failedIcon, setFailedIcon] = useState("");
  if (icon && failedIcon !== icon)
    return (
      <img
        className="app-mark"
        src={icon}
        alt={`${label} icon`}
        referrerPolicy="no-referrer"
        onError={() => setFailedIcon(icon)}
        style={{ objectFit: "cover" }}
      />
    );
  return (
    <span className={cn("app-mark", `mark-${tone}`)}>
      {label.slice(0, 1).toUpperCase()}
    </span>
  );
}
export function PageHeader({
  title,
  desc,
  actions,
}: {
  title: string;
  desc: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        <p className="page-desc">{desc}</p>
      </div>
      {actions && <div className="header-actions">{actions}</div>}
    </div>
  );
}
export function Panel({
  title,
  icon,
  children,
  action,
  className = "",
}: {
  title?: string;
  icon?: "archive" | "apps" | "folder";
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const Icon =
    icon === "archive" ? Archive : icon === "apps" ? Layers3 : Folder;
  return (
    <section className={cn("panel", className)}>
      {title && (
        <div className="panel-head">
          <div className="panel-title">
            <Icon />
            {title}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Empty({ label }: { label: string }) {
  return (
    <div
      className="empty"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Archive />
      <div>{label}</div>
    </div>
  );
}
export function Loading({ label = "正在读取当前账号的数据…" }: { label?: string }) {
  return (
    <div className="empty" role="status" aria-live="polite">
      <LoaderCircle className="spin" />
      <div>{label}</div>
    </div>
  );
}
export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="search-field">
      <Search />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
export function TableIconButton({
  label,
  children,
  primary = false,
  disabled = false,
  onClick,
}: {
  label: string;
  children: ReactNode;
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`icon-button table-icon-button ${primary ? "primary" : ""}`}
      style={{ width: 28, height: 28 }}
      title={label}
      data-tooltip={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
export function Pager({
  page,
  onMove,
  locale,
  onLimit,
}: {
  page: {
    history: string[];
    nextCursor?: string;
    limit?: number;
    loading?: boolean;
  };
  onMove: (direction: "previous" | "next") => void;
  locale: string;
  onLimit?: (limit: number) => void;
}) {
  return (
    <div className="header-actions" style={{ marginTop: 14 }}>
      <label className="small faint">
        {locale === "zh-CN" ? "每页" : "Rows"}{" "}
        <select
          className="select"
          value={page.limit || 15}
          disabled={page.loading}
          onChange={(event) => onLimit?.(Number(event.target.value))}
        >
          <option value={15}>15</option>
          <option value={30}>30</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
      </label>
      <button
        className="button button-secondary"
        disabled={page.loading || !page.history.length}
        onClick={() => onMove("previous")}
      >
        <ChevronLeft />
        {locale === "zh-CN" ? "上一页" : "Previous"}
      </button>
      <span className="small faint">
        {locale === "zh-CN"
          ? `第 ${page.history.length + 1} 页`
          : `Page ${page.history.length + 1}`}
      </span>
      <button
        className="button button-secondary"
        disabled={page.loading || !page.nextCursor}
        onClick={() => onMove("next")}
      >
        {locale === "zh-CN" ? "下一页" : "Next"}
        <ChevronRight />
      </button>
    </div>
  );
}
