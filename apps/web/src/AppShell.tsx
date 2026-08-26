import { AppHeader } from './components/layout/AppHeader';
import { AppSidebar } from './components/layout/AppSidebar';
import { GlobalModals } from './components/layout/GlobalModals';
import { MobileNavigation } from './components/layout/MobileNavigation';
import { WorkspaceRouter } from './components/layout/WorkspaceRouter';

export function AppShell(props) {
  return (
    <div className="h-screen bg-slate-50/70 text-slate-800 font-sans flex flex-col overflow-hidden antialiased selection:bg-emerald-500 selection:text-white">
      <AppHeader {...props} />
      <div className="h-[calc(100vh-4rem)] flex overflow-hidden relative">
        <AppSidebar {...props} />
        <MobileNavigation {...props} />
        <WorkspaceRouter {...props} />
      </div>
      <GlobalModals {...props} />
    </div>
  );
}
