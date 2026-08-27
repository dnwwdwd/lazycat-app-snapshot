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


export function StorageView({ t, snapshots }) {
  return (
    <div className="space-y-6">

      <div>
        <h2 className="text-lg font-bold text-slate-900 tracking-tight">{t.storage.title}</h2>
        <p className="text-xs text-slate-500">管理备份写入的懒猫网盘物理存储路径与 ISO 8601 UTC 规范</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 space-y-1 shadow-xs">
          <span className="text-xs text-slate-500">{t.storage.netdiskUser}</span>
          <div className="text-base font-bold text-emerald-600 font-mono">admin (uid-admin-1001)</div>
        </div>
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 space-y-1 shadow-xs">
          <span className="text-xs text-slate-500">{t.storage.rootPath}</span>
          <div className="text-sm font-bold text-slate-800 font-mono">/LazycatAppBackup</div>
        </div>
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 space-y-1 shadow-xs">
          <span className="text-xs text-slate-500">完整快照数</span>
          <div className="text-base font-bold text-teal-600 font-mono">{snapshots.length} 份</div>
        </div>
      </div>

      {/* Directory Layout Tree Card */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 space-y-3 shadow-xs">
        <h3 className="text-xs font-bold text-slate-900">{t.storage.structureTitle}</h3>
        <p className="text-xs text-slate-600">
          物理目录以批次逻辑时间 `scheduled_at` 为顶层视角，规范为 ISO 8601 UTC 可排序格式：
        </p>

        <div className="bg-slate-900 text-slate-200 rounded-xl p-4 font-mono text-xs leading-relaxed overflow-x-auto shadow-inner">
          <div>/lzcapp/document/LazycatAppBackup/</div>
          <div className="pl-4 text-emerald-400">├── 20260825T020000.000Z/ <span className="text-slate-500">(批次计划 UTC 时间)</span></div>
          <div className="pl-8 text-teal-300">├── dep-notus-8839a/ <span className="text-slate-500">(Deploy ID)</span></div>
          <div className="pl-12 text-emerald-300">├── Notus笔记__cloud.lazycat.notus/</div>
          <div className="pl-16 text-slate-400">├── manifest.json</div>
          <div className="pl-16 text-slate-400">├── file-index.jsonl.zst</div>
          <div className="pl-16 text-slate-400">├── files-000001.tar.zst</div>
          <div className="pl-16 text-slate-400">├── sqlite/notus_main.sqlite</div>
          <div className="pl-16 text-slate-400">├── checksums.sha256</div>
          <div className="pl-16 text-emerald-400">└── COMPLETED <span className="text-slate-500">(原子完成标记)</span></div>
        </div>
      </div>

    </div>
  );
}
