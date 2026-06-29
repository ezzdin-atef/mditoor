import { useLayoutEffect, useRef } from 'react';
import { CustomSelect } from '../../../components/CustomSelect';
import { fieldTypeMap } from '../../workspace/store';
import type { MetadataField } from '../../workspace/types';
import type { MetaValues } from '../utils/frontmatter';

interface Props {
  fields: MetadataField[];
  values: MetaValues;
  onChange: (key: string, value: MetaValues[string]) => void;
}

const FIELD_COLORS: Record<string, string> = {
  text:    'var(--accent)',
  number:  'var(--joy-blue)',
  boolean: 'var(--joy-green)',
  date:    'var(--joy-orange)',
  select:  'var(--joy-pink)',
  tags:    'var(--joy-yellow)',
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

export function MetadataSidebar({ fields, values, onChange }: Props) {
  if (fields.length === 0) {
    return (
      <aside
        className="w-60 flex-shrink-0 flex flex-col items-center justify-center text-center px-5 py-10 border-r-2"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        <div className="text-5xl mb-4 animate-float opacity-30 select-none">🔧</div>
        <p className="text-xs font-black" style={{ color: 'var(--text-muted)' }}>
          No metadata fields
        </p>
        <p className="text-[11px] mt-1 leading-relaxed font-bold" style={{ color: 'var(--text-faint)' }}>
          Add fields in the workspace Metadata tab.
        </p>
      </aside>
    );
  }

  return (
    <aside
      className="w-60 flex-shrink-0 flex flex-col border-r-2 overflow-hidden"
      style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between flex-shrink-0 border-b-2"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm select-none">🏷️</span>
          <span
            className="text-[10px] font-black uppercase tracking-[0.15em]"
            style={{ color: 'var(--text-muted)' }}
          >
            Frontmatter
          </span>
        </div>
        <span
          className="text-[10px] px-2 py-0.5 rounded-full font-black"
          style={{ background: 'var(--accent-faint)', color: 'var(--accent)' }}
        >
          {fields.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {fields.map(field => (
          <FieldCard
            key={field.id}
            field={field}
            value={values[field.name]}
            onChange={v => onChange(field.name, v)}
          />
        ))}
      </div>
    </aside>
  );
}

function FieldCard({
  field,
  value,
  onChange,
}: {
  field: MetadataField;
  value: MetaValues[string] | undefined;
  onChange: (v: MetaValues[string]) => void;
}) {
  const info = fieldTypeMap[field.type];
  const typeColor = FIELD_COLORS[field.type] ?? 'var(--accent)';

  const inputCls = 'w-full px-3 py-1.5 rounded-xl border-2 text-sm font-bold focus:outline-none transition-all duration-150';
  const inputStyle: React.CSSProperties = {
    background: 'var(--surface)',
    borderColor: 'var(--border)',
    color: 'var(--text)',
  };
  const onFocusInput: React.FocusEventHandler<HTMLInputElement> = e => {
    e.currentTarget.style.borderColor = typeColor;
    e.currentTarget.style.boxShadow = `0 0 0 3px ${typeColor}22`;
  };
  const onBlurInput: React.FocusEventHandler<HTMLInputElement> = e => {
    e.currentTarget.style.borderColor = 'var(--border)';
    e.currentTarget.style.boxShadow = 'none';
  };
  const onFocusTA: React.FocusEventHandler<HTMLTextAreaElement> = e => {
    e.currentTarget.style.borderColor = typeColor;
    e.currentTarget.style.boxShadow = `0 0 0 3px ${typeColor}22`;
  };
  const onBlurTA: React.FocusEventHandler<HTMLTextAreaElement> = e => {
    e.currentTarget.style.borderColor = 'var(--border)';
    e.currentTarget.style.boxShadow = 'none';
  };

  const header = (
    <div className="flex items-center gap-1.5 mb-2">
      <span className="text-sm leading-none select-none">{info.emoji}</span>
      <span className="text-xs font-black truncate flex-1" style={{ color: 'var(--text)' }}>
        {field.name}
      </span>
      <span
        className="text-[9px] px-1.5 py-0.5 rounded-lg font-black uppercase tracking-wide flex-shrink-0"
        style={{ background: `${typeColor}20`, color: typeColor }}
      >
        {info.label}
      </span>
      {field.required && (
        <span className="text-[10px] font-black flex-shrink-0" style={{ color: 'var(--accent-2)' }}>
          ✦
        </span>
      )}
    </div>
  );

  const cardStyle: React.CSSProperties = {
    borderColor: 'var(--border)',
    background: 'var(--surface-2)',
    borderLeft: `3px solid ${typeColor}`,
  };

  /* Boolean toggle */
  if (field.type === 'boolean') {
    const checked = value === true || value === 'true';
    return (
      <div className="rounded-2xl p-3 border-2" style={cardStyle}>
        {header}
        <button onClick={() => onChange(!checked)} className="flex items-center gap-2.5 joy-btn">
          <div
            className="w-11 h-6 rounded-full relative transition-all duration-300 flex-shrink-0"
            style={{
              background: checked
                ? `linear-gradient(135deg, var(--joy-green), ${typeColor})`
                : 'var(--border-2)',
              boxShadow: checked ? `0 2px 8px ${typeColor}40` : 'none',
            }}
          >
            <div
              className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-all duration-300"
              style={{ left: checked ? '23px' : '3px' }}
            />
          </div>
          <span
            className="text-xs font-black"
            style={{ color: checked ? 'var(--joy-green)' : 'var(--text-faint)' }}
          >
            {checked ? 'true' : 'false'}
          </span>
        </button>
      </div>
    );
  }

  /* Custom select */
  if (field.type === 'select') {
    return (
      <div className="rounded-2xl p-3 border-2" style={cardStyle}>
        {header}
        <CustomSelect
          value={String(value ?? '')}
          options={field.options?.map(o => ({ value: o, label: o }))}
          onChange={v => onChange(v)}
        />
      </div>
    );
  }

  /* Tags */
  if (field.type === 'tags') {
    const tags = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="rounded-2xl p-3 border-2" style={cardStyle}>
        {header}
        <input
          type="text"
          value={tags.join(', ')}
          onChange={e =>
            onChange(e.target.value.split(',').map(t => t.trim()).filter(Boolean))
          }
          placeholder="tag1, tag2, ..."
          className={inputCls}
          style={inputStyle}
          onFocus={onFocusInput}
          onBlur={onBlurInput}
        />
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {tags.map(t => (
              <span
                key={t}
                className="text-[10px] px-2 py-0.5 rounded-full font-black"
                style={{ background: `${typeColor}20`, color: typeColor }}
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* Date */
  if (field.type === 'date') {
    return (
      <div className="rounded-2xl p-3 border-2" style={cardStyle}>
        {header}
        <input
          type="date"
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          className={inputCls}
          style={inputStyle}
          onFocus={onFocusInput}
          onBlur={onBlurInput}
        />
      </div>
    );
  }

  /* Number */
  if (field.type === 'number') {
    return (
      <div className="rounded-2xl p-3 border-2" style={cardStyle}>
        {header}
        <input
          type="number"
          value={value === '' || value === undefined ? '' : String(value)}
          onChange={e => onChange(Number.isNaN(e.target.valueAsNumber) ? '' : e.target.valueAsNumber)}
          className={inputCls}
          style={inputStyle}
          onFocus={onFocusInput}
          onBlur={onBlurInput}
        />
      </div>
    );
  }

  /* Text — auto-expanding */
  return (
    <div className="rounded-2xl p-3 border-2" style={cardStyle}>
      {header}
      <AutoTextarea
        value={String(value ?? '')}
        onChange={v => onChange(v)}
        placeholder={`Enter ${field.name}...`}
        className={inputCls}
        style={inputStyle}
        onFocus={onFocusTA}
        onBlur={onBlurTA}
      />
    </div>
  );
}
