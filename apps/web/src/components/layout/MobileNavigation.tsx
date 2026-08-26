import { Activity, AlertOctagon, BarChart2, Clock, FolderTree, HardDrive, Layers, Menu, Settings, ShieldCheck, X, Zap } from 'lucide-react';

export function MobileNavigation({ currentRoute, isMobileMenuOpen, setIsMobileMenuOpen, navigateTo, t, runningJobs, stats }) {
  const bottomItems = [
    { id: 'overview', icon: BarChart2, label: '概览' }, { id: 'applications', icon: Layers, label: '应用' }, { id: 'plans', icon: Clock, label: '计划' },
    { id: 'tasks', icon: Activity, label: '任务', badge: runningJobs.length > 0 }, { id: 'alerts', icon: AlertOctagon, label: '告警', badge: stats.unreadAlerts > 0 }, { id: 'more', icon: Menu, label: '更多' }
  ];
  const drawerItems = [
    { id: 'overview', icon: BarChart2, label: t.menu.overview }, { id: 'applications', icon: Layers, label: t.menu.applications }, { id: 'plans', icon: Clock, label: t.menu.plans },
    { id: 'tasks', icon: Activity, label: t.menu.tasks }, { id: 'backups', icon: FolderTree, label: t.menu.backups }, { id: 'storage', icon: HardDrive, label: t.menu.storage },
    { id: 'alerts', icon: AlertOctagon, label: t.menu.alerts }, { id: 'settings', icon: Settings, label: t.menu.settings }, { id: 'setup', icon: Zap, label: t.menu.setup }
  ];
  return <>
    <div className="xl:hidden fixed bottom-3 left-3 right-3 z-50 bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-xl rounded-2xl p-1.5 flex items-center justify-around">
      {bottomItems.map(item => { const Icon = item.icon; const isActive = currentRoute === item.id; return <button key={item.id} onClick={() => item.id === 'more' ? setIsMobileMenuOpen(true) : navigateTo(item.id)} className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all relative ${isActive ? 'text-emerald-600 font-bold bg-emerald-50/90' : 'text-slate-500 hover:text-slate-900 font-medium'}`}><Icon className="w-4 h-4 mb-0.5" /><span className="text-[10px] leading-tight">{item.label}</span>{item.badge && <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white"></span>}</button>; })}
    </div>
    {isMobileMenuOpen && <div className="xl:hidden fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex"><div className="w-72 bg-white h-full p-4 flex flex-col justify-between shadow-2xl"><div><div className="flex justify-between items-center pb-4 mb-4 border-b border-slate-200"><div className="flex items-center space-x-2"><ShieldCheck className="w-6 h-6 text-emerald-600" /><span className="font-bold text-slate-900 text-sm">{t.appName}</span></div><button onClick={() => setIsMobileMenuOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button></div><nav className="space-y-1">{drawerItems.map(item => { const Icon = item.icon; return <button key={item.id} onClick={() => navigateTo(item.id)} className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold ${currentRoute === item.id ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'}`}><Icon className="w-4 h-4" /><span>{item.label}</span></button>; })}</nav></div></div></div>}
  </>;
}
