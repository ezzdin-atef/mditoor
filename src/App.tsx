import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { useRouter } from './router';
import { applyTheme, ARABIC_FONT_FAMILY, useSettings, type Settings } from './features/settings/store';
import { useStore, type StoredWorkspace } from './features/workspace/store';
import { WorkspacePage } from './features/workspace/pages/WorkspacePage';
import { EditorPage } from './features/editor/pages/EditorPage';
import { SettingsPage } from './features/settings/pages/SettingsPage';
import { CommandPalette } from './CommandPalette';
import { Toaster } from './components/Toast';
import { TitleBar, USE_CUSTOM_TITLEBAR } from './components/TitleBar';
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
  const { language, arabicFont } = useSettings();
  useEffect(() => {
    i18n.changeLanguage(language);
    const rtl = isRtlLanguage(language as AppLanguage);
    document.documentElement.setAttribute('dir', rtl ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', language);
    document.documentElement.style.setProperty('--arabic-font', ARABIC_FONT_FAMILY[arabicFont]);
  }, [language, arabicFont]);
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

// Ctrl/Cmd+, opens settings from anywhere (the palette advertises it).
function useGlobalShortcuts() {
  const { navigate } = useRouter();
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        navigate({ page: 'settings' });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate]);
}

function useWindowTitle(): string {
  const { t } = useTranslation();
  const { route } = useRouter();
  const { workspaces, activeId } = useStore();
  const app = t('app.name');
  if (route.page === 'settings') return `${t('settings.title')} — ${app}`;
  if (route.page === 'editor') {
    const ws = workspaces.find(w => w.id === route.workspaceId);
    return `${route.slug}${ws ? ` · ${ws.name}` : ''} — ${app}`;
  }
  const ws = workspaces.find(w => w.id === activeId);
  return ws ? `${ws.name} — ${app}` : app;
}

export default function App() {
  useThemeSync();
  useLanguageSync();
  useHydrateFromDisk();
  useGlobalShortcuts();
  const { route } = useRouter();
  const title = useWindowTitle();

  useEffect(() => { document.title = title; }, [title]);

  return (
    <div className={`app-frame${USE_CUSTOM_TITLEBAR ? ' has-titlebar' : ''}`}>
      {USE_CUSTOM_TITLEBAR && <TitleBar title={title} tone={route.page === 'editor' ? 'page' : 'app'} />}
      <div className="app-content">
        {route.page === 'editor'   ? <EditorPage key={`${route.workspaceId}:${route.slug}`} /> :
         route.page === 'settings' ? <SettingsPage />  :
         <WorkspacePage />}
      </div>
      <CommandPalette />
      <Toaster />
    </div>
  );
}
