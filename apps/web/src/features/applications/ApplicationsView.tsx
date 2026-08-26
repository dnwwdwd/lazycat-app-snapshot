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


export function ApplicationsView({ t, appsData, navigateTo, triggerManualBackup, renderStatusBadge, openModal }) {
  const [activeTab, setActiveTab] = useState('ALL');
  const [viewType, setViewType] = useState('UNFOLDED');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredApps = useMemo(() => {
    return appsData.filter(app => {
      const matchQuery = app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        app.appid.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchQuery) return false;

      if (activeTab === 'BACKUPABLE') return app.instances.some(i => i.status === 'BACKUPABLE');
      if (activeTab === 'NO_DATA') return app.instances.some(i => i.status === 'NO_DATA');
      if (activeTab === 'UNSUPPORTED') return app.instances.some(i => i.status === 'UNSUPPORTED_DATABASE');
      return true;
    });
  }, [appsData, searchQuery, activeTab]);

  return (
    <div className="space-y-6">

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">{t.applications.title}</h2>
          <p className="text-xs text-slate-500">微服发现的应用、部署实例及 `appvar` 数据可备份性能力检测</p>
        </div>

        <div className="flex w-full sm:w-auto items-center space-x-1 bg-slate-200/60 p-1 rounded-xl">
          <button
            onClick={() => setViewType('UNFOLDED')}
            className={`flex-1 sm:flex-none whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              viewType === 'UNFOLDED' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.applications.instanceUnfolded}
          </button>
          <button
            onClick={() => setViewType('AGGREGATED')}
            className={`flex-1 sm:flex-none whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              viewType === 'AGGREGATED' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.applications.appAggregated}
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 space-y-4 shadow-xs">
        <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-3">
          <div className="relative w-full lg:w-80">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t.applications.searchPlaceholder}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex w-full lg:w-auto flex-wrap gap-1 text-xs">
            {[
              { key: 'ALL', label: t.applications.tabAll },
              { key: 'BACKUPABLE', label: t.applications.tabBackupable },
              { key: 'NO_DATA', label: t.applications.tabNoData },
              { key: 'UNSUPPORTED', label: t.applications.tabUnsupported }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1.5 rounded-xl font-medium transition ${
                  activeTab === tab.key ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-semibold' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Unfolded Instance List Table */}
      {viewType === 'UNFOLDED' && (
        <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto overscroll-contain">
            <table className="min-w-[860px] w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold uppercase tracking-wider text-[11px]">
                  <th className="min-w-[200px] p-3.5">{t.applications.colAppName}</th>
                  <th className="min-w-[145px] p-3.5">{t.applications.owner} / {t.applications.deployId}</th>
                  <th className="min-w-[96px] p-3.5">{t.applications.colStatus}</th>
                  <th className="min-w-[104px] p-3.5">{t.applications.colDataSize}</th>
                  <th className="min-w-[112px] p-3.5">{t.applications.colLastBackup}</th>
                  <th className="min-w-[92px] p-3.5 text-right">{t.applications.colActions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredApps.flatMap(app =>
                  app.instances.map(inst => (
                    <tr key={inst.instance_key} className="hover:bg-slate-50/80 transition">
                      <td className="p-3.5">
                        <div className="flex items-center space-x-3">
                          <div className={`w-8 h-8 rounded-xl ${app.iconBg} flex items-center justify-center font-bold text-xs shadow-xs shrink-0`}>
                            {app.name.slice(0, 1)}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900">{app.name}</div>
                            <div className="text-[10px] font-mono text-slate-500">{app.appid}</div>
                          </div>
                        </div>
                      </td>

                      <td className="p-3.5">
                        <div className="space-y-0.5">
                          <div className="text-slate-800 font-semibold">{inst.owner_name}</div>
                          <div className="font-mono text-[10px] text-emerald-600 flex items-center gap-1">
                            <span>{inst.deploy_id}</span>
                            <span className="text-slate-400">({app.isMultiInstance ? '多实例' : '单实例'})</span>
                          </div>
                        </div>
                      </td>

                      <td className="p-3.5">
                        {renderStatusBadge(inst.status)}
                      </td>

                      <td className="p-3.5 font-mono">
                        {inst.estimatedBytes > 0 ? `${(inst.estimatedBytes / 1000000).toFixed(1)} MB` : '-'}
                        {inst.sqliteCount > 0 && (
                          <div className="text-[10px] text-teal-700 font-semibold">{inst.sqliteCount} 个 SQLite 数据库</div>
                        )}
                      </td>

                      <td className="p-3.5 text-slate-500">
                        {inst.lastBackupAt || '尚未备份'}
                      </td>

                      <td className="whitespace-nowrap p-3.5 text-right space-x-2">
                        {inst.status === 'BACKUPABLE' && (
                          <button
                            onClick={() => triggerManualBackup(inst)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-[11px] transition shadow-xs"
                          >
                            立即备份
                          </button>
                        )}

                        {inst.status === 'UNSUPPORTED_DATABASE' && (
                          <button
                            onClick={() => openModal('unsupportedDb', inst)}
                            className="px-2.5 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-lg text-[11px] font-semibold"
                          >
                            阻断原因
                          </button>
                        )}

                        {inst.status === 'NO_DATA' && (
                          <button
                            onClick={() => openModal('noData', inst)}
                            className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-[11px] font-medium hover:bg-slate-200"
                          >
                            无数据
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}

