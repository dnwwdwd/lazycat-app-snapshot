import { useCallback, useEffect, useState } from 'react';

type PocIdentity = {
  tenantUID: string;
  identityConfigured: boolean;
  sourceConfigured: boolean;
  catalogConfigured: boolean;
  requiredPermission: string;
};

type SourceEntry = {
  name: string;
  type: string;
  size: number;
};

type PocSource = {
  sourceDeployID: string;
  entryCount: number;
  entries: SourceEntry[];
  readOnly: boolean;
};

type PocError = {
  code?: string;
  message?: string;
};

async function readResponse(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw { status: response.status, ...body } as PocError & { status: number };
  }
  return body;
}

export function usePocDiagnostics() {
  const [identity, setIdentity] = useState<PocIdentity | null>(null);
  const [source, setSource] = useState<PocSource | null>(null);
  const [error, setError] = useState<PocError | null>(null);
  const [loading, setLoading] = useState(true);
  const [probeResult, setProbeResult] = useState<{ bytesRead: number; sha256: string; truncated: boolean } | null>(null);
  const [probeError, setProbeError] = useState<PocError | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setProbeError(null);
    try {
      const identityResponse = await fetch('/api/poc/identity');
      const identityPayload = await readResponse(identityResponse) as PocIdentity;
      setIdentity(identityPayload);
      // Source probing is performed after an application is selected. Calling
      // the legacy no-deploy source endpoint here made a healthy application
      // catalog look broken whenever the first catalog entry had no resolver.
      setSource(null);
    } catch (identityFailure) {
      setIdentity(null);
      setSource(null);
      setError(identityFailure as PocError);
    } finally {
      setLoading(false);
    }
  }, []);

  const probe = useCallback(async (relativePath: string, deployID?: string) => {
    setProbeResult(null);
    setProbeError(null);
    const path = relativePath.trim();
    if (!path || path.startsWith('/') || path === '.' || path === '..' || path.startsWith('../')) {
      setProbeError({ code: 'INVALID_SOURCE_PATH', message: '请输入源根目录内的相对文件路径' });
      return;
    }

    try {
      const query = new URLSearchParams({ path });
      if (deployID) query.set('deploy_id', deployID);
      const response = await fetch(`/api/poc/read?${query.toString()}`);
      const payload = await readResponse(response);
      setProbeResult(payload);
    } catch (failure) {
      setProbeError(failure as PocError);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { identity, source, error, loading, probeResult, probeError, probe, refresh };
}
