import { useEffect } from 'react';
import { useRouter } from './router';
import { applyTheme, useSettings } from './features/settings/store';
import { WorkspacePage } from './features/workspace/pages/WorkspacePage';
import { EditorPage } from './features/editor/pages/EditorPage';
import { SettingsPage } from './features/settings/pages/SettingsPage';

function useThemeSync() {
  const { theme } = useSettings();
  useEffect(() => {
    applyTheme(theme);
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) =>
        document.documentElement.classList.toggle('dark', e.matches);
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [theme]);
}

export default function App() {
  useThemeSync();
  const { route } = useRouter();

  if (route.page === 'editor')   return <EditorPage />;
  if (route.page === 'settings') return <SettingsPage />;
  return <WorkspacePage />;
}
