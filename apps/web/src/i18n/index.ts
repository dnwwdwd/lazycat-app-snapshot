export type Locale = "zh-CN" | "en-US";

const dictionaries = {
  "zh-CN": {
    appName: "咪咪应用备份",
    overview: "概览", applications: "应用", plans: "备份计划", tasks: "任务中心", backups: "备份库", storage: "存储", alerts: "告警", settings: "设置", setup: "首次使用向导",
    workspace: "工作台", assets: "资产", preferences: "偏好",
    refresh: "刷新", save: "保存", cancel: "取消", close: "关闭", delete: "删除", edit: "编辑", create: "新建", runNow: "立即执行", pause: "暂停", resume: "启用", retry: "重试", resolve: "确认已处理", mute: "静默 1 小时", markRead: "标记已读", export: "导出", verify: "快速校验", fullVerify: "完整校验", scan: "立即扫描", cleanup: "清理", signOut: "退出登录", signIn: "重新登录",
    loading: "正在读取当前账号的数据…", empty: "暂无数据", failed: "操作未完成", sessionExpired: "登录会话已失效，请重新登录。", identityMismatch: "当前登录会话与懒猫账号不一致。",
    protected: "正常保护", unprotected: "待首次备份", backupable: "可备份", sharedWarning: "可备份 · 共享风险", noData: "无应用数据", unsupported: "数据库不支持", failedStatus: "失败", success: "成功", queued: "排队中", running: "运行中", paused: "已暂停", resolved: "已处理", muted: "已静默", open: "待处理",
    currentTenant: "当前账号", safeScope: "所有数据均限定在当前用户的应用实例和网盘目录中。", setupTitle: "开始保护你的应用数据", setupCopy: "支持普通文件和 SQLite 一致性快照。备份只写入当前账号网盘，不提供直接恢复。", setupAction: "扫描当前应用", setupStepIdentity: "OIDC 身份", setupStepPermissions: "权限与运行时投影", setupStepScan: "应用扫描", setupStepBackup: "首次备份",
    overviewTitle: "当前保护状态", overviewCopy: "以下统计由当前用户的持久化控制库汇总。", discovered: "已发现应用", backupableCount: "可备份实例", protectedCount: "已保护实例", unprotectedCount: "待首次备份", task24: "最近 24 小时任务", queuedTasks: "排队 / 运行", storageUsed: "ZIP 占用", nextPlans: "下一批计划", activity: "最近活动", risks: "风险提醒", noAlerts: "当前没有未读告警",
    applicationTitle: "应用资产柜", applicationCopy: "仅显示当前登录用户可见的应用实例。", searchApps: "搜索应用、appid 或 deploy ID", all: "全部", single: "单实例", multi: "多实例", details: "查看详情", probe: "重新检测", backupNow: "立即备份", sharedRisk: "共享实例风险", sharedRiskCopy: "该应用使用单实例运行，目录可能含有共享数据。备份范围以平台开放给本账号的目录为准。", acceptRisk: "我已了解共享实例风险", dataSize: "数据大小", fileCount: "文件数量", sqliteCount: "SQLite", lastBackup: "最近快照", database: "数据库检测", noApplications: "没有找到匹配的应用实例。",
    planTitle: "备份计划", planCopy: "计划、批次和下次运行时间来自当前用户的持久化控制库。", newPlan: "新建计划", name: "计划名称", targets: "目标实例", allBackupable: "未来新增的可备份应用", schedule: "执行频率", manual: "仅手动", hourly: "每小时", daily: "每天", weekly: "每周", cron: "Cron", timezone: "时区", catchUp: "错过后补跑", retention: "保留策略", keepLast: "最近保留", keepDaily: "每日保留", keepWeekly: "每周保留", keepMonthly: "每月保留", trashGrace: "回收站宽限期（小时）", retries: "自动重试", backoff: "重试间隔（秒）", saveAndRun: "保存并立即执行", planWizardCopy: "配置目标、计划时间、保留与重试策略。单实例必须确认风险。", planCreated: "计划已保存", planUpdated: "计划已更新",
    taskTitle: "任务中心", taskCopy: "状态、租约和重试记录均来自服务端持久化队列。", batches: "备份批次", history: "任务历史", attempts: "重试记录", taskDetail: "任务详情", batchDetail: "批次详情", status: "状态", plan: "计划", application: "应用", instance: "实例", started: "开始时间", finished: "完成时间", scheduledAt: "计划时间", error: "错误", progress: "进度", noTasks: "当前没有任务。",
    backupTitle: "备份库", backupCopy: "只显示当前账号已完成并登记的 ZIP 快照。", snapshot: "快照", capturedAt: "捕获时间", archiveSize: "ZIP 大小", integrity: "完整性", files: "文件索引", exportDone: "导出完成", trash: "移入回收站", noBackups: "还没有已完成快照。",
    storageTitle: "存储维护", storageCopy: "仅维护当前用户 LazycatAppBackup 目录下的快照、临时目录和回收站。", snapshots: "快照", availableStorage: "可用空间", partial: "部分写入", trashCount: "回收站", verificationIssues: "校验异常", lastVerified: "最近校验",
    alertsTitle: "告警", alertsCopy: "告警只关联当前账号的应用、任务、批次或快照。", allAlerts: "全部", openAlerts: "待处理", resolvedAlerts: "已处理", mutedAlerts: "已静默", alertType: "类型", createdAt: "发生时间", noAlertsList: "当前筛选下没有告警。",
    settingsTitle: "设置", settingsCopy: "这里只提供已由服务端使用或能安全展示的当前账号默认值。", language: "页面语言", localeZh: "简体中文", localeEn: "English", notification: "站内通知偏好", notifyFailure: "首次失败提醒", notifySuccess: "成功提醒", account: "账户与登录", identityVerified: "OIDC、入口 Header 与应用 tenant 已校验", environment: "权限与环境", readonly: "应用层只读（兼容投影）", audit: "审计活动", auditCopy: "记录当前账号的计划、任务、存储和设置操作。", settingsSaved: "设置已保存",
  },
  "en-US": {
    appName: "Mimi App Backup",
    overview: "Overview", applications: "Applications", plans: "Backup Plans", tasks: "Task Center", backups: "Backup Library", storage: "Storage", alerts: "Alerts", settings: "Settings", setup: "Setup",
    workspace: "WORKSPACE", assets: "ASSETS", preferences: "PREFERENCES",
    refresh: "Refresh", save: "Save", cancel: "Cancel", close: "Close", delete: "Delete", edit: "Edit", create: "Create", runNow: "Run now", pause: "Pause", resume: "Resume", retry: "Retry", resolve: "Resolve", mute: "Mute for 1 hour", markRead: "Mark read", export: "Export", verify: "Quick verify", fullVerify: "Full verify", scan: "Scan now", cleanup: "Clean up", signOut: "Sign out", signIn: "Sign in again",
    loading: "Loading current-account data…", empty: "No data yet", failed: "The operation did not complete.", sessionExpired: "Your sign-in session has expired. Sign in again.", identityMismatch: "The signed-in identity does not match this application instance.",
    protected: "Protected", unprotected: "First backup pending", backupable: "Backupable", sharedWarning: "Backupable · shared-data risk", noData: "No application data", unsupported: "Unsupported database", failedStatus: "Failed", success: "Succeeded", queued: "Queued", running: "Running", paused: "Paused", resolved: "Resolved", muted: "Muted", open: "Open",
    currentTenant: "Current account", safeScope: "All data is restricted to this user’s application instances and document directory.", setupTitle: "Start protecting application data", setupCopy: "Supports ordinary files and consistent SQLite snapshots. Backups write only to this account’s document directory and never restore directly.", setupAction: "Scan current applications", setupStepIdentity: "OIDC identity", setupStepPermissions: "Permissions and runtime projection", setupStepScan: "Application scan", setupStepBackup: "First backup",
    overviewTitle: "Protection status", overviewCopy: "These metrics are aggregated from the current user’s persistent control database.", discovered: "Applications discovered", backupableCount: "Backupable instances", protectedCount: "Protected instances", unprotectedCount: "First backup pending", task24: "Tasks in 24h", queuedTasks: "Queued / running", storageUsed: "ZIP storage", nextPlans: "Upcoming plans", activity: "Recent activity", risks: "Risk reminders", noAlerts: "No unread alerts right now.",
    applicationTitle: "Application cabinet", applicationCopy: "Only application instances visible to the signed-in user are shown.", searchApps: "Search name, appid, or deploy ID", all: "All", single: "Single-instance", multi: "Multi-instance", details: "Details", probe: "Re-probe", backupNow: "Back up now", sharedRisk: "Shared-data risk", sharedRiskCopy: "This application runs as a single instance and may contain shared data. Backup scope follows the directory exposed to this account by the platform.", acceptRisk: "I understand the shared-data risk", dataSize: "Data size", fileCount: "Files", sqliteCount: "SQLite", lastBackup: "Latest snapshot", database: "Database findings", noApplications: "No matching application instances were found.",
    planTitle: "Backup plans", planCopy: "Plans, batches, and next run times come from the current account’s persistent control database.", newPlan: "New plan", name: "Plan name", targets: "Target instances", allBackupable: "Future backupable applications", schedule: "Schedule", manual: "Manual only", hourly: "Hourly", daily: "Daily", weekly: "Weekly", cron: "Cron", timezone: "Time zone", catchUp: "Catch up missed runs", retention: "Retention", keepLast: "Keep latest", keepDaily: "Keep daily", keepWeekly: "Keep weekly", keepMonthly: "Keep monthly", trashGrace: "Trash grace (hours)", retries: "Automatic retries", backoff: "Retry delay (seconds)", saveAndRun: "Save and run now", planWizardCopy: "Set targets, schedule, retention, and retries. A single-instance target requires risk acknowledgement.", planCreated: "Plan saved", planUpdated: "Plan updated",
    taskTitle: "Task center", taskCopy: "Status, leases, and retries are read from the persistent server queue.", batches: "Backup batches", history: "Task history", attempts: "Retry attempts", taskDetail: "Task details", batchDetail: "Batch details", status: "Status", plan: "Plan", application: "Application", instance: "Instance", started: "Started", finished: "Finished", scheduledAt: "Scheduled", error: "Error", progress: "Progress", noTasks: "There are no tasks right now.",
    backupTitle: "Backup library", backupCopy: "Only completed ZIP snapshots registered for this account are shown.", snapshot: "Snapshot", capturedAt: "Captured", archiveSize: "ZIP size", integrity: "Integrity", files: "File index", exportDone: "Export complete", trash: "Move to trash", noBackups: "There are no completed snapshots yet.",
    storageTitle: "Storage maintenance", storageCopy: "Only snapshots, partial directories, and trash under this account’s LazycatAppBackup directory are maintained.", snapshots: "Snapshots", availableStorage: "Available", partial: "Partial writes", trashCount: "Trash", verificationIssues: "Verification issues", lastVerified: "Last verification",
    alertsTitle: "Alerts", alertsCopy: "Alerts only reference this account’s applications, tasks, batches, or snapshots.", allAlerts: "All", openAlerts: "Open", resolvedAlerts: "Resolved", mutedAlerts: "Muted", alertType: "Type", createdAt: "Created", noAlertsList: "There are no alerts for this filter.",
    settingsTitle: "Settings", settingsCopy: "Only defaults already used by the service or safe to display for this account are available here.", language: "Display language", localeZh: "简体中文", localeEn: "English", notification: "In-app notification preferences", notifyFailure: "Notify on first failure", notifySuccess: "Notify on success", account: "Account and sign-in", identityVerified: "OIDC, ingress header, and application tenant are verified", environment: "Permissions and environment", readonly: "Application-layer read only (compatibility projection)", audit: "Audit activity", auditCopy: "Shows this account’s plan, task, storage, and settings actions.", settingsSaved: "Settings saved",
  },
} as const;

export type Translator = typeof dictionaries["zh-CN"];

export function translate(locale: Locale): Translator {
  return dictionaries[locale];
}

export function loadLocale(): Locale {
  return window.localStorage.getItem("lazycat-backup-locale") === "en-US" ? "en-US" : "zh-CN";
}

export function storeLocale(locale: Locale) {
  window.localStorage.setItem("lazycat-backup-locale", locale);
}

export function formatDate(locale: Locale, value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function formatBytes(locale: Locale, value = 0) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: index > 1 ? 1 : 0 }).format(value / 1024 ** index)} ${units[index]}`;
}
