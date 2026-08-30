import React from "react";
import { navGroups } from "./data";

const iconPaths = {
  grid: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1.5" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" />
      <rect x="14" y="14" width="6" height="6" rx="1.5" />
    </>
  ),
  apps: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M8 9h8M8 13h5" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </>
  ),
  tasks: (
    <>
      <path d="M8 6h11M8 12h11M8 18h11" />
      <path d="m4 6 1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />
    </>
  ),
  archive: (
    <>
      <path d="M4 7h16v13H4zM3 4h18v3H3z" />
      <path d="M10 11h4" />
    </>
  ),
  harddrive: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 15h.01M11 15h6" />
    </>
  ),
  bell: (
    <>
      <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
    </>
  ),
  settings: (
    <>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
      <circle cx="12" cy="12" r="4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </>
  ),
  chevron: <path d="m9 18 6-6-6-6" />,
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-14-4L4 9" />
      <path d="M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2" />
      <path d="M20 20v-5h-5" />
    </>
  ),
  play: <path d="m8 5 11 7-11 7z" />,
  pause: (
    <>
      <path d="M8 5v14M16 5v14" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  edit: (
    <>
      <path d="m14.5 5.5 4 4M4 20l4.2-1 10-10a2.8 2.8 0 0 0-4-4l-10 10L4 20z" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  close: (
    <>
      <path d="m6 6 12 12M18 6 6 18" />
    </>
  ),
  warning: (
    <>
      <path d="m12 3 9 17H3z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  folder: (
    <>
      <path d="M3 6h7l2 2h9v10H3z" />
    </>
  ),
  file: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v5h5" />
    </>
  ),
  fileText: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v5h5M9 13h6M9 17h5" />
    </>
  ),
  image: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m5 17 4.5-4 3 2.5 2.5-3 4 4.5" />
    </>
  ),
  code: (
    <>
      <path d="m9 6-6 6 6 6M15 6l6 6-6 6" />
      <path d="m14 4-4 16" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12M7 11l5 5 5-5M5 21h14" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M5 16H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1" />
    </>
  ),
  filter: (
    <>
      <path d="M4 5h16M7 12h10M10 19h4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 21a7 7 0 0 1 14 0" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 19 6v5c0 4.6-3 8.2-7 10-4-1.8-7-5.4-7-10V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="5" rx="7" ry="3" />
      <path d="M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 12v7c0 1.7 3.1 3 7 3s7-1.3 7-3v-7" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  zap: <path d="m13 2-9 12h7l-1 8 9-12h-7z" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </>
  ),
  menu: (
    <>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </>
  ),
  trend: (
    <>
      <path d="m4 16 5-5 4 3 7-8" />
      <path d="M15 6h5v5" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  downloadCloud: (
    <>
      <path d="M12 3v10M8 9l4 4 4-4" />
      <path d="M5 16a4 4 0 0 1 1-7.9A6 6 0 0 1 18 10a3 3 0 0 1 0 6zM5 20h14" />
    </>
  ),
};

function Icon({ name, size = 17, stroke = 1.8, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {iconPaths[name]}
    </svg>
  );
}

function StatusPill({ status }) {
  const map = {
    BACKUPABLE: ["good", "可备份"],
    BACKUPABLE_SHARED_WARNING: ["warn", "可备份 · 共享风险"],
    PROTECTED: ["good", "正常保护"],
    UNPROTECTED: ["warn", "待首次备份"],
    UNSUPPORTED_DATABASE: ["bad", "数据库不支持"],
    NO_DATA: ["neutral", "无应用数据"],
    VERIFIED: ["good", "校验通过"],
    WARNING: ["warn", "校验警告"],
    RUNNING: ["violet", "运行中"],
    QUEUED: ["neutral", "排队中"],
    SUCCESS: ["good", "成功"],
    FAILED: ["bad", "失败"],
    PAUSED: ["neutral", "已暂停"],
    INFO: ["violet", "信息"],
  };
  const [kind, label] = map[status] || ["neutral", status];
  return (
    <span className={"pill " + kind}>
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: "currentColor",
          display: "inline-block",
        }}
      ></span>
      {label}
    </span>
  );
}
function ModePill({ mode }) {
  return (
    <span className={"mode " + (mode === "single" ? "shared" : "")}>
      <span className="mode-dot"></span>
      {mode === "single" ? "单实例" : "多实例"}
    </span>
  );
}
function AppIcon({ app, size = "normal" }) {
  return (
    <div
      className="app-avatar"
      style={{
        background: app.color,
        width: size === "large" ? 48 : 34,
        height: size === "large" ? 48 : 34,
        borderRadius: size === "large" ? 15 : 11,
      }}
    >
      {app.initials}
    </div>
  );
}
function SectionHead({ title, caption, action }) {
  return (
    <div className="card-head">
      <div>
        <div className="card-title">{title}</div>
        {caption && <div className="card-caption">{caption}</div>}
      </div>
      {action}
    </div>
  );
}
function StatCard({ label, value, foot, icon, tone }) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className="stat-icon" style={tone ? { color: tone } : null}>
          <Icon name={icon} size={15} />
        </span>
      </div>
      <div className="stat-value">{value}</div>
      <div className={"stat-foot " + (foot?.kind || "")}>
        {foot?.kind === "positive" && <Icon name="trend" size={12} />}{" "}
        {foot?.text}
      </div>
    </div>
  );
}
function Dropdown({
  options = [],
  value,
  defaultValue,
  onChange,
  className = "",
  style,
  name,
  id,
  required = false,
  "aria-label": ariaLabel,
  placeholder,
}) {
  const selectProps = value !== undefined ? { value } : { defaultValue };
  return (
    <div className={"dropdown " + className} style={style}>
      <select
        {...selectProps}
        onChange={onChange}
        name={name}
        id={id}
        required={required}
        aria-required={required || undefined}
        aria-label={ariaLabel}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => {
          const item =
            typeof option === "string"
              ? { label: option, value: option }
              : option;
          return (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          );
        })}
      </select>
      <span className="dropdown-arrow">
        <Icon name="chevron" size={13} />
      </span>
    </div>
  );
}

function Sidebar({ route, navigate, alertCount, session }) {
  const displayName = session?.displayName || "登录用户";
  const avatar = displayName.slice(0, 1) || "用";
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <img src="assets/lzc-icon.png" alt="懒猫" />
        </div>
        <div>
          <div className="brand-title">咪咪应用备份</div>
        </div>
      </div>
      {navGroups.map((group) => (
        <div className="nav-section" key={group.label}>
          <div className="nav-label">{group.label}</div>
          {group.items.map(([id, label, icon]) => (
            <button
              key={id}
              className={"nav-item " + (route === id ? "active" : "")}
              onClick={() => navigate(id)}
            >
              <Icon name={icon} size={17} />
              <span>{label}</span>
              {id === "alerts" && alertCount > 0 ? (
                <span className="nav-count">{alertCount}</span>
              ) : null}
            </button>
          ))}
        </div>
      ))}
      <div className="sidebar-footer">
        <div className="tenant-card">
          <div className="tenant-row">
            <div className="avatar">{avatar}</div>
            <div>
              <div className="tenant-name">{displayName}的备份舱</div>
              <div className="tenant-uid">{session?.uid || "身份读取中"} · {session?.role || "—"}</div>
            </div>
          </div>
          <div className="tenant-check">
            <Icon name="shield" size={13} /> OIDC 身份已校验
          </div>
        </div>
      </div>
    </aside>
  );
}
function MobileNavigation({ route, navigate, alertCount }) {
  const items = navGroups.flatMap((group) => group.items);
  return (
    <nav className="mobile-nav" aria-label="移动端主导航">
      <div className="mobile-nav-scroll">
        {items.map(([id, label, icon]) => (
          <button
            key={id}
            className={"mobile-nav-item " + (route === id ? "active" : "")}
            onClick={() => navigate(id)}
            aria-current={route === id ? "page" : undefined}
          >
            <Icon name={icon} size={17} />
            <span>{label}</span>
            {id === "alerts" && alertCount > 0 ? (
              <span className="mobile-nav-count">{alertCount}</span>
            ) : null}
          </button>
        ))}
      </div>
    </nav>
  );
}
export {
  Icon,
  StatusPill,
  ModePill,
  AppIcon,
  SectionHead,
  StatCard,
  Dropdown,
  Sidebar,
  MobileNavigation,
};
