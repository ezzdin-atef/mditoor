import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useRouter } from './router';
import { applyTheme, useSettings, type Settings } from './features/settings/store';
import { useStore, type StoredWorkspace } from './features/workspace/store';
import { WorkspacePage } from './features/workspace/pages/WorkspacePage';
import { EditorPage } from './features/editor/pages/EditorPage';
import { SettingsPage } from './features/settings/pages/SettingsPage';
import { CommandPalette } from './CommandPalette';
import i18n, { isRtlLanguage } from './i18n';
import type { AppLanguage } from './i18n';

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

function useLanguageSync() {
  const { language } = useSettings();
  useEffect(() => {
    i18n.changeLanguage(language);
    const rtl = isRtlLanguage(language as AppLanguage);
    document.documentElement.setAttribute('dir', rtl ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', language);
  }, [language]);
}

function useHydrateFromDisk() {
  const { hydrate: hydrateSettings } = useSettings();
  const { hydrateWorkspaces }        = useStore();

  useEffect(() => {
    Promise.all([
      invoke<string>('read_app_data', { file: 'settings.json' }).catch(() => ''),
      invoke<string>('read_app_data', { file: 'workspaces.json' }).catch(() => ''),
    ]).then(([settingsJson, workspacesJson]) => {
      if (settingsJson) {
        try { hydrateSettings(JSON.parse(settingsJson) as Partial<Settings>); } catch { /* ignore */ }
      }
      if (workspacesJson) {
        try { hydrateWorkspaces(JSON.parse(workspacesJson) as StoredWorkspace[]); } catch { /* ignore */ }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export default function App() {
  useThemeSync();
  useLanguageSync();
  useHydrateFromDisk();
  const { route } = useRouter();
  const [_ready, setReady] = useState(false);

  useEffect(() => { const t = setTimeout(() => setReady(true), 80); return () => clearTimeout(t); }, []);

  return (
    <>
      {route.page === 'editor'   ? <EditorPage />   :
       route.page === 'settings' ? <SettingsPage />  :
       <WorkspacePage />}
      <CommandPalette />
    </>
  );
}
