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


export function AlertsView({ t, alerts, setAlerts, navigateTo }) {
  const markResolved = (alertId) => {
    setAlerts(prev => prev.map(a => a.alert_id === alertId ? { ...a, resolved: true, isRead: true } : a));
  };

  return (
    <div className="space-y-6">

      <div>
        <h2 className="text-lg font-bold text-slate-900 tracking-tight">{t.alerts.title}</h2>
        <p className="text-xs text-slate-500">受阻断数据库、权限异常及存储监控警告</p>
      </div>

      <div className="space-y-3">
        {alerts.map(a => (
          <div
            key={a.alert_id}
            className={`p-4 rounded-2xl border transition flex items-start justify-between shadow-xs ${
              a.resolved
                ? 'bg-slate-50 border-slate-200 opacity-60'
                : 'bg-white border-rose-200'
            }`}
          >
            <div className="flex items-start space-x-3">
              <AlertOctagon className={`w-5 h-5 shrink-0 mt-0.5 ${a.resolved ? 'text-slate-400' : 'text-rose-600'}`} />
              <div className="space-y-1 text-xs">
                <div className="font-bold text-slate-900 text-sm">{a.title}</div>
                <p className="text-slate-600 leading-relaxed">{a.message}</p>
                <div className="text-[10px] text-slate-400 font-mono">触发时间：{a.createdAt}</div>
              </div>
            </div>

            {!a.resolved && (
              <button
                onClick={() => markResolved(a.alert_id)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-xl font-semibold shrink-0 ml-4 transition"
              >
                {t.alerts.resolve}
              </button>
            )}
          </div>
        ))}
      </div>

    </div>
  );
}

