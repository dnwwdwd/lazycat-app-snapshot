import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api/client";

export type PageKey =
  "applications" | "backups" | "batches" | "tasks" | "alerts" | "audit";

type PageState = {
  items: any[];
  nextCursor?: string;
  history: string[];
  cursor?: string;
  limit: number;
};
type LiveError = { code: string; fallback?: string };
type LiveState = {
  session?: any;
  sync?: any;
  overview?: any;
  plans: any[];
  storage?: any;
  settings?: any;
  applications: PageState;
  backups: PageState;
  batches: PageState;
  tasks: PageState;
  alerts: PageState;
  audit: PageState;
};

const emptyPage = (): PageState => ({ items: [], history: [], limit: 15 });
const initialState = (): LiveState => ({
  plans: [],
  applications: emptyPage(),
  backups: emptyPage(),
  batches: emptyPage(),
  tasks: emptyPage(),
  alerts: emptyPage(),
  audit: emptyPage(),
});

const paged = new Set<PageKey>([
  "applications",
  "backups",
  "batches",
  "tasks",
  "alerts",
  "audit",
]);

function signIn() {
  window.location.assign(
    `/auth/login?return_to=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`,
  );
}

export function useLiveBackupData() {
  const [state, setState] = useState<LiveState>(initialState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LiveError>();
  const sessionReady = Boolean(state.session);
  const filters = useRef<Record<PageKey, URLSearchParams>>({
    applications: new URLSearchParams([["limit", "15"]]),
    backups: new URLSearchParams([["limit", "15"]]),
    batches: new URLSearchParams([["limit", "15"]]),
    tasks: new URLSearchParams([["limit", "15"]]),
    alerts: new URLSearchParams([["limit", "15"]]),
    audit: new URLSearchParams([["limit", "15"]]),
  });
  const mounted = useRef(true);

  const handleFailure = useCallback((caught: unknown) => {
    if (
      caught instanceof ApiError &&
      (caught.status === 401 || caught.status === 403)
    ) {
      signIn();
      return;
    }
    setError(
      caught instanceof ApiError
        ? { code: caught.code, fallback: caught.message }
        : {
            code: "REQUEST_FAILED",
            fallback: caught instanceof Error ? caught.message : undefined,
          },
    );
  }, []);

  const requestPage = useCallback(
    async (key: PageKey, cursor?: string, override?: URLSearchParams) => {
      const params = new URLSearchParams(override || filters.current[key]);
      if (cursor) params.set("cursor", cursor);
      else params.delete("cursor");
      const result =
        key === "applications"
          ? await api.applications(params)
          : key === "backups"
            ? await api.backups(params)
            : key === "batches"
              ? await api.batches(params)
              : key === "tasks"
                ? await api.tasks(params)
                : key === "alerts"
                  ? await api.alerts(params)
                  : await api.audit(params);
      if (!mounted.current) return;
      setState((current) => ({
        ...current,
        [key]: {
          items: result.items || [],
          nextCursor: result.nextCursor,
          cursor,
          history: cursor ? current[key].history : [],
          limit: Number(params.get("limit") || 15),
        },
      }));
    },
    [],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      // Resolve the session independently so a slow or cancelled secondary
      // resource cannot keep the whole application on the initial loading
      // screen. The current tenant is the only prerequisite for rendering the
      // shell; each other resource can fail and be retried independently.
      const session = await api.session();
      if (!mounted.current) return;
      setState((current) => ({ ...current, session }));

      const results = await Promise.allSettled([
        api.overview(),
        api.applications(filters.current.applications),
        api.plans(),
        api.tasks(filters.current.tasks),
        api.batches(filters.current.batches),
        api.backups(filters.current.backups),
        api.storage(),
        api.alerts(filters.current.alerts),
        api.settings(),
        api.audit(filters.current.audit),
      ]);
      if (!mounted.current) return;

      const [
        overview,
        applicationPage,
        plans,
        taskPage,
        batchPage,
        backupPage,
        storage,
        alertPage,
        settings,
        auditPage,
      ] = results;
      setState((current) => ({
        ...current,
        sync:
          applicationPage.status === "fulfilled"
            ? applicationPage.value.sync
            : current.sync,
        overview: overview.status === "fulfilled" ? overview.value : current.overview,
        plans: plans.status === "fulfilled" ? plans.value.items || [] : current.plans,
        storage: storage.status === "fulfilled" ? storage.value : current.storage,
        settings: settings.status === "fulfilled" ? settings.value : current.settings,
        applications:
          applicationPage.status === "fulfilled"
            ? {
                items: applicationPage.value.items || [],
                nextCursor: applicationPage.value.nextCursor,
                history: [],
                limit: Number(filters.current.applications.get("limit") || 15),
              }
            : current.applications,
        tasks:
          taskPage.status === "fulfilled"
            ? {
                items: taskPage.value.items || [],
                nextCursor: taskPage.value.nextCursor,
                history: [],
                limit: Number(filters.current.tasks.get("limit") || 15),
              }
            : current.tasks,
        batches:
          batchPage.status === "fulfilled"
            ? {
                items: batchPage.value.items || [],
                nextCursor: batchPage.value.nextCursor,
                history: [],
                limit: Number(filters.current.batches.get("limit") || 15),
              }
            : current.batches,
        backups:
          backupPage.status === "fulfilled"
            ? {
                items: backupPage.value.items || [],
                nextCursor: backupPage.value.nextCursor,
                history: [],
                limit: Number(filters.current.backups.get("limit") || 15),
              }
            : current.backups,
        alerts:
          alertPage.status === "fulfilled"
            ? {
                items: alertPage.value.items || [],
                nextCursor: alertPage.value.nextCursor,
                history: [],
                limit: Number(filters.current.alerts.get("limit") || 15),
              }
            : current.alerts,
        audit:
          auditPage.status === "fulfilled"
            ? {
                items: auditPage.value.items || [],
                nextCursor: auditPage.value.nextCursor,
                history: [],
                limit: Number(filters.current.audit.get("limit") || 15),
              }
            : current.audit,
      }));

      const failed = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      if (failed) handleFailure(failed.reason);
    } catch (caught) {
      handleFailure(caught);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [handleFailure]);

  useEffect(() => {
    // React StrictMode mounts effects twice in development. Reset the shared
    // lifecycle guard when the active effect is installed so the second
    // setup is allowed to commit its API responses.
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  useEffect(() => {
    // Catalog discovery starts asynchronously when the server boots. Keep
    // reading the real API until that sync publishes its terminal state;
    // otherwise the first empty page would look like an empty account.
    if (state.sync?.state !== "RUNNING" || loading) return;
    const timer = window.setTimeout(() => void refresh(), 1500);
    return () => window.clearTimeout(timer);
  }, [loading, refresh, state.sync?.state]);

  useEffect(() => {
    if (!sessionReady) return;
    let source: EventSource | undefined;
    let reconnect: number | undefined;
    let merge: number | undefined;
    let disposed = false;
    const update = () => {
      window.clearTimeout(merge);
      merge = window.setTimeout(() => {
        void refresh();
      }, 1200);
    };
    const connect = () => {
      if (disposed) return;
      source = new EventSource(api.eventsURL());
      [
        "batch.updated",
        "task.updated",
        "snapshot.updated",
        "alert.created",
        "storage.updated",
        "session.expiring",
      ].forEach((name) => source?.addEventListener(name, update));
      source.onerror = () => {
        source?.close();
        reconnect = window.setTimeout(connect, 15000);
      };
    };
    connect();
    return () => {
      disposed = true;
      source?.close();
      window.clearTimeout(reconnect);
      window.clearTimeout(merge);
    };
  }, [refresh, sessionReady]);

  const setFilter = useCallback(
    async (key: PageKey, entries: Record<string, string | undefined>) => {
      const params = new URLSearchParams(filters.current[key]);
      Object.entries(entries).forEach(([name, value]) =>
        value ? params.set(name, value) : params.delete(name),
      );
      params.delete("cursor");
      filters.current[key] = params;
      try {
        await requestPage(key, undefined, params);
      } catch (caught) {
        handleFailure(caught);
      }
    },
    [handleFailure, requestPage],
  );

  const movePage = useCallback(
    async (key: PageKey, direction: "previous" | "next") => {
      const current = state[key];
      const target =
        direction === "next"
          ? current.nextCursor
          : current.history[current.history.length - 1];
      if (!target && direction === "next") return;
      try {
        const before = current.cursor;
        await requestPage(key, target);
        setState((latest) => ({
          ...latest,
          [key]: {
            ...latest[key],
            history:
              direction === "next"
                ? [...current.history, before || ""]
                : current.history.slice(0, -1),
          },
        }));
      } catch (caught) {
        handleFailure(caught);
      }
    },
    [handleFailure, requestPage, state],
  );

  const run = useCallback(
    async (operation: () => Promise<unknown>) => {
      try {
        await operation();
        await refresh();
        return true;
      } catch (caught) {
        handleFailure(caught);
        return false;
      }
    },
    [handleFailure, refresh],
  );

  const scope = useCallback(
    async (deployId: string, query = "", cursor?: string) => {
      const params = new URLSearchParams([["limit", "50"]]);
      if (query) params.set("q", query);
      if (cursor) params.set("cursor", cursor);
      try {
        return await api.backupScope(deployId, params);
      } catch (caught) {
        handleFailure(caught);
        throw caught;
      }
    },
    [handleFailure],
  );

  const applications = useCallback(
    async (params: URLSearchParams) => {
      try {
        return await api.applications(params);
      } catch (caught) {
        handleFailure(caught);
        throw caught;
      }
    },
    [handleFailure],
  );

  return {
    state,
    loading,
    error,
    refresh,
    setFilter,
    movePage,
    run,
    scope,
    applications,
    paged,
  };
}
