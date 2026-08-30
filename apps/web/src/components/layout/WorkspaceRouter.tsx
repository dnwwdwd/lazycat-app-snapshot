import { AlertsView } from '../../features/alerts/AlertsView';
import { ApplicationsView } from '../../features/applications/ApplicationsView';
import { BackupLibraryView } from '../../features/backups/BackupLibraryView';
import { OverviewView } from '../../features/overview/OverviewView';
import { PlansView } from '../../features/plans/PlansView';
import { SettingsView } from '../../features/settings/SettingsView';
import { StorageView } from '../../features/storage/StorageView';
import { TasksView } from '../../features/tasks/TasksView';

export function WorkspaceRouter({ currentRoute, t, stats, navigateTo, triggerManualBackup, batches, alerts, appsData, renderStatusBadge, setActiveModal, setModalPayload, plans, runningJobs, snapshots, storageStats, setStorageStats, storageColorInfo, setAlerts }) {
  const openModal = (modal, payload) => {
    setActiveModal(modal);
    setModalPayload(payload);
  };
  return (
    <main className="flex-1 h-full overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 pb-20 xl:pb-8">
      {currentRoute === 'overview' && <OverviewView t={t} stats={stats} navigateTo={navigateTo} triggerManualBackup={triggerManualBackup} batches={batches} alerts={alerts} />}
      {currentRoute === 'applications' && <ApplicationsView t={t} appsData={appsData} navigateTo={navigateTo} triggerManualBackup={triggerManualBackup} renderStatusBadge={renderStatusBadge} openModal={openModal} />}
      {currentRoute === 'plans' && <PlansView t={t} plans={plans} navigateTo={navigateTo} openModal={openModal} triggerManualBackup={triggerManualBackup} />}
      {currentRoute === 'tasks' && <TasksView t={t} batches={batches} runningJobs={runningJobs} renderStatusBadge={renderStatusBadge} />}
      {currentRoute === 'backups' && <BackupLibraryView t={t} snapshots={snapshots} renderStatusBadge={renderStatusBadge} openModal={openModal} />}
      {currentRoute === 'storage' && <StorageView t={t} snapshots={snapshots} />}
      {currentRoute === 'alerts' && <AlertsView t={t} alerts={alerts} setAlerts={setAlerts} navigateTo={navigateTo} />}
      {currentRoute === 'settings' && <SettingsView t={t} storageStats={storageStats} setStorageStats={setStorageStats} storageColorInfo={storageColorInfo} />}
    </main>
  );
}
