import { Activity, AlertOctagon, BarChart2, Clock, FolderTree, HardDrive, Layers, Settings } from 'lucide-react';

export function AppSidebar({ currentRoute, navigateTo, t, runningJobs, stats, storageStats }) {
  const items = [
    { id: 'overview', icon: BarChart2, label: t.menu.overview },
    { id: 'applications', icon: Layers, label: t.menu.applications },
    { id: 'plans', icon: Clock, label: t.menu.plans },
    { id: 'tasks', icon: Activity, label: t.menu.tasks, badge: runningJobs.length > 0 ? runningJobs.length : null },
    { id: 'backups', icon: FolderTree, label: t.menu.backups },
    { id: 'storage', icon: HardDrive, label: t.menu.storage },
    { id: 'alerts', icon: AlertOctagon, label: t.menu.alerts, badge: stats.unreadAlerts > 0 ? stats.unreadAlerts : null, badgeColor: 'bg-rose-500' },
    { id: 'settings', icon: Settings, label: t.menu.settings }
  ];
  return (
    <aside className="w-60 bg-white border-r border-slate-200/80 hidden xl:flex flex-col justify-between shrink-0 h-full overflow-y-auto">
      <nav className="p-3 space-y-1">
        {items.map(item => {
          const Icon = item.icon;
          const isActive = currentRoute === item.id;
          return <button key={item.id} onClick={() => navigateTo(item.id)} className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${isActive ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'}`}>
            <div className="flex items-center space-x-2.5"><Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} /><span>{item.label}</span></div>
            {item.badge && <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold text-white ${item.badgeColor || 'bg-emerald-500'}`}>{item.badge}</span>}
          </button>;
        })}
      </nav>
      <div className="p-3.5 m-3 bg-slate-50 rounded-xl border border-slate-200/80 text-xs text-slate-600 space-y-2.5">
        <div className="flex justify-between items-center text-slate-800 font-bold"><span className="flex items-center gap-1.5"><HardDrive className="w-3.5 h-3.5 text-slate-500" />网盘存储状态</span><span className="text-emerald-700 font-mono text-[11px]">admin</span></div>
        <div className="text-[10px] text-slate-400 font-mono truncate">/LazycatAppBackup</div>
        <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden shadow-inner"><div className="h-2 rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${(storageStats.usedGB / storageStats.totalGB) * 100}%` }}></div></div>
        <div className="flex justify-between text-[10px] text-slate-500 font-medium"><span>已用 <strong className="text-slate-800 font-mono">{storageStats.usedGB.toFixed(1)} GB</strong></span><span>剩余 <strong className="text-slate-800 font-mono">{(storageStats.totalGB - storageStats.usedGB).toFixed(1)} GB</strong></span></div>
      </div>
    </aside>
  );
}
