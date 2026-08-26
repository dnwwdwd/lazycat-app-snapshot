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


export function SettingsView({ t, storageStats, setStorageStats, storageColorInfo }) {
  const [activeTab, setActiveTab] = useState('PERFORMANCE');

  return (
    <div className="space-y-6">

      <div>
        <h2 className="text-lg font-bold text-slate-900 tracking-tight">{t.settings.title}</h2>
        <p className="text-xs text-slate-500">自适应工作池并发限速、压缩级别与脱敏诊断日志</p>
      </div>

      <div className="flex space-x-1 border-b border-slate-200 pb-2 text-xs">
        {[
          { key: 'PERFORMANCE', label: t.settings.tabPerformance },
          { key: 'DIAGNOSTICS', label: t.settings.tabDiagnostics }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-1.5 rounded-lg font-semibold transition ${
              activeTab === tab.key ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'PERFORMANCE' && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 space-y-6 max-w-2xl shadow-xs">
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-2">自适应工作池并发与限速设置</h3>

            <div className="space-y-2 text-xs">
              <label className="text-slate-700 font-semibold">{t.settings.archiveConcurrency} (普通文件)</label>
              <input type="range" min="1" max="16" defaultValue="4" className="w-full accent-emerald-600" />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>1 (保护 CPU)</span>
                <span className="text-emerald-600 font-bold">4 个并发线程</span>
                <span>16 (极致速度)</span>
              </div>
            </div>

            <div className="space-y-2 text-xs pt-2">
              <label className="text-slate-700 font-semibold">{t.settings.sqliteConcurrency} (Online Snapshot API)</label>
              <input type="range" min="1" max="8" defaultValue="2" className="w-full accent-emerald-600" />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>1</span>
                <span className="text-emerald-600 font-bold">2 个并发线程</span>
                <span>8</span>
              </div>
            </div>

            {/* Quick Storage Color Test Slider */}
            <div className="space-y-2 text-xs pt-4 border-t border-slate-100">
              <label className="text-slate-700 font-semibold flex justify-between">
                <span>网盘存储模拟占用 (改变侧边栏颜色)</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${storageColorInfo.badgeBg}`}>
                  {storageColorInfo.statusText}
                </span>
              </label>
              <input
                type="range"
                min="5"
                max="98"
                value={storageStats.usedGB}
                onChange={(e) => setStorageStats(s => ({ ...s, usedGB: parseFloat(e.target.value) }))}
                className="w-full accent-emerald-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>5 GB</span>
                <span className="text-emerald-700 font-bold">{storageStats.usedGB} GB ({storageColorInfo.percent.toFixed(0)}%)</span>
                <span>98 GB</span>
              </div>
            </div>

          </div>
        </div>
      )}

      {activeTab === 'DIAGNOSTICS' && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 space-y-4 max-w-2xl shadow-xs">
          <h3 className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-2">环境与脱敏诊断日志</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            导出诊断包仅包含脱敏配置、并发池快照与错误追踪 ID，绝对不包含文件内容或数据库隐私正文。
          </p>

          <button
            onClick={() => alert('脱敏诊断包 diagnostic-20260825.json 已成功下载')}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition"
          >
            {t.settings.exportLogPackage}
          </button>
        </div>
      )}

    </div>
  );
}

