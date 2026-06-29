import { create } from 'zustand';

export type Theme = 'light' | 'dark' | 'system';
export type EditorFont = 'mono' | 'sans';
export type EditorFontSize = 'sm' | 'md' | 'lg';
export type EditorLineHeight = 'compact' | 'comfortable' | 'relaxed';

export interface Settings {
  theme: Theme;
  editorFont: EditorFont;
  editorFontSize: EditorFontSize;
  editorLineHeight: EditorLineHeight;
}

interface SettingsStore extends Settings {
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

const KEY = 'mditoor:settings';

const DEFAULTS: Settings = {
  theme: 'system',
  editorFont: 'mono',
  editorFontSize: 'md',
  editorLineHeight: 'comfortable',
};

function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

export function applyTheme(theme: Theme) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = theme === 'dark' || (theme === 'system' && prefersDark);
  document.documentElement.classList.toggle('dark', dark);
}

export const useSettings = create<SettingsStore>((set, get) => {
  const initial = loadSettings();
  return {
    ...initial,
    update: (key, value) => {
      const next = { ...get(), [key]: value };
      localStorage.setItem(KEY, JSON.stringify(next));
      if (key === 'theme') applyTheme(value as Theme);
      set({ [key]: value } as Partial<SettingsStore>);
    },
  };
});

export const EDITOR_FONT: Record<EditorFont, string> = {
  mono: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace",
  sans: "system-ui, -apple-system, sans-serif",
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
