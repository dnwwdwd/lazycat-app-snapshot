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


export function SetupWizardView({ t, onComplete }) {
  const [step, setStep] = useState(1);

  return (
    <div className="max-w-2xl mx-auto space-y-6 pt-2">

      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 space-y-6 shadow-xl">

        <div className="flex justify-between items-center border-b border-slate-100 pb-4">
          <div className="flex items-center space-x-2">
            <Zap className="w-5 h-5 text-emerald-600" />
            <h2 className="text-sm font-bold text-slate-900">{t.setup.title}</h2>
          </div>
          <span className="text-xs font-bold text-emerald-600 font-mono">Step {step} / 6</span>
        </div>

        {step === 1 && (
          <div className="space-y-4 text-xs text-slate-600">
            <h3 className="text-sm font-bold text-slate-900">{t.setup.step1}</h3>
            <p className="leading-relaxed">
              欢迎使用懒猫应用备份 V1。本产品专为普通应用 `appvar` 数据与标准 SQLite 3 引擎设计，数据直接保存至懒猫网盘。
            </p>
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1 text-[11px]">
              <div className="text-emerald-700 font-semibold">✓ 支持：普通文件、附件、JSON/YAML、标准 SQLite 3</div>
              <div className="text-rose-700 font-semibold">✗ 阻断：MySQL、PostgreSQL、MongoDB、Redis 等已知服务型或复杂数据库</div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 text-xs">
            <h3 className="text-sm font-bold text-slate-900">{t.setup.step2}</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-700">跨应用 appvar 读取 (`appvar.other.read`)</span>
                <span className="text-emerald-600 font-bold">已授权 ✓</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-700">懒猫网盘私有文稿写入 (`document.private`)</span>
                <span className="text-emerald-600 font-bold">已授权 ✓</span>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 text-xs text-slate-600">
            <h3 className="text-sm font-bold text-slate-900">{t.setup.step3}</h3>
            <p>确认网盘备份物理路径：</p>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 font-mono text-emerald-600 font-semibold">
              /lzcapp/documents/uid-admin-1001/LazycatAppBackup/
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4 text-xs text-slate-600">
            <h3 className="text-sm font-bold text-slate-900">{t.setup.step4}</h3>
            <p>正在全量探测微服生态中的应用及部署实例...</p>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 font-mono text-emerald-700">
              已成功探测 6 个应用，发现 7 个部署实例。自动阻断 2 个不支持的服务型数据库。
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4 text-xs text-slate-600">
            <h3 className="text-sm font-bold text-slate-900">{t.setup.step5}</h3>
            <p>已根据微服硬件配置最佳自适应并发策略：普通归档 4 并发，SQLite 2 并发。</p>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-4 text-xs text-slate-600">
            <h3 className="text-sm font-bold text-slate-900">{t.setup.step6}</h3>
            <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200 text-emerald-900 space-y-1">
              <div className="font-bold">初始化设置完成！</div>
              <p>系统已就绪，已为 Notus 笔记创建默认备份保护规则。</p>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center pt-4 border-t border-slate-100">
          {step > 1 ? (
            <button
              onClick={() => setStep(s => s - 1)}
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-200 transition"
            >
              {t.setup.prev}
            </button>
          ) : <div />}

          {step < 6 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition shadow-xs"
            >
              {t.setup.next}
            </button>
          ) : (
            <button
              onClick={onComplete}
              className="px-5 py-2 bg-teal-600 text-white rounded-xl text-xs font-bold hover:bg-teal-700 transition shadow-xs"
            >
              {t.setup.finish}
            </button>
          )}
        </div>

      </div>

    </div>
  );
}
