import React, { useState } from "react";
import {
  Icon,
  StatusPill,
  ModePill,
  AppIcon,
  SectionHead,
  StatCard,
  Dropdown,
} from "./components";
import { plans, snapshots, alerts } from "./data";

function ApplicationsPage({
  applications = [],
  session,
  sync,
  filters,
  onFiltersChange,
  hasPreviousPage,
  hasNextPage,
  onPreviousPage,
  onNextPage,
  loading,
  error,
  onOpenDetail,
  onStartBackup,
  onSync,
  showToast,
}) {
  const [selected, setSelected] = useState([]);
  const tabByFilter =
    filters.protectionStatus === "PROTECTED" ? "protected" :
    filters.protectionStatus === "UNPROTECTED" ? "pending" :
    filters.capabilityStatus === "BACKUPABLE" ? "backupable" :
    filters.capabilityStatus === "NO_DATA" ? "nodata" :
    filters.capabilityStatus === "UNSUPPORTED_DATABASE" ? "unsupported" : "all";
  const setTab = (tab) => {
    const next = { capabilityStatus: "", protectionStatus: "" };
    if (tab === "backupable") next.capabilityStatus = "BACKUPABLE";
    if (tab === "protected") next.protectionStatus = "PROTECTED";
    if (tab === "pending") next.protectionStatus = "UNPROTECTED";
    if (tab === "nodata") next.capabilityStatus = "NO_DATA";
    if (tab === "unsupported") next.capabilityStatus = "UNSUPPORTED_DATABASE";
    onFiltersChange(next);
  };
  const filtered = applications;
  const allSelected =
    filtered.length > 0 && filtered.every((a) => selected.includes(a.id));
  const toggleAll = () =>
    setSelected(
      allSelected
        ? selected.filter((id) => !filtered.some((a) => a.id === id))
        : Array.from(new Set([...selected, ...filtered.map((a) => a.id)])),
    );
  const toggle = (id) =>
    setSelected(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );
  return (
    <div data-screen-label="applications" className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Application shelf · 只看当前账号</div>
          <h1>应用资产柜</h1>
          <p className="page-sub">
            每个实例都来自当前 OIDC
            用户可访问的目录。数据只读，快照只写入你的懒猫网盘。
          </p>
        </div>
        <div className="head-actions">
          <button
            className="btn btn-secondary"
            onClick={onSync}
            disabled={loading || sync?.state === "RUNNING"}
          >
            <Icon name="refresh" size={14} />
            重新检测
          </button>
          <button
            className="btn btn-primary"
            disabled
          >
            <Icon name="calendar" size={14} />
            计划功能开发中
          </button>
        </div>
      </div>
      <div className="app-hero">
        <div className="hero-copy">
          <h2>{session?.displayName || "当前用户"}，今天的应用也有猫猫在守护。</h2>
          <p>
            可备份实例会进入受限的手动备份作业；单实例会在操作前提醒共享目录风险，服务型数据库会被安全阻断。
          </p>
          <div className="hero-badges">
            <span className="hero-badge">
              <Icon name="shield" size={12} />
              <strong>OIDC 已校验</strong> tenant_uid: {session?.tenantUid || "正在读取"}
            </span>
            <span className="hero-badge">
              <Icon name="harddrive" size={12} />
              应用目录同步 {sync?.state === "RUNNING" ? "进行中" : "已就绪"}
            </span>
            <span className="hero-badge">
              <Icon name="lock" size={12} />
              应用层只读
            </span>
          </div>
        </div>
        <div className="hero-side">
          <div className="cat-peek">
            <img src="assets/lzc-icon.png" alt="懒猫文件夹" />
          </div>
        </div>
      </div>
      <div className="stats-grid">
        <StatCard
          label="可见应用实例"
          value={applications.length}
          foot={{ text: "当前用户范围" }}
          icon="apps"
        />
        <StatCard
          label="可备份"
          value={applications.filter((app) => app.status.includes("BACKUPABLE")).length}
          foot={{ kind: "positive", text: "当前探测结果" }}
          icon="shield"
          tone="var(--mint)"
        />
        <StatCard
          label="待首次备份"
          value={applications.filter((app) => app.protection === "UNPROTECTED" && app.status.includes("BACKUPABLE")).length}
          foot={{ kind: "warning", text: "计划功能开发中" }}
          icon="clock"
          tone="var(--sun-deep)"
        />
        <StatCard
          label="阻断 / 无数据"
          value={applications.filter((app) => !app.status.includes("BACKUPABLE")).length}
          foot={{ text: "数据库阻断与无数据" }}
          icon="warning"
          tone="var(--rose)"
        />
      </div>
      <div className="two-col">
        <div className="card table-card">
          <div className="toolbar">
            <div className="toolbar-left">
              <label className="searchbox">
                <Icon name="search" size={14} />
                <input
                  value={filters.q}
                  onChange={(e) => onFiltersChange({ q: e.target.value })}
                  placeholder="搜索应用名、appid、deploy_id"
                />
              </label>
              <Dropdown
                className="filter-select"
                aria-label="实例模式"
                options={[
                  { label: "全部模式", value: "all" },
                  { label: "单实例", value: "single" },
                  { label: "多实例", value: "multi" },
                ]}
                value={filters.mode || "all"}
                onChange={(e) => onFiltersChange({ mode: e.target.value === "all" ? "" : e.target.value })}
              />
            </div>
            <div className="toolbar-right">
              <span className="subtle" style={{ fontSize: 10 }}>
                {sync?.state === "RUNNING" ? "正在同步应用目录" : sync?.finishedAt ? `已同步 · ${new Intl.DateTimeFormat("zh-CN", { timeStyle: "short" }).format(new Date(sync.finishedAt))}` : "等待首次同步"}
              </span>
              <button className="icon-btn" title="筛选">
                <Icon name="filter" size={14} />
              </button>
            </div>
          </div>
          <div className="tabs">
            {[
              ["all", "全部"],
              ["backupable", "可备份"],
              ["protected", "已保护"],
              ["pending", "未保护"],
              ["nodata", "无数据"],
              ["unsupported", "数据库不支持"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={"tab " + (tabByFilter === id ? "active" : "")}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      className="check"
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                    />
                  </th>
                  <th>应用信息</th>
                  <th>实例</th>
                  <th>能力评估</th>
                  <th>数据量</th>
                  <th>最近备份</th>
                  <th style={{ textAlign: "right" }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((app) => (
                  <tr key={app.id}>
                    <td>
                      <input
                        className="check"
                        type="checkbox"
                        checked={selected.includes(app.id)}
                        onChange={() => toggle(app.id)}
                      />
                    </td>
                    <td>
                      <div className="app-cell">
                        <AppIcon app={app} />
                        <div>
                          <div className="app-name">{app.name}</div>
                          <div className="app-id">{app.appid}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <ModePill mode={app.mode} />
                      <div className="mono subtle" style={{ marginTop: 5 }}>
                        {app.deploy}
                      </div>
                    </td>
                    <td>
                      <StatusPill status={app.status} />
                      <div className="mono subtle" style={{ marginTop: 5 }}>
                        {app.sqlite
                          ? `SQLite × ${app.sqlite}`
                          : app.unsupported || "目录为空"}
                      </div>
                    </td>
                    <td>
                      <strong>{app.size}</strong>
                      <div className="subtle" style={{ marginTop: 4 }}>
                        {app.files} 文件
                      </div>
                    </td>
                    <td>
                      <div>{app.last}</div>
                      <div className="subtle" style={{ marginTop: 4 }}>
                        {app.protection === "PROTECTED"
                          ? "下次 " + app.next
                          : "尚未建立计划"}
                      </div>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-btn"
                          title="查看详情"
                          onClick={() => onOpenDetail(app)}
                        >
                          <Icon name="eye" size={14} />
                        </button>
                        {app.status.includes("BACKUPABLE") && (
                          <button
                            className="icon-btn"
                            title={app.mode === "single" ? "确认共享风险后备份" : "立即备份"}
                            onClick={() => app.mode === "single" ? onOpenDetail(app) : onStartBackup(app)}
                          >
                            <Icon name="zap" size={14} />
                          </button>
                        )}
                        <button
                          className="icon-btn"
                          title="更多"
                          onClick={() =>
                            showToast(
                              "操作菜单",
                              "计划、任务和快照操作请从对应菜单进入。",
                            )
                          }
                        >
                          <Icon name="more" size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {loading && <div className="empty"><strong>正在读取当前用户的应用目录…</strong></div>}
          {error && <div className="empty"><strong>应用目录暂时不可用</strong><p>{error}</p></div>}
          {filtered.length === 0 && (
            <div className="empty">
              <div className="empty-icon">
                <Icon name="search" size={18} />
              </div>
              <strong>没有找到匹配的应用</strong>
              <p>试试应用名、appid 或 deploy_id。</p>
            </div>
          )}
          <div className="row-actions" style={{ justifyContent: "flex-end", marginTop: 14 }}>
            <button className="btn btn-secondary btn-small" disabled={!hasPreviousPage || loading} onClick={onPreviousPage}>上一页</button>
            <button className="btn btn-secondary btn-small" disabled={!hasNextPage || loading} onClick={onNextPage}>下一页</button>
          </div>
          {selected.length > 0 && (
            <div className="bulk-bar">
              <div className="bulk-copy">
                <strong>{selected.length}</strong> 个实例已选中{" "}
                <span style={{ color: "#b9c9e3" }}>
                  · 可备份{" "}
                  {
                    selected.filter((id) =>
                        applications
                        .find((a) => a.id === id)
                        ?.status.includes("BACKUPABLE"),
                    ).length
                  }
                </span>
              </div>
              <div className="bulk-actions">
                <button
                  className="btn btn-secondary btn-small"
                  onClick={() => setSelected([])}
                >
                  清除选择
                </button>
                <button
                  className="btn btn-secondary btn-small"
                  disabled
                >
                  批量计划开发中
                </button>
                <button
                  className="btn btn-primary btn-small"
                  disabled
                >
                  批量备份开发中
                </button>
              </div>
            </div>
          )}
        </div>
        <CatalogStatus applications={applications} sync={sync} onSync={onSync} loading={loading} />
      </div>
    </div>
  );
}

function CatalogStatus({ applications, sync, onSync, loading }) {
  const backupable = applications.filter((app) => app.status.includes("BACKUPABLE")).length;
  const blocked = applications.filter((app) => app.status === "UNSUPPORTED_DATABASE").length;
  const noData = applications.filter((app) => app.status === "NO_DATA").length;
  return (
    <div className="card radar">
      <SectionHead
        title="当前页检测结果"
        caption="仅统计服务端已持久化的当前页实例"
        action={
          <button
            className="icon-btn"
            onClick={onSync}
            disabled={loading || sync?.state === "RUNNING"}
          >
            <Icon name="refresh" size={14} />
          </button>
        }
      />
      <div className="legend">
        <div className="legend-item">
          <span className="legend-label">
            <i className="legend-dot" style={{ background: "var(--mint)" }}></i>
            可备份
          </span>
          <strong>{backupable}</strong>
        </div>
        <div className="legend-item">
          <span className="legend-label">
            <i className="legend-dot" style={{ background: "var(--sun)" }}></i>
            无应用数据
          </span>
          <strong>{noData}</strong>
        </div>
        <div className="legend-item">
          <span className="legend-label">
            <i className="legend-dot" style={{ background: "var(--rose)" }}></i>
            数据库阻断
          </span>
          <strong>{blocked}</strong>
        </div>
      </div>
      <div className="risk-box">
        <div className="risk-title">
          <Icon name="warning" size={13} />
          同步状态
        </div>
        <div className="risk-list">
          <div className="risk-item">
            <i className="dot-pulse"></i>
            <span>{sync?.state === "RUNNING" ? "目录同步和探测正在进行。" : sync?.state === "FAILED" ? "最近一次同步失败，请重新检测。" : "列表显示最近一次成功持久化的结果。"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewPage({ navigate, showToast }) {
  return (
    <div data-screen-label="overview" className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Overview · 今日状态</div>
          <h1>你的应用，正在被好好照看。</h1>
          <p className="page-sub">
            截至 08:24，备份引擎稳定运行，下一批任务将在今晚 02:00 开始。
          </p>
        </div>
        <div className="head-actions">
          <button
            className="btn btn-secondary"
            onClick={() => navigate("tasks")}
          >
            <Icon name="tasks" size={14} />
            查看任务
          </button>
          <button
            className="btn btn-primary"
            onClick={() => navigate("applications")}
          >
            <Icon name="apps" size={14} />
            管理应用
          </button>
        </div>
      </div>
      <div className="overview-hero">
        <div>
          <h2>早上好，林墨。</h2>
          <p>
            今天有 2 个计划会在夜间运行，预计写入 1.6 GB
            网盘空间。猫猫已经帮你把单实例共享风险放进待办。
          </p>
          <div className="metric-strip">
            <span className="metric-chip">
              <strong>3 / 5</strong> 可备份实例
            </span>
            <span className="metric-chip">
              <strong>2</strong> 个计划运行中
            </span>
            <span className="metric-chip">
              <strong>61.6 GB</strong> 可用
            </span>
          </div>
        </div>
        <div className="hero-cat-large">
          <img src="assets/lzc-icon.png" alt="懒猫" />
        </div>
      </div>
      <div className="stats-grid">
        <StatCard
          label="已发现应用"
          value="5"
          foot={{ text: "全部来自当前用户目录" }}
          icon="apps"
        />
        <StatCard
          label="已保护实例"
          value="2"
          foot={{ kind: "positive", text: "过去 7 天成功率 100%" }}
          icon="shield"
          tone="var(--mint)"
        />
        <StatCard
          label="最近 24h 任务"
          value="8"
          foot={{ kind: "positive", text: "7 成功 · 1 警告" }}
          icon="tasks"
          tone="var(--violet)"
        />
        <StatCard
          label="网盘占用"
          value="38.4 GB"
          foot={{ kind: "warning", text: "使用 38.4% · 空间充足" }}
          icon="harddrive"
          tone="var(--sun-deep)"
        />
      </div>
      <div className="dashboard-grid">
        <div className="grid">
          <div className="card card-pad">
            <SectionHead
              title="未来 24h 定时批次"
              caption="计划时间按 Asia/Shanghai 显示"
              action={
                <button
                  className="btn btn-ghost btn-small"
                  onClick={() => navigate("plans")}
                >
                  管理计划 <Icon name="arrow" size={12} />
                </button>
              }
            />
            <div className="mini-list">
              <div className="mini-row">
                <div className="mini-main">
                  <div className="mini-icon">
                    <Icon name="calendar" size={14} />
                  </div>
                  <div>
                    <div className="mini-name">Notus 夜间守护</div>
                    <div className="mini-meta">
                      明天 02:00 · 1 个实例 · 420 MB
                    </div>
                  </div>
                </div>
                <button
                  className="btn btn-secondary btn-small"
                  onClick={() =>
                    showToast("已加入队列", "Notus 将在当前工作池中优先执行。")
                  }
                >
                  <Icon name="play" size={11} />
                  立即执行
                </button>
              </div>
              <div className="mini-row">
                <div className="mini-main">
                  <div
                    className="mini-icon"
                    style={{
                      background: "var(--violet-soft)",
                      color: "var(--violet)",
                    }}
                  >
                    <Icon name="calendar" size={14} />
                  </div>
                  <div>
                    <div className="mini-name">文档双保险</div>
                    <div className="mini-meta">
                      下周一 03:30 · 2 个实例 · 22.1 GB
                    </div>
                  </div>
                </div>
                <button
                  className="btn btn-ghost btn-small"
                  onClick={() => navigate("plans")}
                >
                  查看
                </button>
              </div>
            </div>
          </div>
          <div className="card card-pad">
            <SectionHead
              title="最近活动"
              caption="你的实例和快照的审计轨迹"
              action={
                <button
                  className="btn btn-ghost btn-small"
                  onClick={() => navigate("tasks")}
                >
                  全部活动
                </button>
              }
            />
            <div className="activity">
              <div className="activity-item">
                <div className="activity-icon">
                  <Icon name="check" size={13} />
                </div>
                <div className="activity-text">
                  <strong>Paperless 文档</strong> 快照校验通过，1.2 GB
                  已写入网盘。
                </div>
                <div className="activity-time">08:10</div>
              </div>
              <div className="activity-item">
                <div
                  className="activity-icon"
                  style={{ background: "#fff1d4", color: "var(--sun-deep)" }}
                >
                  <Icon name="warning" size={13} />
                </div>
                <div className="activity-text">
                  <strong>Notus 笔记</strong> 触发单实例共享风险提醒。
                </div>
                <div className="activity-time">07:42</div>
              </div>
              <div className="activity-item">
                <div
                  className="activity-icon"
                  style={{ background: "var(--sky)", color: "var(--ink-2)" }}
                >
                  <Icon name="settings" size={13} />
                </div>
                <div className="activity-text">
                  林墨 更新了“文档双保险”的保留策略。
                </div>
                <div className="activity-time">昨天</div>
              </div>
            </div>
          </div>
        </div>
        <div className="grid">
          <div className="card card-pad">
            <SectionHead
              title="资源队列"
              caption="有界并发 · 不会无限创建任务"
              action={<span className="pill violet">稳定运行</span>}
            />
            <div style={{ marginTop: 17 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 10,
                  color: "var(--ink-3)",
                  marginBottom: 7,
                }}
              >
                <span>工作池占用</span>
                <strong style={{ color: "var(--ink)" }}>3 / 6</strong>
              </div>
              <div className="progress">
                <span style={{ width: "50%" }}></span>
              </div>
            </div>
            <div className="queue-row" style={{ marginTop: 13 }}>
              <i className="queue-dot"></i>
              <div>
                <strong>SQLite 在线快照</strong>
                <span>Notus · 2 个数据库</span>
              </div>
              <div className="queue-state">运行中</div>
            </div>
            <div className="queue-row">
              <i
                className="queue-dot"
                style={{ background: "var(--mint)" }}
              ></i>
              <div>
                <strong>ZIP 流式归档</strong>
                <span>Paperless · 46 MB/s</span>
              </div>
              <div className="queue-state">运行中</div>
            </div>
            <div className="queue-row">
              <i
                className="queue-dot"
                style={{ background: "var(--violet)" }}
              ></i>
              <div>
                <strong>等待中的任务</strong>
                <span>Immich · 预计 02:03 开始</span>
              </div>
              <div className="queue-state">排队中</div>
            </div>
          </div>
          <div className="card card-pad">
            <SectionHead title="近 7 日吞吐" caption="每日成功任务数" />
            <div className="chart">
              {[45, 66, 53, 76, 63, 85, 91].map((h, i) => (
                <div
                  key={i}
                  className={"bar " + (i === 6 ? "active" : "")}
                  style={{ height: h + "%" }}
                ></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlansPage({ onPlan, showToast }) {
  const [planState, setPlanState] = useState(plans);
  return (
    <div data-screen-label="plans" className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Backup plans · 自动化</div>
          <h1>备份计划</h1>
          <p className="page-sub">
            按小时、每天、每周或 Cron 运行。所有目标都会在执行前重新检测。
          </p>
        </div>
        <div className="head-actions">
          <button
            className="btn btn-secondary"
            onClick={() =>
              showToast("补跑检查完成", "没有超过最大补跑延迟的计划。")
            }
          >
            <Icon name="refresh" size={14} />
            检查漏跑
          </button>
          <button className="btn btn-primary" onClick={() => onPlan(null)}>
            <Icon name="plus" size={14} />
            新建计划
          </button>
        </div>
      </div>
      <div className="stats-grid">
        <StatCard
          label="启用计划"
          value="2"
          foot={{ kind: "positive", text: "今晚有 2 个批次" }}
          icon="calendar"
        />
        <StatCard
          label="计划覆盖实例"
          value="3"
          foot={{ text: "动态目标 1 个" }}
          icon="apps"
        />
        <StatCard
          label="本月成功率"
          value="99.2%"
          foot={{ kind: "positive", text: "较上月 +1.4%" }}
          icon="trend"
        />
        <StatCard
          label="连续失败"
          value="0"
          foot={{ kind: "positive", text: "暂无升级告警" }}
          icon="check"
        />
      </div>
      <div className="card table-card plans-table">
        <div className="toolbar">
          <div className="toolbar-left">
            <span className="card-title">我的计划清单</span>
            <span className="pill neutral">仅当前租户</span>
          </div>
          <div className="toolbar-right">
            <button
              className="btn btn-secondary btn-small"
              onClick={() => showToast("计划已刷新", "已同步最新应用目录。")}
            >
              <Icon name="refresh" size={12} />
              刷新
            </button>
          </div>
        </div>
        {planState.map((p, i) => (
          <div className="plan-card" key={p.id}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <strong>{p.name}</strong>
                <span className="pill neutral">{p.on ? "启用" : "暂停"}</span>
              </div>
              <div className="plan-meta">
                {p.targets} · {p.count}
              </div>
            </div>
            <div>
              <div className="plan-meta">执行频率</div>
              <strong>{p.schedule}</strong>
            </div>
            <div>
              <div className="plan-meta">下次执行</div>
              <strong>{p.next}</strong>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                className={"toggle " + (p.on ? "on" : "")}
                onClick={() =>
                  setPlanState((prev) =>
                    prev.map((x, idx) => (idx === i ? { ...x, on: !x.on } : x)),
                  )
                }
              >
                <span></span>
              </button>
              <button
                className="icon-btn"
                onClick={() =>
                  showToast("计划操作", "可编辑、复制或查看该计划的批次。")
                }
              >
                <Icon name="more" size={15} />
              </button>
            </div>
          </div>
        ))}
        <div className="table-foot">
          <span>保留策略由每个计划独立维护 · 快照校验失败时自动暂停清理</span>
          <button
            className="btn btn-ghost btn-small"
            onClick={() =>
              showToast(
                "保留策略",
                "最近 / 每日 / 每周 / 每月规则可在新建向导中配置。",
              )
            }
          >
            查看规则
          </button>
        </div>
      </div>
    </div>
  );
}

function TasksPage({ onTask, showToast }) {
  const [tab, setTab] = useState("queue");
  return (
    <div data-screen-label="tasks" className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Task center · 有界队列</div>
          <h1>任务中心</h1>
          <p className="page-sub">
            查看实时队列、批次进度与任务历史。一个 deploy_id
            同时只允许一个备份任务。
          </p>
        </div>
        <div className="head-actions">
          <button
            className="btn btn-secondary"
            onClick={() =>
              showToast("队列已暂停", "新任务不会启动，当前任务继续完成。")
            }
          >
            <Icon name="pause" size={14} />
            暂停队列
          </button>
          <button
            className="btn btn-primary"
            onClick={() =>
              showToast("已恢复队列", "等待中的任务会按优先级继续运行。")
            }
          >
            <Icon name="play" size={14} />
            恢复队列
          </button>
        </div>
      </div>
      <div className="stats-grid">
        <StatCard
          label="运行中"
          value="2"
          foot={{ text: "SQLite × 1 · ZIP × 1" }}
          icon="refresh"
          tone="var(--violet)"
        />
        <StatCard
          label="排队中"
          value="1"
          foot={{ text: "预计 02:03 开始" }}
          icon="clock"
          tone="var(--sun-deep)"
        />
        <StatCard
          label="今天已完成"
          value="8"
          foot={{ kind: "positive", text: "7 成功 · 1 警告" }}
          icon="check"
          tone="var(--mint)"
        />
        <StatCard
          label="平均耗时"
          value="4m 18s"
          foot={{ kind: "positive", text: "较上周 -12%" }}
          icon="trend"
        />
      </div>
      <div className="card table-card">
        <div className="tabs" style={{ paddingTop: 14 }}>
          {[
            ["queue", "运行队列"],
            ["batches", "备份批次"],
            ["history", "任务历史"],
          ].map(([id, l]) => (
            <button
              key={id}
              className={"tab " + (tab === id ? "active" : "")}
              onClick={() => setTab(id)}
            >
              {l}
            </button>
          ))}
        </div>
        {tab === "queue" && (
          <>
            <div className="notice" style={{ margin: "14px 16px 0" }}>
              <Icon name="zap" size={14} />
              <span>
                工作池 3 / 6 · 读取 46 MB/s · ZIP 写入 21 MB/s · 预计队列清空
                02:07
              </span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>位置</th>
                    <th>应用 / deploy_id</th>
                    <th>任务阶段</th>
                    <th>预计大小</th>
                    <th>预计开始</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <span className="pill violet">运行中</span>
                    </td>
                    <td>
                      <strong>Notus 笔记</strong>
                      <div className="mono subtle">dep-notus-8839a</div>
                    </td>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 7,
                        }}
                      >
                        <span className="progress" style={{ width: 82 }}>
                          <span style={{ width: "68%" }}></span>
                        </span>
                        <span className="subtle">SQLite 快照 68%</span>
                      </div>
                    </td>
                    <td>420 MB</td>
                    <td>现在</td>
                    <td>
                      <button
                        className="btn btn-ghost btn-small"
                        onClick={() => onTask("Notus 笔记")}
                      >
                        详情
                      </button>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <span className="pill violet">运行中</span>
                    </td>
                    <td>
                      <strong>Paperless 文档</strong>
                      <div className="mono subtle">dep-paper-1002</div>
                    </td>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 7,
                        }}
                      >
                        <span className="progress" style={{ width: 82 }}>
                          <span style={{ width: "44%" }}></span>
                        </span>
                        <span className="subtle">流式归档 44%</span>
                      </div>
                    </td>
                    <td>3.4 GB</td>
                    <td>现在</td>
                    <td>
                      <button
                        className="btn btn-ghost btn-small"
                        onClick={() => onTask("Paperless 文档")}
                      >
                        详情
                      </button>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <span className="pill neutral">#3</span>
                    </td>
                    <td>
                      <strong>Immich 相册</strong>
                      <div className="mono subtle">dep-immich-1001</div>
                    </td>
                    <td>
                      <span className="subtle">等待资源配额</span>
                    </td>
                    <td>18.7 GB</td>
                    <td>约 02:03</td>
                    <td>
                      <button
                        className="btn btn-ghost btn-small"
                        onClick={() =>
                          showToast("优先级已调整", "Immich 已提升到队列 #2。")
                        }
                      >
                        调高优先级
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
        {tab === "batches" && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>批次 ID</th>
                  <th>计划名称</th>
                  <th>计划时间</th>
                  <th>任务总数</th>
                  <th>结果</th>
                  <th>窗口</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[
                  [
                    "batch-0827-02",
                    "Notus 夜间守护",
                    "2026-08-27 02:00",
                    "1",
                    "成功",
                    "内",
                  ],
                  [
                    "batch-0826-02",
                    "文档双保险",
                    "2026-08-26 02:00",
                    "2",
                    "成功 · 1 警告",
                    "内",
                  ],
                  [
                    "batch-0825-manual",
                    "手动备份",
                    "2026-08-25 17:42",
                    "1",
                    "成功",
                    "内",
                  ],
                ].map((row) => (
                  <tr key={row[0]}>
                    <td className="mono">{row[0]}</td>
                    <td>
                      <strong>{row[1]}</strong>
                    </td>
                    <td>{row[2]}</td>
                    <td>{row[3]}</td>
                    <td>
                      <StatusPill
                        status={
                          row[4].startsWith("成功") ? "SUCCESS" : "WARNING"
                        }
                      />
                    </td>
                    <td>
                      <span className="pill good">{row[5]}窗口</span>
                    </td>
                    <td>
                      <button
                        className="btn btn-ghost btn-small"
                        onClick={() => onTask(row[0])}
                      >
                        查看批次
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tab === "history" && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>完成时间</th>
                  <th>应用</th>
                  <th>触发方式</th>
                  <th>状态</th>
                  <th>源大小</th>
                  <th>耗时</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[
                  [
                    "今天 02:04",
                    "Notus 笔记",
                    "定时",
                    "SUCCESS",
                    "420 MB",
                    "3m 12s",
                  ],
                  [
                    "今天 02:06",
                    "Paperless 文档",
                    "定时",
                    "SUCCESS",
                    "3.4 GB",
                    "5m 48s",
                  ],
                  [
                    "昨天 18:20",
                    "Immich 相册",
                    "手动",
                    "WARNING",
                    "18.7 GB",
                    "12m 06s",
                  ],
                  [
                    "08-25 02:02",
                    "Notus 笔记",
                    "定时",
                    "SUCCESS",
                    "418 MB",
                    "3m 09s",
                  ],
                ].map((row) => (
                  <tr key={row[0] + row[1]}>
                    <td>{row[0]}</td>
                    <td>
                      <strong>{row[1]}</strong>
                    </td>
                    <td>
                      <span className="pill neutral">{row[2]}</span>
                    </td>
                    <td>
                      <StatusPill status={row[3]} />
                    </td>
                    <td>{row[4]}</td>
                    <td>{row[5]}</td>
                    <td>
                      <button
                        className="btn btn-ghost btn-small"
                        onClick={() => onTask(row[1])}
                      >
                        查看详情
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="table-foot">
          <span>显示 1–3 / 当前用户任务</span>
          <div className="pager">
            <button className="active">1</button>
            <button>2</button>
            <button>›</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BackupsPage({ onSnapshot, showToast }) {
  const [view, setView] = useState("app");
  return (
    <div data-screen-label="backups" className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Backup library · 快照索引</div>
          <h1>备份库</h1>
          <p className="page-sub">
            按应用、时间或计划浏览当前用户网盘中的已完成快照。V1
            只提供校验与导出，不直接恢复到目标应用。
          </p>
        </div>
        <div className="head-actions">
          <button
            className="btn btn-secondary"
            onClick={() =>
              showToast(
                "索引已重建",
                "已扫描 LazycatAppBackup，发现 3 份快照。",
              )
            }
          >
            <Icon name="refresh" size={14} />
            重建索引
          </button>
          <button
            className="btn btn-primary"
            onClick={() =>
              showToast("导出准备中", "请从快照详情选择导出到恢复目录。")
            }
          >
            <Icon name="download" size={14} />
            导出快照
          </button>
        </div>
      </div>
      <div className="stats-grid">
        <StatCard
          label="已完成快照"
          value="3"
          foot={{ kind: "positive", text: "全部包含 manifest.json" }}
          icon="archive"
        />
        <StatCard
          label="校验通过"
          value="2"
          foot={{ text: "1 份待重新校验" }}
          icon="shield"
          tone="var(--mint)"
        />
        <StatCard
          label="ZIP 总大小"
          value="1.57 GB"
          foot={{ text: "原始数据 4.2 GB" }}
          icon="harddrive"
        />
        <StatCard
          label="保留中"
          value="3"
          foot={{ text: "最近 / 每周规则生效" }}
          icon="clock"
          tone="var(--violet)"
        />
      </div>
      <div className="card table-card">
        <div className="toolbar">
          <div className="toolbar-left">
            <span className="card-title">快照浏览</span>
            <div className="tabs" style={{ padding: 0 }}>
              {[
                ["app", "按应用"],
                ["time", "按时间"],
                ["plan", "按计划"],
              ].map(([id, l]) => (
                <button
                  key={id}
                  className={"tab " + (view === id ? "active" : "")}
                  onClick={() => setView(id)}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="toolbar-right">
            <label className="searchbox" style={{ width: 215 }}>
              <Icon name="search" size={14} />
              <input placeholder="搜索应用或 deploy_id" />
            </label>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>快照时间</th>
                <th>应用 / 实例</th>
                <th>模式</th>
                <th>文件</th>
                <th>ZIP / 原始大小</th>
                <th>完整性</th>
                <th>保留</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.time.slice(0, 10)}</strong>
                    <div className="subtle" style={{ marginTop: 4 }}>
                      {s.time.slice(11)}
                    </div>
                  </td>
                  <td>
                    <strong>{s.app}</strong>
                    <div className="mono subtle">{s.deploy}</div>
                  </td>
                  <td>
                    <ModePill mode={s.mode} />
                  </td>
                  <td>
                    {s.files}
                    <div className="subtle" style={{ marginTop: 4 }}>
                      SQLite × {s.sqlite}
                    </div>
                  </td>
                  <td>
                    <strong>{s.zip}</strong>
                    <div className="subtle" style={{ marginTop: 4 }}>
                      原始 {s.raw}
                    </div>
                  </td>
                  <td>
                    <StatusPill status={s.integrity} />
                    <div className="mono subtle" style={{ marginTop: 5 }}>
                      SHA {s.sha}
                    </div>
                  </td>
                  <td>
                    <span className="pill neutral">{s.keep}</span>
                  </td>
                  <td>
                    <button
                      className="btn btn-ghost btn-small"
                      onClick={() => onSnapshot(s)}
                    >
                      详情 <Icon name="chevron" size={11} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-foot">
          <span>外部 manifest 最后写入 · 只索引 completed 快照</span>
          <div className="pager">
            <button className="active">1</button>
            <button>›</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StoragePage({ showToast }) {
  return (
    <div data-screen-label="storage" className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Storage · 你的懒猫网盘</div>
          <h1>存储</h1>
          <p className="page-sub">
            备份应用只保存任务状态和短生命周期临时文件，长期快照全部写入当前用户自己的网盘。
          </p>
        </div>
        <div className="head-actions">
          <button
            className="btn btn-secondary"
            onClick={() =>
              showToast("扫描完成", "已对账 LazycatAppBackup 目录。")
            }
          >
            <Icon name="refresh" size={14} />
            立即扫描
          </button>
          <button
            className="btn btn-primary"
            onClick={() =>
              showToast(
                "维护任务已加入队列",
                "清理过期临时目录不会影响已完成快照。",
              )
            }
          >
            <Icon name="settings" size={14} />
            运行维护
          </button>
        </div>
      </div>
      <div className="storage-layout">
        <div className="grid">
          <div className="card storage-meter">
            <SectionHead
              title="空间概览"
              caption="统计范围：当前 OIDC 用户的懒猫网盘"
              action={<span className="pill good">空间充足</span>}
            />
            <div className="meter-big">
              <div className="meter-ring">
                <div className="meter-text">
                  <strong>38.4%</strong>
                  <span>已使用</span>
                </div>
              </div>
              <div className="meter-copy">
                <strong>
                  38.4 GB{" "}
                  <span className="subtle" style={{ fontWeight: 400 }}>
                    of 100 GB
                  </span>
                </strong>
                <p>
                  还剩 61.6 GB，可容纳约 49 份 Notus 快照。空间达到 80%
                  时会发出告警。
                </p>
                <div style={{ display: "flex", gap: 7, marginTop: 11 }}>
                  <span className="pill good">网盘可写</span>
                  <span className="pill neutral">最近写入 08:10</span>
                </div>
              </div>
            </div>
            <div className="progress" style={{ height: 10 }}>
              <span style={{ width: "38.4%" }}></span>
            </div>
            <div className="storage-kpis" style={{ marginTop: 18 }}>
              <div className="storage-kpi">
                <span>快照数量</span>
                <strong>3</strong>
              </div>
              <div className="storage-kpi">
                <span>ZIP 总大小</span>
                <strong>1.57 GB</strong>
              </div>
              <div className="storage-kpi">
                <span>临时任务</span>
                <strong>1</strong>
              </div>
            </div>
          </div>
          <div className="card card-pad">
            <SectionHead title="占用最大的应用" caption="按 ZIP 大小排序" />
            <div className="mini-list">
              <div className="mini-row">
                <div className="mini-main">
                  <AppIcon app={applications[2]} />
                  <div>
                    <div className="mini-name">Immich 相册</div>
                    <div className="mini-meta">预计 18.7 GB · 尚未建立计划</div>
                  </div>
                </div>
                <span className="pill warn">待保护</span>
              </div>
              <div className="mini-row">
                <div className="mini-main">
                  <AppIcon app={applications[1]} />
                  <div>
                    <div className="mini-name">Paperless 文档</div>
                    <div className="mini-meta">1.2 GB · 2 份快照</div>
                  </div>
                </div>
                <span className="pill good">正常</span>
              </div>
              <div className="mini-row">
                <div className="mini-main">
                  <AppIcon app={applications[0]} />
                  <div>
                    <div className="mini-name">Notus 笔记</div>
                    <div className="mini-meta">375 MB · 1 份快照</div>
                  </div>
                </div>
                <span className="pill good">正常</span>
              </div>
            </div>
          </div>
        </div>
        <div className="grid">
          <div className="card card-pad">
            <SectionHead
              title="固定目录结构"
              caption="UTC 时间目录 · 不暴露宿主机绝对路径"
            />
            <div className="tree" style={{ marginTop: 16 }}>
              <div className="folder">LazycatAppBackup/</div>
              <div>
                ├── <span className="folder">20260827T020000.000Z/</span>
              </div>
              <div>
                │ └── <span className="folder">dep-notus-8839a/</span>
              </div>
              <div>
                │ ├── <span className="file">snapshot.zip</span>
              </div>
              <div>
                │ └── <span className="file">manifest.json</span>
              </div>
              <div>
                ├── <span className="folder">_partial/</span>{" "}
                <span className="subtle">(1 个运行中)</span>
              </div>
              <div>
                ├── <span className="folder">_trash/</span>
              </div>
              <div>
                └── <span className="folder">_restore_exports/</span>
              </div>
            </div>
            <div className="notice" style={{ marginTop: 13 }}>
              <Icon name="lock" size={14} />
              <span>
                根目录只读展示。产品不提供任意宿主机路径输入，也不会写入目标应用
                appvar。
              </span>
            </div>
          </div>
          <div className="card card-pad">
            <SectionHead title="维护时间线" caption="自动清理和校验" />
            <div className="activity">
              <div className="activity-item">
                <div className="activity-icon">
                  <Icon name="check" size={13} />
                </div>
                <div className="activity-text">
                  <strong>快照索引对账</strong> 已完成，3 份 manifest 与 ZIP
                  一致。
                </div>
                <div className="activity-time">08:10</div>
              </div>
              <div className="activity-item">
                <div
                  className="activity-icon"
                  style={{ background: "var(--sky)", color: "var(--ink-2)" }}
                >
                  <Icon name="refresh" size={13} />
                </div>
                <div className="activity-text">
                  <strong>临时目录扫描</strong> 发现 1 个运行中的任务目录。
                </div>
                <div className="activity-time">07:58</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AlertsPage({ showToast }) {
  const [items, setItems] = useState(alerts);
  return (
    <div data-screen-label="alerts" className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Alerts · 需要你的确认</div>
          <h1>告警</h1>
          <p className="page-sub">
            权限、任务、数据库和存储异常会在这里留下可追踪的处理记录。
          </p>
        </div>
        <div className="head-actions">
          <button className="btn btn-secondary" onClick={() => setItems([])}>
            <Icon name="check" size={14} />
            全部标记已读
          </button>
          <button
            className="btn btn-primary"
            onClick={() =>
              showToast(
                "告警规则",
                "首次失败、连续失败、空间不足和校验失败均已开启。",
              )
            }
          >
            <Icon name="settings" size={14} />
            告警设置
          </button>
        </div>
      </div>
      <div className="stats-grid">
        <StatCard
          label="未处理"
          value={items.length}
          foot={{ kind: "warning", text: "需要确认 1 项共享风险" }}
          icon="bell"
          tone="var(--rose)"
        />
        <StatCard
          label="本周事件"
          value="8"
          foot={{ text: "较上周 -3" }}
          icon="trend"
        />
        <StatCard
          label="权限状态"
          value="4 / 4"
          foot={{ kind: "positive", text: "必需权限正常" }}
          icon="shield"
          tone="var(--mint)"
        />
        <StatCard
          label="最后扫描"
          value="08:10"
          foot={{ text: "网盘与 appvar 均正常" }}
          icon="refresh"
        />
      </div>
      <div className="alert-list">
        {items.map((a) => (
          <div className="alert-item" key={a.id}>
            <div className={"alert-icon " + a.level}>
              <Icon
                name={
                  a.level === "good"
                    ? "check"
                    : a.level === "bad"
                      ? "warning"
                      : "info"
                }
                size={16}
              />
            </div>
            <div>
              <strong>{a.title}</strong>
              <p>{a.copy}</p>
              <div style={{ display: "flex", gap: 7, marginTop: 9 }}>
                <span
                  className={
                    "pill " +
                    (a.level === "good"
                      ? "good"
                      : a.level === "bad"
                        ? "bad"
                        : "warn")
                  }
                >
                  {a.level === "good"
                    ? "信息"
                    : a.level === "bad"
                      ? "严重"
                      : "警告"}
                </span>
                <span className="pill neutral">OIDC · 当前租户</span>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="alert-time">{a.time}</div>
              <button
                className="btn btn-ghost btn-small"
                style={{ marginTop: 8 }}
                onClick={() => {
                  setItems(items.filter((x) => x.id !== a.id));
                  showToast("已确认处理", a.title);
                }}
              >
                {a.action}
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="card empty">
            <div className="empty-icon">
              <Icon name="check" size={18} />
            </div>
            <strong>告警都处理好了</strong>
            <p>新的异常会在这里出现。</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsPage({ showToast }) {
  const [tab, setTab] = useState("general");
  const [advanced, setAdvanced] = useState(false);
  const labels = {
    general: "常规设置",
    performance: "调度与性能",
    engine: "备份引擎",
    notifications: "通知",
    account: "账户与登录",
    environment: "权限与环境",
  };
  return (
    <div data-screen-label="settings" className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Settings · 引擎与会话</div>
          <h1>设置</h1>
          <p className="page-sub">
            调整备份引擎、通知和会话偏好。用户 UID
            与网盘根目录由平台绑定，不能在此修改。
          </p>
        </div>
        <div className="head-actions">
          <button
            className="btn btn-secondary"
            onClick={() =>
              showToast("设置已保存", "新的偏好会从下一批任务开始生效。")
            }
          >
            <Icon name="check" size={14} />
            保存设置
          </button>
        </div>
      </div>
      <div className="settings-layout">
        <div className="card settings-nav">
          {[
            ["general", "常规", "globe"],
            ["performance", "调度与性能", "zap"],
            ["engine", "备份引擎", "archive"],
            ["notifications", "通知", "bell"],
            ["account", "账户与登录", "user"],
            ["environment", "权限与环境", "shield"],
          ].map(([id, label, icon]) => (
            <button
              key={id}
              className={"settings-tab " + (tab === id ? "active" : "")}
              onClick={() => setTab(id)}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icon name={icon} size={14} />
                {label}
              </span>
              <Icon name="chevron" size={13} />
            </button>
          ))}
        </div>
        <div className="card settings-panel">
          <SectionHead
            title={labels[tab]}
            caption="只影响当前用户的备份应用实例"
          />
          <div className="settings-content">
            {tab === "general" && (
              <div>
                <div className="setting-row">
                  <div>
                    <strong>页面语言</strong>
                    <p>切换不会丢失筛选和表单草稿。</p>
                  </div>
                  <Dropdown
                    className="filter-select"
                    defaultValue="zh-CN"
                    options={[
                      { label: "简体中文", value: "zh-CN" },
                      { label: "English", value: "en-US" },
                    ]}
                    aria-label="页面语言"
                  />
                </div>
                <div className="setting-row">
                  <div>
                    <strong>默认时区</strong>
                    <p>计划时间、批次和通知会按此显示。</p>
                  </div>
                  <Dropdown
                    className="filter-select"
                    defaultValue="Asia/Shanghai"
                    options={["Asia/Shanghai", "UTC"]}
                    aria-label="默认时区"
                  />
                </div>
                <div className="setting-row">
                  <div>
                    <strong>展示高级设置</strong>
                    <p>打开后显示限速、重试和窗口参数。</p>
                  </div>
                  <button
                    className={"toggle " + (advanced ? "on" : "")}
                    onClick={() => setAdvanced(!advanced)}
                  >
                    <span></span>
                  </button>
                </div>
              </div>
            )}
            {tab === "performance" && (
              <div>
                <div className="setting-row">
                  <div>
                    <strong>普通 ZIP 并发</strong>
                    <p>有界工作池，避免同时打开过多文件。</p>
                  </div>
                  <input
                    className="range"
                    type="range"
                    defaultValue="3"
                    min="1"
                    max="8"
                  />
                </div>
                <div className="setting-row">
                  <div>
                    <strong>SQLite 快照并发</strong>
                    <p>Online Backup API 独立限流。</p>
                  </div>
                  <input
                    className="range"
                    type="range"
                    defaultValue="2"
                    min="1"
                    max="4"
                  />
                </div>
                <div className="setting-row">
                  <div>
                    <strong>读取限速</strong>
                    <p>大型任务超过阈值时自动降速。</p>
                  </div>
                  <Dropdown
                    className="filter-select"
                    defaultValue="自适应"
                    options={["自适应", "50 MB/s", "100 MB/s"]}
                    aria-label="读取限速"
                  />
                </div>
                <div className="setting-row">
                  <div>
                    <strong>错过计划后的补跑</strong>
                    <p>最长补跑延迟 6 小时。</p>
                  </div>
                  <button className="toggle on">
                    <span></span>
                  </button>
                </div>
              </div>
            )}
            {tab === "engine" && (
              <div>
                <div className="setting-row">
                  <div>
                    <strong>压缩策略</strong>
                    <p>文本与数据库使用 Deflate，JPEG/PNG 使用 Store。</p>
                  </div>
                  <span className="pill good">自动</span>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>普通文件一致性</strong>
                    <p>文件变化时重试，达到上限后严格失败。</p>
                  </div>
                  <span className="pill good">严格模式</span>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>SQLite busy 超时</strong>
                    <p>失败时不降级为普通复制。</p>
                  </div>
                  <span className="pill neutral">30 秒</span>
                </div>
              </div>
            )}
            {tab === "notifications" && (
              <div>
                <div className="setting-row">
                  <div>
                    <strong>首次失败</strong>
                    <p>任务第一次失败时发送系统通知。</p>
                  </div>
                  <button className="toggle on">
                    <span></span>
                  </button>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>连续失败升级</strong>
                    <p>连续 3 次失败升级为严重告警。</p>
                  </div>
                  <button className="toggle on">
                    <span></span>
                  </button>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>每日摘要</strong>
                    <p>每天 09:00 汇总成功、失败与空间。</p>
                  </div>
                  <button className="toggle">
                    <span></span>
                  </button>
                </div>
              </div>
            )}
            {tab === "account" && (
              <div>
                <div className="notice good">
                  <Icon name="shield" size={14} />
                  <span>
                    当前身份已通过 OIDC、X-HC-User-ID 与 tenant_uid
                    三方一致性检查。
                  </span>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>当前用户</strong>
                    <p>林墨 · uid-linmo-1001</p>
                  </div>
                  <span className="pill violet">NORMAL</span>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>会话到期</strong>
                    <p>2026-08-27 18:20 · 到期后需要重新登录</p>
                  </div>
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() =>
                      showToast("重新登录", "即将跳转懒猫 OIDC 授权入口。")
                    }
                  >
                    重新登录
                  </button>
                </div>
              </div>
            )}
            {tab === "environment" && (
              <div>
                <div className="setting-row">
                  <div>
                    <strong>appvar.other.read</strong>
                    <p>当前用户可访问的应用数据投影</p>
                  </div>
                  <span className="pill good">已启用</span>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>document.write</strong>
                    <p>写入当前用户懒猫网盘</p>
                  </div>
                  <span className="pill good">已启用</span>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>user.notify</strong>
                    <p>发送失败、空间和校验通知</p>
                  </div>
                  <span className="pill good">已启用</span>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>运行时投影</strong>
                    <p>/lzcapp/run/data/app/var · 最近检测 08:10</p>
                  </div>
                  <span className="pill good">正常</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SetupPage({ showToast, navigate }) {
  const [step, setStep] = useState(1);
  const steps = ["能力与边界", "身份检查", "权限检测", "应用扫描", "首次备份"];
  return (
    <div data-screen-label="setup" className="page">
      <div className="setup-layout">
        <div className="page-head">
          <div>
            <div className="eyebrow">First run · 给猫猫 5 分钟</div>
            <h1>首次使用向导</h1>
            <p className="page-sub">
              完成身份、权限、应用扫描和第一份快照，之后备份会按计划自动运行。
            </p>
          </div>
          <button
            className="btn btn-ghost"
            onClick={() => navigate("overview")}
          >
            跳过向导
          </button>
        </div>
        <div className="card setup-card">
          <div className="setup-intro">
            <div>
              <h2>把应用数据放进安全的猫窝</h2>
              <p>
                支持普通文件、目录和标准 SQLite
                3；服务型数据库会被阻止。所有备份都属于当前登录用户。
              </p>
            </div>
            <div className="cat-peek" style={{ width: 74, height: 74 }}>
              <img src="assets/lzc-icon.png" alt="懒猫" />
            </div>
          </div>
          <div className="stepper">
            {steps.map((s, i) => (
              <div
                key={s}
                className={
                  "step " +
                  (step === i + 1 ? "active " : "") +
                  (step > i + 1 ? "done" : "")
                }
              >
                <span className="step-num">
                  {step > i + 1 ? <Icon name="check" size={12} /> : i + 1}
                </span>
                <span>{s}</span>
              </div>
            ))}
          </div>
          {step === 1 && (
            <>
              <div className="notice warn">
                <Icon name="warning" size={14} />
                <span>
                  单实例应用可能包含共享数据。首次备份或创建计划时，系统会再次请求确认。
                </span>
              </div>
              <div className="check-grid">
                <div className="check-card">
                  <div className="status-mark">
                    <Icon name="check" size={13} />
                  </div>
                  <div>
                    <strong>普通文件与目录</strong>
                    <span>文件级、尽力一致</span>
                  </div>
                </div>
                <div className="check-card">
                  <div className="status-mark">
                    <Icon name="check" size={13} />
                  </div>
                  <div>
                    <strong>标准 SQLite 3</strong>
                    <span>Online Backup 一致性快照</span>
                  </div>
                </div>
                <div className="check-card">
                  <div
                    className="status-mark"
                    style={{
                      background: "var(--rose-soft)",
                      color: "var(--rose)",
                    }}
                  >
                    <Icon name="close" size={13} />
                  </div>
                  <div>
                    <strong>服务型数据库</strong>
                    <span>MySQL / PostgreSQL / MongoDB / Redis 阻断</span>
                  </div>
                </div>
                <div className="check-card">
                  <div
                    className="status-mark"
                    style={{ background: "var(--sky)", color: "var(--ink-2)" }}
                  >
                    <Icon name="lock" size={13} />
                  </div>
                  <div>
                    <strong>数据只读</strong>
                    <span>不写回、不覆盖目标应用</span>
                  </div>
                </div>
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <div className="notice good">
                <Icon name="shield" size={14} />
                <span>
                  身份三方一致性检查通过，当前备份范围已锁定到 uid-linmo-1001。
                </span>
              </div>
              <div className="check-grid">
                <div className="check-card">
                  <div className="status-mark">
                    <Icon name="check" size={13} />
                  </div>
                  <div>
                    <strong>OIDC 会话</strong>
                    <span>有效至 18:20</span>
                  </div>
                </div>
                <div className="check-card">
                  <div className="status-mark">
                    <Icon name="check" size={13} />
                  </div>
                  <div>
                    <strong>X-HC-User-ID</strong>
                    <span>uid-linmo-1001</span>
                  </div>
                </div>
                <div className="check-card">
                  <div className="status-mark">
                    <Icon name="check" size={13} />
                  </div>
                  <div>
                    <strong>tenant_uid</strong>
                    <span>uid-linmo-1001</span>
                  </div>
                </div>
                <div className="check-card">
                  <div className="status-mark">
                    <Icon name="check" size={13} />
                  </div>
                  <div>
                    <strong>角色</strong>
                    <span>NORMAL · 不扩大数据范围</span>
                  </div>
                </div>
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <div className="notice good">
                <Icon name="check" size={14} />
                <span>必需权限均已就绪，懒猫网盘可以接收快照。</span>
              </div>
              <div className="check-grid">
                <div className="check-card">
                  <div className="status-mark">
                    <Icon name="check" size={13} />
                  </div>
                  <div>
                    <strong>appvar.other.read</strong>
                    <span>应用数据投影正常</span>
                  </div>
                </div>
                <div className="check-card">
                  <div className="status-mark">
                    <Icon name="check" size={13} />
                  </div>
                  <div>
                    <strong>document.write</strong>
                    <span>网盘写入正常</span>
                  </div>
                </div>
                <div className="check-card">
                  <div className="status-mark">
                    <Icon name="check" size={13} />
                  </div>
                  <div>
                    <strong>user.notify</strong>
                    <span>可选 · 已启用</span>
                  </div>
                </div>
                <div className="check-card">
                  <div className="status-mark">
                    <Icon name="check" size={13} />
                  </div>
                  <div>
                    <strong>运行时投影</strong>
                    <span>/lzcapp/run/data/app/var</span>
                  </div>
                </div>
              </div>
            </>
          )}
          {step === 4 && (
            <>
              <div className="notice">
                <Icon name="refresh" size={14} />
                <span>
                  扫描已完成：发现 5 个实例，3 个可备份，1 个无数据，1
                  个数据库阻断。
                </span>
              </div>
              <div style={{ marginTop: 16 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 10,
                    marginBottom: 7,
                  }}
                >
                  <span>应用目录同步</span>
                  <strong>5 / 5</strong>
                </div>
                <div className="progress">
                  <span style={{ width: "100%" }}></span>
                </div>
              </div>
              <div className="mini-list">
                <div className="mini-row">
                  <div className="mini-main">
                    <AppIcon app={applications[0]} />
                    <div>
                      <div className="mini-name">Notus 笔记 · 单实例</div>
                      <div className="mini-meta">420 MB · SQLite × 2</div>
                    </div>
                  </div>
                  <StatusPill status="BACKUPABLE_SHARED_WARNING" />
                </div>
                <div className="mini-row">
                  <div className="mini-main">
                    <AppIcon app={applications[3]} />
                    <div>
                      <div className="mini-name">Mastodon · PostgreSQL</div>
                      <div className="mini-meta">8.2 GB · 服务型数据库</div>
                    </div>
                  </div>
                  <StatusPill status="UNSUPPORTED_DATABASE" />
                </div>
              </div>
            </>
          )}
          {step === 5 && (
            <>
              <div className="notice good">
                <Icon name="check" size={14} />
                <span>
                  扫描结果已准备好。建议先备份 Notus，验证 ZIP、manifest
                  和网盘路径。
                </span>
              </div>
              <div className="field" style={{ marginTop: 15 }}>
                <label>首个备份目标</label>
                <Dropdown
                  defaultValue="notus"
                  options={[
                    {
                      label: "Notus 笔记 · dep-notus-8839a · 420 MB",
                      value: "notus",
                    },
                    {
                      label: "Paperless 文档 · dep-paper-1002 · 3.4 GB",
                      value: "paperless",
                    },
                  ]}
                  aria-label="首个备份目标"
                />
              </div>
              <label className="checkline" style={{ marginTop: 13 }}>
                <input className="check" type="checkbox" defaultChecked />
                我已了解单实例共享数据风险，并确认只备份当前账号可访问的目录。
              </label>
            </>
          )}
          <div className="wizard-actions">
            <button
              className="btn btn-secondary"
              disabled={step === 1}
              onClick={() => setStep(step - 1)}
            >
              <Icon
                name="chevron"
                size={13}
                style={{ transform: "rotate(180deg)" }}
              />
              上一步
            </button>
            {step < 5 ? (
              <button
                className="btn btn-primary"
                onClick={() => setStep(step + 1)}
              >
                下一步 <Icon name="arrow" size={13} />
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => {
                  showToast(
                    "首个备份已加入队列",
                    "完成后可在任务中心查看 snapshot.zip 与 manifest.json。",
                  );
                  navigate("tasks");
                }}
              >
                <Icon name="play" size={13} />
                开始首个备份
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export {
  ApplicationsPage,
  CatalogStatus,
  OverviewPage,
  PlansPage,
  TasksPage,
  BackupsPage,
  StoragePage,
  AlertsPage,
  SettingsPage,
  SetupPage,
};
