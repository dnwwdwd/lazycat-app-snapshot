import type { components } from "./schema";

export type ApiErrorShape = components["schemas"]["ApiError"];

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type Session = components["schemas"]["Session"];
export type DatabaseFinding = components["schemas"]["DatabaseFinding"];
export type ApplicationInstance = components["schemas"]["ApplicationInstance"];
export type SyncStatus = components["schemas"]["SyncStatus"];
export type ApplicationList = components["schemas"]["ApplicationList"];
export type ApplicationDetail = components["schemas"]["ApplicationDetail"];
export type SyncAccepted = components["schemas"]["SyncAccepted"];
export type BackupJob = components["schemas"]["BackupJob"];
export type ManualBackupAccepted = components["schemas"]["ManualBackupAccepted"];
export type Snapshot = components["schemas"]["Snapshot"];
export type SnapshotList = components["schemas"]["SnapshotList"];
export type BackupScopeCatalog = components["schemas"]["BackupScopeCatalog"];
export type PlanInput = components["schemas"]["PlanInput"];
export type BackupPlan = components["schemas"]["BackupPlan"];
export type PlanList = components["schemas"]["PlanList"];
export type BackupBatch = components["schemas"]["BackupBatch"];
export type BatchList = components["schemas"]["BatchList"];
export type BackupTask = components["schemas"]["BackupTask"];
export type TaskList = components["schemas"]["TaskList"];
export type TaskDetail = components["schemas"]["TaskDetail"];
export type SnapshotFileList = components["schemas"]["SnapshotFileList"];
export type StorageSummary = components["schemas"]["StorageSummary"];
export type Settings = components["schemas"]["Settings"];
export type Alert = components["schemas"]["Alert"];
export type AlertList = components["schemas"]["AlertList"];
export type Overview = components["schemas"]["Overview"];
export type AuditEntry = components["schemas"]["AuditEntry"];
export type AuditList = components["schemas"]["AuditList"];

const chineseErrorMessages: Record<string, string> = {
  IDENTITY_MISMATCH: "当前登录会话与懒猫账号不一致，请重新登录。",
  SESSION_REQUIRED: "登录会话已失效，请重新登录。",
  RESOURCE_NOT_FOUND: "当前账号下未找到该应用实例。",
  INVALID_CURSOR: "列表分页状态已失效，请重新加载。",
  INVALID_LIMIT: "每页数量必须在 1 到 200 之间。",
  INVALID_MODE: "实例模式筛选无效。",
  APPLICATION_CATALOG_UNAVAILABLE: "应用目录暂时不可用，请稍后重新检测。",
  BACKUP_ALREADY_RUNNING: "该实例已有正在进行的备份，请等待它完成。",
  INSTANCE_NOT_BACKUPABLE: "当前探测结果不允许创建备份。",
  NO_APPLICATION_DATA: "该应用当前没有需要备份的数据。",
  UNSUPPORTED_DATABASE: "检测到 V1 不支持的数据库，已阻止备份。",
  BACKUP_QUEUE_FULL: "备份队列暂时繁忙，请稍后重试。",
  BACKUP_INTERRUPTED: "服务重启导致该备份未完成，请重新发起备份。",
  SNAPSHOT_VERIFICATION_FAILED: "快照校验未通过，请保留该快照并检查网盘状态。",
  INVALID_PLAN_NAME: "请输入 1 到 120 个字符的计划名称。",
  INVALID_PLAN_TARGETS: "请选择当前账号下可备份的应用实例。",
  INVALID_SCHEDULE: "执行频率无效。",
  INVALID_CRON: "Cron 表达式无效，请使用五段格式。",
  INVALID_TIMEZONE: "时区无效。",
  INVALID_CATCH_UP_WINDOW: "补跑窗口超出允许范围。",
  INVALID_RETRY_POLICY: "重试策略无效。",
  INVALID_RETENTION_POLICY: "保留策略无效。",
  OPERATION_CONFLICT: "当前资源状态不允许该操作。",
  PHASE4_SERVICE_UNAVAILABLE: "计划与备份库服务暂时不可用。",
  PHASE5_SERVICE_UNAVAILABLE: "运营服务暂时不可用。",
  INVALID_LOCALE: "页面语言无效。",
  INVALID_SETTINGS: "设置内容无效，请检查后重新保存。",
  INVALID_ALERT_STATUS: "告警状态无效。",
  INVALID_MUTE_DURATION: "静默时长必须在允许范围内。",
  INVALID_EVENT_CURSOR: "实时事件游标无效，请刷新页面。",
  EVENT_STREAM_UNAVAILABLE: "当前服务不支持实时状态更新。",
};

export function messageForError(code: string, fallback: string) {
  return chineseErrorMessages[code] ?? fallback;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
	...init,
    credentials: "same-origin",
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    let body: Partial<ApiErrorShape> = {};
    try {
      body = (await response.json()) as Partial<ApiErrorShape>;
    } catch {
      // Keep an ingress error page from hiding the actionable request status.
    }
    throw new ApiError(
      response.status,
      body.code ?? "REQUEST_FAILED",
      messageForError(body.code ?? "REQUEST_FAILED", body.message ?? "请求失败，请稍后重试。"),
      body.requestId,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function withQuery(path: string, params?: URLSearchParams) {
	return params && params.size ? `${path}?${params.toString()}` : path;
}

export const api = {
  session: () => request<Session>("/api/session"),
  applications: (params: URLSearchParams = new URLSearchParams()) =>
    request<ApplicationList>(`/api/applications${params.size ? `?${params}` : ""}`),
  application: (appid: string) =>
    request<ApplicationDetail>(
      `/api/applications/${encodeURIComponent(appid)}`,
    ),
  instance: (deployId: string) =>
    request<ApplicationInstance>(`/api/instances/${encodeURIComponent(deployId)}`),
  backupScope: (deployId: string, params: URLSearchParams = new URLSearchParams()) =>
    request<BackupScopeCatalog>(withQuery(`/api/instances/${encodeURIComponent(deployId)}/backup-scope`, params)),
  syncApplications: () =>
    request<SyncAccepted>("/api/applications/sync", { method: "POST" }),
  probeInstance: (deployId: string) =>
    request<SyncAccepted>(
      `/api/instances/${encodeURIComponent(deployId)}/probe`,
      { method: "POST" },
    ),
  startBackup: (deployId: string) =>
    request<ManualBackupAccepted>(
      `/api/instances/${encodeURIComponent(deployId)}/backup`,
      {
        method: "POST",
      },
    ),
  backupJob: (jobId: string) =>
    request<BackupJob>(`/api/backup-jobs/${encodeURIComponent(jobId)}`),
  backups: (params: URLSearchParams = new URLSearchParams()) =>
    request<SnapshotList>(withQuery("/api/backups", params)),
  backup: (snapshotId: string) =>
    request<Snapshot>(`/api/backups/${encodeURIComponent(snapshotId)}`),
  verifyBackup: (snapshotId: string) =>
    request<Snapshot>(`/api/backups/${encodeURIComponent(snapshotId)}/verify`, { method: "POST" }),
  verifyBackupFull: (snapshotId: string) =>
    request<Snapshot>(`/api/backups/${encodeURIComponent(snapshotId)}/verify?mode=full`, { method: "POST" }),
  backupFiles: (snapshotId: string) =>
    request<SnapshotFileList>(`/api/backups/${encodeURIComponent(snapshotId)}/files`),
  exportBackup: (snapshotId: string) =>
    request<{ accepted: true; exportPath: string }>(`/api/backups/${encodeURIComponent(snapshotId)}/export`, { method: "POST" }),
  plans: () => request<PlanList>("/api/plans"),
  plan: (planId: string) => request<BackupPlan>(`/api/plans/${encodeURIComponent(planId)}`),
  createPlan: (input: PlanInput) => request<BackupPlan>("/api/plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }),
  updatePlan: (planId: string, input: PlanInput) => request<BackupPlan>(`/api/plans/${encodeURIComponent(planId)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }),
  runPlan: (planId: string) => request<{ accepted: true; batch: BackupBatch }>(`/api/plans/${encodeURIComponent(planId)}/run`, { method: "POST" }),
  pausePlan: (planId: string) => request<BackupPlan>(`/api/plans/${encodeURIComponent(planId)}/pause`, { method: "POST" }),
  resumePlan: (planId: string) => request<BackupPlan>(`/api/plans/${encodeURIComponent(planId)}/resume`, { method: "POST" }),
  batches: (params: URLSearchParams = new URLSearchParams()) => request<BatchList>(withQuery("/api/batches", params)),
  batch: (batchId: string) => request<BackupBatch>(`/api/batches/${encodeURIComponent(batchId)}`),
  tasks: (params: URLSearchParams = new URLSearchParams()) => request<TaskList>(withQuery("/api/tasks", params)),
  task: (taskId: string) => request<TaskDetail>(`/api/tasks/${encodeURIComponent(taskId)}`),
  cancelTask: (taskId: string) => request<BackupTask>(`/api/tasks/${encodeURIComponent(taskId)}/cancel`, { method: "POST" }),
  retryTask: (taskId: string) => request<BackupTask>(`/api/tasks/${encodeURIComponent(taskId)}/retry`, { method: "POST" }),
  storage: () => request<StorageSummary>("/api/storage"),
  scanStorage: () => request<StorageSummary>("/api/storage/scan", { method: "POST" }),
  overview: () => request<Overview>("/api/overview"),
  alerts: (params: URLSearchParams = new URLSearchParams()) => request<AlertList>(withQuery("/api/alerts", params)),
  readAlert: (alertId: string) => request<Alert>(`/api/alerts/${encodeURIComponent(alertId)}/read`, { method: "POST" }),
  resolveAlert: (alertId: string) => request<Alert>(`/api/alerts/${encodeURIComponent(alertId)}/resolve`, { method: "POST" }),
  muteAlert: (alertId: string, minutes = 60) => request<Alert>(`/api/alerts/${encodeURIComponent(alertId)}/mute`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ minutes }) }),
  settings: () => request<Settings>("/api/settings"),
  updateSettings: (value: Settings) => request<Settings>("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) }),
  audit: (params: URLSearchParams = new URLSearchParams()) => request<AuditList>(withQuery("/api/audit", params)),
  eventsURL: () => "/api/events",
  logout: () => request<void>("/auth/logout", { method: "POST" }),
};
