import type { ApplicationInstance } from "./client";

const colors = ["#3eab91", "#7e88de", "#df6d7e", "#5d739d", "#e9941d"];

function colorFor(value: string) {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return colors[hash % colors.length];
}

export function formatBytes(value: number) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / 1024 ** index;
  return `${amount >= 10 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`;
}

export function toPrototypeApplication(value: ApplicationInstance) {
  const unsupported = value.databaseFindings?.find((finding) => !finding.supported);
  return {
    id: value.deployId,
    name: value.name,
    appid: value.appid,
    version: value.version || "—",
    mode: value.multiInstance ? "multi" : "single",
    deploy: value.deployId,
    status: value.capabilityStatus,
    protection: value.protectionStatus,
    size: formatBytes(value.totalBytes),
    bytes: value.totalBytes,
    files: value.fileCount.toLocaleString("zh-CN"),
    sqlite: value.sqliteCount,
    last: value.lastBackupAt ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value.lastBackupAt)) : "—",
    next: "未设置",
    color: colorFor(value.appid),
    initials: value.name.trim().slice(0, 1) || "?",
    updated: value.lastProbedAt ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value.lastProbedAt)) : "等待检测",
    unsupported: unsupported ? `${unsupported.type} · ${unsupported.reason || "不支持"}` : undefined,
    readOnlyMode: value.readOnlyMode,
    probeErrorCode: value.probeErrorCode,
  };
}
