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


export function PlansView({ t, plans, navigateTo, openModal, triggerManualBackup }) {
  return (
    <div className="space-y-6">

      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">{t.plans.title}</h2>
          <p className="text-xs text-slate-500">按 Cron 表达、动态包含新增实例的批量备份计划</p>
        </div>

        <button
          onClick={() => openModal('planWizard')}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center space-x-1.5 transition"
        >
          <Plus className="w-4 h-4" />
          <span>{t.plans.newPlan}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {plans.map(p => (
          <div key={p.plan_id} className="bg-white border border-slate-200/80 rounded-2xl p-5 space-y-4 hover:border-emerald-300 transition shadow-xs">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">{p.name}</h3>
                <span className="text-[11px] text-emerald-600 font-mono font-semibold">{p.scheduleHuman}</span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                {p.status}
              </span>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/60 text-xs space-y-1.5">
              <div className="flex justify-between text-slate-700">
                <span>目标实例：</span>
                <span className="font-semibold text-slate-900">{p.targetsCount} 个实例</span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>备份窗口：</span>
                <span className="text-slate-500">{p.backupWindowMinutes} 分钟</span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>保留规则：</span>
                <span className="text-slate-500 truncate max-w-[200px]">{p.retentionPolicy}</span>
              </div>
            </div>

            <div className="flex justify-between items-center text-xs pt-1">
              <span className="text-slate-500 text-[11px]">下次执行: {p.nextRunAt}</span>
              <button
                onClick={() => triggerManualBackup({ appName: p.name })}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-xs shadow-xs"
              >
                {t.plans.runImmediately}
              </button>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}

