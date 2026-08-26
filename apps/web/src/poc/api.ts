export type PocIdentity = {
  identityConfigured: boolean;
  sourceConfigured: boolean;
  requiredPermissions: string[];
  optionalPermissions: string[];
  sourceAdapter: string;
  tenantUID?: string;
  backupDeployID?: string;
  configuredSourceDeployID?: string;
};

export type SourceEntry = {
  name: string;
  type: 'file' | 'directory' | 'symlink' | 'other';
  size?: number;
};

export type PocSource = {
  sourceDeployID: string;
  sourceAdapter: string;
  readOnly: boolean;
  entryCount: number;
  entries: SourceEntry[];
};

export type PocRead = {
  sourceDeployID: string;
  path: string;
  bytesRead: number;
  sha256: string;
  hashScope: 'complete' | 'prefix';
  complete: boolean;
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
      // The server is expected to return JSON, but retain a safe fallback.
    }
    throw new PocApiError(response.status, error.code ?? 'REQUEST_FAILED', error.message ?? '诊断请求失败');
  }

  return response.json() as Promise<T>;
}

export const pocApi = {
  identity: (signal?: AbortSignal) => getJSON<PocIdentity>('/api/poc/identity', signal),
  source: (deployID: string, signal?: AbortSignal) => getJSON<PocSource>(`/api/poc/source?deploy_id=${encodeURIComponent(deployID)}`, signal),
  read: (deployID: string, path: string, signal?: AbortSignal) => getJSON<PocRead>(`/api/poc/read?deploy_id=${encodeURIComponent(deployID)}&path=${encodeURIComponent(path)}`, signal),
};
