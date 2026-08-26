import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShieldCheck, HardDrive, Database, Play, Pause, Clock, Settings,
  AlertTriangle, Layers, FileText, CheckCircle2, XCircle, RefreshCw,
  Search, Filter, Folder, File, Download, Trash2, ChevronRight, ChevronDown,
  Menu, X, Globe, Activity, Info, Lock, Server, Zap, Plus, Eye,
  ArrowRight, Copy, ExternalLink, HelpCircle, Check, Cpu, Terminal,
  BarChart2, FolderTree, AlertOctagon, CheckCircle, ShieldAlert,
  ArrowUpRight, ArrowDownRight, User, Sliders, Box, AlertCircle,
  FileCheck, Shield, Sparkles, FolderArchive, CornerDownRight, ArrowLeft,
  PieChart, SlidersHorizontal, CheckSquare, Layers3, CpuIcon, Radio
} from 'lucide-react';


export function OverviewView({ t, stats, navigateTo, triggerManualBackup, batches, alerts }) {
  return (
    <div className="space-y-6">

      {/* Hero Banner Card with Emerald Dark Gradient */}
      <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-teal-950 rounded-2xl p-6 text-white shadow-md relative overflow-hidden">
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold border border-emerald-500/30">
            <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
            <span>懒猫微服应用 &amp; SQLite 一致性保护中心</span>
          </div>
          <h2 className="text-2xl font-black tracking-tight text-white">4,000+ 微服应用自动化冷备份引擎</h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            实时管控微服环境中的所有应用实例。采用受控并发工作池与 SQLite Online Backup 快照机制，无缝将数据安全归档至懒猫网盘。
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={() => triggerManualBackup({ appName: 'Notus 笔记' })}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md flex items-center space-x-1.5 transition"
            >
              <Zap className="w-4 h-4 text-white" />
              <span>立即体验测试备份 (Notus)</span>
            </button>
            <button
              onClick={() => navigateTo('plans')}
              className="px-4 py-2 bg-slate-800/80 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold border border-slate-700/80 transition"
            >
              配置定时计划
            </button>
          </div>
        </div>
      </div>

      {/* Metric Cards Matrix */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: t.overview.discoveredApps, value: stats.discoveredApps, sub: '微服生态全部应用', icon: Layers, bg: 'bg-emerald-50 text-emerald-600' },
          { label: t.overview.discoveredInstances, value: stats.totalInstances, sub: `已受保护 ${stats.protectedCount} 个实例`, icon: Box, bg: 'bg-teal-50 text-teal-600' },
          { label: t.overview.backupableInstances, value: stats.backupable, sub: '满足文件/SQLite备份条件', icon: ShieldCheck, bg: 'bg-emerald-50 text-emerald-600' },
          { label: t.overview.blockedInstances, value: stats.blockedCount, sub: `${stats.noDataCount} 无数据 / 部分受阻`, icon: AlertTriangle, bg: 'bg-rose-50 text-rose-600' }
        ].map((card, idx) => {
          const Icon = card.icon;
          return (
            <div key={idx} className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-2 hover:shadow-md transition">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-slate-500">{card.label}</span>
                <div className={`p-2 rounded-xl ${card.bg}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-slate-900 tracking-tight">{card.value}</div>
              <p className="text-[11px] text-slate-500">{card.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Live Throughput Gauge & Scheduled Batches */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Live Speed Widget */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 space-y-4 shadow-xs">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-600" />
              {t.overview.throughput}
            </h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
              工作池运行正常
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
              <div className="text-[10px] text-slate-500">{t.overview.readSpeed}</div>
              <div className="text-xs font-bold text-emerald-600 font-mono mt-0.5">14.2 MB/s</div>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
              <div className="text-[10px] text-slate-500">{t.overview.writeSpeed}</div>
              <div className="text-xs font-bold text-teal-600 font-mono mt-0.5">12.8 MB/s</div>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
              <div className="text-[10px] text-slate-500">{t.overview.compressSpeed}</div>
              <div className="text-xs font-bold text-emerald-500 font-mono mt-0.5">18.5 MB/s</div>
            </div>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>并发使用状态 (普通 / SQLite)</span>
              <span className="text-slate-500 font-mono text-[11px]">3 / 2 / 10 Max</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden flex">
              <div className="bg-emerald-600 h-2" style={{ width: '30%' }}></div>
              <div className="bg-teal-500 h-2" style={{ width: '20%' }}></div>
            </div>
          </div>

          <button
            onClick={() => navigateTo('tasks')}
            className="w-full py-2 bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs rounded-xl font-semibold transition"
          >
            {t.overview.viewAllTasks} →
          </button>
        </div>

        {/* Scheduled Batches List */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 space-y-4 lg:col-span-2 shadow-xs">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-600" />
              {t.overview.nextBatches}
            </h3>
            <button onClick={() => navigateTo('plans')} className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold">
              管理计划
            </button>
          </div>

          <div className="space-y-3">
            {[
              { name: '核心应用每日定时备份', time: '2026-08-26 02:00:00 (UTC)', targets: 'Notus, Paperless (3 个实例)', window: '120 分钟窗口' },
              { name: 'Notus SQLite 高频保护计划', time: '2026-08-25 15:00:00 (UTC)', targets: 'dep-notus-8839a', window: '15 分钟窗口' }
            ].map((p, i) => (
              <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200/60 text-xs">
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="font-bold text-slate-900">{p.name}</div>
                  <div className="text-slate-500 text-[11px] leading-relaxed">
                    计划时间：<span className="font-mono text-slate-700">{p.time}</span>
                    <span className="mx-1.5 text-slate-300">|</span>
                    目标：<span className="text-slate-700">{p.targets}</span>
                  </div>
                </div>
                <div className="shrink-0 self-start sm:self-center">
                  <span className="inline-block whitespace-nowrap px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-semibold border border-emerald-200">
                    {p.window}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Safety Risk Alert Banner */}
      <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 flex items-start space-x-3 text-xs text-amber-900 shadow-xs">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-bold text-amber-900">安全提示：检测到 2 个不支持备份的服务型数据库应用</div>
          <p className="text-amber-800 leading-relaxed">
            Mastodon (PostgreSQL) 与 WordPress (MySQL) 因包含已知不支持的服务型数据库，已在能力探测阶段自动触发阻断保护。系统不会生成包含损坏文件的不一致虚假备份。
          </p>
        </div>
      </div>

    </div>
  );
}

