import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { AppLanguage } from '../../i18n';

export type Theme = 'light' | 'dark' | 'system';
export type EditorFont =
  | 'jetbrains-mono'
  | 'fira-code'
  | 'ibm-plex-mono'
  | 'courier-new'
  | 'inter'
  | 'dm-sans'
  | 'system-sans'
  | 'lora'
  | 'merriweather'
  | 'georgia';
export type EditorFontSize = 'sm' | 'md' | 'lg';
export type EditorLineHeight = 'compact' | 'comfortable' | 'relaxed';
export type AutoSaveInterval = 3000 | 5000 | 10000 | 30000;

export interface Settings {
  theme: Theme;
  editorFont: EditorFont;
  editorFontSize: EditorFontSize;
  editorLineHeight: EditorLineHeight;
  language: AppLanguage;
  autoSave: boolean;
  autoSaveInterval: AutoSaveInterval;
}

interface SettingsStore extends Settings {
  hydrate: (data: Partial<Settings>) => void;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

const LS_KEY = 'mditoor:settings';
const FILE   = 'settings.json';

const DEFAULTS: Settings = {
  theme: 'light',
  editorFont: 'jetbrains-mono',
  editorFontSize: 'md',
  editorLineHeight: 'comfortable',
  language: 'en',
  autoSave: true,
  autoSaveInterval: 5000,
};

function loadFromLS(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

function persist(settings: Settings) {
  localStorage.setItem(LS_KEY, JSON.stringify(settings));
  invoke('write_app_data', { file: FILE, content: JSON.stringify(settings, null, 2) })
    .catch(() => { /* non-fatal */ });
}

export function applyTheme(theme: Theme) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = theme === 'dark' || (theme === 'system' && prefersDark);
  document.documentElement.classList.toggle('dark', dark);
}

export const useSettings = create<SettingsStore>((set, get) => {
  const initial = loadFromLS();
  return {
    ...initial,

    hydrate: (data) => {
      const merged = { ...get(), ...data };
      localStorage.setItem(LS_KEY, JSON.stringify(merged));
      applyTheme(merged.theme);
      set(merged);
    },

    update: (key, value) => {
      const next = { ...get(), [key]: value } as Settings;
      persist(next);
      if (key === 'theme') applyTheme(value as Theme);
      set({ [key]: value } as Partial<SettingsStore>);
    },
  };
});

export const EDITOR_FONT: Record<EditorFont, string> = {
  'jetbrains-mono': "'JetBrains Mono', monospace",
  'fira-code':      "'Fira Code', monospace",
  'ibm-plex-mono':  "'IBM Plex Mono', monospace",
  'courier-new':    "'Courier New', Courier, monospace",
  'inter':          "'Inter', sans-serif",
  'dm-sans':        "'DM Sans', sans-serif",
  'system-sans':    "system-ui, -apple-system, sans-serif",
  'lora':           "'Lora', serif",
  'merriweather':   "'Merriweather', serif",
  'georgia':        "Georgia, serif",
};

export const EDITOR_FONT_SIZE: Record<EditorFontSize, string> = {
  sm: '13px',
  md: '15px',
  lg: '17px',
};

export const EDITOR_LINE_HEIGHT: Record<EditorLineHeight, string> = {
  compact: '1.5',
  comfortable: '1.75',
  relaxed: '2',
};
