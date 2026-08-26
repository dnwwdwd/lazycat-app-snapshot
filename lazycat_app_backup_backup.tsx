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

// Helper function to derive storage progress color and status based on usage percentage
const getStorageColor = (usedGB, totalGB) => {
  const percent = Math.min(100, Math.max(0, (usedGB / totalGB) * 100));
  if (percent >= 85) {
    return {
      percent,
      bar: 'bg-rose-500',
      text: 'text-rose-600',
      badgeBg: 'bg-rose-50 text-rose-700 border-rose-200',
      statusText: '空间紧张 (>85%)',
      dotColor: 'bg-rose-500'
    };
  } else if (percent >= 60) {
    return {
      percent,
      bar: 'bg-amber-500',
      text: 'text-amber-600',
      badgeBg: 'bg-amber-50 text-amber-700 border-amber-200',
      statusText: '用量较高 (60%-85%)',
      dotColor: 'bg-amber-500'
    };
  } else {
    return {
      percent,
      bar: 'bg-emerald-500',
      text: 'text-emerald-600',
      badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      statusText: '空间充裕 (<60%)',
      dotColor: 'bg-emerald-500'
    };
  }
};

const i18n = {
  appName: '懒猫应用备份',
  appSub: 'Lazycat App Backup V1',
  menu: {
    overview: '概览',
    applications: '应用实例',
    plans: '备份计划',
    tasks: '任务中心',
    backups: '备份库',
    storage: '网盘存储',
    alerts: '告警中心',
    settings: '系统设置',
    setup: '首次向导',
    more: '更多'
  },
  status: {
    BACKUPABLE: '可备份',
    NO_DATA: '无应用数据',
    UNSUPPORTED_DATABASE: '数据库不支持',
    UNKNOWN_DATABASE: '检测到未知数据库',
    DATA_OUTSIDE_APPVAR: '数据在 appvar 外',
    APPVAR_NOT_PROJECTED: '未找到投影',
    PERMISSION_DENIED: '权限受限',
    SYSTEM_UNSUPPORTED: '系统应用不支持',
    LIGHTOS_UNSUPPORTED: 'LightOS 不支持',
    PROBE_FAILED: '探测失败',
    PROTECTED: '正常保护',
    UNPROTECTED: '未保护',
    PENDING: '待首次备份',
    RUNNING: '运行中',
    QUEUED: '排队中',
    SUCCESS: '成功',
    NO_CHANGE: '无变化',
    WARNING: '有警告',
    FAILED: '失败',
    CANCELLED: '已取消'
  },
  overview: {
    title: '概览中心',
    discoveredApps: '已发现应用',
    discoveredInstances: '部署实例数',
    backupableInstances: '可备份实例',
    protectedInstances: '已保护实例',
    noDataInstances: '无数据实例',
    blockedInstances: '受阻 / 数据库不支持',
    taskStats24h: '24小时任务状态',
    queueStats: '资源队列',
    storageUsage: '网盘存储空间',
    protectionDist: '保护状态分布',
    throughput: '实时吞吐与工作池',
    readSpeed: '读取吞吐',
    writeSpeed: '网盘写入',
    compressSpeed: 'zstd 压缩率',
    nextBatches: '未来 24h 定时批次',
    riskReminders: '安全边界与阻断提醒',
    recentActivity: '最近审计日志',
    runNow: '立即触发',
    viewAllTasks: '进入任务中心'
  },
  applications: {
    title: '应用与实例管理',
    tabAll: '全部实例',
    tabBackupable: '可备份',
    tabProtected: '已保护',
    tabUnprotected: '未保护',
    tabNoData: '无应用数据',
    tabUnsupported: '数据库不支持',
    searchPlaceholder: '搜索应用名、appid、deploy_id 或 UID...',
    appAggregated: '按应用分组',
    instanceUnfolded: '实例平铺视图',
    colAppName: '应用信息',
    colVersion: '版本',
    colInstances: '实例数',
    colStatus: '能力评估',
    colDataSize: '估算数据量',
    colLastBackup: '最近成功备份',
    colActions: '操作选项',
    owner: '所属用户',
    deployId: 'Deploy ID'
  },
  plans: {
    title: '备份计划管理',
    newPlan: '新建备份计划',
    runImmediately: '立即触发',
    targetSingle: '指定单实例',
    targetAllInApp: '应用当前全部实例',
    targetDynamic: '动态包含新增实例',
    targetMultiApp: '多应用组合计划'
  },
  tasks: {
    title: '任务中心',
    tabQueue: '实时运行队列',
    tabBatches: '备份批次记录',
    batchId: '批次 ID',
    scheduledAt: '计划时间 (UTC)',
    totalTasks: '实例任务总数'
  },
  backups: {
    title: '备份快照库',
    snapshotTime: '快照生成时间',
    snapshotType: '快照类型',
    fullSnapshot: '完整压缩快照',
    noChangeRef: '无变化轻量引用',
    integrity: '校验状态',
    viewFiles: '浏览文件索引'
  },
  storage: {
    title: '网盘存储管理',
    netdiskUser: '网盘归属 UID',
    rootPath: '网盘物理根路径',
    structureTitle: '懒猫网盘 ISO 8601 UTC 物理目录结构'
  },
  alerts: {
    title: '告警事件中心',
    resolve: '确认已处理'
  },
  settings: {
    title: '系统与引擎设置',
    tabPerformance: '并发与限速',
    tabDiagnostics: '诊断与脱敏包',
    archiveConcurrency: '普通文件归档并发',
    sqliteConcurrency: 'SQLite 在线快照并发',
    exportLogPackage: '导出脱敏诊断包'
  },
  setup: {
    title: '懒猫应用备份 - 首次启动向导',
    step1: '产品能力与安全边界',
    step2: '微服系统权限检测',
    step3: '懒猫网盘目标配置',
    step4: '应用与数据库全量探测',
    step5: '资源与并发策略优化',
    step6: '体验首个备份任务',
    next: '下一步',
    prev: '上一步',
    finish: '完成配置并开启保护'
  }
};

const INITIAL_APPS = [
  {
    appid: 'cloud.lazycat.notus',
    name: 'Notus 笔记',
    version: '2.4.1',
    isMultiInstance: false,
    iconBg: 'bg-emerald-600 text-white',
    instances: [
      {
        instance_key: 'deploy-notus-001',
        deploy_id: 'dep-notus-8839a',
        owner_uid: 'uid-admin-1001',
        owner_name: '管理员主账号',
        status: 'BACKUPABLE',
        protectionStatus: 'PROTECTED',
        fileCount: 1420,
        estimatedBytes: 420000000,
        sqliteCount: 2,
        sqlitePaths: ['notus_main.sqlite', 'index_cache.db'],
        unsupportedDb: null,
        lastBackupAt: '2026-08-25 02:00:12',
        nextScheduleAt: '2026-08-26 02:00:00'
      }
    ]
  },
  {
    appid: 'cloud.lazycat.paperless',
    name: 'Paperless-ngx 文档管理',
    version: '2.11.0',
    isMultiInstance: true,
    iconBg: 'bg-teal-600 text-white',
    instances: [
      {
        instance_key: 'dep-paperless-user1',
        deploy_id: 'dep-paper-9921b',
        owner_uid: 'uid-user-1002',
        owner_name: '张经理 (Finance)',
        status: 'BACKUPABLE',
        protectionStatus: 'PROTECTED',
        fileCount: 8900,
        estimatedBytes: 3450000000,
        sqliteCount: 1,
        sqlitePaths: ['db.sqlite3'],
        unsupportedDb: null,
        lastBackupAt: '2026-08-25 02:00:45',
        nextScheduleAt: '2026-08-26 02:00:00'
      },
      {
        instance_key: 'dep-paperless-user2',
        deploy_id: 'dep-paper-3312c',
        owner_uid: 'uid-user-1003',
        owner_name: '李工程师 (R&D)',
        status: 'BACKUPABLE',
        protectionStatus: 'UNPROTECTED',
        fileCount: 2400,
        estimatedBytes: 980000000,
        sqliteCount: 1,
        sqlitePaths: ['db.sqlite3'],
        unsupportedDb: null,
        lastBackupAt: null,
        nextScheduleAt: '2026-08-26 02:00:00'
      }
    ]
  },
  {
    appid: 'cloud.lazycat.mastodon',
    name: 'Mastodon 联邦微服',
    version: '4.2.8',
    isMultiInstance: false,
    iconBg: 'bg-rose-500 text-white',
    instances: [
      {
        instance_key: 'dep-masto-shared',
        deploy_id: 'dep-masto-1102f',
        owner_uid: 'uid-admin-1001',
        owner_name: '共享实例',
        status: 'UNSUPPORTED_DATABASE',
        protectionStatus: 'UNPROTECTED',
        fileCount: 12000,
        estimatedBytes: 8200000000,
        sqliteCount: 0,
        sqlitePaths: [],
        unsupportedDb: 'PostgreSQL 数据库 (detected socket / PG_VERSION)',
        lastBackupAt: null,
        nextScheduleAt: null
      }
    ]
  },
  {
    appid: 'cloud.lazycat.wordpress',
    name: 'WordPress 博客系统',
    version: '6.5.2',
    isMultiInstance: true,
    iconBg: 'bg-cyan-600 text-white',
    instances: [
      {
        instance_key: 'dep-wp-site1',
        deploy_id: 'dep-wp-4410e',
        owner_uid: 'uid-user-1004',
        owner_name: '王作家 (Blog)',
        status: 'UNSUPPORTED_DATABASE',
        protectionStatus: 'UNPROTECTED',
        fileCount: 4500,
        estimatedBytes: 1200000000,
        sqliteCount: 0,
        sqlitePaths: [],
        unsupportedDb: 'MySQL 数据库服务 (detected db_config.php + mysqld.sock)',
        lastBackupAt: null,
        nextScheduleAt: null
      }
    ]
  },
  {
    appid: 'cloud.lazycat.redis-viewer',
    name: 'Redis 管理面板',
    version: '1.2.0',
    isMultiInstance: false,
    iconBg: 'bg-slate-600 text-white',
    instances: [
      {
        instance_key: 'shared:cloud.lazycat.redis-viewer',
        deploy_id: 'dep-redis-view-0',
        owner_uid: 'uid-admin-1001',
        owner_name: '共享实例',
        status: 'NO_DATA',
        protectionStatus: 'PROTECTED',
        fileCount: 0,
        estimatedBytes: 0,
        sqliteCount: 0,
        sqlitePaths: [],
        unsupportedDb: null,
        lastBackupAt: null,
        nextScheduleAt: null
      }
    ]
  },
  {
    appid: 'cloud.lazycat.netdisk',
    name: '懒猫网盘 (系统级核心应用)',
    version: '3.1.0',
    isMultiInstance: false,
    iconBg: 'bg-slate-800 text-white',
    instances: [
      {
        instance_key: 'shared:cloud.lazycat.netdisk',
        deploy_id: 'dep-sys-netdisk',
        owner_uid: 'uid-system-0',
        owner_name: '系统账号',
        status: 'SYSTEM_UNSUPPORTED',
        protectionStatus: 'UNPROTECTED',
        fileCount: 0,
        estimatedBytes: 0,
        sqliteCount: 0,
        sqlitePaths: [],
        unsupportedDb: null,
        lastBackupAt: null,
        nextScheduleAt: null
      }
    ]
  }
];

const INITIAL_PLANS = [
  {
    plan_id: 'plan-core-daily',
    name: '核心应用每日定时备份',
    targetType: 'DYNAMIC_ALL',
    targetsCount: 3,
    status: 'ACTIVE',
    scheduleCron: '0 2 * * *',
    scheduleHuman: '每天 02:00 UTC',
    backupWindowMinutes: 120,
    concurrencyMax: 4,
    lastBatchStatus: 'SUCCESS',
    nextRunAt: '2026-08-26 02:00:00',
    retentionPolicy: '保留最近 7 份完整快照 + 30天无变化引用'
  },
  {
    plan_id: 'plan-sqlite-hourly',
    name: 'Notus SQLite 高频保护计划',
    targetType: 'SPECIFIC_INSTANCE',
    targetsCount: 1,
    status: 'ACTIVE',
    scheduleCron: '0 * * * *',
    scheduleHuman: '每小时整点',
    backupWindowMinutes: 15,
    concurrencyMax: 1,
    lastBatchStatus: 'SUCCESS',
    nextRunAt: '2026-08-25 15:00:00',
    retentionPolicy: '保留最近 24 小时高频快照'
  }
];

const INITIAL_BATCHES = [
  {
    batch_id: 'batch-20260825-020000',
    plan_id: 'plan-core-daily',
    plan_name: '核心应用每日定时备份',
    scheduled_at: '20260825T020000.000Z',
    started_at: '2026-08-25 02:00:01',
    completed_at: '2026-08-25 02:01:23',
    status: 'SUCCESS',
    total_jobs: 2,
    success_jobs: 2,
    failed_jobs: 0,
    warn_jobs: 0
  }
];

const INITIAL_SNAPSHOTS = [
  {
    snapshot_id: 'snap-notus-20260825',
    scheduled_at: '20260825T020000.000Z',
    captured_at: '2026-08-25 02:00:10',
    completed_at: '2026-08-25 02:00:12',
    appid: 'cloud.lazycat.notus',
    appName: 'Notus 笔记',
    deploy_id: 'dep-notus-8839a',
    owner_uid: 'uid-admin-1001',
    owner_name: '管理员主账号',
    snapshotType: 'FULL',
    rawBytes: 420000000,
    archiveBytes: 185000000,
    filesCount: 1420,
    sqliteCount: 2,
    netdiskPath: '/LazycatAppBackup/20260825T020000.000Z/dep-notus-8839a/Notus笔记__cloud.lazycat.notus/',
    sha256Status: 'VERIFIED',
    lastVerifiedAt: '2026-08-25 03:00:00'
  },
  {
    snapshot_id: 'snap-paperless-20260825',
    scheduled_at: '20260825T020000.000Z',
    captured_at: '2026-08-25 02:00:15',
    completed_at: '2026-08-25 02:01:23',
    appid: 'cloud.lazycat.paperless',
    appName: 'Paperless-ngx 文档管理',
    deploy_id: 'dep-paper-9921b',
    owner_uid: 'uid-user-1002',
    owner_name: '张经理 (Finance)',
    snapshotType: 'FULL',
    rawBytes: 3450000000,
    archiveBytes: 2100000000,
    filesCount: 8900,
    sqliteCount: 1,
    netdiskPath: '/LazycatAppBackup/20260825T020000.000Z/dep-paper-9921b/Paperless-ngx__cloud.lazycat.paperless/',
    sha256Status: 'VERIFIED',
    lastVerifiedAt: '2026-08-25 03:05:00'
  }
];

const INITIAL_ALERTS = [
  {
    alert_id: 'alert-masto-db',
    level: 'WARNING',
    type: 'UNSUPPORTED_DATABASE_DETECTED',
    title: '检测到不支持的服务型数据库 (Mastodon)',
    message: '应用实例 dep-masto-1102f 中检测到 PostgreSQL 数据库特征，已阻断物理直接归档以防止无效损坏文件。',
    appid: 'cloud.lazycat.mastodon',
    deploy_id: 'dep-masto-1102f',
    createdAt: '2026-08-24 18:22:10',
    isRead: false,
    resolved: false
  },
  {
    alert_id: 'alert-wp-db',
    level: 'WARNING',
    type: 'UNSUPPORTED_DATABASE_DETECTED',
    title: '检测到 MySQL 数据库服务 (WordPress)',
    message: '应用实例 dep-wp-4410e 包含 MySQL 活动实例，V1 不提供服务型数据库物理冷复制。',
    appid: 'cloud.lazycat.wordpress',
    deploy_id: 'dep-wp-4410e',
    createdAt: '2026-08-24 19:05:00',
    isRead: false,
    resolved: false
  }
];

export default function App() {
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

  return (
    <div className="h-screen bg-slate-50/70 text-slate-800 font-sans flex flex-col overflow-hidden antialiased selection:bg-emerald-500 selection:text-white">

      {/* Top Header */}
      <header className="h-16 bg-white border-b border-slate-200/80 sticky top-0 z-40 backdrop-blur-md flex items-center justify-between px-4 sm:px-6 shadow-xs shrink-0">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 rounded-xl text-slate-500 hover:bg-slate-100 focus:outline-none transition"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center space-x-3 cursor-pointer group" onClick={() => navigateTo('overview')}>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-emerald-500 flex items-center justify-center shadow-xs text-white group-hover:scale-105 transition-transform">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-slate-900 text-sm tracking-tight flex items-center gap-2">
                {t.appName}
                <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">V1</span>
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block">文件与 SQLite 一致性保护中心</p>
            </div>
          </div>
        </div>

        {/* Header Right Controls */}
        <div className="flex items-center space-x-3">
          {runningJobs.length > 0 && (
            <div
              onClick={() => navigateTo('tasks')}
              className="cursor-pointer bg-emerald-50 border border-emerald-200/80 rounded-full px-3 py-1 flex items-center space-x-2 text-xs text-emerald-800 hover:bg-emerald-100/80 transition-all shadow-xs"
            >
              <RefreshCw className="w-3.5 h-3.5 text-emerald-600 animate-spin" />
              <span className="font-semibold">{runningJobs.length} 个任务运行中</span>
              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-ping"></span>
            </div>
          )}

          <button
            onClick={() => navigateTo('setup')}
            className="hidden lg:flex items-center space-x-1.5 text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-900 px-3 py-1.5 rounded-xl border border-emerald-200/80 transition"
          >
            <Zap className="w-3.5 h-3.5 text-emerald-600" />
            <span>{t.menu.setup}</span>
          </button>

          <button
            onClick={() => navigateTo('alerts')}
            className="relative p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition focus:outline-none"
            title="告警事件中心"
          >
            <AlertOctagon className="w-5 h-5" />
            {stats.unreadAlerts > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-xs">
                {stats.unreadAlerts}
              </span>
            )}
          </button>

          <div className="flex items-center space-x-2 border-l border-slate-200 pl-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-700 flex items-center justify-center text-xs font-bold shadow-xs">
              AD
            </div>
            <span className="text-xs font-semibold text-slate-700 hidden md:inline">微服管理员</span>
          </div>
        </div>
      </header>

      {/* Main Workspace Frame with Independent Scrolling Sidebar & Main View */}
      <div className="h-[calc(100vh-4rem)] flex overflow-hidden relative">

        {}
        {/* Sidebar Navigation (Independently Scrollable) */}
        <aside className="w-60 bg-white border-r border-slate-200/80 hidden md:flex flex-col justify-between shrink-0 h-full overflow-y-auto">
          <nav className="p-3 space-y-1">
            {[
              { id: 'overview', icon: BarChart2, label: t.menu.overview },
              { id: 'applications', icon: Layers, label: t.menu.applications },
              { id: 'plans', icon: Clock, label: t.menu.plans },
              { id: 'tasks', icon: Activity, label: t.menu.tasks, badge: runningJobs.length > 0 ? runningJobs.length : null },
              { id: 'backups', icon: FolderTree, label: t.menu.backups },
              { id: 'storage', icon: HardDrive, label: t.menu.storage },
              { id: 'alerts', icon: AlertOctagon, label: t.menu.alerts, badge: stats.unreadAlerts > 0 ? stats.unreadAlerts : null, badgeColor: 'bg-rose-500' },
              { id: 'settings', icon: Settings, label: t.menu.settings }
            ].map(item => {
              const Icon = item.icon;
              const isActive = currentRoute === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => navigateTo(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold text-white ${item.badgeColor || 'bg-emerald-500'}`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Sidebar Storage Widget - Dynamic color changing bar based on usage */}
          <div className="p-3.5 m-3 bg-slate-50 rounded-xl border border-slate-200/80 text-xs text-slate-600 space-y-2.5">
            <div className="flex justify-between items-center text-slate-800 font-bold">
              <span className="flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-slate-500" />
                网盘存储状态
              </span>
              <span className="text-emerald-700 font-mono text-[11px]">admin</span>
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="truncate text-[10px] text-slate-400 font-mono">/LazycatAppBackup</span>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${storageColorInfo.badgeBg}`}>
                {storageColorInfo.statusText}
              </span>
            </div>

            {/* Dynamic Storage Bar */}
            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden shadow-inner">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${storageColorInfo.bar}`}
                style={{ width: `${storageColorInfo.percent}%` }}
              ></div>
            </div>

            <div className="flex justify-between text-[10px] text-slate-500 font-medium">
              <span>已用 <strong className="text-slate-800 font-mono">{storageStats.usedGB.toFixed(1)} GB</strong></span>
              <span>剩余 <strong className="text-slate-800 font-mono">{(storageStats.totalGB - storageStats.usedGB).toFixed(1)} GB</strong></span>
            </div>
          </div>
        </aside>

        {/* Mobile Floating Bottom Bar with Rounded Border Radius */}
        <div className="md:hidden fixed bottom-3 left-3 right-3 z-50 bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-xl rounded-2xl p-1.5 flex items-center justify-around">
          {[
            { id: 'overview', icon: BarChart2, label: '概览' },
            { id: 'applications', icon: Layers, label: '应用' },
            { id: 'plans', icon: Clock, label: '计划' },
            { id: 'tasks', icon: Activity, label: '任务', badge: runningJobs.length > 0 },
            { id: 'alerts', icon: AlertOctagon, label: '告警', badge: stats.unreadAlerts > 0 },
            { id: 'more', icon: Menu, label: '更多' }
          ].map((item) => {
            const Icon = item.icon;
            const isActive = currentRoute === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.id === 'more') {
                    setIsMobileMenuOpen(true);
                  } else {
                    navigateTo(item.id);
                  }
                }}
                className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all relative ${
                  isActive
                    ? 'text-emerald-600 font-bold bg-emerald-50/90'
                    : 'text-slate-500 hover:text-slate-900 font-medium'
                }`}
              >
                <Icon className="w-4 h-4 mb-0.5" />
                <span className="text-[10px] leading-tight">{item.label}</span>
                {item.badge && (
                  <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white"></span>
                )}
              </button>
            );
          })}
        </div>

        {/* Mobile Navigation Drawer */}
        {isMobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex">
            <div className="w-72 bg-white h-full p-4 flex flex-col justify-between shadow-2xl">
              <div>
                <div className="flex justify-between items-center pb-4 mb-4 border-b border-slate-200">
                  <div className="flex items-center space-x-2">
                    <ShieldCheck className="w-6 h-6 text-emerald-600" />
                    <span className="font-bold text-slate-900 text-sm">{t.appName}</span>
                  </div>
                  <button onClick={() => setIsMobileMenuOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <nav className="space-y-1">
                  {[
                    { id: 'overview', icon: BarChart2, label: t.menu.overview },
                    { id: 'applications', icon: Layers, label: t.menu.applications },
                    { id: 'plans', icon: Clock, label: t.menu.plans },
                    { id: 'tasks', icon: Activity, label: t.menu.tasks },
                    { id: 'backups', icon: FolderTree, label: t.menu.backups },
                    { id: 'storage', icon: HardDrive, label: t.menu.storage },
                    { id: 'alerts', icon: AlertOctagon, label: t.menu.alerts },
                    { id: 'settings', icon: Settings, label: t.menu.settings },
                    { id: 'setup', icon: Zap, label: t.menu.setup }
                  ].map(item => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => navigateTo(item.id)}
                        className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold ${
                          currentRoute === item.id ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </nav>
              </div>
            </div>
          </div>
        )}

        {/* Workspace Views Routing (Independently Scrollable Main View) */}
        <main className="flex-1 h-full overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 pb-20 md:pb-8">

          {currentRoute === 'overview' && (
            <OverviewView
              t={t}
              stats={stats}
              navigateTo={navigateTo}
              triggerManualBackup={triggerManualBackup}
              batches={batches}
              alerts={alerts}
            />
          )}

          {currentRoute === 'applications' && (
            <ApplicationsView
              t={t}
              appsData={appsData}
              navigateTo={navigateTo}
              triggerManualBackup={triggerManualBackup}
              renderStatusBadge={renderStatusBadge}
              openModal={(modal, payload) => {
                setActiveModal(modal);
                setModalPayload(payload);
              }}
            />
          )}

          {currentRoute === 'plans' && (
            <PlansView
              t={t}
              plans={plans}
              navigateTo={navigateTo}
              openModal={(modal, payload) => {
                setActiveModal(modal);
                setModalPayload(payload);
              }}
              triggerManualBackup={triggerManualBackup}
            />
          )}

          {currentRoute === 'tasks' && (
            <TasksView
              t={t}
              batches={batches}
              runningJobs={runningJobs}
              renderStatusBadge={renderStatusBadge}
            />
          )}

          {currentRoute === 'backups' && (
            <BackupLibraryView
              t={t}
              snapshots={snapshots}
              renderStatusBadge={renderStatusBadge}
              openModal={(modal, payload) => {
                setActiveModal(modal);
                setModalPayload(payload);
              }}
            />
          )}

          {currentRoute === 'storage' && (
            <StorageView
              t={t}
              snapshots={snapshots}
              storageStats={storageStats}
              setStorageStats={setStorageStats}
              storageColorInfo={storageColorInfo}
            />
          )}

          {currentRoute === 'alerts' && (
            <AlertsView
              t={t}
              alerts={alerts}
              setAlerts={setAlerts}
              navigateTo={navigateTo}
            />
          )}

          {currentRoute === 'settings' && (
            <SettingsView
              t={t}
              storageStats={storageStats}
              setStorageStats={setStorageStats}
              storageColorInfo={storageColorInfo}
            />
          )}

          {currentRoute === 'setup' && (
            <SetupWizardView
              t={t}
              onComplete={() => navigateTo('overview')}
            />
          )}

        </main>
      </div>

      {/* Global Modals */}

      {/* Modal: Unsupported DB Dialog */}
      {activeModal === 'unsupportedDb' && modalPayload && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start space-x-3 text-rose-600">
              <div className="p-2 bg-rose-50 rounded-xl border border-rose-100">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">检测到不支持的服务型数据库</h3>
                <p className="text-xs text-rose-600">触发安全阻断保护机制</p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">应用名称：</span>
                <span className="font-semibold text-slate-900">{modalPayload.appName || modalPayload.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Deploy ID：</span>
                <span className="font-mono text-emerald-600">{modalPayload.deploy_id || 'shared'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">数据库特征：</span>
                <span className="text-rose-600 font-semibold">{modalPayload.unsupportedDb || 'MySQL / PostgreSQL / Redis / MongoDB'}</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              懒猫应用备份 V1 专为普通文件与标准 SQLite 3 设计。直接冷复制正在运行的服务型数据库物理文件会导致文件破坏。根据 V1 安全边界，系统严格阻止为此类实例创建无效快照。
            </p>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 transition"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: No Data Info Dialog */}
      {activeModal === 'noData' && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center space-x-3 text-slate-700">
              <div className="p-2 bg-emerald-50 rounded-xl">
                <Box className="w-5 h-5 text-emerald-600" />
              </div>
              <h3 className="text-base font-bold text-slate-900">该应用无需要备份的数据</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              纯前端应用或初始 `appvar` 目录为空的应用无需产生物理归档。这不会计入系统的未保护风险，也不产生错误日志。
            </p>
            <div className="flex justify-end">
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 transition shadow-xs"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: File Index Inspector */}
      {activeModal === 'fileIndex' && modalPayload && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <div className="flex items-center space-x-2">
                <FolderTree className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">快照文件索引预览 ({modalPayload.appName})</h3>
              </div>
              <button onClick={() => setActiveModal(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-900 text-slate-100 rounded-xl p-3.5 font-mono text-xs max-h-80 overflow-y-auto space-y-1.5 shadow-inner">
              <div className="text-emerald-400 flex items-center"><Folder className="w-4 h-4 mr-1.5 text-emerald-400" /> / (appvar root)</div>
              <div className="pl-4 text-teal-400 flex items-center"><FileText className="w-4 h-4 mr-1.5 text-teal-400" /> sqlite/notus_main.sqlite <span className="text-slate-400 ml-2">(380MB, Online Snapshot Copy)</span></div>
              <div className="pl-4 text-slate-300 flex items-center"><File className="w-4 h-4 mr-1.5 text-slate-400" /> config.json <span className="text-slate-500 ml-2">(2.4KB)</span></div>
              <div className="pl-4 text-emerald-300 flex items-center"><Folder className="w-4 h-4 mr-1.5 text-emerald-400" /> uploads/</div>
              <div className="pl-8 text-slate-300 flex items-center"><File className="w-4 h-4 mr-1.5 text-slate-400" /> avatar.png <span className="text-slate-500 ml-2">(145KB)</span></div>
              <div className="pl-8 text-slate-300 flex items-center"><File className="w-4 h-4 mr-1.5 text-slate-400" /> doc_metadata.json <span className="text-slate-500 ml-2">(18KB)</span></div>
              <div className="pl-4 text-emerald-300 flex items-center"><CheckCircle className="w-4 h-4 mr-1.5 text-emerald-300" /> checksums.sha256</div>
              <div className="pl-4 text-emerald-400 flex items-center"><FileText className="w-4 h-4 mr-1.5 text-emerald-400" /> manifest.json</div>
            </div>

            <div className="flex justify-between items-center text-xs text-slate-500 pt-1">
              <span>* 保护应用隐私安全，不在控制台展示敏感文件文本内容</span>
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function OverviewView({ t, stats, navigateTo, triggerManualBackup, batches, alerts }) {
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

function ApplicationsView({ t, appsData, navigateTo, triggerManualBackup, renderStatusBadge, openModal }) {
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

        <div className="flex items-center space-x-1 bg-slate-200/60 p-1 rounded-xl">
          <button
            onClick={() => setViewType('UNFOLDED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              viewType === 'UNFOLDED' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.applications.instanceUnfolded}
          </button>
          <button
            onClick={() => setViewType('AGGREGATED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              viewType === 'AGGREGATED' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.applications.appAggregated}
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 space-y-4 shadow-xs">
        <div className="flex flex-col md:flex-row justify-between items-center gap-3">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t.applications.searchPlaceholder}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex flex-wrap gap-1 text-xs">
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
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold uppercase tracking-wider text-[11px]">
                  <th className="p-3.5">{t.applications.colAppName}</th>
                  <th className="p-3.5">{t.applications.owner} / {t.applications.deployId}</th>
                  <th className="p-3.5">{t.applications.colStatus}</th>
                  <th className="p-3.5">{t.applications.colDataSize}</th>
                  <th className="p-3.5">{t.applications.colLastBackup}</th>
                  <th className="p-3.5 text-right">{t.applications.colActions}</th>
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

                      <td className="p-3.5 text-right space-x-2">
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

function PlansView({ t, plans, navigateTo, openModal, triggerManualBackup }) {
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

function TasksView({ t, batches, runningJobs, renderStatusBadge }) {
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

function BackupLibraryView({ t, snapshots, renderStatusBadge, openModal }) {
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

function StorageView({ t, snapshots, storageStats, setStorageStats, storageColorInfo }) {
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

      {/* Dynamic Storage Usage Control Card */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-emerald-600" />
              网盘存储用量实时控制与状态颜色测试
            </h3>
            <p className="text-[11px] text-slate-500">拖动下方滑块调整存储占用比例，观察左侧菜单栏及此处的动态颜色变化</p>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-bold border shrink-0 ${storageColorInfo.badgeBg}`}>
            当前状态: {storageColorInfo.statusText}
          </span>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs text-slate-700 font-semibold">
            <span>存储使用量设置：</span>
            <span className="font-mono text-emerald-700">{storageStats.usedGB.toFixed(1)} GB / {storageStats.totalGB} GB ({storageColorInfo.percent.toFixed(1)}%)</span>
          </div>

          <input
            type="range"
            min="5"
            max="98"
            step="1"
            value={storageStats.usedGB}
            onChange={(e) => setStorageStats(prev => ({ ...prev, usedGB: parseFloat(e.target.value) }))}
            className="w-full accent-emerald-600 cursor-pointer"
          />

          <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden shadow-inner mt-2">
            <div
              className={`h-3 rounded-full transition-all duration-300 ${storageColorInfo.bar}`}
              style={{ width: `${storageColorInfo.percent}%` }}
            ></div>
          </div>

          <div className="flex justify-between text-[11px] text-slate-500 pt-1">
            <span className="text-emerald-600 font-semibold">&lt;60% 正常 (绿色)</span>
            <span className="text-amber-600 font-semibold">60%-85% 警告 (黄橙)</span>
            <span className="text-rose-600 font-semibold">&gt;85% 紧张 (红色)</span>
          </div>
        </div>
      </div>

      {/* Directory Layout Tree Card */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 space-y-3 shadow-xs">
        <h3 className="text-xs font-bold text-slate-900">{t.storage.structureTitle}</h3>
        <p className="text-xs text-slate-600">
          物理目录以批次逻辑时间 `scheduled_at` 为顶层视角，规范为 ISO 8601 UTC 可排序格式：
        </p>

        <div className="bg-slate-900 text-slate-200 rounded-xl p-4 font-mono text-xs leading-relaxed overflow-x-auto shadow-inner">
          <div>/lzcapp/documents/&lt;storage_uid&gt;/LazycatAppBackup/</div>
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

function AlertsView({ t, alerts, setAlerts, navigateTo }) {
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

function SettingsView({ t, storageStats, setStorageStats, storageColorInfo }) {
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

function SetupWizardView({ t, onComplete }) {
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