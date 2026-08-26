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


export function BackupLibraryView({ t, snapshots, renderStatusBadge, openModal }) {
  return (
    <div className="space-y-6">

      <div>
        <h2 className="text-lg font-bold text-slate-900 tracking-tight">{t.backups.title}</h2>
        <p className="text-xs text-slate-500">懒猫网盘中的物理快照与 SHA-256 完整性校验状态</p>
      </div>

      <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold uppercase text-[11px]">
              <th className="p-3.5">{t.backups.snapshotTime}</th>
              <th className="p-3.5">应用与 Deploy ID</th>
              <th className="p-3.5">{t.backups.snapshotType}</th>
              <th className="p-3.5">压缩大小</th>
              <th className="p-3.5">{t.backups.integrity}</th>
              <th className="p-3.5 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {snapshots.map(s => (
              <tr key={s.snapshot_id} className="hover:bg-slate-50/80">
                <td className="p-3.5">
                  <div className="font-mono text-slate-800 font-medium">{s.captured_at}</div>
                  <div className="text-[10px] text-slate-400 font-mono">Plan: {s.scheduled_at}</div>
                </td>

                <td className="p-3.5">
                  <div className="font-bold text-slate-900">{s.appName}</div>
                  <div className="text-[10px] font-mono text-emerald-600">{s.deploy_id} ({s.owner_name})</div>
                </td>

                <td className="p-3.5">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {s.snapshotType === 'FULL' ? t.backups.fullSnapshot : t.backups.noChangeRef}
                  </span>
                </td>

                <td className="p-3.5 font-mono">
                  <div>{(s.archiveBytes / 1000000).toFixed(1)} MB</div>
                  <div className="text-[10px] text-slate-400 line-through">{(s.rawBytes / 1000000).toFixed(1)} MB</div>
                </td>

                <td className="p-3.5">
                  {renderStatusBadge(s.sha256Status)}
                </td>

                <td className="p-3.5 text-right space-x-2">
                  <button
                    onClick={() => openModal('fileIndex', s)}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold"
                  >
                    文件索引
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}

