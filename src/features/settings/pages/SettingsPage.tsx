import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from '../../../router';
import {
  ARABIC_FONT_FAMILY,
  editorFontFamily,
  EDITOR_FONT_SIZE,
  EDITOR_LINE_HEIGHT,
  useSettings,
  type AutoSaveInterval,
  type ArabicFont,
  type EditorFont,
  type EditorFontSize,
  type EditorLineHeight,
  type Settings,
  type Theme,
} from '../store';
import type { AppLanguage } from '../../../i18n';
import { IconArrowLeft, IconCheck } from '../../../components/Icons';
import { toast } from '../../../components/Toast';
import { CustomSelect } from '../../../components/CustomSelect';
import { ConfigFilesSection } from '../components/ConfigFilesSection';

type OptionItem<T> = { value: T; label: string };

function snapshotSettings(settings: Settings): Settings {
  return {
    theme: settings.theme,
    editorFont: settings.editorFont,
    editorFontSize: settings.editorFontSize,
    editorLineHeight: settings.editorLineHeight,
    language: settings.language,
    arabicFont: settings.arabicFont,
    autoSave: settings.autoSave,
    autoSaveInterval: settings.autoSaveInterval,
  };
}

function sameSettings(a: Settings, b: Settings) {
  return (Object.keys(a) as (keyof Settings)[]).every(k => a[k] === b[k]);
}

export function SettingsPage() {
  const { navigate } = useRouter();
  const settings = useSettings();
  const { t } = useTranslation();

  const persisted = useMemo(() => snapshotSettings(settings), [
    settings.theme,
    settings.editorFont,
    settings.editorFontSize,
    settings.editorLineHeight,
    settings.language,
    settings.arabicFont,
    settings.autoSave,
    settings.autoSaveInterval,
  ]);

  const [draft, setDraft] = useState<Settings>(() => persisted);
  const isDirty = !sameSettings(draft, persisted);

  useEffect(() => {
    if (!isDirty) setDraft(persisted);
  }, [isDirty, persisted]);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }));
  };

  const save = () => {
    if (!isDirty) return;
    (Object.keys(draft) as (keyof Settings)[]).forEach(key => {
      if (draft[key] !== persisted[key]) settings.update(key, draft[key]);
    });
    toast.success(t('settings.saved'));
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
      if (e.key === 'Escape' && !isDirty) navigate({ page: 'workspace' });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const FONTS: OptionItem<EditorFont>[] = [
    { value: 'jetbrains-mono', label: 'JetBrains Mono' },
    { value: 'fira-code',      label: 'Fira Code' },
    { value: 'ibm-plex-mono',  label: 'IBM Plex Mono' },
    { value: 'courier-new',    label: 'Courier New' },
    { value: 'inter',          label: 'Inter' },
    { value: 'dm-sans',        label: 'DM Sans' },
    { value: 'system-sans',    label: 'System UI' },
    { value: 'lora',           label: 'Lora' },
    { value: 'merriweather',   label: 'Merriweather' },
    { value: 'georgia',        label: 'Georgia' },
  ];

  const SIZES: OptionItem<EditorFontSize>[] = [
    { value: 'sm', label: t('settings.sizes.sm') },
    { value: 'md', label: t('settings.sizes.md') },
    { value: 'lg', label: t('settings.sizes.lg') },
  ];

  const LINE_HEIGHTS: OptionItem<EditorLineHeight>[] = [
    { value: 'compact',     label: t('settings.lineHeights.compact') },
    { value: 'comfortable', label: t('settings.lineHeights.comfortable') },
    { value: 'relaxed',     label: t('settings.lineHeights.relaxed') },
  ];

  const LANGUAGES: OptionItem<AppLanguage>[] = [
    { value: 'en', label: t('settings.languages.en') },
    { value: 'ar', label: t('settings.languages.ar') },
    { value: 'fr', label: t('settings.languages.fr') },
  ];

  const ARABIC_FONTS: OptionItem<ArabicFont>[] = [
    { value: 'noto-sans-arabic', label: 'Noto Sans Arabic' },
    { value: 'cairo', label: 'Cairo' },
    { value: 'readex-pro', label: 'Readex Pro' },
  ];

  const INTERVALS: OptionItem<AutoSaveInterval>[] = [
    { value: 3000,  label: t('settings.intervals.3s') },
    { value: 5000,  label: t('settings.intervals.5s') },
    { value: 10000, label: t('settings.intervals.10s') },
    { value: 30000, label: t('settings.intervals.30s') },
  ];

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--app-bg)', color: 'var(--text)' }}>
      <header
        className="sticky top-0 z-30 flex items-center gap-3 px-5 flex-shrink-0"
        style={{ minHeight: 60, background: 'var(--app-bg)', borderBottom: '1px solid var(--border)' }}
      >
        <button onClick={() => navigate({ page: 'workspace' })} className="mac-btn mac-btn-ghost">
          <IconArrowLeft size={15} mirror />
          {t('nav.back')}
        </button>

        <h1 className="text-[15px] font-bold flex-1 min-w-0 truncate">{t('settings.title')}</h1>

        <div className="flex items-center gap-3 flex-shrink-0">
          {isDirty && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[12px] mac-fade-in" style={{ color: 'var(--orange)' }}>
              <span className="editor-dirty-dot" />{t('settings.unsavedChanges')}
            </span>
          )}
          {isDirty && (
            <button onClick={() => setDraft(persisted)} className="mac-btn mac-btn-ghost">{t('common.cancel')}</button>
          )}
          <button onClick={save} disabled={!isDirty} className="mac-btn mac-btn-primary">
            <IconCheck size={14} />{t('settings.saveChanges')}
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-5 py-10 space-y-6">
          <div>
            <h2 className="text-[26px] font-extrabold" style={{ letterSpacing: '-0.03em' }}>{t('settings.title')}</h2>
            <p className="text-[13.5px] mt-1" style={{ color: 'var(--text-muted)' }}>{t('settings.subtitle')}</p>
          </div>

          <Section title={t('settings.appearance')}>
            <div className="px-[18px] pt-4 pb-2">
              <p className="text-[13.5px] font-medium mb-3">{t('settings.colorScheme')}</p>
              <div className="grid grid-cols-3 gap-3">
                {(['light', 'dark', 'system'] as Theme[]).map(theme => (
                  <ThemeCard key={theme} theme={theme} label={t(`settings.themes.${theme}`)} selected={draft.theme === theme} onSelect={() => set('theme', theme)} />
                ))}
              </div>
            </div>
            <Row label={t('settings.language')} hint={t('settings.languageHint')}>
              <SettingsSelect options={LANGUAGES} value={draft.language} onChange={v => set('language', v)} />
            </Row>
            {draft.language === 'ar' && (
              <Row label={t('settings.arabicFont')} hint={t('settings.arabicFontHint')}>
                <div className="flex items-center gap-3 flex-wrap">
                  <SettingsSelect options={ARABIC_FONTS} value={draft.arabicFont} onChange={v => set('arabicFont', v)} />
                  <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC_FONT_FAMILY[draft.arabicFont], fontSize: 17 }}>
                    العربية بخط جميل
                  </span>
                </div>
              </Row>
            )}
          </Section>

          <Section title={t('settings.editor')}>
            <Row label={t('settings.fontFamily')} hint={t('settings.fontFamilyHint')}>
              <SettingsSelect options={FONTS} value={draft.editorFont} onChange={v => set('editorFont', v)} />
            </Row>
            <Row label={t('settings.fontSize')}>
              <SegmentGroup options={SIZES} value={draft.editorFontSize} onChange={v => set('editorFontSize', v)} />
            </Row>
            <Row label={t('settings.lineHeight')}>
              <SegmentGroup options={LINE_HEIGHTS} value={draft.editorLineHeight} onChange={v => set('editorLineHeight', v)} />
            </Row>
            <Row label={t('settings.autoSave')} hint={t('settings.autoSaveHint')}>
              <div className="flex items-center gap-3">
                {draft.autoSave && (
                  <SettingsSelect options={INTERVALS} value={draft.autoSaveInterval} onChange={v => set('autoSaveInterval', v)} />
                )}
                <Toggle checked={draft.autoSave} onChange={() => set('autoSave', !draft.autoSave)} label={t('settings.autoSave')} />
              </div>
            </Row>
            <EditorPreview draft={draft} label={t('settings.preview')} />
          </Section>

          <ConfigFilesSection />
        </div>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-header" style={{ padding: '12px 18px' }}>
        <h2 className="text-[12px] font-bold uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>{title}</h2>
      </div>
      <div>{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="settings-row">
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium">{label}</p>
        {hint && <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-faint)' }}>{hint}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function ThemeCard({ theme, label, selected, onSelect }: { theme: Theme; label: string; selected: boolean; onSelect: () => void }) {
  const pane = (dark: boolean) => (
    <div className="flex-1 h-full p-2 flex gap-1.5" style={{ background: dark ? '#10181d' : '#ffffff' }}>
      <div className="w-4 rounded" style={{ background: dark ? '#1c2a31' : '#edf1f3' }} />
      <div className="flex-1 space-y-1.5 pt-1">
        <div className="h-1.5 rounded-full w-3/4" style={{ background: '#0d8f86' }} />
        <div className="h-1.5 rounded-full w-full" style={{ background: dark ? '#28383f' : '#dce4e8' }} />
        <div className="h-1.5 rounded-full w-2/3" style={{ background: dark ? '#28383f' : '#dce4e8' }} />
      </div>
    </div>
  );
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="text-start"
      style={{
        padding: 6,
        borderRadius: 14,
        border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
        background: selected ? 'var(--accent-faint)' : 'var(--bg)',
        boxShadow: selected ? 'var(--ring)' : 'none',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
    >
      <div className="flex overflow-hidden" style={{ height: 64, borderRadius: 9, border: '1px solid var(--border)' }}>
        {theme === 'system' ? <>{pane(false)}{pane(true)}</> : pane(theme === 'dark')}
      </div>
      <div className="flex items-center gap-1.5 px-1 pt-2 pb-0.5 text-[12.5px] font-semibold" style={{ color: selected ? 'var(--accent)' : 'var(--text)' }}>
        {selected && <IconCheck size={13} />}{label}
      </div>
    </button>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className="mac-toggle"
      style={{ background: checked ? 'var(--accent)' : 'var(--surface-3)' }}
    >
      <div className="mac-toggle-knob" style={{ insetInlineStart: checked ? '18px' : '2px' }} />
    </button>
  );
}

function SettingsSelect<T extends string | number>({ options, value, onChange }: {
  options: OptionItem<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <CustomSelect<T>
      value={value}
      options={options}
      onChange={v => { if (v !== '') onChange(v); }}
      width={190}
    />
  );
}

function SegmentGroup<T extends string | number>({ options, value, onChange }: {
  options: OptionItem<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="mac-segmented">
      {options.map(opt => (
        <button
          key={String(opt.value)}
          onClick={() => onChange(opt.value)}
          className={`mac-segment${value === opt.value ? ' active' : ''}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function EditorPreview({ draft, label }: { draft: Settings; label: string }) {
  return (
    <div className="px-[18px] py-4">
      <p className="text-[11px] font-bold uppercase mb-2" style={{ color: 'var(--text-faint)', letterSpacing: '0.06em' }}>{label}</p>
      <div
        className="px-5 py-4"
        style={{
          border: '1px solid var(--border)',
          borderRadius: 12,
          background: 'var(--surface)',
          fontFamily: editorFontFamily(draft.editorFont, draft.arabicFont),
          fontSize: EDITOR_FONT_SIZE[draft.editorFontSize],
          lineHeight: EDITOR_LINE_HEIGHT[draft.editorLineHeight],
          color: 'var(--text)',
        }}
      >
        The quick brown fox jumps over the lazy dog.{' '}
        <span style={{ color: 'var(--accent)' }}>اكتب ما تشاء.</span>
      </div>
    </div>
  );
}
