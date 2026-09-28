import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CustomSelect } from '../../../components/CustomSelect';
import { DatePicker } from '../../../components/DatePicker';
import {
  IconAlert, IconCheck, IconChevronLeft, IconChevronRight, IconImage, IconLayers, IconSearch, IconUpload, IconX,
} from '../../../components/Icons';
import { fieldTypeMap } from '../../workspace/store';
import { useViewPrefs } from '../../settings/viewPrefs';
import type { MetadataField } from '../../workspace/types';
import type { MetaValues } from '../utils/frontmatter';
import { ResolvedImg, useEditorImages } from './EditorImages';

interface Props {
  fields: MetadataField[];
  values: MetaValues;
  onChange: (key: string, value: MetaValues[string]) => void;
  body?: string;
  slug?: string;
  onUploadImage?: () => Promise<string | null>;
}

export const SIDEBAR_MIN = 240;
export const SIDEBAR_MAX = 560;
const SIDEBAR_DEFAULT = 300;

const FIELD_COLORS: Record<string, string> = {
  text:    'var(--accent)',
  number:  'var(--indigo)',
  boolean: 'var(--green)',
  date:    'var(--orange)',
  select:  'var(--purple)',
  tags:    'var(--pink)',
  image:   'var(--yellow)',
};

function isFilled(v: MetaValues[string] | undefined) {
  if (v === undefined || v === null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'boolean') return true;
  return String(v).trim() !== '';
}

/* ─── Shell: resizable, collapsible ──────────────────────────────────── */

export function MetadataSidebar({ fields, values, onChange, body = '', slug = '', onUploadImage }: Props) {
  const { t } = useTranslation();
  const { sidebarWidth, sidebarCollapsed, sidebarTab, set } = useViewPrefs();
  const [width, setWidth] = useState(sidebarWidth || SIDEBAR_DEFAULT);
  const [dragging, setDragging] = useState(false);
  const asideRef = useRef<HTMLElement>(null);

  const seo = useMemo(() => analyzeSeo(values, body, slug), [values, body, slug]);
  const filled = fields.filter(f => isFilled(values[f.name])).length;
  const missingRequired = fields.filter(f => f.required && !isFilled(values[f.name])).length;

  // Drag the inline-end edge. Width is applied to the element directly while
  // dragging (no React re-render per mousemove) and committed on release.
  const startResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const el = asideRef.current;
    if (!el) return;
    const rtl = document.documentElement.dir === 'rtl';
    const startX = e.clientX;
    const startW = el.getBoundingClientRect().width;
    let next = startW;
    setDragging(true);
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) * (rtl ? -1 : 1);
      next = Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startW + dx)));
      el.style.width = `${next}px`;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDragging(false);
      setWidth(next);
      set('sidebarWidth', next);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [set]);

  const nudge = (delta: number) => {
    const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, width + delta));
    setWidth(next);
    set('sidebarWidth', next);
  };

  if (sidebarCollapsed) {
    return (
      <aside className="meta-rail">
        <button className="icon-btn" onClick={() => set('sidebarCollapsed', false)} title={t('meta.expand')} aria-label={t('meta.expand')}>
          <IconChevronRight size={16} mirror />
        </button>
        <button className="meta-rail-item" onClick={() => { set('sidebarTab', 'meta'); set('sidebarCollapsed', false); }} title={t('metadata.meta')}>
          <IconLayers size={16} />
          {missingRequired > 0 && <span className="meta-rail-dot" />}
        </button>
        <button className="meta-rail-item" onClick={() => { set('sidebarTab', 'seo'); set('sidebarCollapsed', false); }} title={t('metadata.seo')}>
          <span className="meta-rail-score" style={{ color: scoreColor(seo.score) }}>{seo.score}</span>
        </button>
      </aside>
    );
  }

  return (
    <aside ref={asideRef} className={`meta-sidebar${dragging ? ' resizing' : ''}`} style={{ width }}>
      <div className="meta-header">
        <div className="mac-segmented flex-1" role="tablist">
          <button
            role="tab"
            aria-selected={sidebarTab === 'meta'}
            className={`mac-segment flex-1${sidebarTab === 'meta' ? ' active' : ''}`}
            onClick={() => set('sidebarTab', 'meta')}
          >
            <IconLayers size={13} />{t('metadata.meta')}
            {fields.length > 0 && (
              <span className={`tab-count${missingRequired ? ' attention' : ''}`}>{filled}/{fields.length}</span>
            )}
          </button>
          <button
            role="tab"
            aria-selected={sidebarTab === 'seo'}
            className={`mac-segment flex-1${sidebarTab === 'seo' ? ' active' : ''}`}
            onClick={() => set('sidebarTab', 'seo')}
          >
            <IconSearch size={13} />{t('metadata.seo')}
            <span className="tab-count" style={{ color: scoreColor(seo.score) }}>{seo.score}</span>
          </button>
        </div>
        <button className="icon-btn icon-btn-sm" onClick={() => set('sidebarCollapsed', true)} title={t('meta.collapse')} aria-label={t('meta.collapse')}>
          <IconChevronLeft size={14} mirror />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sidebarTab === 'seo' ? (
          <SeoPanel seo={seo} />
        ) : fields.length === 0 ? (
          <div className="empty-state" style={{ padding: '40px 20px' }}>
            <div className="empty-illustration" style={{ width: 56, height: 56, fontSize: 24, borderRadius: 18 }}>🧩</div>
            <p className="empty-state-title" style={{ fontSize: 14 }}>{t('metadata.noMetaFields')}</p>
            <p className="empty-state-hint" style={{ marginBottom: 0 }}>{t('metadata.noMetaHint')}</p>
          </div>
        ) : (
          <div className="p-3 space-y-2.5">
            <div className="meta-progress" aria-label={t('meta.filled', { filled, total: fields.length })}>
              <div className="flex items-center justify-between text-[11.5px] mb-1.5">
                <span style={{ color: 'var(--text-muted)' }}>{t('meta.filled', { filled, total: fields.length })}</span>
                {missingRequired > 0 && (
                  <span className="inline-flex items-center gap-1" style={{ color: 'var(--orange)' }}>
                    <IconAlert size={12} />{t('meta.missingRequired', { n: missingRequired })}
                  </span>
                )}
              </div>
              <div className="meter"><span style={{ transform: `scaleX(${filled / fields.length})` }} /></div>
            </div>
            {fields.map(field => (
              <FieldCard
                key={field.id}
                field={field}
                value={values[field.name]}
                onChange={v => onChange(field.name, v)}
                onUploadImage={onUploadImage}
              />
            ))}
          </div>
        )}
      </div>

      <div
        className="meta-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label={t('meta.resize')}
        aria-valuemin={SIDEBAR_MIN}
        aria-valuemax={SIDEBAR_MAX}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={startResize}
        onDoubleClick={() => { setWidth(SIDEBAR_DEFAULT); set('sidebarWidth', SIDEBAR_DEFAULT); }}
        onKeyDown={e => {
          const rtl = document.documentElement.dir === 'rtl';
          if (e.key === 'ArrowRight') { e.preventDefault(); nudge(rtl ? -16 : 16); }
          if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(rtl ? 16 : -16); }
        }}
        title={t('meta.resizeHint')}
      />
    </aside>
  );
}

/* ─── SEO analysis ───────────────────────────────────────────────────── */

interface SeoCheck { id: string; ok: boolean; label: string; detail?: string }
interface SeoResult {
  score: number;
  title: string;
  description: string;
  slug: string;
  words: number;
  readTime: number;
  h1: number; h2: number; h3: number;
  images: number; missingAlt: number; links: number;
  checks: SeoCheck[];
}

function stripMd(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[(.+?)\]\(.*?\)/g, '$1')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/^>\s*/gm, '')
    .replace(/---+/g, '');
}

function firstText(values: MetaValues, keys: string[]) {
  for (const k of keys) {
    const v = values[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function analyzeSeo(values: MetaValues, body: string, slug: string): Omit<SeoResult, 'checks'> & { checks: Omit<SeoCheck, 'label' | 'detail'>[]; raw: Record<string, number> } {
  const clean = stripMd(body).trim();
  const words = clean ? clean.split(/\s+/).length : 0;
  const title = firstText(values, ['seoTitle', 'metaTitle', 'title']);
  const description = firstText(values, ['metaDescription', 'description', 'excerpt', 'summary']);
  const h1 = (body.match(/^#\s/gm) ?? []).length;
  const h2 = (body.match(/^##\s/gm) ?? []).length;
  const h3 = (body.match(/^###\s/gm) ?? []).length;
  const images = (body.match(/!\[/g) ?? []).length + (body.match(/<img\s/g) ?? []).length;
  const missingAlt = (body.match(/!\[\s*\]/g) ?? []).length;
  const links = (body.match(/(?<!!)\[[^\]]+\]\([^)]+\)/g) ?? []).length;
  const slugOk = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);

  const checks = [
    { id: 'title', ok: title.length >= 30 && title.length <= 60 },
    { id: 'description', ok: description.length >= 120 && description.length <= 160 },
    { id: 'slug', ok: slugOk && slug.length <= 75 },
    { id: 'h1', ok: h1 <= 1 && (h1 === 1 || title.length > 0) },
    { id: 'structure', ok: h2 > 0 || words < 300 },
    { id: 'length', ok: words >= 300 },
    { id: 'alt', ok: missingAlt === 0 },
    { id: 'links', ok: links > 0 },
  ];
  const score = Math.round((checks.filter(c => c.ok).length / checks.length) * 100);

  return {
    score, title, description, slug, words, readTime: Math.max(1, Math.round(words / 200)),
    h1, h2, h3, images, missingAlt, links, checks,
    raw: { title: title.length, description: description.length, words, h1, missingAlt, links },
  };
}

function scoreColor(score: number) {
  return score >= 80 ? 'var(--green)' : score >= 50 ? 'var(--orange)' : 'var(--red)';
}

function SeoPanel({ seo }: { seo: ReturnType<typeof analyzeSeo> }) {
  const { t } = useTranslation();
  const color = scoreColor(seo.score);
  const circumference = 2 * Math.PI * 22;

  const checkText = (id: string, ok: boolean) => {
    switch (id) {
      case 'title':       return { label: t('meta.checks.title'), detail: t('meta.chars', { n: seo.raw.title, range: '30–60' }) };
      case 'description': return { label: t('meta.checks.description'), detail: t('meta.chars', { n: seo.raw.description, range: '120–160' }) };
      case 'slug':        return { label: t('meta.checks.slug'), detail: ok ? undefined : t('meta.checks.slugHint') };
      case 'h1':          return { label: t('meta.checks.h1'), detail: t('meta.count', { n: seo.raw.h1 }) };
      case 'structure':   return { label: t('meta.checks.structure'), detail: ok ? undefined : t('meta.checks.structureHint') };
      case 'length':      return { label: t('meta.checks.length'), detail: t('meta.wordsCount', { n: seo.raw.words }) };
      case 'alt':         return { label: t('meta.checks.alt'), detail: ok ? undefined : t('meta.count', { n: seo.raw.missingAlt }) };
      default:            return { label: t('meta.checks.links'), detail: t('meta.count', { n: seo.raw.links }) };
    }
  };

  return (
    <div className="p-3 space-y-3">
      {/* Score */}
      <div className="meta-card flex items-center gap-3">
        <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
          <circle cx="28" cy="28" r="22" fill="none" stroke="var(--surface-2)" strokeWidth="6" />
          <circle
            cx="28" cy="28" r="22" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={circumference * (1 - seo.score / 100)}
            transform="rotate(-90 28 28)" style={{ transition: 'stroke-dashoffset 0.4s ease' }}
          />
          <text x="28" y="32" textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--text)">{seo.score}</text>
        </svg>
        <div className="min-w-0">
          <p className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>
            {seo.score >= 80 ? t('meta.scoreGreat') : seo.score >= 50 ? t('meta.scoreOk') : t('meta.scoreLow')}
          </p>
          <p className="text-[11.5px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {t('meta.passed', { n: seo.checks.filter(c => c.ok).length, total: seo.checks.length })}
          </p>
        </div>
      </div>

      {/* Search preview */}
      <div>
        <p className="meta-section-label">{t('meta.searchPreview')}</p>
        <div className="meta-card serp">
          <p className="serp-url dir-ltr">example.com › {seo.slug || '…'}</p>
          <p className="serp-title" dir="auto">{seo.title || <span style={{ color: 'var(--text-faint)' }}>{t('meta.noTitle')}</span>}</p>
          <p className="serp-desc" dir="auto">
            {seo.description
              ? (seo.description.length > 160 ? `${seo.description.slice(0, 157)}…` : seo.description)
              : <span style={{ color: 'var(--text-faint)' }}>{t('meta.noDescription')}</span>}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: t('seo.words'), value: seo.words.toLocaleString() },
          { label: t('seo.readTime'), value: `${seo.readTime} ${t('seo.min')}` },
          { label: t('seo.images'), value: String(seo.images) },
          { label: 'H1', value: String(seo.h1) },
          { label: 'H2', value: String(seo.h2) },
          { label: 'H3', value: String(seo.h3) },
        ].map(s => (
          <div key={s.label} className="meta-stat">
            <span className="meta-stat-value">{s.value}</span>
            <span className="meta-stat-label">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Checklist */}
      <div>
        <p className="meta-section-label">{t('meta.checklist')}</p>
        <div className="meta-card" style={{ padding: 4 }}>
          {seo.checks.map(c => {
            const { label, detail } = checkText(c.id, c.ok);
            return (
              <div key={c.id} className="seo-check">
                <span className={`seo-check-icon ${c.ok ? 'ok' : 'warn'}`}>
                  {c.ok ? <IconCheck size={11} /> : <IconAlert size={11} />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[12.5px]" style={{ color: 'var(--text)' }}>{label}</span>
                  {detail && <span className="block text-[11px]" style={{ color: 'var(--text-faint)' }}>{detail}</span>}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Field cards ────────────────────────────────────────────────────── */

function AutoTextarea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      dir="auto"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="mac-input meta-input"
      style={{ resize: 'none', overflowY: 'hidden', minHeight: 34 }}
    />
  );
}

function FieldCard({ field, value, onChange, onUploadImage }: {
  field: MetadataField;
  value: MetaValues[string] | undefined;
  onChange: (v: MetaValues[string]) => void;
  onUploadImage?: () => Promise<string | null>;
}) {
  const { t } = useTranslation();
  const info = fieldTypeMap[field.type];
  const color = FIELD_COLORS[field.type] ?? 'var(--accent)';
  const missing = field.required && !isFilled(value);

  const header = (
    <div className="flex items-center gap-2 mb-2">
      <span className="meta-type" style={{ color, background: `color-mix(in srgb, ${color} 13%, transparent)` }} title={info.label}>
        {info.emoji}
      </span>
      <span className="text-[12.5px] font-semibold truncate flex-1" style={{ color: 'var(--text)' }}>{field.name}</span>
      {field.required && (
        <span className={`badge ${missing ? 'badge-orange' : ''}`} style={{ height: 18, fontSize: 10 }}>
          {t('metadata.requiredLabel')}
        </span>
      )}
    </div>
  );

  let input: React.ReactNode;
  switch (field.type) {
    case 'boolean': {
      const checked = value === true || value === 'true';
      input = (
        <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex items-center gap-2.5">
          <span className="mac-toggle" style={{ background: checked ? 'var(--accent)' : 'var(--surface-3)' }}>
            <span className="mac-toggle-knob" style={{ insetInlineStart: checked ? '18px' : '2px' }} />
          </span>
          <span className="text-[12.5px]" style={{ color: checked ? 'var(--text)' : 'var(--text-muted)' }}>
            {checked ? t('meta.yes') : t('meta.no')}
          </span>
        </button>
      );
      break;
    }
    case 'select':
      input = (
        <CustomSelect
          value={String(value ?? '')}
          options={(field.options ?? []).map(o => ({ value: o, label: o }))}
          onChange={v => onChange(v)}
          showClear
          size="sm"
          width="100%"
        />
      );
      break;
    case 'tags':
      input = <TagsInput value={value} onChange={onChange} />;
      break;
    case 'date':
      input = (
        <DatePicker value={String(value ?? '')} onChange={v => onChange(v)} showClear size="sm" width="100%" ariaLabel={field.name} />
      );
      break;
    case 'number':
      input = (
        <input
          type="number"
          value={value === '' || value === undefined ? '' : String(value)}
          onChange={e => onChange(Number.isNaN(e.target.valueAsNumber) ? '' : e.target.valueAsNumber)}
          className="mac-input meta-input"
        />
      );
      break;
    case 'image':
      input = <ImageInput value={value} onChange={onChange} onUploadImage={onUploadImage} />;
      break;
    default:
      input = <AutoTextarea value={String(value ?? '')} onChange={v => onChange(v)} placeholder={t('meta.placeholder', { name: field.name })} />;
  }

  return (
    <div className={`meta-field${missing ? ' missing' : ''}`}>
      {header}
      {input}
    </div>
  );
}

function TagsInput({ value, onChange }: { value: MetaValues[string] | undefined; onChange: (v: MetaValues[string]) => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const tags = Array.isArray(value) ? (value as string[]) : [];

  const add = () => {
    const parts = draft.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) return;
    onChange([...tags, ...parts.filter(p => !tags.includes(p))]);
    setDraft('');
  };

  return (
    <div className="tags-box">
      {tags.map(tag => (
        <span key={tag} className="tag-pill">
          {tag}
          <button type="button" className="tag-pill-close" aria-label={`${t('common.remove')} ${tag}`} onClick={() => onChange(tags.filter(x => x !== tag))}>
            <IconX size={10} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
          if (e.key === 'Backspace' && draft === '' && tags.length > 0) onChange(tags.slice(0, -1));
        }}
        onBlur={add}
        placeholder={tags.length ? '' : t('metadata.tagPlaceholder')}
        className="tags-box-input"
        dir="auto"
      />
    </div>
  );
}

function ImageInput({ value, onChange, onUploadImage }: {
  value: MetaValues[string] | undefined;
  onChange: (v: MetaValues[string]) => void;
  onUploadImage?: () => Promise<string | null>;
}) {
  const { t } = useTranslation();
  const images = useEditorImages();
  const url = String(value ?? '');
  const [busy, setBusy] = useState(false);

  const upload = async () => {
    if (!onUploadImage || busy) return;
    setBusy(true);
    try {
      const next = await onUploadImage();
      if (next) onChange(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {url ? (
        <button
          type="button"
          className="meta-image meta-image-open"
          onClick={() => images?.openViewer({ src: url, onReplaceSrc: onChange })}
          title={t('viewer.open')}
          aria-label={t('viewer.open')}
        >
          <ResolvedImg src={url} />
        </button>
      ) : (
        <div className="meta-image">
          <span className="flex flex-col items-center gap-1 text-[11px]" style={{ color: 'var(--text-faint)' }}>
            <IconImage size={18} />{t('meta.noImage')}
          </span>
        </div>
      )}
      <div className="flex gap-1.5">
        <input
          type="text"
          value={url}
          onChange={e => onChange(e.target.value)}
          placeholder={t('meta.imagePlaceholder')}
          className="mac-input meta-input dir-ltr flex-1"
        />
        {onUploadImage && (
          <button type="button" onClick={upload} disabled={busy} className="mac-btn mac-btn-sm" style={{ height: 32 }} title={t('toolbar.uploadImage')}>
            <IconUpload size={13} className={busy ? 'spin' : undefined} />
          </button>
        )}
      </div>
    </div>
  );
}
