import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from '../../router';
import type { Workspace } from '../workspace/types';
import { useViewPrefs } from '../settings/viewPrefs';
import { useConfirmDialog } from '../../components/ConfirmDialog';
import { CustomSelect } from '../../components/CustomSelect';
import { toast } from '../../components/Toast';
import {
  IconArrowRight, IconBulb, IconColumns, IconFile, IconList, IconPen, IconPlus, IconSearch, IconStar, IconTrash, IconX,
} from '../../components/Icons';
import { MOD, relativeTime } from '../../lib/ui';
import { newPostSlug, postFileName, slugify } from '../posts/postMeta';
import { IDEA_STATUSES, sortIdeas, useIdeas, type Idea, type IdeaStatus } from './store';

const STATUS_COLOR: Record<IdeaStatus, string> = {
  inbox: 'var(--text-muted)',
  next: 'var(--accent)',
  drafted: 'var(--green)',
};

function uniqueSlug(base: string, taken: Set<string>) {
  const root = base || 'untitled';
  if (!taken.has(root)) return root;
  let n = 2;
  while (taken.has(`${root}-${n}`)) n++;
  return `${root}-${n}`;
}

function parseTags(input: string): string[] {
  return Array.from(new Set(input.split(/[,،]/).map(s => s.trim().replace(/^#/, '')).filter(Boolean)));
}

/* ─── Main view ──────────────────────────────────────────────────────── */

export function IdeasView({ workspace, existingSlugs }: { workspace: Workspace; existingSlugs: string[] }) {
  const { t } = useTranslation();
  const { navigate } = useRouter();
  const { ideasView, set: setPref } = useViewPrefs();
  const path = workspace.mdxPath;
  const ideas = useIdeas(s => s.byPath[path]);
  const loading = useIdeas(s => s.loading[path]);
  const error = useIdeas(s => s.error[path]);
  const { load, add, update, remove, removeMany } = useIdeas.getState();
  const { confirm, confirmationDialog } = useConfirmDialog();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<IdeaStatus | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<IdeaStatus | null>(null);

  useEffect(() => { void load(path, true); }, [path, load]);

  const all = ideas ?? [];
  const q = query.trim().toLowerCase();
  const matching = useMemo(
    () => sortIdeas(all.filter(i =>
      !q || i.title.toLowerCase().includes(q) || i.notes.toLowerCase().includes(q) ||
      i.tags.some(tag => tag.toLowerCase().includes(q)))),
    [all, q],
  );
  const counts = useMemo(() => {
    const c: Record<IdeaStatus, number> = { inbox: 0, next: 0, drafted: 0 };
    all.forEach(i => { c[i.status]++; });
    return c;
  }, [all]);

  const opened = all.find(i => i.id === openId) ?? null;

  const startWriting = (idea: Idea) => {
    // An idea that already became a post just reopens it.
    if (idea.slug && existingSlugs.includes(idea.slug)) {
      navigate({ page: 'editor', workspaceId: workspace.id, slug: idea.slug, isNew: false });
      return;
    }
    const slug = uniqueSlug(newPostSlug(workspace.profile, slugify(idea.title)), new Set(existingSlugs));
    update(path, idea.id, { status: 'drafted', slug });
    navigate({
      page: 'editor',
      workspaceId: workspace.id,
      slug,
      isNew: true,
      seed: { title: idea.title, body: idea.notes },
    });
  };

  const deleteIdea = async (idea: Idea) => {
    const ok = await confirm({
      title: t('ideas.deleteTitle'),
      message: t('ideas.deleteConfirm', { title: idea.title }),
      confirmLabel: t('common.delete'),
    });
    if (!ok) return;
    remove(path, idea.id);
    setOpenId(null);
    toast.success(t('ideas.deleted'));
  };

  const clearDrafted = async () => {
    const drafted = all.filter(i => i.status === 'drafted');
    if (drafted.length === 0) return;
    const ok = await confirm({
      title: t('ideas.clearDraftedTitle'),
      message: t('ideas.clearDraftedConfirm', { n: drafted.length }),
      confirmLabel: t('ideas.clearDrafted'),
    });
    if (!ok) return;
    removeMany(path, drafted.map(i => i.id));
    toast.success(t('ideas.clearedDrafted', { n: drafted.length }));
  };

  const cardProps = (idea: Idea) => ({
    idea,
    hasPost: Boolean(idea.slug && existingSlugs.includes(idea.slug)),
    onOpen: () => setOpenId(idea.id),
    onStar: () => update(path, idea.id, { starred: !idea.starred }),
    onWrite: () => startWriting(idea),
    onDelete: () => void deleteIdea(idea),
  });

  return (
    <div className="space-y-5">
      <CaptureBar onAdd={async (title, status) => {
        await add(path, { title, status });
        toast.success(t('ideas.added'), title);
      }} />

      <div className="toolbar-row">
        <div className="search-field">
          <IconSearch size={15} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('ideas.search')} aria-label={t('ideas.search')} />
        </div>
        {ideasView === 'list' && (
          <div className="mac-segmented">
            {(['all', ...IDEA_STATUSES] as const).map(s => (
              <button key={s} onClick={() => setFilter(s)} className={`mac-segment${filter === s ? ' active' : ''}`}>
                {s === 'all' ? t('ideas.all') : t(`ideas.status.${s}`)}
                <span className="tab-count">{s === 'all' ? all.length : counts[s]}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex-1" />
        {ideasView === 'list' && filter === 'drafted' && counts.drafted > 0 && (
          <button className="mac-btn mac-btn-destructive" onClick={() => void clearDrafted()}>
            <IconTrash size={14} />{t('ideas.clearDrafted')}
          </button>
        )}
        <div className="mac-segmented" role="radiogroup" aria-label={t('view.label')}>
          {(['board', 'list'] as const).map(v => (
            <button
              key={v}
              role="radio"
              aria-checked={ideasView === v}
              onClick={() => setPref('ideasView', v)}
              className={`mac-segment${ideasView === v ? ' active' : ''}`}
              title={t(`ideas.view.${v}`)}
            >
              {v === 'board' ? <IconColumns size={14} /> : <IconList size={14} />}
              <span className="hidden md:inline">{t(`ideas.view.${v}`)}</span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-[12px] px-3 py-2" style={{ color: 'var(--red)', background: 'color-mix(in srgb, var(--red) 8%, transparent)', borderRadius: 10 }}>
          {error}
        </p>
      )}

      {loading && !ideas ? (
        <div className="idea-board">
          {IDEA_STATUSES.map(s => <div key={s} className="skeleton" style={{ height: 220, borderRadius: 14 }} />)}
        </div>
      ) : all.length === 0 ? (
        <div className="empty-state mac-fade-in">
          <div className="empty-illustration">💡</div>
          <p className="empty-state-title">{t('ideas.empty')}</p>
          <p className="empty-state-hint">{t('ideas.emptyHint', { shortcut: `${MOD}K` })}</p>
        </div>
      ) : ideasView === 'board' ? (
        <div className="idea-board">
          {IDEA_STATUSES.map(status => {
            const column = matching.filter(i => i.status === status);
            return (
              <section
                key={status}
                className={`idea-column${dragOver === status ? ' drop' : ''}`}
                onDragOver={e => { if (e.dataTransfer.types.includes('text/idea-id')) { e.preventDefault(); setDragOver(status); } }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null); }}
                onDrop={e => {
                  e.preventDefault();
                  setDragOver(null);
                  const id = e.dataTransfer.getData('text/idea-id');
                  const idea = all.find(i => i.id === id);
                  if (idea && idea.status !== status) update(path, id, { status });
                }}
              >
                <header className="idea-column-header">
                  <span className="status-pip" style={{ background: STATUS_COLOR[status] }} />
                  <span className="flex-1">{t(`ideas.status.${status}`)}</span>
                  <span className="tab-count">{column.length}</span>
                  {status === 'drafted' && column.length > 0 && (
                    <button className="idea-clear" onClick={() => void clearDrafted()} title={t('ideas.clearDrafted')}>
                      <IconTrash size={12} />{t('ideas.clear')}
                    </button>
                  )}
                </header>
                <div className="idea-column-body">
                  {column.length === 0 ? (
                    <p className="idea-column-empty">{t(`ideas.columnEmpty.${status}`)}</p>
                  ) : column.map(idea => <IdeaCard key={idea.id} {...cardProps(idea)} draggable />)}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="post-list">
          {matching.filter(i => filter === 'all' || i.status === filter).map(idea => (
            <IdeaRow key={idea.id} {...cardProps(idea)} onStatus={s => update(path, idea.id, { status: s })} />
          ))}
          {matching.filter(i => filter === 'all' || i.status === filter).length === 0 && (
            <p className="text-[13px] text-center py-10" style={{ color: 'var(--text-faint)' }}>{t('ideas.noMatches')}</p>
          )}
        </div>
      )}

      {opened && (
        <IdeaDialog
          idea={opened}
          profile={workspace.profile}
          hasPost={Boolean(opened.slug && existingSlugs.includes(opened.slug))}
          onChange={patch => update(path, opened.id, patch)}
          onClose={() => setOpenId(null)}
          onDelete={() => void deleteIdea(opened)}
          onWrite={title => startWriting({ ...opened, title })}
        />
      )}
      {confirmationDialog}
    </div>
  );
}

/* ─── Quick capture ──────────────────────────────────────────────────── */

function CaptureBar({ onAdd }: { onAdd: (title: string, status: IdeaStatus) => Promise<void> }) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [status, setStatus] = useState<IdeaStatus>('inbox');
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    const title = value.trim();
    if (!title) return;
    setValue('');
    await onAdd(title, status);
    inputRef.current?.focus();
  };

  return (
    <div className="idea-capture">
      <span className="idea-capture-icon"><IconBulb size={18} /></span>
      <input
        ref={inputRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') void submit(); }}
        placeholder={t('ideas.capturePlaceholder')}
        aria-label={t('ideas.capturePlaceholder')}
        dir="auto"
      />
      <CustomSelect<IdeaStatus>
        value={status}
        options={IDEA_STATUSES.filter(s => s !== 'drafted').map(s => ({ value: s, label: t(`ideas.status.${s}`) }))}
        onChange={v => { if (v) setStatus(v); }}
        size="sm"
        variant="ghost"
        ariaLabel={t('ideas.statusLabel')}
        menuMinWidth={140}
      />
      <button className="mac-btn mac-btn-primary" onClick={() => void submit()} disabled={!value.trim()}>
        <IconPlus size={14} />{t('ideas.add')}
      </button>
    </div>
  );
}

/* ─── Card (board) ───────────────────────────────────────────────────── */

interface CardProps {
  idea: Idea;
  hasPost: boolean;
  onOpen: () => void;
  onStar: () => void;
  onWrite: () => void;
  onDelete: () => void;
}

function IdeaCard({ idea, hasPost, onOpen, onStar, onWrite, onDelete, draggable }: CardProps & { draggable?: boolean }) {
  const { t, i18n } = useTranslation();
  return (
    <article
      className="idea-card"
      draggable={draggable}
      onDragStart={e => { e.dataTransfer.setData('text/idea-id', idea.id); e.dataTransfer.effectAllowed = 'move'; }}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter') onOpen(); }}
      tabIndex={0}
      aria-label={idea.title}
    >
      <div className="flex items-start gap-2">
        <h3 className="idea-card-title" dir="auto">{idea.title}</h3>
        <button
          className={`idea-star${idea.starred ? ' on' : ''}`}
          onClick={e => { e.stopPropagation(); onStar(); }}
          aria-pressed={idea.starred}
          aria-label={t('ideas.star')}
          title={t('ideas.star')}
        >
          <IconStar size={14} />
        </button>
      </div>
      {idea.notes && <p className="idea-card-notes" dir="auto">{idea.notes}</p>}
      {idea.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {idea.tags.slice(0, 4).map(tag => <span key={tag} className="chip">#{tag}</span>)}
        </div>
      )}
      <div className="idea-card-footer">
        <span className="flex-1">{relativeTime(Date.parse(idea.updatedAt), i18n.language)}</span>
        <button
          className="idea-write danger"
          onClick={e => { e.stopPropagation(); onDelete(); }}
          aria-label={t('ideas.delete')}
          title={t('ideas.delete')}
        >
          <IconTrash size={12} />
        </button>
        <button className="idea-write" onClick={e => { e.stopPropagation(); onWrite(); }}>
          {hasPost ? <><IconFile size={12} />{t('ideas.openPost')}</> : <><IconPen size={12} />{t('ideas.write')}</>}
        </button>
      </div>
    </article>
  );
}

/* ─── Row (list) ─────────────────────────────────────────────────────── */

function IdeaRow({ idea, hasPost, onOpen, onStar, onWrite, onDelete, onStatus }: CardProps & { onStatus: (s: IdeaStatus) => void }) {
  const { t, i18n } = useTranslation();
  return (
    <div className="post-row" role="button" tabIndex={0} onClick={onOpen} onKeyDown={e => { if (e.key === 'Enter') onOpen(); }}>
      <button
        className={`idea-star${idea.starred ? ' on' : ''}`}
        onClick={e => { e.stopPropagation(); onStar(); }}
        aria-pressed={idea.starred}
        aria-label={t('ideas.star')}
      >
        <IconStar size={14} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-semibold truncate" style={{ color: 'var(--text)' }} dir="auto">{idea.title}</div>
        {idea.notes && <div className="text-[12px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }} dir="auto">{idea.notes}</div>}
      </div>
      <div className="hidden lg:flex items-center gap-1 flex-shrink-0">
        {idea.tags.slice(0, 2).map(tag => <span key={tag} className="chip">#{tag}</span>)}
      </div>
      <span className="hidden sm:inline text-[11.5px] w-24 text-end flex-shrink-0" style={{ color: 'var(--text-faint)' }}>
        {relativeTime(Date.parse(idea.updatedAt), i18n.language)}
      </span>
      <div onClick={e => e.stopPropagation()} className="flex-shrink-0">
        <CustomSelect<IdeaStatus>
          value={idea.status}
          options={IDEA_STATUSES.map(s => ({
            value: s,
            label: t(`ideas.status.${s}`),
            icon: <span className="status-pip" style={{ background: STATUS_COLOR[s] }} />,
          }))}
          onChange={v => { if (v) onStatus(v); }}
          size="sm"
          variant="ghost"
          width={130}
          ariaLabel={t('ideas.statusLabel')}
        />
      </div>
      <button className="mac-btn mac-btn-sm flex-shrink-0" onClick={e => { e.stopPropagation(); onWrite(); }}>
        {hasPost ? <IconFile size={12} /> : <IconPen size={12} />}
        {hasPost ? t('ideas.openPost') : t('ideas.write')}
      </button>
      <button
        className="icon-btn icon-btn-sm danger flex-shrink-0"
        onClick={e => { e.stopPropagation(); onDelete(); }}
        aria-label={t('ideas.delete')}
        title={t('ideas.delete')}
      >
        <IconTrash size={14} />
      </button>
    </div>
  );
}

/* ─── Detail dialog ──────────────────────────────────────────────────── */

function IdeaDialog({ idea, profile, hasPost, onChange, onClose, onDelete, onWrite }: {
  idea: Idea;
  profile: Workspace['profile'];
  hasPost: boolean;
  onChange: (patch: Partial<Idea>) => void;
  onClose: () => void;
  onDelete: () => void;
  onWrite: (title: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [title, setTitle] = useState(idea.title);
  const [tags, setTags] = useState(idea.tags.join(', '));

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const commitTitle = () => {
    const next = title.trim();
    if (next && next !== idea.title) onChange({ title: next });
    else setTitle(idea.title);
  };

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal mac-sheet" style={{ width: 'min(560px, 100%)' }} role="dialog" aria-modal="true" aria-label={idea.title}>
        <div className="flex items-center gap-2 px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="status-pip" style={{ background: STATUS_COLOR[idea.status] }} />
          <CustomSelect<IdeaStatus>
            value={idea.status}
            options={IDEA_STATUSES.map(s => ({ value: s, label: t(`ideas.status.${s}`) }))}
            onChange={v => { if (v) onChange({ status: v }); }}
            size="sm"
            variant="ghost"
            ariaLabel={t('ideas.statusLabel')}
          />
          <span className="text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
            {t('ideas.created', { when: relativeTime(Date.parse(idea.createdAt), i18n.language) })}
          </span>
          <div className="flex-1" />
          <button
            className={`idea-star${idea.starred ? ' on' : ''}`}
            onClick={() => onChange({ starred: !idea.starred })}
            aria-pressed={idea.starred}
            aria-label={t('ideas.star')}
            title={t('ideas.star')}
          >
            <IconStar size={16} />
          </button>
          <button className="icon-btn" onClick={onClose} aria-label={t('common.close')}><IconX size={16} /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className="idea-title-input"
            aria-label={t('ideas.titleLabel')}
            dir="auto"
          />
          <div>
            <label className="field-label" htmlFor="idea-notes">{t('ideas.notes')}</label>
            <textarea
              id="idea-notes"
              value={idea.notes}
              onChange={e => onChange({ notes: e.target.value })}
              placeholder={t('ideas.notesPlaceholder')}
              rows={7}
              className="mac-input"
              style={{ resize: 'vertical', minHeight: 140 }}
              dir="auto"
            />
            <p className="field-hint">{t('ideas.notesHint')}</p>
          </div>
          <div>
            <label className="field-label" htmlFor="idea-tags">{t('ideas.tags')}</label>
            <input
              id="idea-tags"
              value={tags}
              onChange={e => setTags(e.target.value)}
              onBlur={() => onChange({ tags: parseTags(tags) })}
              placeholder={t('ideas.tagsPlaceholder')}
              className="mac-input"
              dir="auto"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 px-5 py-3" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
          <button className="mac-btn mac-btn-destructive" onClick={onDelete}>
            <IconTrash size={14} />{t('common.delete')}
          </button>
          <div className="flex-1" />
          {idea.slug && (
            <span className="text-[11.5px] ui-mono truncate" style={{ color: 'var(--text-faint)' }}>{postFileName(profile, idea.slug)}</span>
          )}
          <button className="mac-btn mac-btn-primary" onClick={() => { commitTitle(); onChange({ tags: parseTags(tags) }); onWrite(title.trim() || idea.title); }}>
            {hasPost ? t('ideas.openPost') : t('ideas.startWriting')}
            <IconArrowRight size={14} mirror />
          </button>
        </div>
      </div>
    </div>
  );
}
