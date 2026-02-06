import { onMount, Suspense } from 'solid-js';
import BlueprintDashboard from './themes/blueprint/BlueprintDashboard';
import SettingsPanel from './components/SettingsPanel';
import AlertBanner from './components/AlertBanner';
import { useSSE } from './hooks/useSSE';
import { serverStore } from './stores/servers';
import { settingsStore } from './stores/settings';
import { alertStore } from './stores/alerts';

export default function App() {
  onMount(() => {
    serverStore.fetchServers();
    settingsStore.fetchSettings();
    alertStore.fetchAlerts();
  });

  useSSE((event, data) => {
    serverStore.handleSSE(event, data);
    alertStore.handleSSE(event, data);
  });

  let refreshInterval: ReturnType<typeof setInterval>;
  onMount(() => {
    refreshInterval = setInterval(() => {
      serverStore.fetchServers();
    }, 15000);
  });

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <AlertBanner />
      <Suspense fallback={
        <div style={{
          height: '100%',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          background: '#080c18',
          color: '#5a6880',
          'font-size': '14px',
        }}>
          Loading...
        </div>
      }>
        <BlueprintDashboard />
      </Suspense>
      <SettingsPanel />
    </div>
  );
}
