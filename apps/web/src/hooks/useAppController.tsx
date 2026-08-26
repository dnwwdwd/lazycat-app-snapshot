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
import { getStorageColor, i18n, INITIAL_ALERTS, INITIAL_APPS, INITIAL_BATCHES, INITIAL_PLANS, INITIAL_SNAPSHOTS } from '../data/prototype';
export function useAppController() {
  const [currentRoute, setCurrentRoute] = useState('overview');
  const [routeParams, setRouteParams] = useState({});
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Core Data Stores
  const [appsData, setAppsData] = useState(INITIAL_APPS);
  const [plans, setPlans] = useState(INITIAL_PLANS);
  const [batches, setBatches] = useState(INITIAL_BATCHES);
  const [snapshots, setSnapshots] = useState(INITIAL_SNAPSHOTS);
  const [alerts, setAlerts] = useState(INITIAL_ALERTS);

  // Storage Stats State for live usage calculation
  const [storageStats, setStorageStats] = useState({ usedGB: 38.4, totalGB: 100 });

  // Active Running Jobs
  const [runningJobs, setRunningJobs] = useState([]);

  // Modals & Dialog State
  const [activeModal, setActiveModal] = useState(null);
  const [modalPayload, setModalPayload] = useState(null);

  const t = i18n;

  // Compute storage color dynamics
  const storageColorInfo = useMemo(() => {
    return getStorageColor(storageStats.usedGB, storageStats.totalGB);
  }, [storageStats]);

  // Derived Metrics
  const stats = useMemo(() => {
    let discoveredApps = appsData.length;
    let allInstances = [];
    appsData.forEach(a => allInstances.push(...a.instances));

    let totalInstances = allInstances.length;
    let backupable = allInstances.filter(i => i.status === 'BACKUPABLE').length;
    let protectedCount = allInstances.filter(i => i.protectionStatus === 'PROTECTED' && i.status === 'BACKUPABLE').length;
    let noDataCount = allInstances.filter(i => i.status === 'NO_DATA').length;
    let blockedCount = allInstances.filter(i => ['UNSUPPORTED_DATABASE', 'SYSTEM_UNSUPPORTED', 'PERMISSION_DENIED', 'UNKNOWN_DATABASE'].includes(i.status)).length;
    let unreadAlerts = alerts.filter(a => !a.isRead && !a.resolved).length;

    return {
      discoveredApps,
      totalInstances,
      backupable,
      protectedCount,
      noDataCount,
      blockedCount,
      unreadAlerts,
      allInstances
    };
  }, [appsData, alerts]);

  const triggerManualBackup = useCallback((target) => {
    const newBatchId = `batch-${Date.now()}`;
    const scheduledAtISO = new Date().toISOString().replace(/[:-]/g, '').slice(0, 15) + 'Z';

    const newBatch = {
      batch_id: newBatchId,
      plan_id: 'manual-trigger',
      plan_name: '管理员即时手动备份',
      scheduled_at: scheduledAtISO,
      started_at: new Date().toLocaleString(),
      completed_at: null,
      status: 'RUNNING',
      total_jobs: 1,
      success_jobs: 0,
      failed_jobs: 0,
      warn_jobs: 0
    };

    setBatches(prev => [newBatch, ...prev]);

    const newJob = {
      job_id: `job-${Date.now()}`,
      batch_id: newBatchId,
      appName: target.appName || target.name || 'Notus 笔记',
      deploy_id: target.deploy_id || 'dep-notus-8839a',
      owner_name: target.owner_name || '管理员主账号',
      progress: 15,
      phase: 'SQLite Online Backup 快照生成中...',
      stage: 3
    };

    setRunningJobs(prev => [...prev, newJob]);

    let interval = setInterval(() => {
      setRunningJobs(prevJobs => {
        let updated = prevJobs.map(j => {
          if (j.job_id === newJob.job_id) {
            if (j.progress >= 90) {
              clearInterval(interval);
              setTimeout(() => {
                setBatches(bList => bList.map(b => b.batch_id === newBatchId ? { ...b, status: 'SUCCESS', completed_at: new Date().toLocaleString(), success_jobs: 1 } : b));
                setRunningJobs(r => r.filter(item => item.job_id !== newJob.job_id));

                const newSnap = {
                  snapshot_id: `snap-${Date.now()}`,
                  scheduled_at: scheduledAtISO,
                  captured_at: new Date().toLocaleString(),
                  completed_at: new Date().toLocaleString(),
                  appid: target.appid || 'cloud.lazycat.notus',
                  appName: target.appName || target.name || 'Notus 笔记',
                  deploy_id: target.deploy_id || 'dep-notus-8839a',
                  owner_uid: target.owner_uid || 'uid-admin-1001',
                  owner_name: target.owner_name || '管理员主账号',
                  snapshotType: 'FULL',
                  rawBytes: target.estimatedBytes || 425000000,
                  archiveBytes: (target.estimatedBytes ? target.estimatedBytes * 0.45 : 188000000),
                  filesCount: target.fileCount || 1428,
                  sqliteCount: target.sqliteCount || 2,
                  netdiskPath: `/LazycatAppBackup/${scheduledAtISO}/${target.deploy_id || 'dep-notus-8839a'}/${target.name || 'Notus笔记'}__${target.appid || 'cloud.lazycat.notus'}/`,
                  sha256Status: 'VERIFIED',
                  lastVerifiedAt: new Date().toLocaleString()
                };
                setSnapshots(s => [newSnap, ...s]);
              }, 600);
              return { ...j, progress: 100, phase: '写入 manifest.json 并完成原子提交' };
            }
            return {
              ...j,
              progress: j.progress + 25,
              phase: j.progress > 50 ? '流式 zstd 归档分片传输至网盘...' : '一致性文件指纹采样与校验...'
            };
          }
          return j;
        });
        return updated;
      });
    }, 700);
  }, []);

  const navigateTo = (route, params = {}) => {
    setCurrentRoute(route);
    setRouteParams(params);
    setIsMobileMenuOpen(false);
  };

  const renderStatusBadge = (status) => {
    let colorClass = 'bg-slate-100 text-slate-700 border-slate-200';
    let icon = <Info className="w-3.5 h-3.5 mr-1 inline shrink-0" />;

    switch (status) {
      case 'BACKUPABLE':
      case 'PROTECTED':
      case 'SUCCESS':
      case 'VERIFIED':
        colorClass = 'bg-emerald-50 text-emerald-800 border-emerald-200/80 font-semibold';
        icon = <CheckCircle2 className="w-3.5 h-3.5 mr-1 inline shrink-0 text-emerald-600" />;
        break;
      case 'UNPROTECTED':
      case 'PENDING':
      case 'QUEUED':
        colorClass = 'bg-amber-50 text-amber-800 border-amber-200/80 font-semibold';
        icon = <Clock className="w-3.5 h-3.5 mr-1 inline shrink-0 text-amber-600" />;
        break;
      case 'RUNNING':
        colorClass = 'bg-teal-50 text-teal-800 border-teal-200/80 font-semibold';
        icon = <RefreshCw className="w-3.5 h-3.5 mr-1 inline shrink-0 text-teal-600 animate-spin" />;
        break;
      case 'NO_DATA':
        colorClass = 'bg-slate-100 text-slate-600 border-slate-200 font-semibold';
        icon = <Box className="w-3.5 h-3.5 mr-1 inline shrink-0 text-slate-500" />;
        break;
      case 'UNSUPPORTED_DATABASE':
      case 'UNKNOWN_DATABASE':
        colorClass = 'bg-rose-50 text-rose-700 border-rose-200/80 font-semibold';
        icon = <AlertTriangle className="w-3.5 h-3.5 mr-1 inline shrink-0 text-rose-600" />;
        break;
      case 'SYSTEM_UNSUPPORTED':
      case 'PERMISSION_DENIED':
        colorClass = 'bg-purple-50 text-purple-700 border-purple-200/80 font-semibold';
        icon = <Lock className="w-3.5 h-3.5 mr-1 inline shrink-0 text-purple-600" />;
        break;
      default:
        break;
    }

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] border ${colorClass}`}>
        {icon}
        {t.status[status] || status}
      </span>
    );
  };

  return {
    activeModal, alerts, appsData, batches, currentRoute, isMobileMenuOpen, modalPayload,
    navigateTo, plans, renderStatusBadge, runningJobs, setActiveModal, setAlerts,
    setIsMobileMenuOpen, setModalPayload, setStorageStats, snapshots, stats,
    storageColorInfo, storageStats, t, triggerManualBackup,
  };
}
