import React, { useState } from "react";
import { Icon, StatusPill, ModePill, AppIcon, Dropdown } from "./components";
import { applications } from "./data";
import { api } from "../api/client";

function DetailModalLegacy({ app, close, onProbe, onStartBackup }) {
  const [sharedRiskAccepted, setSharedRiskAccepted] = useState(false);
  const [startingBackup, setStartingBackup] = useState(false);
  const backupable = app.status.includes("BACKUPABLE");
  const startBackup = async () => {
    if (!backupable || (app.mode === "single" && !sharedRiskAccepted)) return;
    setStartingBackup(true);
    try {
      await onStartBackup(app, app.mode !== "single" || sharedRiskAccepted);
    } finally {
      setStartingBackup(false);
    }
  };
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div className="modal detail-overlay-modal">
        <div className="modal-head">
          <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
            <AppIcon app={app} size="large" />
            <div>
              <div className="modal-title">{app.name}</div>
              <div className="detail-sub">
                {app.appid} · v{app.version}
              </div>
            </div>
          </div>
          <button className="icon-btn" onClick={close}>
            <Icon name="close" size={15} />
          </button>
        </div>
        <div className="modal-body detail-overlay-body">
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            <StatusPill status={app.status} />
            <ModePill mode={app.mode} />
            <span className="pill neutral">{app.updated}</span>
          </div>
          {app.mode === "single" && (
            <div className="notice warn" style={{ marginTop: 15 }}>
              <Icon name="warning" size={14} />
              <span>
                <strong>共享实例风险</strong>
                <br />
                该应用使用单实例运行，应用内部可能保存共享数据。当前范围以平台开放给本账号的目录为准。
              </span>
            </div>
          )}
          {app.mode === "single" && backupable && (
            <label className="checkline" style={{ marginTop: 11 }}>
              <input
                className="check"
                type="checkbox"
                checked={sharedRiskAccepted}
                onChange={(event) => setSharedRiskAccepted(event.target.checked)}
              />
              我已了解并继续备份当前账号可访问的共享实例数据。
            </label>
          )}
          {app.status === "UNSUPPORTED_DATABASE" && (
            <div className="notice bad" style={{ marginTop: 15 }}>
              <Icon name="warning" size={14} />
              <span>
                <strong>备份已阻断</strong>
                <br />
                检测到 {app.unsupported}。V1 不提供强制备份按钮。
              </span>
            </div>
          )}
          {app.status === "NO_DATA" && (
            <div className="notice" style={{ marginTop: 15 }}>
              <Icon name="info" size={14} />
              <span>该应用当前没有需要备份的运行数据。</span>
            </div>
          )}
          <div className="section-label">实例信息</div>
          <div className="card card-pad" style={{ boxShadow: "none" }}>
            <div className="setting-row">
              <div>
                <strong>Deploy ID</strong>
                <p className="mono">{app.deploy}</p>
              </div>
              <Icon name="copy" size={14} />
            </div>
            <div className="setting-row">
              <div>
                <strong>运行模式</strong>
                <p>
                  {app.mode === "single"
                    ? "单实例 · 共享实例风险"
                    : "多实例 · 用户隔离"}
                </p>
              </div>
              <ModePill mode={app.mode} />
            </div>
            <div className="setting-row">
              <div>
                <strong>最近检测</strong>
                <p>{app.probeErrorCode ? `检测状态：${app.probeErrorCode}` : `上次探测：${app.updated}`}</p>
              </div>
              <span className={"pill " + (app.probeErrorCode ? "bad" : "good")}>{app.probeErrorCode ? "待处理" : "已完成"}</span>
            </div>
          </div>
          <div className="section-label">数据概览</div>
          <div className="storage-kpis">
            <div className="storage-kpi">
              <span>数据大小</span>
              <strong>{app.size}</strong>
            </div>
            <div className="storage-kpi">
              <span>文件数量</span>
              <strong>{app.files}</strong>
            </div>
            <div className="storage-kpi">
              <span>SQLite</span>
              <strong>{app.sqlite}</strong>
            </div>
          </div>
          {app.sqlite > 0 && (
            <div className="notice" style={{ marginTop: 12 }}>
              <Icon name="database" size={14} />
              <span>
                当前检测到 {app.sqlite} 个 SQLite 文件。
                <br />
                备份时会先创建 SQLite 一致性副本，再写入 ZIP。
              </span>
            </div>
          )}
          <div className="section-label">数据范围</div>
          <div className="notice">
            <Icon name="lock" size={14} />
            <span>页面只返回统计和数据库相对路径，不返回目录树、文件正文或源绝对路径。</span>
          </div>
          <div className="section-label">保护状态</div>
          <div className="card card-pad" style={{ boxShadow: "none" }}>
            <div className="setting-row">
              <div>
                <strong>最近成功快照</strong>
                <p>{app.last === "—" ? "暂无快照" : app.last}</p>
              </div>
              <StatusPill status={app.protection} />
            </div>
            <div className="setting-row">
              <div>
                <strong>下次执行</strong>
                <p>{app.next === "未设置" ? "尚未关联计划" : app.next}</p>
              </div>
              <Icon name="calendar" size={14} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
            <button
              className="btn btn-secondary"
              style={{ flex: 1 }}
              onClick={() => onProbe(app)}
            >
              <Icon name="refresh" size={14} />
              重新检测
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={startBackup}
              disabled={!backupable || startingBackup || (app.mode === "single" && !sharedRiskAccepted)}
            >
              <Icon name="zap" size={14} />
              {startingBackup ? "正在创建备份" : "立即备份"}
            </button>
          </div>
          <button className="btn btn-ghost" style={{ width: "100%", marginTop: 8 }} disabled>
            <Icon name="tasks" size={14} />
            任务历史将在后续阶段提供
          </button>
        </div>
      </div>
    </div>
  );
}

function PlanModal({ targets, close, showToast }) {
  const [step, setStep] = useState(1);
  const [freq, setFreq] = useState("daily");
  const [confirm, setConfirm] = useState(false);
  const targetList =
    targets && targets.length
      ? targets
      : applications.filter((a) => a.status.includes("BACKUPABLE")).slice(0, 1);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div className="modal">
        <div className="modal-head">
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              New plan · {step} / 4
            </div>
            <div className="modal-title">新建备份计划</div>
            <div className="modal-copy">
              为当前用户的应用实例设置目标、频率、保留和通知策略。
            </div>
          </div>
          <button className="icon-btn" onClick={close}>
            <Icon name="close" size={15} />
          </button>
        </div>
        <div className="modal-body">
          <div className="stepper" style={{ marginBottom: 18 }}>
            {["选择目标", "执行时间", "保留策略", "确认"].map((s, i) => (
              <div
                key={s}
                className={
                  "step " +
                  (step === i + 1 ? "active " : "") +
                  (step > i + 1 ? "done" : "")
                }
              >
                <span className="step-num">
                  {step > i + 1 ? <Icon name="check" size={11} /> : i + 1}
                </span>
                <span>{s}</span>
              </div>
            ))}
          </div>
          {step === 1 && (
            <>
              <div className="field">
                <label>计划名称</label>
                <input defaultValue="Notus 夜间守护" />
              </div>
              <div className="field" style={{ marginTop: 12 }}>
                <label>目标实例</label>
                <div
                  className="card"
                  style={{ boxShadow: "none", padding: "4px 12px" }}
                >
                  {targetList.map((t) => (
                    <div className="setting-row" key={t.id}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <AppIcon app={t} />
                        <div>
                          <strong>{t.name}</strong>
                          <p className="mono">
                            {t.deploy} · {t.size}
                          </p>
                        </div>
                      </div>
                      <StatusPill status={t.status} />
                    </div>
                  ))}
                </div>
              </div>
              {targetList.some((t) => t.mode === "single") && (
                <label className="checkline" style={{ marginTop: 13 }}>
                  <input
                    className="check"
                    type="checkbox"
                    checked={confirm}
                    onChange={(e) => setConfirm(e.target.checked)}
                  />
                  我已了解单实例共享数据风险
                </label>
              )}
            </>
          )}
          {step === 2 && (
            <>
              <div className="field">
                <label>执行频率</label>
                <div className="form-grid">
                  <button
                    className={
                      "btn " +
                      (freq === "manual" ? "btn-primary" : "btn-secondary")
                    }
                    onClick={() => setFreq("manual")}
                  >
                    仅手动
                  </button>
                  <button
                    className={
                      "btn " +
                      (freq === "hourly" ? "btn-primary" : "btn-secondary")
                    }
                    onClick={() => setFreq("hourly")}
                  >
                    每小时
                  </button>
                  <button
                    className={
                      "btn " +
                      (freq === "daily" ? "btn-primary" : "btn-secondary")
                    }
                    onClick={() => setFreq("daily")}
                  >
                    每天
                  </button>
                  <button
                    className={
                      "btn " +
                      (freq === "weekly" ? "btn-primary" : "btn-secondary")
                    }
                    onClick={() => setFreq("weekly")}
                  >
                    每周
                  </button>
                </div>
              </div>
              {freq !== "manual" && (
                <div className="form-grid" style={{ marginTop: 14 }}>
                  <div className="field">
                    <label>时间</label>
                    <input type="time" defaultValue="02:00" />
                  </div>
                  <div className="field">
                    <label>时区</label>
                    <Dropdown
                      defaultValue="Asia/Shanghai"
                      options={["Asia/Shanghai", "UTC"]}
                      aria-label="时区"
                    />
                  </div>
                </div>
              )}
              <div className="notice" style={{ marginTop: 14 }}>
                <Icon name="clock" size={14} />
                <span>
                  未来五次：明天 02:00、后天 02:00、08-30 02:00、08-31
                  02:00、09-01 02:00
                </span>
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <div className="form-grid">
                <div className="field">
                  <label>最近保留</label>
                  <Dropdown
                    defaultValue="7"
                    options={[
                      { label: "最近 3 份", value: "3" },
                      { label: "最近 7 份", value: "7" },
                      { label: "最近 14 份", value: "14" },
                    ]}
                    aria-label="最近保留"
                  />
                </div>
                <div className="field">
                  <label>每周保留</label>
                  <Dropdown
                    defaultValue="4"
                    options={["4 周", "8 周", "12 周"]}
                    aria-label="每周保留"
                  />
                </div>
                <div className="field">
                  <label>回收站宽限期</label>
                  <Dropdown
                    defaultValue="7"
                    options={["7 天", "14 天", "30 天"]}
                    aria-label="回收站宽限期"
                  />
                </div>
                <div className="field">
                  <label>失败快照</label>
                  <Dropdown
                    defaultValue="keep"
                    options={[
                      { label: "暂停清理", value: "keep" },
                      { label: "移入回收站", value: "trash" },
                    ]}
                    aria-label="失败快照"
                  />
                </div>
              </div>
              <div className="notice good" style={{ marginTop: 14 }}>
                <Icon name="shield" size={14} />
                <span>
                  系统会至少保留 1 份校验通过的快照。校验失败时自动暂停删除。
                </span>
              </div>
            </>
          )}
          {step === 4 && (
            <>
              <div className="notice good">
                <Icon name="check" size={14} />
                <span>计划配置已就绪，保存后会创建一个批次任务。</span>
              </div>
              <div className="mini-list">
                <div className="mini-row">
                  <span className="subtle">目标</span>
                  <strong>{targetList.map((t) => t.name).join("、")}</strong>
                </div>
                <div className="mini-row">
                  <span className="subtle">频率</span>
                  <strong>
                    {freq === "manual"
                      ? "仅手动"
                      : freq === "hourly"
                        ? "每小时"
                        : freq === "weekly"
                          ? "每周一 02:00"
                          : "每天 02:00"}
                  </strong>
                </div>
                <div className="mini-row">
                  <span className="subtle">保留</span>
                  <strong>最近 7 份 / 每周 4 份</strong>
                </div>
                <div className="mini-row">
                  <span className="subtle">通知</span>
                  <strong>首次失败、连续失败升级、空间不足</strong>
                </div>
              </div>
            </>
          )}
        </div>
        <div className="modal-foot">
          <button
            className="btn btn-secondary"
            onClick={() => (step === 1 ? close() : setStep(step - 1))}
          >
            {step === 1 ? "取消" : "上一步"}
          </button>
          {step < 4 ? (
            <button
              className="btn btn-primary"
              onClick={() => setStep(step + 1)}
              disabled={
                step === 1 &&
                targetList.some((t) => t.mode === "single") &&
                !confirm
              }
            >
              下一步 <Icon name="arrow" size={13} />
            </button>
          ) : (
            <>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  showToast("计划已保存", "下一次执行时间已加入概览。");
                  close();
                }}
              >
                仅保存
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  showToast("计划已保存并执行", "批次已进入有界工作池。");
                  close();
                }}
              >
                保存并立即执行
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PlanModalSingle({ targets, close, showToast }) {
  const [planName, setPlanName] = useState("Notus 夜间守护");
  const [freq, setFreq] = useState("daily");
  const [backupTime, setBackupTime] = useState("02:00");
  const [timezone, setTimezone] = useState("Asia/Shanghai");
  const [retention, setRetention] = useState("7");
  const [weeklyRetention, setWeeklyRetention] = useState("4");
  const [gracePeriod, setGracePeriod] = useState("7");
  const [failedSnapshot, setFailedSnapshot] = useState("keep");
  const [confirm, setConfirm] = useState(false);
  const [notify, setNotify] = useState({
    first: true,
    repeat: true,
    space: true,
  });
  const [errors, setErrors] = useState({});
  const targetList =
    targets && targets.length
      ? targets
      : applications.filter((a) => a.status.includes("BACKUPABLE")).slice(0, 1);
  const needsConfirm = targetList.some((t) => t.mode === "single");
  const updateNotify = (key) =>
    setNotify((prev) => ({ ...prev, [key]: !prev[key] }));
  const clearError = (key) =>
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  const validate = () => {
    const next = {};
    if (!planName.trim()) next.planName = "请输入计划名称";
    if (!targetList.length) next.target = "至少选择一个可备份实例";
    if (!freq) next.freq = "请选择执行频率";
    if (freq !== "manual" && !backupTime) next.time = "请选择执行时间";
    if (freq !== "manual" && !timezone) next.timezone = "请选择时区";
    if (!retention) next.retention = "请选择最近保留份数";
    if (!weeklyRetention) next.weeklyRetention = "请选择每周保留周期";
    if (!gracePeriod) next.gracePeriod = "请选择回收站宽限期";
    if (needsConfirm && !confirm) next.confirm = "请先确认单实例共享数据风险";
    setErrors(next);
    if (Object.keys(next).length) {
      showToast("请完善必填字段", Object.values(next)[0]);
      return false;
    }
    return true;
  };
  const save = (runNow) => {
    if (!validate()) return;
    showToast(
      runNow ? "计划已保存并执行" : "计划已保存",
      runNow ? "批次已进入有界工作池。" : "下一次执行时间已加入概览。",
    );
    close();
  };
  const fieldLabel = (label, required = false) => (
    <>
      {label}
      {required && <span className="required-mark">*</span>}
    </>
  );
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div className="modal plan-modal">
        <div className="modal-head">
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              New plan · 一次配置
            </div>
            <div className="modal-title">新建备份计划</div>
            <div className="modal-copy">
              在一个窗口里完成目标、频率、时间、保留和通知策略。
            </div>
          </div>
          <button className="icon-btn" onClick={close}>
            <Icon name="close" size={15} />
          </button>
        </div>
        <div className="modal-body">
          <div className={"field " + (errors.planName ? "has-error" : "")}>
            <label>{fieldLabel("计划名称", true)}</label>
            <input
              value={planName}
              onChange={(e) => {
                setPlanName(e.target.value);
                clearError("planName");
              }}
              placeholder="例如：Notus 夜间守护"
              required
              aria-required="true"
            />
            {errors.planName && (
              <span className="field-error">{errors.planName}</span>
            )}
          </div>
          <div className={"field " + (errors.target ? "has-error" : "")}>
            <label>{fieldLabel("目标实例", true)}</label>
            <div
              className={
                "plan-target-list " + (!targetList.length ? "is-empty" : "")
              }
            >
              {targetList.length ? (
                targetList.map((t) => (
                  <div className="setting-row" key={t.id}>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <AppIcon app={t} />
                      <div>
                        <strong>{t.name}</strong>
                        <p className="mono">
                          {t.deploy} · {t.size}
                        </p>
                      </div>
                    </div>
                    <StatusPill status={t.status} />
                  </div>
                ))
              ) : (
                <span>当前没有可备份的应用实例</span>
              )}
            </div>
            {errors.target && (
              <span className="field-error">{errors.target}</span>
            )}
          </div>
          <div className={"field " + (errors.freq ? "has-error" : "")}>
            <label>{fieldLabel("执行频率", true)}</label>
            <div className="frequency-grid">
              {[
                ["manual", "仅手动"],
                ["hourly", "每小时"],
                ["daily", "每天"],
                ["weekly", "每周"],
              ].map(([id, label]) => (
                <button
                  type="button"
                  key={id}
                  className={
                    "btn " + (freq === id ? "btn-primary" : "btn-secondary")
                  }
                  onClick={() => {
                    setFreq(id);
                    setErrors((prev) => ({
                      ...prev,
                      freq: undefined,
                      time: undefined,
                      timezone: undefined,
                    }));
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {errors.freq && <span className="field-error">{errors.freq}</span>}
          </div>
          {freq !== "manual" && (
            <div className="plan-form-grid plan-form-grid-compact">
              <div className={"field " + (errors.time ? "has-error" : "")}>
                <label>{fieldLabel("执行时间", true)}</label>
                <input
                  type="time"
                  value={backupTime}
                  onChange={(e) => {
                    setBackupTime(e.target.value);
                    clearError("time");
                  }}
                  required
                  aria-required="true"
                />
                {errors.time && (
                  <span className="field-error">{errors.time}</span>
                )}
              </div>
              <div className={"field " + (errors.timezone ? "has-error" : "")}>
                <label>{fieldLabel("时区", true)}</label>
                <Dropdown
                  value={timezone}
                  onChange={(e) => {
                    setTimezone(e.target.value);
                    clearError("timezone");
                  }}
                  options={["Asia/Shanghai", "UTC"]}
                  aria-label="时区"
                  required
                />
                {errors.timezone && (
                  <span className="field-error">{errors.timezone}</span>
                )}
              </div>
            </div>
          )}
          {freq !== "manual" && (
            <div className="notice">
              <Icon name="clock" size={14} />
              <span>
                未来五次：明天 02:00、后天 02:00、08-30 02:00、08-31
                02:00、09-01 02:00
              </span>
            </div>
          )}
          <div className="field">
            <label>保留策略</label>
            <div className="form-grid">
              <div className={"field " + (errors.retention ? "has-error" : "")}>
                <label>{fieldLabel("最近保留", true)}</label>
                <Dropdown
                  value={retention}
                  onChange={(e) => {
                    setRetention(e.target.value);
                    clearError("retention");
                  }}
                  options={[
                    { label: "最近 3 份", value: "3" },
                    { label: "最近 7 份", value: "7" },
                    { label: "最近 14 份", value: "14" },
                  ]}
                  aria-label="最近保留"
                  required
                />
                {errors.retention && (
                  <span className="field-error">{errors.retention}</span>
                )}
              </div>
              <div
                className={
                  "field " + (errors.weeklyRetention ? "has-error" : "")
                }
              >
                <label>{fieldLabel("每周保留", true)}</label>
                <Dropdown
                  value={weeklyRetention}
                  onChange={(e) => {
                    setWeeklyRetention(e.target.value);
                    clearError("weeklyRetention");
                  }}
                  options={[
                    { label: "4 周", value: "4" },
                    { label: "8 周", value: "8" },
                    { label: "12 周", value: "12" },
                  ]}
                  aria-label="每周保留"
                  required
                />
                {errors.weeklyRetention && (
                  <span className="field-error">{errors.weeklyRetention}</span>
                )}
              </div>
              <div
                className={"field " + (errors.gracePeriod ? "has-error" : "")}
              >
                <label>{fieldLabel("回收站宽限期", true)}</label>
                <Dropdown
                  value={gracePeriod}
                  onChange={(e) => {
                    setGracePeriod(e.target.value);
                    clearError("gracePeriod");
                  }}
                  options={[
                    { label: "7 天", value: "7" },
                    { label: "14 天", value: "14" },
                    { label: "30 天", value: "30" },
                  ]}
                  aria-label="回收站宽限期"
                  required
                />
                {errors.gracePeriod && (
                  <span className="field-error">{errors.gracePeriod}</span>
                )}
              </div>
              <div className="field">
                <label>失败快照</label>
                <Dropdown
                  value={failedSnapshot}
                  onChange={(e) => setFailedSnapshot(e.target.value)}
                  options={[
                    { label: "暂停清理", value: "keep" },
                    { label: "移入回收站", value: "trash" },
                  ]}
                  aria-label="失败快照"
                />
              </div>
            </div>
          </div>
          <div className="notice good">
            <Icon name="shield" size={14} />
            <span>
              系统会至少保留 1 份校验通过的快照；校验失败时自动暂停删除。
            </span>
          </div>
          <div className="field">
            <label>通知</label>
            <div className="notification-options">
              <label className="notification-option">
                <input
                  className="check"
                  type="checkbox"
                  checked={notify.first}
                  onChange={() => updateNotify("first")}
                />
                <span className="notification-option-copy">
                  <strong>首次失败</strong>
                  <small>任务第一次失败时提醒</small>
                </span>
              </label>
              <label className="notification-option">
                <input
                  className="check"
                  type="checkbox"
                  checked={notify.repeat}
                  onChange={() => updateNotify("repeat")}
                />
                <span className="notification-option-copy">
                  <strong>连续失败升级</strong>
                  <small>连续 3 次失败升级告警</small>
                </span>
              </label>
              <label className="notification-option">
                <input
                  className="check"
                  type="checkbox"
                  checked={notify.space}
                  onChange={() => updateNotify("space")}
                />
                <span className="notification-option-copy">
                  <strong>空间不足</strong>
                  <small>网盘达到阈值时提醒</small>
                </span>
              </label>
            </div>
          </div>
          {needsConfirm && (
            <div className={"field " + (errors.confirm ? "has-error" : "")}>
              <label className="checkline">
                <input
                  className="check"
                  type="checkbox"
                  checked={confirm}
                  onChange={(e) => {
                    setConfirm(e.target.checked);
                    setErrors((prev) => ({ ...prev, confirm: undefined }));
                  }}
                  required={needsConfirm}
                  aria-required="true"
                />
                我已了解单实例共享数据风险
                <span className="required-mark">*</span>
              </label>
              {errors.confirm && (
                <span className="field-error">{errors.confirm}</span>
              )}
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={close}>
            取消
          </button>
          <button className="btn btn-secondary" onClick={() => save(false)}>
            仅保存
          </button>
          <button className="btn btn-primary" onClick={() => save(true)}>
            保存并立即执行
          </button>
        </div>
      </div>
    </div>
  );
}

function PlanModalSingleLegacy({ targets, close, showToast }) {
  const [freq, setFreq] = useState("daily");
  const [confirm, setConfirm] = useState(false);
  const targetList =
    targets && targets.length
      ? targets
      : applications.filter((a) => a.status.includes("BACKUPABLE")).slice(0, 1);
  const needsConfirm = targetList.some((t) => t.mode === "single");
  const frequencyLabel = {
    manual: "仅手动",
    hourly: "每小时",
    daily: "每天 02:00",
    weekly: "每周一 02:00",
  };
  const save = (runNow = false) => {
    showToast(
      runNow ? "计划已保存并执行" : "计划已保存",
      runNow ? "批次已进入有界工作池。" : "下一次执行时间已加入概览。",
    );
    close();
  };
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div className="modal plan-modal">
        <div className="modal-head">
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              New plan · 一次配置
            </div>
            <div className="modal-title">新建备份计划</div>
            <div className="modal-copy">
              在一个窗口里完成目标、频率、保留和通知策略。
            </div>
          </div>
          <button className="icon-btn" onClick={close}>
            <Icon name="close" size={15} />
          </button>
        </div>
        <div className="modal-body">
          <div className="plan-form-grid">
            <div className="field">
              <label>计划名称</label>
              <input defaultValue="Notus 夜间守护" />
            </div>
            <div className="field">
              <label>执行频率</label>
              <div className="frequency-grid">
                {[
                  ["manual", "仅手动"],
                  ["hourly", "每小时"],
                  ["daily", "每天"],
                  ["weekly", "每周"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className={
                      "btn " + (freq === id ? "btn-primary" : "btn-secondary")
                    }
                    onClick={() => setFreq(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="field plan-field">
            <label>目标实例</label>
            <div className="plan-target-list">
              {targetList.map((t) => (
                <div className="setting-row" key={t.id}>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <AppIcon app={t} />
                    <div>
                      <strong>{t.name}</strong>
                      <p className="mono">
                        {t.deploy} · {t.size}
                      </p>
                    </div>
                  </div>
                  <StatusPill status={t.status} />
                </div>
              ))}
            </div>
          </div>
          {needsConfirm && (
            <label className="checkline plan-risk-check">
              <input
                className="check"
                type="checkbox"
                checked={confirm}
                onChange={(e) => setConfirm(e.target.checked)}
              />
              我已了解单实例共享数据风险
            </label>
          )}
          {freq !== "manual" && (
            <>
              <div className="plan-form-grid plan-form-grid-compact">
                <div className="field">
                  <label>时间</label>
                  <input type="time" defaultValue="02:00" />
                </div>
                <div className="field">
                  <label>时区</label>
                  <Dropdown
                    defaultValue="Asia/Shanghai"
                    options={["Asia/Shanghai", "UTC"]}
                    aria-label="时区"
                  />
                </div>
              </div>
              <div className="notice plan-field">
                <Icon name="clock" size={14} />
                <span>
                  未来五次：明天 02:00、后天 02:00、08-30 02:00、08-31
                  02:00、09-01 02:00
                </span>
              </div>
            </>
          )}
          <div className="field plan-field">
            <label>保留策略</label>
            <div className="form-grid">
              <div className="field">
                <label>最近保留</label>
                <Dropdown
                  defaultValue="7"
                  options={[
                    { label: "最近 3 份", value: "3" },
                    { label: "最近 7 份", value: "7" },
                    { label: "最近 14 份", value: "14" },
                  ]}
                  aria-label="最近保留"
                />
              </div>
              <div className="field">
                <label>每周保留</label>
                <Dropdown
                  defaultValue="4"
                  options={["4 周", "8 周", "12 周"]}
                  aria-label="每周保留"
                />
              </div>
              <div className="field">
                <label>回收站宽限期</label>
                <Dropdown
                  defaultValue="7"
                  options={["7 天", "14 天", "30 天"]}
                  aria-label="回收站宽限期"
                />
              </div>
              <div className="field">
                <label>失败快照</label>
                <Dropdown
                  defaultValue="keep"
                  options={[
                    { label: "暂停清理", value: "keep" },
                    { label: "移入回收站", value: "trash" },
                  ]}
                  aria-label="失败快照"
                />
              </div>
            </div>
          </div>
          <div className="notice good plan-field">
            <Icon name="shield" size={14} />
            <span>
              系统会至少保留 1 份校验通过的快照；校验失败时自动暂停删除。
            </span>
          </div>
          <div className="field plan-field">
            <label>通知</label>
            <div className="notification-options">
              <label className="checkline">
                <input className="check" type="checkbox" defaultChecked />
                首次失败
              </label>
              <label className="checkline">
                <input className="check" type="checkbox" defaultChecked />
                连续失败升级
              </label>
              <label className="checkline">
                <input className="check" type="checkbox" defaultChecked />
                空间不足
              </label>
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={close}>
            取消
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => save(false)}
            disabled={needsConfirm && !confirm}
          >
            仅保存
          </button>
          <button
            className="btn btn-primary"
            onClick={() => save(true)}
            disabled={needsConfirm && !confirm}
          >
            保存并立即执行
          </button>
        </div>
      </div>
    </div>
  );
}

function TaskModalLegacy({ name, close }) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div className="modal detail-overlay-modal">
        <div className="modal-head">
          <div>
            <div className="modal-title">任务详情</div>
            <div className="detail-sub">{name} · job-0827-0200</div>
          </div>
          <button className="icon-btn" onClick={close}>
            <Icon name="close" size={15} />
          </button>
        </div>
        <div className="modal-body detail-overlay-body">
          <div className="notice good">
            <Icon name="check" size={14} />
            <span>
              任务已完成，snapshot.zip 与 manifest.json 已提交到当前用户网盘。
            </span>
          </div>
          <div className="section-label">阶段时间线</div>
          <div className="activity">
            <div className="activity-item">
              <div className="activity-icon">
                <Icon name="check" size={13} />
              </div>
              <div className="activity-text">
                <strong>入队 / 获取租约</strong>
                <br />
                <span className="subtle">确认实例锁 · 未发现并发任务</span>
              </div>
              <div className="activity-time">02:00:02</div>
            </div>
            <div className="activity-item">
              <div className="activity-icon">
                <Icon name="check" size={13} />
              </div>
              <div className="activity-text">
                <strong>扫描与数据库检测</strong>
                <br />
                <span className="subtle">1,420 文件 · SQLite × 2</span>
              </div>
              <div className="activity-time">02:00:27</div>
            </div>
            <div className="activity-item">
              <div className="activity-icon">
                <Icon name="check" size={13} />
              </div>
              <div className="activity-text">
                <strong>SQLite 在线快照</strong>
                <br />
                <span className="subtle">quick_check 通过</span>
              </div>
              <div className="activity-time">02:01:44</div>
            </div>
            <div className="activity-item">
              <div className="activity-icon">
                <Icon name="check" size={13} />
              </div>
              <div className="activity-text">
                <strong>ZIP + SHA-256 + manifest</strong>
                <br />
                <span className="subtle">188 MB · 4b22…e91a</span>
              </div>
              <div className="activity-time">02:03:14</div>
            </div>
          </div>
          <div className="section-label">输出路径</div>
          <div className="tree">
            <div className="folder">MimiAppBakcup/</div>
            <div>
              └── <span className="folder">20260827T020000.000Z/</span>
            </div>
            <div>
              {" "}
              └── <span className="folder">dep-notus-8839a/</span>
            </div>
            <div>
              {" "}
              ├── <span className="file">snapshot.zip</span>
            </div>
            <div>
              {" "}
              └── <span className="file">manifest.json</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            <button className="btn btn-secondary" style={{ flex: 1 }}>
              <Icon name="download" size={13} />
              导出诊断摘要
            </button>
            <button className="btn btn-primary" style={{ flex: 1 }}>
              重新校验
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SnapshotModalLegacy({ snap, close, showToast }) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div className="modal detail-overlay-modal">
        <div className="modal-head">
          <div>
            <div className="modal-title">{snap.app}</div>
            <div className="detail-sub">快照详情 · {snap.time}</div>
          </div>
          <button className="icon-btn" onClick={close}>
            <Icon name="close" size={15} />
          </button>
        </div>
        <div className="modal-body detail-overlay-body">
          <div style={{ display: "flex", gap: 7 }}>
            <StatusPill status={snap.integrity} />
            <ModePill mode={snap.mode} />
          </div>
          <div className="section-label">快照信息</div>
          <div className="card card-pad" style={{ boxShadow: "none" }}>
            <div className="setting-row">
              <div>
                <strong>相对路径</strong>
                <p className="mono">
                  MimiAppBakcup/20260827T020000.000Z/{snap.deploy}/
                </p>
              </div>
              <Icon name="folder" size={14} />
            </div>
            <div className="setting-row">
              <div>
                <strong>snapshot.zip</strong>
                <p>
                  {snap.zip} · SHA-256 {snap.sha}
                </p>
              </div>
              <span className="pill good">存在</span>
            </div>
            <div className="setting-row">
              <div>
                <strong>manifest.json</strong>
                <p>status = completed · archive_sha256 一致</p>
              </div>
              <span className="pill good">有效</span>
            </div>
          </div>
          <div className="section-label">文件索引摘要</div>
          <div className="tree">
            <div className="folder">appvar/</div>
            <div>
              ├── <span className="folder">config/</span>{" "}
              <span className="subtle">(34 files)</span>
            </div>
            <div>
              ├── <span className="folder">attachments/</span>{" "}
              <span className="subtle">(1,120 files)</span>
            </div>
            <div>
              ├── <span className="folder">indexes/</span>{" "}
              <span className="subtle">(264 files)</span>
            </div>
            <div>
              └── <span className="file">_snapshot/file-index.jsonl</span>
            </div>
          </div>
          <p className="card-caption" style={{ marginTop: 8 }}>
            V1 不在线展示文件正文，只提供路径、大小、修改时间与可选 SHA-256。
          </p>
          <div className="section-label">操作</div>
          <div className="form-grid">
            <button
              className="btn btn-secondary"
              onClick={() =>
                showToast(
                  "快速校验已完成",
                  "ZIP 大小、SHA-256 与内部 manifest 一致。",
                )
              }
            >
              <Icon name="shield" size={13} />
              快速校验
            </button>
            <button
              className="btn btn-secondary"
              onClick={() =>
                showToast(
                  "完整校验已加入队列",
                  "会遍历 CRC 并检查 SQLite quick_check。",
                )
              }
            >
              <Icon name="refresh" size={13} />
              完整校验
            </button>
            <button
              className="btn btn-secondary"
              onClick={() =>
                showToast(
                  "导出已加入队列",
                  "将解压到当前用户网盘的 _restore_exports。",
                )
              }
            >
              <Icon name="download" size={13} />
              导出到恢复目录
            </button>
            <button
              className="btn btn-danger"
              onClick={() =>
                showToast("已移入回收站", "快照会在宽限期后物理删除。")
              }
            >
              <Icon name="archive" size={13} />
              移入回收站
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RiskModal({ target, close, onContinue }) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div className="modal">
        <div className="modal-head">
          <div>
            <div className="risk-illustration">
              <Icon name="warning" size={25} />
            </div>
            <div className="modal-title">确认单实例共享风险</div>
            <div className="modal-copy">
              {target.length > 1
                ? "所选目标中包含单实例应用。"
                : "该应用使用单实例运行，应用内部可能保存共享数据。"}
            </div>
          </div>
          <button className="icon-btn" onClick={close}>
            <Icon name="close" size={15} />
          </button>
        </div>
        <div className="modal-body">
          <div className="notice warn">
            <Icon name="lock" size={14} />
            <span>
              当前备份范围以懒猫平台向本账号开放的数据目录为准。备份过程只读，不会停止、修改或恢复目标应用。
            </span>
          </div>
          <div className="mini-list">
            {target.map((t) => (
              <div className="mini-row" key={t.id}>
                <div className="mini-main">
                  <AppIcon app={t} />
                  <div>
                    <div className="mini-name">{t.name}</div>
                    <div className="mini-meta">
                      {t.deploy} · {t.size}
                    </div>
                  </div>
                </div>
                <ModePill mode={t.mode} />
              </div>
            ))}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={close}>
            取消
          </button>
          <button className="btn btn-primary" onClick={onContinue}>
            我已了解并继续 <Icon name="arrow" size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

function SessionModal({ close, showToast, session }) {
  const logout = async () => {
    try {
      await api.logout();
      window.location.assign("/auth/login");
    } catch (error) {
      showToast("退出登录失败", error instanceof Error ? error.message : "请稍后重试。");
    }
  };
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div className="modal">
        <div className="modal-head">
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              Session · OIDC
            </div>
            <div className="modal-title">{session?.displayName || "当前用户"}的登录会话</div>
            <div className="modal-copy">
              当前会话只绑定到这个备份应用实例，不支持切换其他用户。
            </div>
          </div>
          <button className="icon-btn" onClick={close}>
            <Icon name="close" size={15} />
          </button>
        </div>
        <div className="modal-body">
          <div className="notice good">
            <Icon name="shield" size={14} />
            <span>当前登录会话与懒猫账号一致。</span>
          </div>
          <div
            className="card card-pad"
            style={{ boxShadow: "none", marginTop: 13 }}
          >
            <div className="setting-row">
              <div>
                <strong>显示名称</strong>
                <p>{session?.displayName || "—"}</p>
              </div>
              <span className="pill violet">{session?.role || "—"}</span>
            </div>
            <div className="setting-row">
              <div>
                <strong>UID</strong>
                <p className="mono">{session?.uid || "—"}</p>
              </div>
              <Icon name="lock" size={14} />
            </div>
            <div className="setting-row">
              <div>
                <strong>会话到期</strong>
                <p>{session?.expiresAt ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(new Date(session.expiresAt)) : "—"}</p>
              </div>
              <span className="pill good">有效</span>
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button
            className="btn btn-secondary"
            onClick={logout}
          >
            退出登录
          </button>
          <button
            className="btn btn-primary"
            onClick={() => window.location.assign("/auth/login")}
          >
            重新登录
          </button>
        </div>
      </div>
    </div>
  );
}

// Compatibility aliases for the retired overlay API. These legacy exports now
// render centered modals as well, so callers cannot accidentally reintroduce a
// second detail surface.
const DetailDrawer = DetailModalLegacy;
const TaskDrawer = TaskModalLegacy;
const SnapshotDrawer = SnapshotModalLegacy;

export {
  DetailModalLegacy,
  DetailDrawer,
  PlanModal,
  PlanModalSingle,
  PlanModalSingleLegacy,
  TaskModalLegacy,
  TaskDrawer,
  SnapshotModalLegacy,
  SnapshotDrawer,
  RiskModal,
  SessionModal,
};
