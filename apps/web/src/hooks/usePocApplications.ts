import { useCallback, useEffect, useState } from 'react';

export type PocEntry = {
  name: string;
  type: string;
  size: number;
};

export type PocDatabaseFinding = {
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
  databaseFindings: PocDatabaseFinding[];
  entries: PocEntry[];
  sourceWarning?: string;
  sourceError?: string;
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

type PocApiError = { code?: string; message?: string };

async function readResponse(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw { status: response.status, ...body } as PocApiError & { status: number };
  }
  return body;
}

export function usePocApplications() {
  const [applications, setApplications] = useState<PocApplication[]>([]);
  const [selected, setSelected] = useState<PocApplication | null>(null);
  const [error, setError] = useState<PocApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<PocSnapshot | null>(null);
  const [snapshotError, setSnapshotError] = useState<PocApiError | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/poc/applications');
      const payload = await readResponse(response) as { applications: PocApplication[] };
      setApplications(payload.applications || []);
      setSelected(current => current ? (payload.applications || []).find(app => app.deployID === current.deployID) || null : null);
    } catch (failure) {
      setApplications([]);
      setSelected(null);
      setError(failure as PocApiError);
    } finally {
      setLoading(false);
    }
  }, []);

  const selectApplication = useCallback(async (deployID: string) => {
    setSnapshot(null);
    setSnapshotError(null);
    try {
      const response = await fetch(`/api/poc/applications/${encodeURIComponent(deployID)}`);
      const payload = await readResponse(response) as PocApplication;
      setSelected(payload);
    } catch (failure) {
      setSelected(null);
      setError(failure as PocApiError);
    }
  }, []);

  const createSnapshot = useCallback(async () => {
    if (!selected) return;
    setSnapshotLoading(true);
    setSnapshot(null);
    setSnapshotError(null);
    try {
      const response = await fetch('/api/poc/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deploy_id: selected.deployID }),
      });
      const payload = await readResponse(response) as PocSnapshot;
      setSnapshot(payload);
    } catch (failure) {
      setSnapshotError(failure as PocApiError);
    } finally {
      setSnapshotLoading(false);
    }
  }, [selected]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    applications,
    selected,
    error,
    loading,
    snapshot,
    snapshotError,
    snapshotLoading,
    refresh,
    selectApplication,
    createSnapshot,
  };
}
