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


export function TasksView({ t, batches, runningJobs, renderStatusBadge }) {
  const [activeTab, setActiveTab] = useState('QUEUE');

  return (
    <div className="space-y-6">

      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">{t.tasks.title}</h2>
          <p className="text-xs text-slate-500">排队调度、批次展开结果与实例级执行历史</p>
        </div>

        <div className="flex space-x-1 bg-slate-200/60 p-1 rounded-xl text-xs">
          {[
            { key: 'QUEUE', label: t.tasks.tabQueue },
            { key: 'BATCHES', label: t.tasks.tabBatches }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                activeTab === tab.key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'QUEUE' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
            <h3 className="text-xs font-bold text-slate-900">当前运行与排队中的实例任务</h3>

            {runningJobs.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                当前任务队列为空，所有计划任务已成功完成
              </div>
            ) : (
              <div className="space-y-3">
                {runningJobs.map(job => (
                  <div key={job.job_id} className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-slate-900">{job.appName} ({job.deploy_id})</span>
                      <span className="text-emerald-600 font-mono font-bold">{job.progress}%</span>
                    </div>

                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-emerald-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${job.progress}%` }}
                      ></div>
                    </div>

                    <div className="text-[11px] text-slate-500 flex justify-between">
                      <span>阶段：{job.phase}</span>
                      <span>所属用户: {job.owner_name}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'BATCHES' && (
        <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold uppercase text-[11px]">
                <th className="p-3.5">{t.tasks.batchId}</th>
                <th className="p-3.5">备份计划</th>
                <th className="p-3.5">{t.tasks.scheduledAt}</th>
                <th className="p-3.5">{t.tasks.totalTasks}</th>
                <th className="p-3.5">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {batches.map(b => (
                <tr key={b.batch_id} className="hover:bg-slate-50/80">
                  <td className="p-3.5 font-mono text-emerald-600 font-semibold">{b.batch_id}</td>
                  <td className="p-3.5 font-bold text-slate-900">{b.plan_name}</td>
                  <td className="p-3.5 font-mono text-slate-500">{b.scheduled_at}</td>
                  <td className="p-3.5">{b.total_jobs} 个实例</td>
                  <td className="p-3.5">{renderStatusBadge(b.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}

