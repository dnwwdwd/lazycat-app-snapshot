import { useEffect, useRef, useState } from "react";
import {
  Archive,
  Bell,
  Calendar,
  HardDrive,
  Layers3,
  ListTodo,
  LoaderCircle,
  Menu,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";
import { ApiError } from "../api/client";
import { apiErrorLabel, BrandLogo, toastMessage } from "./components";
import { Dialog } from "./dialogs";
import {
  AlertsPage,
  ApplicationsPage,
  BackupsPage,
  OverviewPage,
  PlansPage,
  SettingsPage,
  StoragePage,
  TasksPage,
} from "./pages";
import { useLiveBackupData } from "./live";

type Route =
  | "overview"
  | "applications"
  | "plans"
  | "tasks"
  | "backups"
  | "storage"
  | "alerts"
  | "settings";
const routes: Record<Route, string> = {
  overview: "/overview",
  applications: "/applications",
  plans: "/plans",
  tasks: "/tasks",
  backups: "/backups",
  storage: "/storage",
  alerts: "/alerts",
  settings: "/settings",
};
const fromPath = (path: string): Route =>
  (Object.entries(routes).find(([, value]) => value === path)?.[0] as Route) ||
  "overview";
const labels: Array<[Route, any, string, string]> = [
  ["overview", ShieldCheck, "概览", "Overview"],
  ["applications", Layers3, "应用", "Applications"],
  ["plans", Calendar, "备份计划", "Backup Plans"],
  ["tasks", ListTodo, "任务中心", "Task Center"],
  ["backups", Archive, "备份库", "Backup Library"],
  ["storage", HardDrive, "存储", "Storage"],
  ["alerts", Bell, "告警", "Alerts"],
  ["settings", Settings, "设置", "Settings"],
];

export default function App() {
  const live = useLiveBackupData();
  const [route, setRoute] = useState<Route>(() =>
    fromPath(window.location.pathname),
  );
  const [mobile, setMobile] = useState(false);
  const [dialog, setDialog] = useState<any>();
  const [globalNotice, setGlobalNotice] = useState("");
  const globalNoticeTimer = useRef<number | undefined>(undefined);
  const [locale, setLocale] = useState<"zh-CN" | "en-US">("zh-CN");
  const timezone = live.state.settings?.timezone || "Asia/Shanghai";
  useEffect(() => {
    if (
      live.state.settings?.locale === "en-US" ||
      live.state.settings?.locale === "zh-CN"
    )
      setLocale(live.state.settings.locale);
  }, [live.state.settings?.locale]);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(
    () => () => {
      if (globalNoticeTimer.current !== undefined)
        window.clearTimeout(globalNoticeTimer.current);
    },
  );
  useEffect(() => {
    const listener = () => setRoute(fromPath(window.location.pathname));
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, []);
  const navigate = (next: Route, search = "") => {
    const target = `${routes[next]}${search}`;
    if (`${window.location.pathname}${window.location.search}` !== target)
      window.history.pushState({}, "", target);
    setRoute(next);
    setMobile(false);
  };
  const open = (kind: string, data?: any) =>
    setDialog((current: any) => ({
      kind,
      data,
      stack: current
        ? [...(current.stack || []), { kind: current.kind, data: current.data }]
        : [],
    }));
  const back = () =>
    setDialog((current: any) => {
      const previous = current?.stack?.[current.stack.length - 1];
      return previous
        ? { ...previous, stack: current.stack.slice(0, -1) }
        : undefined;
    });
  const t = (zh: string, en: string) => (locale === "zh-CN" ? zh : en);
  const notify = (message?: unknown) => {
    const content = toastMessage(message);
    if (!content) return;
    if (globalNoticeTimer.current !== undefined) {
      window.clearTimeout(globalNoticeTimer.current);
      globalNoticeTimer.current = undefined;
    }
    setGlobalNotice(content);
    globalNoticeTimer.current = window.setTimeout(() => {
      setGlobalNotice("");
      globalNoticeTimer.current = undefined;
    }, 3200);
  };
  const accountName =
    live.state.session?.displayName || t("当前账号", "Current account");
  const accountUid = live.state.session?.uid || "—";
  const accountMeta =
    accountUid !== "—" &&
    accountUid.trim().toLocaleLowerCase() !==
      accountName.trim().toLocaleLowerCase()
      ? accountUid
      : t("已连接", "Connected");
  const badge = (key: Route) =>
    key === "applications"
      ? live.state.overview?.applicationCount ?? 0
      : key === "plans"
        ? live.state.plans.length
        : key === "tasks"
          ? live.state.overview?.taskCount ?? 0
          : key === "backups"
            ? live.state.storage?.snapshotCount ??
              live.state.overview?.storage?.snapshotCount ??
              0
            : key === "alerts"
              ? live.state.overview?.alertCount ?? 0
              : undefined;
  // Render the shell and route immediately. Session and page resources are
  // loaded independently; a slow or cancelled session request must not leave
  // the whole application trapped on the initial loading screen.
  const content = route === "overview" ? (
      <OverviewPage
        state={live.state}
        locale={locale}
        timezone={timezone}
        navigate={navigate}
      />
    ) : route === "applications" ? (
      <ApplicationsPage
        state={live.state}
        locale={locale}
        timezone={timezone}
        setFilter={live.setFilter}
        movePage={live.movePage}
        open={open}
        run={live.run}
        initialLoading={live.initialLoading}
      />
    ) : route === "plans" ? (
      <PlansPage
        state={live.state}
        locale={locale}
        timezone={timezone}
        open={open}
      />
    ) : route === "tasks" ? (
      <TasksPage
        state={live.state}
        locale={locale}
        timezone={timezone}
        setFilter={live.setFilter}
        movePage={live.movePage}
        open={open}
        run={live.run}
        navigate={navigate}
      />
    ) : route === "backups" ? (
      <BackupsPage
        state={live.state}
        locale={locale}
        timezone={timezone}
        movePage={live.movePage}
        open={open}
        setFilter={live.setFilter}
      />
    ) : route === "storage" ? (
      <StoragePage
        state={live.state}
        locale={locale}
        timezone={timezone}
        run={live.run}
      />
    ) : route === "alerts" ? (
      <AlertsPage
        state={live.state}
        locale={locale}
        timezone={timezone}
        setFilter={live.setFilter}
        movePage={live.movePage}
        open={open}
        run={live.run}
      />
    ) : (
      <SettingsPage
        state={live.state}
        locale={locale}
        setLocale={setLocale}
        run={live.run}
        movePage={live.movePage}
        setFilter={live.setFilter}
      />
    );
  return (
    <>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <BrandLogo />
            <div>
              <div className="brand-name">{t("咪咪应用备份", "Mimi App Backup")}</div>
            </div>
          </div>
          <Navigation
            route={route}
            locale={locale}
            navigate={navigate}
            badge={badge}
          />
          <div className="side-user">
            <button className="user-card" onClick={() => navigate("settings")}>
              <span className="user-avatar">
                {live.state.session?.displayName?.slice(0, 1) || "U"}
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span className="user-name">
                  {accountName}
                </span>
                <span className="user-meta">
                  <span className="status-dot" />
                  {accountMeta}
                </span>
              </span>
            </button>
          </div>
        </aside>
        <div className="workspace">
          <div className="mobile-bar">
            <div className="mobile-brand">
              <BrandLogo small />
              {t("咪咪应用备份", "Mimi App Backup")}
            </div>
            <button
              className="icon-button"
              onClick={() => setMobile((value) => !value)}
            >
              {mobile ? <X /> : <Menu />}
            </button>
          </div>
          {mobile && (
            <div className="mobile-drawer" onClick={() => setMobile(false)}>
              <div
                className="mobile-drawer-inner"
                onClick={(event) => event.stopPropagation()}
              >
                <Navigation
                  route={route}
                  locale={locale}
                  navigate={navigate}
                  badge={badge}
                />
              </div>
            </div>
          )}
          {live.initialLoading && (
            <div className="global-loading" role="status" aria-live="polite">
              <LoaderCircle className="spin" />
              {t(
                "正在加载当前账号的应用数据…",
                "Loading application data for this account…",
              )}
            </div>
          )}
          {live.error && (
            <div className="page" style={{ paddingBottom: 0 }}>
              <div className="callout callout-danger">
                {apiErrorLabel(live.error.code, locale)}
                <button
                  className="button button-quiet"
                  onClick={() => void live.refresh()}
                >
                  {t("重新加载", "Reload")}
                </button>
              </div>
            </div>
          )}
          {content}
        </div>
      </div>
      {dialog && (
        <Dialog
          {...dialog}
          close={() => setDialog(undefined)}
          state={live.state}
          locale={locale}
          timezone={timezone}
          run={live.run}
          scope={live.scope}
          applications={live.applications}
          navigate={navigate}
          setFilter={live.setFilter}
          open={open}
          back={back}
          canBack={Boolean(dialog.stack?.length)}
          notify={notify}
        />
      )}
      {globalNotice && (
        <div className="toast" role="status" aria-live="polite">
          {globalNotice}
        </div>
      )}
    </>
  );
}

function Navigation({
  route,
  locale,
  navigate,
  badge,
}: {
  route: Route;
  locale: string;
  navigate: (route: Route, search?: string) => void;
  badge: (route: Route) => number | undefined;
}) {
  const t = (zh: string, en: string) => (locale === "zh-CN" ? zh : en);
  return (
    <nav className="side-nav">
      {labels.map(([key, Icon, zh, en]) => (
        <button
          className={`nav-item ${route === key ? "active" : ""}`}
          key={key}
          onClick={() => navigate(key)}
        >
          <Icon />
          <span>{t(zh, en)}</span>
          {badge(key) !== undefined && (
            <span className="nav-badge">{badge(key)}</span>
          )}
        </button>
      ))}
    </nav>
  );
}
