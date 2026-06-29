import { useState } from 'react';
import { CustomSelect } from '../../../components/CustomSelect';
import { fieldTypeMap, useStore } from '../store';
import type { FieldType, MetadataField } from '../types';

const FIELD_TYPES: FieldType[] = ['text', 'number', 'boolean', 'date', 'select', 'tags'];

const frontmatterPlaceholder: Record<FieldType, string> = {
  text:    '"My Post Title"',
  number:  '42',
  boolean: 'false',
  date:    '"2024-01-01"',
  select:  '"draft"',
  tags:    '[]',
};

const FIELD_COLORS: Record<FieldType, string> = {
  text:    'var(--accent)',
  number:  'var(--joy-blue)',
  boolean: 'var(--joy-green)',
  date:    'var(--joy-orange)',
  select:  'var(--joy-pink)',
  tags:    'var(--joy-yellow)',
};

interface NewField {
  name: string;
  type: FieldType;
  required: boolean;
  options: string;
}

const BLANK: NewField = { name: '', type: 'text', required: false, options: '' };

export function MetadataFieldEditor({
  workspaceId,
  fields,
}: {
  workspaceId: string;
  fields: MetadataField[];
}) {
  const { addField, updateField, deleteField } = useStore();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<NewField>(BLANK);

  const commit = () => {
    if (!draft.name.trim()) return;
    addField(workspaceId, {
      name: draft.name.trim(),
      type: draft.type,
      required: draft.required,
      options:
        draft.type === 'select'
          ? draft.options
              .split(',')
              .map(s => s.trim())
              .filter(Boolean)
          : undefined,
    });
    setDraft(BLANK);
    setAdding(false);
  };

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-base font-black" style={{ color: 'var(--text)' }}>
            🏷️ Metadata Fields
          </h2>
          <p className="text-xs font-bold mt-0.5" style={{ color: 'var(--text-faint)' }}>
            Define the frontmatter schema for posts in this workspace
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="joy-btn flex-shrink-0 px-4 py-2 rounded-2xl text-white text-xs font-black"
            style={{
              background: 'linear-gradient(135deg, #a78bfa, #ec4899)',
              boxShadow: '0 4px 14px rgba(167,139,250,0.38)',
            }}
          >
            + Add Field
          </button>
        )}
      </div>

      {fields.length === 0 && !adding && (
        <div
          className="text-center py-14 rounded-3xl border-2 border-dashed animate-bounce-in"
          style={{ borderColor: 'var(--border-2)' }}
        >
          <div className="text-5xl mb-3 animate-float select-none">🔧</div>
          <p className="text-base font-black mb-1" style={{ color: 'var(--text)' }}>
            No fields yet
          </p>
          <p className="text-sm font-bold mb-5 max-w-xs mx-auto" style={{ color: 'var(--text-muted)' }}>
            Add fields to define the frontmatter structure your posts will use.
          </p>
          <button
            onClick={() => setAdding(true)}
            className="joy-btn px-6 py-3 rounded-2xl text-white text-sm font-black"
            style={{
              background: 'linear-gradient(135deg, #a78bfa, #ec4899)',
              boxShadow: '0 4px 16px rgba(167,139,250,0.38)',
            }}
          >
            + Add First Field
          </button>
        </div>
      )}

      {fields.length > 0 && (
        <div className="space-y-2 mb-4 stagger">
          {fields.map(field => (
            <FieldRow
              key={field.id}
              field={field}
              onToggleRequired={() =>
                updateField(workspaceId, field.id, { required: !field.required })
              }
              onDelete={() => deleteField(workspaceId, field.id)}
            />
          ))}
        </div>
      )}

      {adding && (
        <div
          className="rounded-3xl p-6 mt-4 border-2 animate-slide-up"
          style={{
            borderColor: 'var(--accent-faint)',
            background: 'var(--surface-2)',
          }}
        >
          <p className="text-sm font-black mb-4" style={{ color: 'var(--text)' }}>
            ✨ New Field
          </p>
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="flex-1">
                <label
                  className="text-[10px] font-black uppercase tracking-[0.18em] block mb-1.5"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Name
                </label>
                <input
                  autoFocus
                  type="text"
                  value={draft.name}
                  onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commit();
                    if (e.key === 'Escape') { setAdding(false); setDraft(BLANK); }
                  }}
                  placeholder="title, author, date..."
                  className="w-full px-4 py-2.5 rounded-2xl border-2 text-sm font-bold transition-all duration-150"
                  style={{
                    background: 'var(--surface)',
                    borderColor: 'var(--border)',
                    color: 'var(--text)',
                    outline: 'none',
                  }}
                  onFocus={e => {
                    e.currentTarget.style.borderColor = 'var(--accent)';
                    e.currentTarget.style.boxShadow = '0 0 0 4px var(--accent-faint)';
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>
              <div className="w-44">
                <label
                  className="text-[10px] font-black uppercase tracking-[0.18em] block mb-1.5"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Type
                </label>
                <CustomSelect
                  value={draft.type}
                  options={FIELD_TYPES.map(ft => ({
                    value: ft,
                    label: `${fieldTypeMap[ft].emoji} ${fieldTypeMap[ft].label}`,
                  }))}
                  onChange={v => { if (v) setDraft(d => ({ ...d, type: v as FieldType })); }}
                  showClear={false}
                />
              </div>
            </div>

            {draft.type === 'select' && (
              <div className="animate-slide-up">
                <label
                  className="text-[10px] font-black uppercase tracking-[0.18em] block mb-1.5"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Options{' '}
                  <span className="font-bold normal-case tracking-normal" style={{ color: 'var(--text-faint)' }}>
                    — comma separated
                  </span>
                </label>
                <input
                  type="text"
                  value={draft.options}
                  onChange={e => setDraft(d => ({ ...d, options: e.target.value }))}
                  placeholder="draft, published, archived"
                  className="w-full px-4 py-2.5 rounded-2xl border-2 text-sm font-mono font-bold transition-all duration-150"
                  style={{
                    background: 'var(--surface)',
                    borderColor: 'var(--border)',
                    color: 'var(--text)',
                    outline: 'none',
                  }}
                  onFocus={e => {
                    e.currentTarget.style.borderColor = 'var(--joy-pink)';
                    e.currentTarget.style.boxShadow = '0 0 0 4px rgba(244,114,182,0.15)';
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => setDraft(d => ({ ...d, required: !d.required }))}
              className="joy-btn flex items-center gap-2.5 cursor-pointer select-none"
            >
              <div
                className="w-10 h-5.5 rounded-full relative transition-all duration-300 flex-shrink-0"
                style={{
                  background: draft.required
                    ? 'linear-gradient(135deg, var(--joy-green), var(--accent))'
                    : 'var(--border-2)',
                  width: '40px',
                  height: '22px',
                  boxShadow: draft.required ? '0 2px 8px rgba(52,211,153,0.4)' : 'none',
                }}
              >
                <div
                  className="absolute top-[3px] w-4 h-4 rounded-full bg-white shadow-md transition-all duration-300"
                  style={{ left: draft.required ? '19px' : '3px' }}
                />
              </div>
              <span className="text-sm font-bold" style={{ color: 'var(--text-muted)' }}>
                Required field
              </span>
            </button>
          </div>

          <div className="flex gap-2 mt-5">
            <button
              onClick={() => { setAdding(false); setDraft(BLANK); }}
              className="joy-btn px-4 py-2.5 rounded-2xl text-sm font-black border-2 transition-all"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--surface)',
                color: 'var(--text-muted)',
              }}
            >
              Cancel
            </button>
            <button
              onClick={commit}
              disabled={!draft.name.trim()}
              className="joy-btn px-6 py-2.5 rounded-2xl text-white text-sm font-black transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #a78bfa, #ec4899)',
                boxShadow: draft.name.trim() ? '0 4px 14px rgba(167,139,250,0.38)' : 'none',
              }}
            >
              ✨ Add Field
            </button>
          </div>
        </div>
      )}

      {fields.length > 0 && (
        <FrontmatterPreview fields={fields} />
      )}
    </div>
  );
}

function FieldRow({
  field,
  onToggleRequired,
  onDelete,
}: {
  field: MetadataField;
  onToggleRequired: () => void;
  onDelete: () => void;
}) {
  const info = fieldTypeMap[field.type];
  const typeColor = FIELD_COLORS[field.type];
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-2xl border-2 group transition-all duration-200"
      style={{
        background: 'var(--surface-2)',
        borderColor: 'var(--border)',
        borderLeft: `4px solid ${typeColor}`,
      }}
    >
      <span className="text-xl flex-shrink-0 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-6">
        {info.emoji}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-black" style={{ color: 'var(--text)' }}>{field.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-lg font-black uppercase"
            style={{ background: `${typeColor}20`, color: typeColor }}
          >
            {info.label}
          </span>
          {field.required && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-lg font-black"
              style={{ background: 'rgba(244,114,182,0.15)', color: 'var(--joy-pink)' }}
            >
              required
            </span>
          )}
          {field.type === 'select' && field.options && field.options.length > 0 && (
            <span
              className="text-[10px] font-bold truncate max-w-[180px]"
              style={{ color: 'var(--text-faint)' }}
            >
              {field.options.join(' · ')}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200">
        <button
          onClick={onToggleRequired}
          className="joy-btn text-[10px] px-2.5 py-1 rounded-xl font-black transition-all"
          style={{
            background: field.required ? 'rgba(244,114,182,0.15)' : 'var(--surface-3)',
            color: field.required ? 'var(--joy-pink)' : 'var(--text-muted)',
            border: `1px solid ${field.required ? 'rgba(244,114,182,0.3)' : 'var(--border)'}`,
          }}
        >
          {field.required ? 'required' : 'optional'}
        </button>
        <button
          onClick={onDelete}
          className="joy-btn w-7 h-7 flex items-center justify-center rounded-xl text-sm font-black transition-all"
          style={{ color: 'var(--text-faint)', background: 'transparent' }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.color = '#ef4444';
            (e.currentTarget as HTMLElement).style.background = '#fef2f2';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.color = 'var(--text-faint)';
            (e.currentTarget as HTMLElement).style.background = 'transparent';
          }}
          aria-label="Delete field"
        >
          &times;
        </button>
      </div>
    </div>
  );
}

function FrontmatterPreview({ fields }: { fields: MetadataField[] }) {
  return (
    <div className="mt-8">
      <p
        className="text-[10px] font-black uppercase tracking-[0.18em] mb-3"
        style={{ color: 'var(--text-faint)' }}
      >
        Frontmatter Preview
      </p>
      <div
        className="rounded-2xl p-5 overflow-auto"
        style={{ background: 'var(--sb-bg)', border: '2px solid var(--sb-border)' }}
      >
        <pre className="text-xs font-mono leading-relaxed whitespace-pre">
          <span style={{ color: 'rgba(255,255,255,0.25)' }}>---{'\n'}</span>
          {fields.map(f => (
            <span key={f.id}>
              <span style={{ color: '#93c5fd' }}>{f.name}</span>
              <span style={{ color: 'rgba(255,255,255,0.25)' }}>{': '}</span>
              <span style={{ color: '#fde68a' }}>{frontmatterPlaceholder[f.type]}</span>
              {f.required && (
                <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '10px' }}>
                  {'  # required'}
                </span>
              )}
              {'\n'}
            </span>
          ))}
          <span style={{ color: 'rgba(255,255,255,0.25)' }}>---</span>
        </pre>
      </div>
    </div>
  );
}
