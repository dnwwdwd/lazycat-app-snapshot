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
    PAUSED: "Paused",
  };
  return (locale === "zh-CN" ? zh : en)[status] || status || "—";
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
      ) : ["WARNING", "OPEN", "BACKUPABLE_SHARED_WARNING", "PAUSED"].includes(
          status || "",
        ) ? (
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
    IDENTITY_MISMATCH: "当前登录会话与懒猫账号不一致，请重新登录。",
    SESSION_REQUIRED: "登录会话已失效，请重新登录。",
    RESOURCE_NOT_FOUND: "当前账号下未找到所需资源。",
    INVALID_CURSOR: "列表分页状态已失效，请重新加载。",
    INVALID_LIMIT: "每页数量必须在 1 到 200 之间。",
    APPLICATION_CATALOG_UNAVAILABLE: "应用目录暂时不可用，请稍后重新检测。",
    BACKUP_ALREADY_RUNNING: "该实例已有正在进行的备份。",
    INSTANCE_NOT_BACKUPABLE: "当前探测结果不允许创建备份。",
    BACKUP_QUEUE_FULL: "备份队列暂时繁忙，请稍后重试。",
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
    BACKUP_QUEUE_FULL: "The backup queue is busy. Try again later.",
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
  return (locale === "zh-CN" ? zh : en)[code] || code;
}
function applicationIcon(icon?: string) {
  const value = icon?.trim();
  if (!value) return undefined;
  if (/^data:image\/(?:avif|gif|jpe?g|png|svg\+xml|webp);/i.test(value))
    return value;
  try {
    const candidate = new URL(value, window.location.origin);
    return ["http:", "https:"].includes(candidate.protocol)
      ? candidate.href
      : undefined;
  } catch {
    return undefined;
  }
}
export function AppMark({
  app,
  name = "?",
  tone = "blue",
}: {
  app?: { icon?: string; name?: string };
  name?: string;
  tone?: string;
}) {
  const label = app?.name || name;
  const icon = applicationIcon(app?.icon);
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
        <div className="eyebrow">MIMI APP BACKUP · V1</div>
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
export function Loading() {
  return (
    <div className="empty">
      <LoaderCircle className="spin" />
      正在读取当前账号的数据…
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
      className={`icon-button ${primary ? "primary" : ""}`}
      style={{ width: 28, height: 28 }}
      title={label}
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
  page: { history: string[]; nextCursor?: string; limit?: number };
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
        disabled={!page.history.length}
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
        disabled={!page.nextCursor}
        onClick={() => onMove("next")}
      >
        {locale === "zh-CN" ? "下一页" : "Next"}
        <ChevronRight />
      </button>
    </div>
  );
}
