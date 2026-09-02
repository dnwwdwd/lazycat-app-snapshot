import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api/client";
import { sendBrowserNotification } from "./notifications";

export type PageKey =
  "applications" | "backups" | "batches" | "tasks" | "alerts" | "audit";

type PageState = {
  items: any[];
  nextCursor?: string;
  history: string[];
  cursor?: string;
  limit: number;
  loaded: boolean;
  loading: boolean;
  error: boolean;
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

const emptyPage = (): PageState => ({
  items: [],
  history: [],
  limit: 15,
  loaded: false,
  loading: false,
  error: false,
});
const pageState = (value: { items?: any[]; nextCursor?: string }, limit: number): PageState => ({
  items: value.items || [],
  nextCursor: value.nextCursor,
  history: [],
  limit,
  loaded: true,
  loading: false,
  error: false,
});
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

const successfulTaskStatuses = new Set(["SUCCEEDED", "SUCCEEDED_WITH_WARNINGS"]);
const failedTaskStatuses = new Set(["FAILED", "TIMED_OUT"]);

type TaskEvent = {
  taskId?: string;
  status?: string;
  appid?: string;
  deployId?: string;
  applicationName?: string;
};

function taskNotification(event: TaskEvent, locale: string) {
  const name =
    event.applicationName?.trim() ||
    event.appid?.trim() ||
    event.deployId?.trim() ||
    event.taskId;
  const succeeded = successfulTaskStatuses.has(event.status || "");
  const warned = event.status === "SUCCEEDED_WITH_WARNINGS";
  if (locale === "en-US") {
    return succeeded
      ? {
          title: warned ? "Backup completed with warnings" : "Backup completed",
          body: `Backup for ${name} completed${warned ? " with warnings" : ""}.`,
        }
      : {
          title: "Backup failed",
          body: `Backup for ${name} did not complete. Open Task Center for details.`,
        };
  }
  return succeeded
    ? {
        title: warned ? "备份完成，但有警告" : "备份完成",
        body: `应用「${name}」的备份已完成${warned ? "，请在任务中心查看警告。" : "。"}`,
      }
    : {
        title: "备份失败",
        body: `应用「${name}」的备份未完成，请在任务中心查看详情。`,
      };
}

function signIn() {
  window.location.assign(
    `/auth/login?return_to=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`,
  );
}

export function useLiveBackupData() {
  const [state, setState] = useState<LiveState>(initialState);
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialDataReady, setInitialDataReady] = useState(false);
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
  const refreshing = useRef(false);
  const initialDataReadyRef = useRef(false);
  const eventCursor = useRef<number>();
  const notifiedTasks = useRef(new Set<string>());

  const finishInitialLoad = useCallback((ready: boolean) => {
    if (!mounted.current) return;
    setInitialLoading(false);
    if (ready && !initialDataReadyRef.current) {
      initialDataReadyRef.current = true;
      setInitialDataReady(true);
    }
  }, []);

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
      if (mounted.current)
        setState((current) => ({
          ...current,
          [key]: { ...current[key], loading: true, error: false },
        }));
      try {
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
            loaded: true,
            loading: false,
            error: false,
          },
        }));
      } catch (caught) {
        if (mounted.current)
          setState((current) => ({
            ...current,
            [key]: { ...current[key], loading: false, error: true },
          }));
        throw caught;
      }
    },
    [],
  );

  const refresh = useCallback(async () => {
    // Lazycat's route proxy can cancel a burst of concurrent upstream reads.
    // Serialize refreshes as well as individual resource loads so SSE, the
    // catalog poller, and a manual retry never recreate that burst.
    if (refreshing.current) return;
    refreshing.current = true;
    if (!initialDataReadyRef.current) setInitialLoading(true);
    setLoading(true);
    setError(undefined);
    if (mounted.current)
      setState((current) => {
        const next = { ...current };
        paged.forEach((key) => {
          next[key] = { ...next[key], loading: true, error: false };
        });
        return next;
      });
    try {
      // Resolve the session independently so a slow or cancelled secondary
      // resource cannot keep the whole application on the initial loading
      // screen. The current tenant is the only prerequisite for rendering the
      // shell; each other resource can fail and be retried independently.
      const session = await api.session();
      if (!mounted.current) return;
      setState((current) => ({ ...current, session }));

      const load = async (request: () => Promise<unknown>, commit: (value: any) => void) => {
        try {
          const value = await request();
          if (mounted.current) commit(value);
        } catch (caught) {
          handleFailure(caught);
        }
      };

      // Locale and timezone are global shell state, and the settings page must
      // not wait for application discovery or every other secondary page.
      await load(api.settings, (settings) =>
        setState((current) => ({ ...current, settings })),
      );

      // Applications are the primary product data. Publish them before
      // loading secondary pages so a successful catalog response is never
      // held back by another endpoint or a proxy cancellation.
      if (mounted.current)
        setState((current) => ({
          ...current,
          applications: { ...current.applications, loading: true, error: false },
        }));
      let applicationPage: Awaited<ReturnType<typeof api.applications>>;
      try {
        applicationPage = await api.applications(filters.current.applications);
      } catch (caught) {
        if (mounted.current)
          setState((current) => ({
            ...current,
            applications: { ...current.applications, loading: false, error: true },
          }));
        handleFailure(caught);
        finishInitialLoad(false);
        return;
      } finally {
        if (mounted.current) setLoading(false);
      }
      if (!mounted.current) return;
      const sync = applicationPage.sync;
      setState((current) => ({
        ...current,
        sync,
        applications: pageState(
          applicationPage,
          Number(filters.current.applications.get("limit") || 15),
        ),
      }));

      if (sync?.state !== "RUNNING") finishInitialLoad(true);

      // While discovery is running, wait for the catalog poller. Deferring
      // the rest avoids competing with the platform directory scan and keeps
      // the browser below the ingress's concurrent-request limit.
      if (sync?.state === "RUNNING") return;

      await load(api.overview, (overview) =>
        setState((current) => ({ ...current, overview })),
      );
      await load(api.plans, (plans) =>
        setState((current) => ({ ...current, plans: plans.items || [] })),
      );
      const loadPage = async (
        key: PageKey,
        request: () => Promise<{ items?: any[]; nextCursor?: string }>,
      ) => {
        if (mounted.current)
          setState((current) => ({
            ...current,
            [key]: { ...current[key], loading: true, error: false },
          }));
        try {
          const value = await request();
          if (mounted.current)
            setState((current) => ({
              ...current,
              [key]: pageState(
                value,
                Number(filters.current[key].get("limit") || 15),
              ),
            }));
        } catch (caught) {
          if (mounted.current)
            setState((current) => ({
              ...current,
              [key]: { ...current[key], loading: false, error: true },
            }));
          handleFailure(caught);
        }
      };

      // Prioritize the pages users most often open after a backup. They are
      // still serialized to avoid overwhelming the route proxy, while the
      // page-level loading state keeps navigation responsive during the read.
      await loadPage("tasks", () => api.tasks(filters.current.tasks));
      await loadPage("backups", () => api.backups(filters.current.backups));
      await loadPage("alerts", () => api.alerts(filters.current.alerts));
      await loadPage("batches", () => api.batches(filters.current.batches));
      await load(api.storage, (storage) =>
        setState((current) => ({ ...current, storage })),
      );
      await loadPage("audit", () => api.audit(filters.current.audit));
    } catch (caught) {
      if (mounted.current)
        setState((current) => {
          const next = { ...current };
          paged.forEach((key) => {
            next[key] = { ...next[key], loading: false, error: true };
          });
          return next;
        });
      handleFailure(caught);
      finishInitialLoad(false);
    } finally {
      refreshing.current = false;
      if (mounted.current) setLoading(false);
    }
  }, [finishInitialLoad, handleFailure]);

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
    const settings = state.settings;
    if (!sessionReady || !settings) return;
    let source: EventSource | undefined;
    let reconnect: number | undefined;
    let merge: number | undefined;
    let disposed = false;
    let streamReady = false;
    const rememberCursor = (event: Event) => {
      const id = Number((event as MessageEvent).lastEventId);
      if (Number.isSafeInteger(id) && id >= 0) eventCursor.current = id;
    };
    const update = (event?: Event) => {
      if (event) rememberCursor(event);
      window.clearTimeout(merge);
      merge = window.setTimeout(() => {
        void refresh();
      }, 1200);
    };
    const markReady = (event: Event) => {
      try {
        const value = JSON.parse((event as MessageEvent<string>).data) as {
          after?: number;
        };
        if (Number.isSafeInteger(value.after) && (value.after || 0) >= 0)
          eventCursor.current = value.after;
      } catch {
        // A malformed readiness marker only disables catch-up suppression for
        // this connection; it must not break normal REST refreshes.
      }
      streamReady = true;
    };
    const notifyTask = (event: Event) => {
      update(event);
      if (!streamReady) return;
      let value: TaskEvent;
      try {
        value = JSON.parse((event as MessageEvent<string>).data) as TaskEvent;
      } catch {
        return;
      }
      const status = value.status || "";
      const succeeded = successfulTaskStatuses.has(status);
      const failed = failedTaskStatuses.has(status);
      if (
        !value.taskId ||
        (!succeeded && !failed) ||
        (succeeded && !settings.notifySuccess) ||
        (failed && !settings.notifyFirstFailure)
      )
        return;
      const key = `${value.taskId}:${status}`;
      if (notifiedTasks.current.has(key)) return;
      notifiedTasks.current.add(key);
      const message = taskNotification(value, settings.locale);
      sendBrowserNotification({ ...message, tag: `backup-task-${key}` });
    };
    const connect = () => {
      if (disposed) return;
      streamReady = false;
      source = new EventSource(api.eventsURL(eventCursor.current));
      [
        "batch.updated",
        "snapshot.updated",
        "alert.created",
        "storage.updated",
        "session.expiring",
      ].forEach((name) => source?.addEventListener(name, update));
      source.addEventListener("stream.ready", markReady);
      source.addEventListener("task.updated", notifyTask);
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
  }, [
    refresh,
    sessionReady,
    state.settings?.locale,
    state.settings?.notifyFirstFailure,
    state.settings?.notifySuccess,
  ]);

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
    initialLoading,
    initialDataReady,
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
