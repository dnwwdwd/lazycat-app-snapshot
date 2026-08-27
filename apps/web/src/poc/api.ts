export type PocIdentity = {
  identityConfigured: boolean;
  sourceConfigured: boolean;
  catalogConfigured: boolean;
  requiredPermission: string;
  requiredPermissions: string[];
  optionalPermissions: string[];
  sourceAdapter: string;
  providerStatus: string;
  readOnlyMode?: string;
  tenantUID?: string;
  backupDeployID?: string;
};

export const PLATFORM_RESOLVER_NO_PROJECTION = 'PLATFORM_RESOLVER_FOUND_BUT_NO_CALLER_VISIBLE_PROJECTION';
export const RUNTIME_APPVAR_PROJECTION_NOT_VISIBLE = 'RUNTIME_APPVAR_PROJECTION_NOT_VISIBLE';

export type PocSourceCapability = {
  catalogReady: boolean;
  permissionDeclared: boolean;
  providerStatus: string;
  providerKind: string;
  providerVersion?: string;
  sdkMethod?: string;
  mountConfigured: boolean;
  isolationVerified: boolean;
  readOnlyMode?: string;
  blockingReason?: string;
};

export type SourceEntry = {
  name: string;
  type: 'file' | 'directory' | 'symlink' | 'special' | 'other';
  size?: number;
};

export type DatabaseFinding = {
  type: string;
  path: string;
  supported: boolean;
  reason?: string;
};

export type PocApplication = {
  appid: string;
  name: string;
  version?: string;
  deployID: string;
  ownerUID: string;
  multiInstance: boolean;
  readOnly: boolean;
  status: string;
  entryCount: number;
  fileCount: number;
  totalBytes: number;
  skippedCount: number;
  sqliteCount: number;
  databaseFindings: DatabaseFinding[];
  entries: SourceEntry[];
  sourceWarning?: string;
  sourceError?: string;
  sourceProjection?: string;
  sourceAdapterVersion?: string;
  readOnlyMode?: string;
  sourceVerifiedAt?: string;
};

export type PocApplicationsResponse = {
  applications: PocApplication[];
  count: number;
};

export type PocSource = {
  sourceDeployID: string;
  appid: string;
  name: string;
  sourceAdapter: string;
  sourceProjection?: string;
  readOnly: boolean;
  readOnlyMode?: string;
  entryCount: number;
  entries: SourceEntry[];
  fileCount: number;
  totalBytes: number;
  databaseFindings: DatabaseFinding[];
};

export type PocRead = {
  sourceDeployID?: string;
  path?: string;
  bytesRead: number;
  sha256: string;
  hashScope: 'complete' | 'prefix';
  complete?: boolean;
  truncated?: boolean;
};

export type PocSnapshot = {
  snapshotID: string;
  appid: string;
  name: string;
  deployID: string;
  createdAt: string;
  archivePath: string;
  manifestPath: string;
  archiveBytes: number;
  archiveSha256: string;
  fileCount: number;
  databaseCount: number;
  consistency: string;
};

type ErrorResponse = {
  code?: string;
  message?: string;
};

export class PocApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PocApiError';
  }
}

async function getJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    let error: ErrorResponse = {};
    try {
      error = await response.json() as ErrorResponse;
    } catch {
      // Keep a safe fallback when an ingress returns a non-JSON error page.
    }
    throw new PocApiError(response.status, error.code ?? 'REQUEST_FAILED', error.message ?? '诊断请求失败');
  }

  return response.json() as Promise<T>;
}

async function postJSON<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    let error: ErrorResponse = {};
    try {
      error = await response.json() as ErrorResponse;
    } catch {
      // Keep a safe fallback when an ingress returns a non-JSON error page.
    }
    throw new PocApiError(response.status, error.code ?? 'REQUEST_FAILED', error.message ?? '诊断请求失败');
  }
  return response.json() as Promise<T>;
}

export const pocApi = {
  identity: (signal?: AbortSignal) => getJSON<PocIdentity>('/api/poc/identity', signal),
  sourceCapability: (signal?: AbortSignal) => getJSON<PocSourceCapability>('/api/poc/source-capability', signal),
  applications: (signal?: AbortSignal) => getJSON<PocApplicationsResponse>('/api/poc/applications', signal),
  application: (deployID: string, signal?: AbortSignal) => getJSON<PocApplication>(`/api/poc/applications/${encodeURIComponent(deployID)}`, signal),
  source: (deployID: string, signal?: AbortSignal) => getJSON<PocSource>(`/api/poc/source?deploy_id=${encodeURIComponent(deployID)}`, signal),
  read: (deployID: string, path: string, signal?: AbortSignal) => getJSON<PocRead>(`/api/poc/read?deploy_id=${encodeURIComponent(deployID)}&path=${encodeURIComponent(path)}`, signal),
  snapshot: (deployID: string, signal?: AbortSignal) => postJSON<PocSnapshot>('/api/poc/snapshots', { deploy_id: deployID }, signal),
};
