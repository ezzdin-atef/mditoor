import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { CustomSelect } from '../../../components/CustomSelect';
import { fieldTypeMap } from '../../workspace/store';
import type { MetadataField } from '../../workspace/types';
import type { MetaValues } from '../utils/frontmatter';

interface Props {
  fields: MetadataField[];
  values: MetaValues;
  onChange: (key: string, value: MetaValues[string]) => void;
  body?: string;
  slug?: string;
  onUploadImage?: () => Promise<string | null>;
}

const FIELD_COLORS: Record<string, string> = {
  text:    'var(--accent)',
  number:  'var(--teal)',
  boolean: 'var(--green)',
  date:    'var(--orange)',
  select:  'var(--purple)',
  tags:    'var(--pink)',
  image:   'var(--pink)',
};

function AutoTextarea({
  value,
  onChange,
  placeholder,
  className,
  style,
  onFocus,
  onBlur,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  onFocus?: React.FocusEventHandler<HTMLTextAreaElement>;
  onBlur?: React.FocusEventHandler<HTMLTextAreaElement>;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
      style={{ resize: 'none', overflowY: 'hidden', ...style }}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  );
}

export function MetadataSidebar({ fields, values, onChange, body = '', slug = '', onUploadImage }: Props) {
  const [mode, setMode] = useState<'meta' | 'seo'>('meta');
  const { t } = useTranslation();

  return (
    <aside
      className="w-56 flex-shrink-0 flex flex-col overflow-hidden"
      style={{ borderInlineEnd: '1px solid var(--border)', background: 'var(--surface-2)' }}
    >
      {/* Tab bar */}
      <div
        className="flex flex-shrink-0 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        {(['meta', 'seo'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className="flex-1 py-2 text-[12px] font-medium transition-colors"
            style={
              mode === m
                ? { color: 'var(--accent)', borderBottom: '2px solid var(--accent)', background: 'transparent' }
                : { color: 'var(--text-muted)', borderBottom: '2px solid transparent', background: 'transparent' }
            }
          >
            {m === 'meta' && fields.length > 0 ? `${t('metadata.meta')} (${fields.length})` : m === 'meta' ? t('metadata.meta') : t('metadata.seo')}
          </button>
        ))}
      </div>

      {mode === 'seo' ? (
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <SeoPanel values={values} body={body} slug={slug} />
        </div>
      ) : fields.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-8">
          <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            {t('metadata.noMetaFields')}
          </p>
          <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--text-faint)' }}>
            {t('metadata.noMetaHint')}
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-2.5 py-2.5 space-y-2">
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
    </aside>
  );
}

// ─── SEO Panel ───────────────────────────────────────────────────────────────

function stripMd(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
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

function SeoPanel({ values, body, slug }: { values: MetaValues; body: string; slug: string }) {
  const { t } = useTranslation();
  const clean     = stripMd(body);
  const words     = clean.trim() ? clean.trim().split(/\s+/).length : 0;
  const readTime  = Math.max(1, Math.round(words / 200));

  const title     = String(values.title ?? values.seoTitle ?? values.metaTitle ?? '');
  const desc      = String(values.description ?? values.excerpt ?? values.metaDescription ?? values.summary ?? '');

  const h1s = (body.match(/^#\s/gm)  ?? []).length;
  const h2s = (body.match(/^##\s/gm) ?? []).length;
  const h3s = (body.match(/^###\s/gm) ?? []).length;

  const allImgs     = (body.match(/!\[/g) ?? []).length;
  const emptyAlt    = (body.match(/!\[\]/g) ?? []).length;
  const slugOk      = /^[a-z0-9-]+$/.test(slug) && slug.length > 0;

  return (
    <div className="space-y-4">
      <CharGauge label={t('seo.title')} length={title.length} good={[50, 60]} soft={[45, 70]} />
      <CharGauge label={t('seo.description')} length={desc.length} good={[150, 160]} soft={[120, 180]} />

      <div className="space-y-1.5">
        <SeoRow label={t('seo.words')} value={words.toString()} note={words < 300 ? t('seo.short') : words > 2500 ? t('seo.long') : t('seo.good')} warn={words > 0 && words < 300} />
        <SeoRow label={t('seo.readTime')} value={`~${readTime} ${t('seo.min')}`} />
        <SeoRow label={t('seo.slug')} value={slug || '-'} note={slugOk ? t('seo.ok') : t('seo.invalid')} warn={!slugOk} />
      </div>

      <div>
        <p
          className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
          style={{ color: 'var(--text-muted)' }}
        >
          {t('seo.structure')}
        </p>
        <div className="space-y-1.5">
          <SeoRow label="H1" value={h1s.toString()} note={h1s === 1 ? t('seo.good') : h1s === 0 ? t('seo.missing') : t('seo.tooMany')} warn={h1s !== 1} />
          <SeoRow label="H2" value={h2s.toString()} />
          <SeoRow label="H3" value={h3s.toString()} />
          {allImgs > 0 && (
            <SeoRow
              label={t('seo.images')}
              value={allImgs.toString()}
              note={emptyAlt > 0 ? `${emptyAlt} ${t('seo.noAlt')}` : t('seo.allAlt')}
              warn={emptyAlt > 0}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function CharGauge({
  label,
  length,
  good,
  soft,
}: {
  label: string;
  length: number;
  good: [number, number];
  soft: [number, number];
}) {
  const { t } = useTranslation();
  let color: string;
  let note: string;

  if (length === 0) {
    color = 'var(--text-faint)';
    note  = t('seo.empty');
  } else if (length >= good[0] && length <= good[1]) {
    color = 'var(--green)';
    note  = `${length} - ${t('seo.great')}`;
  } else if (length >= soft[0] && length <= soft[1]) {
    color = 'var(--orange)';
    note  = `${length}`;
  } else if (length > soft[1]) {
    color = 'var(--red)';
    note  = `${length} - ${t('seo.tooLong')}`;
  } else {
    color = 'var(--orange)';
    note  = `${length} - ${t('seo.tooShort')}`;
  }

  const pct = Math.min(100, (length / soft[1]) * 100);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[11px] font-medium" style={{ color: 'var(--text)' }}>{label}</span>
        <span className="text-[10px]" style={{ color }}>{note}</span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="text-[9px]" style={{ color: 'var(--text-faint)' }}>{good[0]}</span>
        <span className="text-[9px]" style={{ color: 'var(--text-faint)' }}>{soft[1]}</span>
      </div>
    </div>
  );
}

function SeoRow({
  label,
  value,
  note,
  warn,
}: {
  label: string;
  value: string;
  note?: string;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] mac-input-mono" style={{ color: 'var(--text)' }}>{value}</span>
        {note && (
          <span
            className="text-[9px] px-1 py-px"
            style={{
              background: warn ? 'var(--accent-faint)' : 'var(--surface-3)',
              color:      warn ? 'var(--red)' : 'var(--text-faint)',
              borderRadius: '3px',
            }}
          >
            {note}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Image field card (separate component to allow hooks) ────────────────────

function ImageFieldCard({
  field,
  value,
  onChange,
  cardStyle,
  header,
  inputStyle,
  onUploadImage,
}: {
  field: MetadataField;
  value: MetaValues[string] | undefined;
  onChange: (v: MetaValues[string]) => void;
  cardStyle: React.CSSProperties;
  header: React.ReactNode;
  inputStyle: React.CSSProperties;
  onUploadImage?: () => Promise<string | null>;
}) {
  const { t } = useTranslation();
  const url = String(value ?? '');
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy]       = useState(false);

  useEffect(() => {
    if (!url) { setPreview(null); return; }
    if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('/')) {
      setPreview(url);
    } else {
      invoke<string>('read_image_base64', { path: url })
        .then(setPreview)
        .catch(() => setPreview(null));
    }
  }, [url]);

  const handleUpload = async () => {
    if (!onUploadImage || busy) return;
    setBusy(true);
    try {
      const newUrl = await onUploadImage();
      if (newUrl) onChange(newUrl);
    } finally {
      setBusy(false);
    }
  };

  const typeColor = 'var(--pink)';

  return (
    <div style={cardStyle}>
      {header}
      {preview && (
        <img
          src={preview}
          alt={field.name}
          style={{
            width: '100%',
            height: '72px',
            objectFit: 'cover',
            borderRadius: '4px',
            marginBottom: '6px',
            border: '1px solid var(--border)',
          }}
        />
      )}
      <div className="flex gap-1">
        <input
          type="text"
          value={url}
          onChange={e => onChange(e.target.value)}
          placeholder="URL or path..."
          style={{ ...inputStyle, flex: 1, fontSize: '11px' }}
          onFocus={e => {
            e.currentTarget.style.borderColor = typeColor;
            e.currentTarget.style.boxShadow   = `0 0 0 2px ${typeColor}22`;
          }}
          onBlur={e => {
            e.currentTarget.style.borderColor = 'var(--border-2)';
            e.currentTarget.style.boxShadow   = 'none';
          }}
        />
        {onUploadImage && (
          <button
            onClick={handleUpload}
            disabled={busy}
            className="mac-btn text-[10px] flex-shrink-0 disabled:opacity-50"
          >
            {busy ? '...' : t('toolbar.uploadImage')}
          </button>
        )}
      </div>
    </div>
  );
}

function TagsFieldCard({
  value,
  onChange,
  cardStyle,
  header,
  inputStyle,
  onFocus,
  onBlur,
}: {
  value: MetaValues[string] | undefined;
  onChange: (v: MetaValues[string]) => void;
  cardStyle: React.CSSProperties;
  header: React.ReactNode;
  inputStyle: React.CSSProperties;
  onFocus: React.FocusEventHandler<HTMLInputElement>;
  onBlur: React.FocusEventHandler<HTMLInputElement>;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const tags = Array.isArray(value) ? (value as string[]) : [];

  const addDraft = () => {
    const next = draft.trim();
    if (!next) return;
    if (!tags.includes(next)) onChange([...tags, next]);
    setDraft('');
  };

  return (
    <div style={cardStyle}>
      {header}
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {tags.map(tag => (
          <span key={tag} className="tag-pill">
            {tag}
            <button
              type="button"
              className="tag-pill-close"
              aria-label={`${t('common.remove')} ${tag}`}
              onClick={() => onChange(tags.filter(t => t !== tag))}
            >
              &times;
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            addDraft();
          }
          if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
            onChange(tags.slice(0, -1));
          }
        }}
        placeholder={t('metadata.tagPlaceholder')}
        style={inputStyle}
        onFocus={onFocus}
        onBlur={e => {
          addDraft();
          onBlur(e);
        }}
      />
    </div>
  );
}

// ─── Field card ──────────────────────────────────────────────────────────────

function FieldCard({
  field,
  value,
  onChange,
  onUploadImage,
}: {
  field: MetadataField;
  value: MetaValues[string] | undefined;
  onChange: (v: MetaValues[string]) => void;
  onUploadImage?: () => Promise<string | null>;
}) {
  const info      = fieldTypeMap[field.type];
  const typeColor = FIELD_COLORS[field.type] ?? 'var(--accent)';

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontFamily: 'inherit',
    border: '1px solid var(--border-2)',
    background: 'var(--bg)',
    color: 'var(--text)',
    outline: 'none',
    transition: 'box-shadow 0.12s ease, border-color 0.12s ease',
  };

  const onFocusInput: React.FocusEventHandler<HTMLInputElement> = e => {
    e.currentTarget.style.borderColor = typeColor;
    e.currentTarget.style.boxShadow = `0 0 0 2px ${typeColor}22`;
  };
  const onBlurInput: React.FocusEventHandler<HTMLInputElement> = e => {
    e.currentTarget.style.borderColor = 'var(--border-2)';
    e.currentTarget.style.boxShadow = 'none';
  };
  const onFocusTA: React.FocusEventHandler<HTMLTextAreaElement> = e => {
    e.currentTarget.style.borderColor = typeColor;
    e.currentTarget.style.boxShadow = `0 0 0 2px ${typeColor}22`;
  };
  const onBlurTA: React.FocusEventHandler<HTMLTextAreaElement> = e => {
    e.currentTarget.style.borderColor = 'var(--border-2)';
    e.currentTarget.style.boxShadow = 'none';
  };

  const header = (
    <div className="flex items-center gap-1.5 mb-1.5">
      <span className="text-xs leading-none select-none" style={{ color: typeColor }}>
        {info.emoji}
      </span>
      <span className="text-[11px] font-medium truncate flex-1" style={{ color: 'var(--text)' }}>
        {field.name}
      </span>
      <span
        className="text-[9px] px-1 py-0.5 font-medium flex-shrink-0"
        style={{ background: `${typeColor}18`, color: typeColor, borderRadius: '3px' }}
      >
        {info.label}
      </span>
      {field.required && (
        <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--red)' }}>*</span>
      )}
    </div>
  );

  const cardStyle: React.CSSProperties = {
    background: 'var(--surface)',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    padding: '8px 10px',
  };

  if (field.type === 'boolean') {
    const checked = value === true || value === 'true';
    return (
      <div style={cardStyle}>
        {header}
        <button onClick={() => onChange(!checked)} className="flex items-center gap-2">
          <div
            className="mac-toggle"
            style={{ background: checked ? 'var(--green)' : 'var(--border-2)' }}
          >
            <div className="mac-toggle-knob" style={{ insetInlineStart: checked ? '16px' : '2px' }} />
          </div>
          <span className="text-xs" style={{ color: checked ? 'var(--green)' : 'var(--text-faint)' }}>
            {checked ? 'true' : 'false'}
          </span>
        </button>
      </div>
    );
  }

  if (field.type === 'select') {
    return (
      <div style={cardStyle}>
        {header}
        <CustomSelect
          value={String(value ?? '')}
          options={field.options?.map(o => ({ value: o, label: o }))}
          onChange={v => onChange(v)}
        />
      </div>
    );
  }

  if (field.type === 'tags') {
    return (
      <TagsFieldCard
        value={value}
        onChange={onChange}
        cardStyle={cardStyle}
        header={header}
        inputStyle={inputStyle}
        onFocus={onFocusInput}
        onBlur={onBlurInput}
      />
    );
  }

  if (field.type === 'date') {
    return (
      <div style={cardStyle}>
        {header}
        <input
          type="date"
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          style={inputStyle}
          onFocus={onFocusInput}
          onBlur={onBlurInput}
        />
      </div>
    );
  }

  if (field.type === 'number') {
    return (
      <div style={cardStyle}>
        {header}
        <input
          type="number"
          value={value === '' || value === undefined ? '' : String(value)}
          onChange={e => onChange(Number.isNaN(e.target.valueAsNumber) ? '' : e.target.valueAsNumber)}
          style={inputStyle}
          onFocus={onFocusInput}
          onBlur={onBlurInput}
        />
      </div>
    );
  }

  if (field.type === 'image') {
    return (
      <ImageFieldCard
        field={field}
        value={value}
        onChange={onChange}
        cardStyle={cardStyle}
        header={header}
        inputStyle={inputStyle}
        onUploadImage={onUploadImage}
      />
    );
  }

  return (
    <div style={cardStyle}>
      {header}
      <AutoTextarea
        value={String(value ?? '')}
        onChange={v => onChange(v)}
        placeholder={`Enter ${field.name}...`}
        style={inputStyle}
        onFocus={onFocusTA}
        onBlur={onBlurTA}
      />
    </div>
  );
}
