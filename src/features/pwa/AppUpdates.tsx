import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { AppStatusBar } from '../../components/ui/AppStatusBar';

const HOUR = 60 * 60 * 1000;

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/**
 * Registers the service worker and shows the update and offline strip (D-141). An installed app
 * can stay open in the background for days, so it also looks for a new version when it comes back
 * to the screen, and hourly while it's open. A new version never reloads the page by itself: the
 * player taps Refresh, or it applies the next time the app is opened. Mounted once, in main.tsx.
 */
export function AppUpdates() {
  const online = useOnline();
  const [later, setLater] = useState(false);
  const {
    needRefresh: [updateReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => {
        if (navigator.onLine && document.visibilityState === 'visible') {
          registration.update().catch(() => {}); // offline or a flaky connection: try next time
        }
      };
      document.addEventListener('visibilitychange', check);
      window.setInterval(check, HOUR);
    },
  });

  return (
    <AppStatusBar
      offline={!online}
      updateReady={updateReady && !later}
      onRefresh={() => void updateServiceWorker(true)}
      onLater={() => setLater(true)}
    />
  );
}
