import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { CustomSelect } from '../../../components/CustomSelect';
import { useConfirmDialog } from '../../../components/ConfirmDialog';
import { fieldTypeMap, useStore } from '../store';
import type { FieldType, MetadataField } from '../types';
import { parseFrontmatter } from '../../editor/utils/frontmatter';

const FIELD_TYPES: FieldType[] = ['text', 'number', 'boolean', 'date', 'select', 'tags', 'image'];

const frontmatterPlaceholder: Record<FieldType, string> = {
  text:    '"My Post Title"',
  number:  '42',
  boolean: 'false',
  date:    '"2024-01-01"',
  select:  '"draft"',
  tags:    '[]',
  image:   '"/assets/cover.jpg"',
};

const FIELD_COLORS: Record<FieldType, string> = {
  text:    'var(--accent)',
  number:  'var(--teal)',
  boolean: 'var(--green)',
  date:    'var(--orange)',
  select:  'var(--purple)',
  tags:    'var(--pink)',
  image:   'var(--pink)',
};

interface NewField {
  name: string;
  type: FieldType;
  required: boolean;
  options: string;
}

interface SuggestedField {
  name: string;
  type: FieldType;
  count: number;
  options?: string[];
}

const BLANK: NewField = { name: '', type: 'text', required: false, options: '' };

function isDateValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(Date.parse(value));
}

function isImageValue(value: string) {
  return /\.(png|jpe?g|gif|webp|svg|avif|bmp)(\?.*)?$/i.test(value) ||
    /^https?:\/\/.+\.(png|jpe?g|gif|webp|svg|avif|bmp)(\?.*)?$/i.test(value);
}

function inferType(values: unknown[]): { type: FieldType; options?: string[] } {
  const nonEmpty = values.filter(v => v !== null && v !== undefined && v !== '');
  if (nonEmpty.some(Array.isArray)) return { type: 'tags' };
  if (nonEmpty.every(v => typeof v === 'boolean')) return { type: 'boolean' };
  if (nonEmpty.every(v => typeof v === 'number')) return { type: 'number' };

  const strings = nonEmpty.map(v => String(v));
  if (strings.length > 0 && strings.every(isDateValue)) return { type: 'date' };
  if (strings.length > 0 && strings.every(isImageValue)) return { type: 'image' };

  const unique = Array.from(new Set(strings)).filter(Boolean);
  if (unique.length > 1 && unique.length <= 8 && strings.length >= unique.length) {
    return { type: 'select', options: unique };
  }

  return { type: 'text' };
}

export function MetadataFieldEditor({
  workspaceId,
  mdxPath,
  fields,
}: {
  workspaceId: string;
  mdxPath: string;
  fields: MetadataField[];
}) {
  const { addField, updateField, deleteField } = useStore();
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<NewField>(BLANK);
  const [suggestions, setSuggestions] = useState<SuggestedField[]>([]);
  const [scanningSuggestions, setScanningSuggestions] = useState(false);
  const { confirm, confirmationDialog } = useConfirmDialog();
  const dismissedKey = `dismissed_suggestions:${workspaceId}`;
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(dismissedKey);
      return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });

  useEffect(() => {
    let cancelled = false;
    const configured = new Set(fields.map(f => f.name));

    async function scan() {
      setScanningSuggestions(true);
      try {
        const slugs = await invoke<string[]>('list_mdx_slugs', { path: mdxPath });
        const buckets = new Map<string, unknown[]>();
        await Promise.all(slugs.map(async slug => {
          try {
            const content = await invoke<string>('read_post', { mdxPath, slug });
            const { meta } = parseFrontmatter(content);
            Object.entries(meta).forEach(([key, value]) => {
              if (configured.has(key)) return;
              buckets.set(key, [...(buckets.get(key) ?? []), value]);
            });
          } catch {
            // Ignore unreadable posts; suggestions are opportunistic.
          }
        }));

        if (cancelled) return;
        setSuggestions(Array.from(buckets.entries()).map(([name, values]) => {
          const inferred = inferType(values);
          return { name, count: values.length, ...inferred };
        }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)));
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setScanningSuggestions(false);
      }
    }

    void scan();
    return () => { cancelled = true; };
  }, [fields, mdxPath]);

  const visibleSuggestions = suggestions.filter(s => !dismissed.has(s.name));

  const dismissSuggestion = (name: string) =>
    setDismissed(prev => {
      const next = new Set([...prev, name]);
      localStorage.setItem(dismissedKey, JSON.stringify([...next]));
      return next;
    });

  const dismissAll = () => {
    const next = new Set(suggestions.map(s => s.name));
    localStorage.setItem(dismissedKey, JSON.stringify([...next]));
    setDismissed(next);
  };

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

  const handleDeleteField = async (field: MetadataField) => {
    const confirmed = await confirm({
      title: t('metadata.deleteFieldTitle'),
      message: t('metadata.deleteFieldConfirm', { name: field.name }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
    });
    if (confirmed) void deleteField(workspaceId, field.id);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            {t('metadata.title')}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {t('metadata.subtitle')}
          </p>
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)} className="mac-btn mac-btn-primary">
            {t('metadata.addField')}
          </button>
        )}
      </div>

      {(visibleSuggestions.length > 0 || scanningSuggestions) && (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              {t('metadata.suggestions')}
            </p>
            {visibleSuggestions.length > 1 && (
              <button
                onClick={dismissAll}
                className="text-[11px] transition-colors"
                style={{ color: 'var(--text-faint)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-faint)'; }}
              >
                {t('metadata.dismissAll')}
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            {scanningSuggestions && visibleSuggestions.length === 0 ? (
              <div className="text-xs px-3 py-2" style={{ color: 'var(--text-faint)' }}>
                {t('common.loading')}
              </div>
            ) : visibleSuggestions.map(s => (
              <div
                key={s.name}
                className="flex items-center gap-3 px-3 py-2 border"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)', borderRadius: '6px' }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{s.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                      {fieldTypeMap[s.type].label}
                    </span>
                  </div>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>
                    {t('metadata.foundIn', { count: s.count })}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    className="mac-btn"
                    onClick={() => {
                      void addField(workspaceId, {
                        name: s.name,
                        type: s.type,
                        required: false,
                        options: s.type === 'select' ? s.options : undefined,
                      });
                    }}
                  >
                    {t('metadata.addSuggestion')}
                  </button>
                  <button
                    onClick={() => dismissSuggestion(s.name)}
                    className="w-6 h-6 flex items-center justify-center text-sm rounded transition-colors"
                    style={{ color: 'var(--text-faint)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
                      (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.color = 'var(--text-faint)';
                      (e.currentTarget as HTMLElement).style.background = 'transparent';
                    }}
                    title={t('metadata.dismiss')}
                    aria-label={t('metadata.dismiss')}
                  >
                    &times;
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {fields.length === 0 && !adding && (
        <div
          className="text-center py-12 border border-dashed"
          style={{ borderColor: 'var(--border-2)', borderRadius: '8px' }}
        >
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
            {t('metadata.noFields')}
          </p>
          <p className="text-xs mb-4 max-w-xs mx-auto" style={{ color: 'var(--text-muted)' }}>
            {t('metadata.noFieldsHint')}
          </p>
          <button onClick={() => setAdding(true)} className="mac-btn mac-btn-primary">
            {t('metadata.addFirst')}
          </button>
        </div>
      )}

      {fields.length > 0 && (
        <div className="space-y-1.5 mb-4">
          {fields.map(field => (
            <FieldRow
              key={field.id}
              field={field}
              onUpdate={updates => updateField(workspaceId, field.id, updates)}
              onDelete={() => handleDeleteField(field)}
            />
          ))}
        </div>
      )}

      {adding && (
        <div
          className="p-4 mt-3 border mac-fade-slide"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--surface-2)',
            borderRadius: '8px',
          }}
        >
          <p className="text-xs font-medium mb-3" style={{ color: 'var(--text-muted)' }}>
            {t('metadata.newField')}
          </p>
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                  {t('metadata.fieldName')}
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
                  placeholder={t('metadata.namePlaceholder')}
                  className="mac-input"
                />
              </div>
              <div className="w-40">
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                  {t('metadata.fieldType')}
                </label>
                <CustomSelect
                  value={draft.type}
                  options={FIELD_TYPES.map(ft => ({
                    value: ft,
                    label: fieldTypeMap[ft].label,
                  }))}
                  onChange={v => { if (v) setDraft(d => ({ ...d, type: v as FieldType })); }}
                  showClear={false}
                />
              </div>
            </div>

            {draft.type === 'select' && (
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                  {t('metadata.options')}{' '}
                  <span style={{ color: 'var(--text-faint)' }}>{t('metadata.optionsHint')}</span>
                </label>
                <input
                  type="text"
                  value={draft.options}
                  onChange={e => setDraft(d => ({ ...d, options: e.target.value }))}
                  placeholder={t('metadata.optionsPlaceholder')}
                  className="mac-input mac-input-mono"
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => setDraft(d => ({ ...d, required: !d.required }))}
              className="flex items-center gap-2 cursor-pointer select-none"
            >
              <div
                className="mac-toggle"
                style={{ background: draft.required ? 'var(--green)' : 'var(--border-2)' }}
              >
                <div
                  className="mac-toggle-knob"
                  style={{ insetInlineStart: draft.required ? '16px' : '2px' }}
                />
              </div>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {t('metadata.required')}
              </span>
            </button>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              onClick={() => { setAdding(false); setDraft(BLANK); }}
              className="mac-btn"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={commit}
              disabled={!draft.name.trim()}
              className="mac-btn mac-btn-primary disabled:opacity-40"
            >
              {t('metadata.addField')}
            </button>
          </div>
        </div>
      )}

      {fields.length > 0 && (
        <FrontmatterPreview fields={fields} />
      )}

      {confirmationDialog}
    </div>
  );
}

function FieldRow({
  field,
  onUpdate,
  onDelete,
}: {
  field: MetadataField;
  onUpdate: (updates: Partial<Pick<MetadataField, 'name' | 'type' | 'required' | 'options'>>) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const info = fieldTypeMap[field.type];
  const typeColor = FIELD_COLORS[field.type];
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<NewField>({
    name: field.name,
    type: field.type,
    required: field.required,
    options: field.options?.join(', ') ?? '',
  });

  const resetDraft = () => setEditDraft({
    name: field.name,
    type: field.type,
    required: field.required,
    options: field.options?.join(', ') ?? '',
  });

  const openEdit = () => {
    setEditDraft({
      name: field.name,
      type: field.type,
      required: field.required,
      options: field.options?.join(', ') ?? '',
    });
    setEditing(true);
  };

  const commitEdit = () => {
    if (!editDraft.name.trim()) return;
    onUpdate({
      name: editDraft.name.trim(),
      type: editDraft.type,
      required: editDraft.required,
      options:
        editDraft.type === 'select'
          ? editDraft.options.split(',').map(s => s.trim()).filter(Boolean)
          : undefined,
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <div
        className="p-4 border mac-fade-slide"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', borderRadius: '8px' }}
      >
        <p className="text-xs font-medium mb-3" style={{ color: 'var(--text-muted)' }}>
          {t('metadata.editField')}
        </p>
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                {t('metadata.fieldName')}
              </label>
              <input
                autoFocus
                type="text"
                value={editDraft.name}
                onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitEdit();
                  if (e.key === 'Escape') { setEditing(false); resetDraft(); }
                }}
                placeholder={t('metadata.namePlaceholder')}
                className="mac-input"
              />
            </div>
            <div className="w-40">
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                {t('metadata.fieldType')}
              </label>
              <CustomSelect
                value={editDraft.type}
                options={FIELD_TYPES.map(ft => ({ value: ft, label: fieldTypeMap[ft].label }))}
                onChange={v => { if (v) setEditDraft(d => ({ ...d, type: v as FieldType })); }}
                showClear={false}
              />
            </div>
          </div>

          {editDraft.type === 'select' && (
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                {t('metadata.options')}{' '}
                <span style={{ color: 'var(--text-faint)' }}>{t('metadata.optionsHint')}</span>
              </label>
              <input
                type="text"
                value={editDraft.options}
                onChange={e => setEditDraft(d => ({ ...d, options: e.target.value }))}
                placeholder={t('metadata.optionsPlaceholder')}
                className="mac-input mac-input-mono"
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => setEditDraft(d => ({ ...d, required: !d.required }))}
            className="flex items-center gap-2 cursor-pointer select-none"
          >
            <div
              className="mac-toggle"
              style={{ background: editDraft.required ? 'var(--green)' : 'var(--border-2)' }}
            >
                <div
                  className="mac-toggle-knob"
                  style={{ insetInlineStart: editDraft.required ? '16px' : '2px' }}
                />
            </div>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {t('metadata.required')}
            </span>
          </button>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={() => { setEditing(false); resetDraft(); }}
            className="mac-btn"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={commitEdit}
            disabled={!editDraft.name.trim()}
            className="mac-btn mac-btn-primary disabled:opacity-40"
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 border group transition-all"
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--border)',
        borderRadius: '6px',
      }}
    >
      <span className="text-sm flex-shrink-0 select-none" style={{ color: typeColor }}>
        {info.emoji}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{field.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span
            className="text-[10px] px-1.5 py-0.5 font-medium"
            style={{ background: `${typeColor}18`, color: typeColor, borderRadius: '3px' }}
          >
            {info.label}
          </span>
          {field.required && (
            <span
              className="text-[10px] px-1.5 py-0.5 font-medium"
              style={{ background: 'var(--accent-faint)', color: 'var(--red)', borderRadius: '3px' }}
            >
              {t('metadata.requiredLabel')}
            </span>
          )}
          {field.type === 'select' && field.options && field.options.length > 0 && (
            <span className="text-[10px] truncate max-w-[160px]" style={{ color: 'var(--text-faint)' }}>
              {field.options.join(', ')}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onUpdate({ required: !field.required })}
          className="mac-btn text-[11px] px-2 py-0.5"
          style={{
            color: field.required ? 'var(--red)' : 'var(--text-muted)',
            border: `1px solid ${field.required ? 'var(--accent)' : 'var(--border-2)'}`,
            background: field.required ? 'var(--accent-faint)' : 'var(--surface-2)',
          }}
        >
          {field.required ? t('metadata.requiredLabel') : t('metadata.optionalLabel')}
        </button>
        <button
          onClick={openEdit}
          className="mac-btn text-[11px] px-2 py-0.5"
          style={{
            color: 'var(--text-muted)',
            border: '1px solid var(--border-2)',
            background: 'var(--surface-2)',
          }}
        >
          {t('common.edit')}
        </button>
        <button
          onClick={onDelete}
          className="w-6 h-6 flex items-center justify-center text-sm transition-colors"
          style={{ color: 'var(--text-faint)', background: 'transparent' }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.color = 'var(--red)';
            (e.currentTarget as HTMLElement).style.background = 'var(--accent-faint)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.color = 'var(--text-faint)';
            (e.currentTarget as HTMLElement).style.background = 'transparent';
          }}
          aria-label={t('common.delete')}
        >
          &times;
        </button>
      </div>
    </div>
  );
}

function FrontmatterPreview({ fields }: { fields: MetadataField[] }) {
  const { t } = useTranslation();
  return (
    <div className="mt-6">
      <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-faint)' }}>
        {t('metadata.frontmatterPreview')}
      </p>
      <div
        className="p-4 overflow-auto"
        style={{ background: 'var(--sb-bg)', border: '1px solid var(--sb-border)', borderRadius: '6px' }}
      >
        <pre className="text-xs mac-input-mono leading-relaxed whitespace-pre" style={{ color: 'var(--sb-muted)' }}>
          <span style={{ color: 'var(--text-faint)' }}>---{'\n'}</span>
          {fields.map(f => (
            <span key={f.id}>
              <span style={{ color: 'var(--accent)' }}>{f.name}</span>
              <span style={{ color: 'var(--text-faint)' }}>{': '}</span>
              <span style={{ color: 'var(--green)' }}>{frontmatterPlaceholder[f.type]}</span>
              {f.required && (
                <span style={{ color: 'var(--text-faint)', fontSize: '10px' }}>
                  {'  # required'}
                </span>
              )}
              {'\n'}
            </span>
          ))}
          <span style={{ color: 'var(--text-faint)' }}>---</span>
        </pre>
      </div>
    </div>
  );
}
