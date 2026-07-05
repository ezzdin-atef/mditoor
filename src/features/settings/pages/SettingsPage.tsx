import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from '../../../router';
import {
  EDITOR_FONT,
  EDITOR_FONT_SIZE,
  EDITOR_LINE_HEIGHT,
  useSettings,
  type AutoSaveInterval,
  type EditorFont,
  type EditorFontSize,
  type EditorLineHeight,
  type Settings,
  type Theme,
} from '../store';
import type { AppLanguage } from '../../../i18n';

type OptionItem<T> = { value: T; label: string };

function snapshotSettings(settings: Settings): Settings {
  return {
    theme: settings.theme,
    editorFont: settings.editorFont,
    editorFontSize: settings.editorFontSize,
    editorLineHeight: settings.editorLineHeight,
    language: settings.language,
    autoSave: settings.autoSave,
    autoSaveInterval: settings.autoSaveInterval,
  };
}

function sameSettings(a: Settings, b: Settings) {
  return a.theme === b.theme &&
    a.editorFont === b.editorFont &&
    a.editorFontSize === b.editorFontSize &&
    a.editorLineHeight === b.editorLineHeight &&
    a.language === b.language &&
    a.autoSave === b.autoSave &&
    a.autoSaveInterval === b.autoSaveInterval;
}

function IconArrowLeft() {
  return (
    <svg className="rtl-mirror" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M9 2.5L5 7 9 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M2.2 6.8 5 9.6l5.8-6.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
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
    settings.autoSave,
    settings.autoSaveInterval,
  ]);

  const [draft, setDraft] = useState<Settings>(() => persisted);
  const [savedFlash, setSavedFlash] = useState(false);
  const isDirty = !sameSettings(draft, persisted);

  useEffect(() => {
    if (!isDirty) setDraft(persisted);
  }, [isDirty, persisted]);

  const setDraftValue = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }));
    setSavedFlash(false);
  };

  const save = () => {
    if (!isDirty) return;
    (Object.keys(draft) as (keyof Settings)[]).forEach(key => {
      if (draft[key] !== persisted[key]) {
        settings.update(key, draft[key]);
      }
    });
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1800);
  };

  const THEMES: OptionItem<Theme>[] = [
    { value: 'light',  label: t('settings.themes.light') },
    { value: 'dark',   label: t('settings.themes.dark') },
    { value: 'system', label: t('settings.themes.system') },
  ];

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

  const INTERVALS: OptionItem<AutoSaveInterval>[] = [
    { value: 3000,  label: t('settings.intervals.3s') },
    { value: 5000,  label: t('settings.intervals.5s') },
    { value: 10000, label: t('settings.intervals.10s') },
    { value: 30000, label: t('settings.intervals.30s') },
  ];

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <header
        className="sticky top-0 z-30 flex items-center gap-3 px-5 border-b flex-shrink-0"
        style={{ minHeight: 56, background: 'var(--bg)', borderColor: 'var(--border)' }}
      >
        <button
          onClick={() => navigate({ page: 'workspace' })}
          className="mac-btn mac-btn-ghost"
          style={{ padding: '5px 8px' }}
        >
          <IconArrowLeft />
          {t('nav.back')}
        </button>
        <div className="w-px h-5 flex-shrink-0" style={{ background: 'var(--border)' }} />
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] font-semibold truncate" style={{ color: 'var(--text)' }}>
            {t('settings.title')}
          </h1>
          <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
            {t('settings.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span
            className="hidden sm:inline-flex items-center gap-1.5 text-xs"
            style={{ color: isDirty ? 'var(--orange)' : savedFlash ? 'var(--green)' : 'var(--text-faint)' }}
          >
            {!isDirty && savedFlash && <IconCheck />}
            {isDirty ? t('settings.unsavedChanges') : savedFlash ? t('settings.saved') : t('settings.upToDate')}
          </span>
          <button
            onClick={save}
            disabled={!isDirty}
            className="mac-btn mac-btn-primary"
          >
            {t('settings.saveChanges')}
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-5 py-7 space-y-5">
          <Section title={t('settings.language')} description={t('settings.languageHint')}>
            <Row label={t('settings.language')}>
              <SettingsSelect
                options={LANGUAGES}
                value={draft.language}
                onChange={v => setDraftValue('language', v)}
              />
            </Row>
          </Section>

          <Section title={t('settings.appearance')} description={t('settings.colorSchemeHint')}>
            <Row label={t('settings.colorScheme')}>
              <SegmentGroup
                options={THEMES}
                value={draft.theme}
                onChange={v => setDraftValue('theme', v)}
              />
            </Row>
          </Section>

          <Section title={t('settings.autoSave')} description={t('settings.autoSaveHint')}>
            <Row label={t('settings.autoSave')}>
              <Toggle
                checked={draft.autoSave}
                onChange={() => setDraftValue('autoSave', !draft.autoSave)}
              />
            </Row>

            {draft.autoSave && (
              <Row label={t('settings.autoSaveInterval')} hint={t('settings.autoSaveIntervalHint')}>
                <SettingsSelect
                  options={INTERVALS}
                  value={draft.autoSaveInterval}
                  onChange={v => setDraftValue('autoSaveInterval', v)}
                />
              </Row>
            )}
          </Section>

          <Section title={t('settings.editor')} description={t('settings.fontFamilyHint')}>
            <Row label={t('settings.fontFamily')}>
              <SettingsSelect
                options={FONTS}
                value={draft.editorFont}
                onChange={v => setDraftValue('editorFont', v)}
              />
            </Row>

            <Row label={t('settings.fontSize')}>
              <SettingsSelect
                options={SIZES}
                value={draft.editorFontSize}
                onChange={v => setDraftValue('editorFontSize', v)}
              />
            </Row>

            <Row label={t('settings.lineHeight')}>
              <SettingsSelect
                options={LINE_HEIGHTS}
                value={draft.editorLineHeight}
                onChange={v => setDraftValue('editorLineHeight', v)}
              />
            </Row>

            <EditorPreview draft={draft} label={t('settings.preview')} />
          </Section>
        </div>
      </main>
    </div>
  );
}

function Section({ title, description, children }: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        border: '1px solid var(--border)',
        borderRadius: 8,
        background: 'var(--bg)',
        overflow: 'hidden',
      }}
    >
      <div className="px-4 py-3" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{title}</h2>
        {description && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{description}</p>
        )}
      </div>
      <div>{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div
      className="px-4 py-3 border-b last:border-b-0 flex items-center justify-between gap-4"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{label}</p>
        {hint && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="mac-toggle"
      aria-pressed={checked}
      style={{ background: checked ? 'var(--accent)' : 'var(--surface-3)' }}
    >
      <div className="mac-toggle-knob" style={{ insetInlineStart: checked ? '16px' : '2px' }} />
    </button>
  );
}

function SettingsSelect<T extends string | number>({ options, value, onChange }: {
  options: OptionItem<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <select
      value={String(value)}
      onChange={e => {
        const found = options.find(o => String(o.value) === e.target.value);
        if (found) onChange(found.value);
      }}
      className="mac-input"
      style={{ width: 'auto', minWidth: 160, cursor: 'pointer' }}
    >
      {options.map(opt => (
        <option key={String(opt.value)} value={String(opt.value)}>
          {opt.label}
        </option>
      ))}
    </select>
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
    <div className="px-4 py-4">
      <p className="text-xs mb-2" style={{ color: 'var(--text-faint)' }}>{label}</p>
      <div
        className="px-4 py-3"
        style={{
          border: '1px solid var(--border)',
          borderRadius: 6,
          background: 'var(--surface)',
          fontFamily: EDITOR_FONT[draft.editorFont],
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
