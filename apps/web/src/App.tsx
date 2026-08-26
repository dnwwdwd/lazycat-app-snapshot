import { AppShell } from './AppShell';
import { useAppController } from './hooks/useAppController';

export default function App() {
  return <AppShell {...useAppController()} />;
}
