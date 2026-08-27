import { AlertOctagon, Menu, RefreshCw, Zap } from 'lucide-react';

export function AppHeader({ isMobileMenuOpen, setIsMobileMenuOpen, navigateTo, t, runningJobs, stats }) {
  return (
    <header className="h-16 bg-white border-b border-slate-200/80 sticky top-0 z-40 backdrop-blur-md flex items-center justify-between px-4 sm:px-6 shadow-xs shrink-0">
      <div className="flex items-center space-x-3">
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="xl:hidden p-2 rounded-xl text-slate-500 hover:bg-slate-100 focus:outline-none transition">
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center space-x-3 cursor-pointer group" onClick={() => navigateTo('overview')}>
          <div className="w-9 h-9 rounded-xl overflow-hidden shadow-xs group-hover:scale-105 transition-transform">
            <img src="/lazycat-backup-icon.png" alt="" className="h-full w-full object-cover" />
          </div>
          <div>
            <div className="font-bold text-slate-900 text-sm tracking-tight flex items-center gap-2">
              {t.appName}
              <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">POC</span>
            </div>
            <p className="text-[11px] text-slate-500 hidden sm:block">应用数据探测与手动快照验证</p>
          </div>
        </div>
      </div>
      <div className="flex items-center space-x-3">
        {runningJobs.length > 0 && (
          <div onClick={() => navigateTo('tasks')} className="cursor-pointer bg-emerald-50 border border-emerald-200/80 rounded-full px-3 py-1 flex items-center space-x-2 text-xs text-emerald-800 hover:bg-emerald-100/80 transition-all shadow-xs">
            <RefreshCw className="w-3.5 h-3.5 text-emerald-600 animate-spin" />
            <span className="font-semibold">{runningJobs.length} 个任务运行中</span>
            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-ping"></span>
          </div>
        )}
        <button onClick={() => navigateTo('setup')} className="hidden lg:flex items-center space-x-1.5 text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-900 px-3 py-1.5 rounded-xl border border-emerald-200/80 transition">
          <Zap className="w-3.5 h-3.5 text-emerald-600" />
          <span>{t.menu.setup}</span>
        </button>
        <button onClick={() => navigateTo('alerts')} className="relative p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition focus:outline-none" title="告警事件中心">
          <AlertOctagon className="w-5 h-5" />
          {stats.unreadAlerts > 0 && <span className="absolute top-1 right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-xs">{stats.unreadAlerts}</span>}
        </button>
        <div className="flex items-center space-x-2 border-l border-slate-200 pl-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-700 flex items-center justify-center text-xs font-bold shadow-xs">AD</div>
          <span className="text-xs font-semibold text-slate-700 hidden md:inline">微服管理员</span>
        </div>
      </div>
    </header>
  );
}
