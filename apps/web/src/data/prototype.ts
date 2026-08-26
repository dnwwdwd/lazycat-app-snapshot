export const getStorageColor = (usedGB, totalGB) => {
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

export const i18n = {
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

export const INITIAL_APPS = [
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

export const INITIAL_PLANS = [
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

export const INITIAL_BATCHES = [
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

export const INITIAL_SNAPSHOTS = [
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

export const INITIAL_ALERTS = [
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

