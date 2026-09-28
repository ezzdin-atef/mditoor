import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { useConfirmDialog } from '../../../components/ConfirmDialog';
import { toast } from '../../../components/Toast';
import {
  IconArrowDown, IconArrowUp, IconBranch, IconCheck, IconChevronDown, IconCloudDown, IconCommit,
  IconFile, IconHistory, IconLink, IconMinus, IconPen, IconPlus, IconRefresh, IconSearch, IconSparkles, IconSync, IconUndo, IconX,
} from '../../../components/Icons';
import { MOD, colorFor, initials, relativeTime } from '../../../lib/ui';
import { DiffView } from './DiffView';

/* ─── Types ──────────────────────────────────────────────────────────── */

interface GitFile {
  path: string;
  orig_path: string | null;
  staged: string;
  unstaged: string;
  staged_stat: [number, number] | null;
  unstaged_stat: [number, number] | null;
}

interface GitStatusData {
  is_repo: boolean;
  branch: string;
  detached: boolean;
  has_commits: boolean;
  remote: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  files: GitFile[];
}

interface GitCommit {
  hash: string;
  short: string;
  date: string;
  timestamp: number;
  author: string;
  email: string;
  refs: string;
  message: string;
}

interface GitBranch {
  name: string;
  current: boolean;
  remote: boolean;
  upstream: string;
  updated: number;
}

type Section = 'staged' | 'unstaged';
type Op = 'fetch' | 'pull' | 'push' | 'sync' | 'commit' | 'branch' | null;

/* ─── Helpers ────────────────────────────────────────────────────────── */

const STATUS_META: Record<string, { key: string; color: string; letter: string }> = {
  M:   { key: 'modified',  color: 'var(--accent)', letter: 'M' },
  T:   { key: 'modified',  color: 'var(--accent)', letter: 'M' },
  A:   { key: 'added',     color: 'var(--green)',  letter: 'A' },
  D:   { key: 'deleted',   color: 'var(--red)',    letter: 'D' },
  R:   { key: 'renamed',   color: 'var(--orange)', letter: 'R' },
  C:   { key: 'copied',    color: 'var(--orange)', letter: 'C' },
  U:   { key: 'conflict',  color: 'var(--red)',    letter: '!' },
  '?': { key: 'untracked', color: 'var(--green)',  letter: 'U' },
};

const isConflict = (f: GitFile) =>
  f.staged === 'U' || f.unstaged === 'U' || (f.staged === 'A' && f.unstaged === 'A') || (f.staged === 'D' && f.unstaged === 'D');
const isStaged   = (f: GitFile) => !isConflict(f) && f.staged !== ' ' && f.staged !== '?';
const isUnstaged = (f: GitFile) => isConflict(f) || f.unstaged !== ' ' || f.staged === '?';

function splitPath(p: string) {
  const i = p.lastIndexOf('/');
  return i === -1 ? { dir: '', base: p } : { dir: p.slice(0, i + 1), base: p.slice(i + 1) };
}

function shortRemote(url: string) {
  return url.replace(/^https?:\/\//, '').replace(/^git@/, '').replace(/\.git$/, '').replace(':', '/');
}

function DiffStat({ stat }: { stat: [number, number] | null }) {
  if (!stat || (stat[0] === 0 && stat[1] === 0)) return null;
  return (
    <span className="diffstat">
      {stat[0] > 0 && <span className="add">+{stat[0]}</span>}
      {stat[1] > 0 && <span className="del">-{stat[1]}</span>}
    </span>
  );
}

/* ─── File row ───────────────────────────────────────────────────────── */

function FileRow({
  file, section, selected, busy, onSelect, onStage, onUnstage, onDiscard,
}: {
  file: GitFile;
  section: Section;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onStage: () => void;
  onUnstage: () => void;
  onDiscard: () => void;
}) {
  const { t } = useTranslation();
  const untracked = file.staged === '?';
  const conflict = isConflict(file);
  const code = conflict ? 'U' : untracked ? '?' : section === 'staged' ? file.staged : file.unstaged;
  const meta = STATUS_META[code] ?? { key: code, color: 'var(--text-muted)', letter: code };
  const { dir, base } = splitPath(file.path);
  const stat = section === 'staged' ? file.staged_stat : file.unstaged_stat;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      className={`git-file${selected ? ' selected' : ''}`}
      onClick={onSelect}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      title={file.orig_path ? `${file.orig_path} → ${file.path}` : file.path}
    >
      <span
        className="status-dot"
        style={{ background: `color-mix(in srgb, ${meta.color} 14%, transparent)`, color: meta.color }}
        title={t(`git.status.${meta.key}`, { defaultValue: meta.key })}
      >
        {meta.letter}
      </span>
      <span className="flex-1 min-w-0 flex items-baseline gap-1.5 overflow-hidden">
        <span className="text-[13px] font-medium truncate dir-ltr" style={{ flexShrink: 0, maxWidth: '100%' }}>{base}</span>
        {dir && <span className="text-[11px] truncate dir-ltr" style={{ color: 'var(--text-faint)' }}>{dir}</span>}
      </span>
      <DiffStat stat={stat} />
      <span className="git-file-actions" onClick={e => e.stopPropagation()}>
        {section === 'unstaged' && !untracked && !conflict && (
          <button className="icon-btn icon-btn-sm danger" disabled={busy} onClick={onDiscard} title={t('git.discard')} aria-label={t('git.discard')}>
            <IconUndo size={13} />
          </button>
        )}
        {section === 'unstaged' ? (
          <button className="icon-btn icon-btn-sm" disabled={busy} onClick={onStage} title={t('git.stage')} aria-label={t('git.stage')}>
            <IconPlus size={14} />
          </button>
        ) : (
          <button className="icon-btn icon-btn-sm" disabled={busy} onClick={onUnstage} title={t('git.unstage')} aria-label={t('git.unstage')}>
            <IconMinus size={14} />
          </button>
        )}
      </span>
    </div>
  );
}

/* ─── Branch picker ──────────────────────────────────────────────────── */

function BranchPicker({ mdxPath, status, disabled, onChanged }: {
  mdxPath: string;
  status: GitStatusData;
  disabled: boolean;
  onChanged: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setFilter('');
    invoke<GitBranch[]>('git_branches', { mdxPath }).then(setBranches).catch(() => setBranches([]));
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open, mdxPath]);

  const newName = filter.trim().replace(/\s+/g, '-');
  const q = filter.trim().toLowerCase();
  const matches = branches.filter(b => b.name.toLowerCase().includes(q));
  const exact = branches.some(b => b.name === newName);

  const run = async (fn: () => Promise<string>, success: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(success);
      setOpen(false);
      await onChanged();
    } catch (e) {
      toast.error(t('git.branchFailed'), String(e));
    } finally {
      setBusy(false);
    }
  };

  const switchTo = (b: GitBranch) => {
    if (b.current) { setOpen(false); return; }
    void run(() => invoke<string>('git_switch_branch', { mdxPath, name: b.name, remote: b.remote }),
      t('git.switchedTo', { name: b.remote ? b.name.split('/').slice(1).join('/') : b.name }));
  };

  const create = () => {
    if (!newName || exact) return;
    void run(() => invoke<string>('git_create_branch', { mdxPath, name: newName }), t('git.createdBranch', { name: newName }));
  };

  return (
    <div ref={ref} className="relative">
      <button className="branch-btn" onClick={() => setOpen(o => !o)} disabled={disabled} aria-expanded={open}>
        <IconBranch size={15} style={{ color: 'var(--accent)' }} />
        <span className="dir-ltr truncate max-w-[180px]">{status.branch || 'HEAD'}</span>
        {status.detached && <span className="badge badge-orange">{t('git.detached')}</span>}
        <IconChevronDown size={14} style={{ color: 'var(--text-faint)' }} />
      </button>

      {open && (
        <div className="popover mac-dropdown">
          <div className="p-2" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="search-field" style={{ maxWidth: 'none' }}>
              <IconSearch size={14} />
              <input
                autoFocus
                value={filter}
                onChange={e => setFilter(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { if (matches.length === 1) switchTo(matches[0]); else create(); } }}
                placeholder={t('git.branchFilter')}
                className="dir-ltr"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-1.5">
            {matches.length === 0 && !newName && (
              <p className="text-[12px] px-2 py-3" style={{ color: 'var(--text-faint)' }}>{t('git.noBranches')}</p>
            )}
            {matches.map(b => (
              <button key={b.name} className={`popover-item${b.current ? ' active' : ''}`} disabled={busy} onClick={() => switchTo(b)}>
                <span className="w-4 flex-shrink-0" style={{ color: 'var(--accent)' }}>{b.current && <IconCheck size={14} />}</span>
                <span className="flex-1 min-w-0 truncate dir-ltr" style={{ fontWeight: b.current ? 650 : 500 }}>{b.name}</span>
                {b.remote && <span className="badge">{t('git.remoteBranch')}</span>}
                <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--text-faint)' }}>
                  {relativeTime(b.updated * 1000, i18n.language)}
                </span>
              </button>
            ))}
          </div>
          {newName && !exact && (
            <div className="p-1.5" style={{ borderTop: '1px solid var(--border)' }}>
              <button className="popover-item" disabled={busy} onClick={create} style={{ color: 'var(--accent)' }}>
                <IconPlus size={14} />
                <span className="truncate">{t('git.createBranch')} <strong className="dir-ltr">{newName}</strong></span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Remote editor ──────────────────────────────────────────────────── */

function RemoteControl({ mdxPath, remote, onChanged }: { mdxPath: string; remote: string | null; onChanged: () => Promise<void> }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(remote ?? '');

  useEffect(() => { setUrl(remote ?? ''); }, [remote]);

  const save = async () => {
    if (!url.trim()) return;
    try {
      await invoke('git_set_remote', { mdxPath, url: url.trim() });
      toast.success(t('git.remoteSaved'));
      setEditing(false);
      await onChanged();
    } catch (e) {
      toast.error(t('git.remoteFailed'), String(e));
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 flex-1 min-w-[240px] mac-fade-in">
        <input
          autoFocus
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') setEditing(false); }}
          placeholder="https://github.com/you/blog.git"
          className="mac-input mac-input-mono"
          style={{ height: 32 }}
        />
        <button className="mac-btn mac-btn-primary mac-btn-sm" onClick={() => void save()} disabled={!url.trim()}>{t('common.save')}</button>
        <button className="icon-btn icon-btn-sm" onClick={() => setEditing(false)} aria-label={t('common.cancel')}><IconX size={13} /></button>
      </div>
    );
  }

  if (!remote) {
    return (
      <button className="mac-btn mac-btn-sm" onClick={() => setEditing(true)}>
        <IconLink size={13} />{t('git.addRemote')}
      </button>
    );
  }

  return (
    <button
      className="inline-flex items-center gap-1.5 min-w-0 text-[12px] toolbar-btn px-2 py-1.5"
      onClick={() => setEditing(true)}
      title={remote}
    >
      <IconLink size={12} />
      <span className="truncate max-w-[260px] dir-ltr">{shortRemote(remote)}</span>
      <IconPen size={11} style={{ opacity: 0.6 }} />
    </button>
  );
}

/* ─── History ────────────────────────────────────────────────────────── */

function CommitItem({ commit, mdxPath, open, onToggle }: {
  commit: GitCommit;
  mdxPath: string;
  open: boolean;
  onToggle: () => void;
}) {
  const { i18n } = useTranslation();
  const [detail, setDetail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || detail !== null) return;
    setLoading(true);
    invoke<string>('git_show_commit', { mdxPath, hash: commit.hash })
      .then(setDetail)
      .catch(() => setDetail(''))
      .finally(() => setLoading(false));
  }, [open, detail, mdxPath, commit.hash]);

  const refs = commit.refs.split(',').map(r => r.trim().replace(/^HEAD -> /, '')).filter(r => r && r !== 'HEAD');

  return (
    <div>
      <div
        className={`timeline-item${open ? ' open' : ''}`}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={e => { if (e.key === 'Enter') onToggle(); }}
      >
        <div className="timeline-rail">
          <span className="avatar" style={{ background: colorFor(commit.email || commit.author) }} title={commit.author}>
            {initials(commit.author)}
          </span>
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[13.5px] font-semibold truncate" style={{ color: 'var(--text)' }} dir="auto">{commit.message}</span>
            {refs.map(r => (
              <span key={r} className={`badge ${r.startsWith('tag:') ? 'badge-orange' : r.includes('/') ? '' : 'badge-accent'} dir-ltr`}>
                {r.replace(/^tag: /, '# ')}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
            <span>{commit.author}</span>
            <span style={{ color: 'var(--text-faint)' }}>·</span>
            <span title={commit.date}>{relativeTime(commit.timestamp * 1000, i18n.language)}</span>
          </div>
        </div>
        <span className="ui-mono text-[11.5px] flex-shrink-0 pt-1" style={{ color: 'var(--text-faint)' }}>{commit.short}</span>
      </div>
      {open && (
        <div className="panel mac-fade-slide" style={{ margin: '4px 0 12px', marginInlineStart: 52, maxHeight: 520, overflow: 'auto' }}>
          {loading ? <div className="p-4"><div className="skeleton" style={{ height: 60 }} /></div> : <DiffView diff={detail ?? ''} />}
        </div>
      )}
    </div>
  );
}

/* ─── Main ───────────────────────────────────────────────────────────── */

export function GitPanel({ mdxPath, onChangeCount }: { mdxPath: string; onChangeCount?: (n: number) => void }) {
  const { t } = useTranslation();
  const { confirm, confirmationDialog } = useConfirmDialog();
  const [status, setStatus]       = useState<GitStatusData | null>(null);
  const [commits, setCommits]     = useState<GitCommit[]>([]);
  const [tab, setTab]             = useState<'changes' | 'history'>('changes');
  const [loading, setLoading]     = useState(false);
  const [op, setOp]               = useState<Op>(null);
  const [fileBusy, setFileBusy]   = useState(false);
  const [message, setMessage]     = useState('');
  const [amend, setAmend]         = useState(false);
  const [selected, setSelected]   = useState<{ path: string; section: Section } | null>(null);
  const [diff, setDiff]           = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [openCommit, setOpenCommit]   = useState<string | null>(null);

  // Held in a ref so an inline parent callback can't retrigger the refresh effect.
  const onChangeCountRef = useRef(onChangeCount);
  onChangeCountRef.current = onChangeCount;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([
        invoke<GitStatusData>('git_status', { mdxPath }),
        invoke<GitCommit[]>('git_log', { mdxPath, limit: 150 }).catch(() => [] as GitCommit[]),
      ]);
      setStatus(s);
      setCommits(c);
      onChangeCountRef.current?.(s.files.length);
    } catch (e) {
      toast.error(t('git.statusFailed'), String(e));
    } finally {
      setLoading(false);
    }
  }, [mdxPath, t]);

  useEffect(() => { setDiff(null); }, [selected?.path, selected?.section]);

  useEffect(() => {
    setSelected(null);
    setDiff(null);
    void refresh();
  }, [refresh]);

  // Files change outside the app (editor saves, terminal, IDE): refresh on focus.
  useEffect(() => {
    let last = Date.now();
    const onFocus = () => {
      if (Date.now() - last < 5000) return;
      last = Date.now();
      void refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  const staged   = useMemo(() => status?.files.filter(isStaged) ?? [], [status]);
  const unstaged = useMemo(() => status?.files.filter(isUnstaged) ?? [], [status]);

  // Keep the diff pane in sync with the selection; drop the selection if the file is gone.
  useEffect(() => {
    if (!selected || !status) { setDiff(null); return; }
    const list = selected.section === 'staged' ? staged : unstaged;
    const file = list.find(f => f.path === selected.path);
    if (!file) {
      const other = (selected.section === 'staged' ? unstaged : staged).find(f => f.path === selected.path);
      setSelected(other ? { path: other.path, section: selected.section === 'staged' ? 'unstaged' : 'staged' } : null);
      return;
    }
    let alive = true;
    setDiffLoading(true);
    invoke<string>('git_diff_file', {
      mdxPath,
      filePath: file.path,
      staged: selected.section === 'staged',
      untracked: file.staged === '?',
    })
      .then(d => { if (alive) setDiff(d); })
      .catch(e => { if (alive) setDiff(''); toast.error(t('git.diffFailed'), String(e)); })
      .finally(() => { if (alive) setDiffLoading(false); });
    return () => { alive = false; };
  }, [selected, status, staged, unstaged, mdxPath, t]);

  const fileAction = async (fn: () => Promise<unknown>) => {
    setFileBusy(true);
    try { await fn(); } catch (e) { toast.error(t('git.actionFailed'), String(e)); }
    finally { setFileBusy(false); await refresh(); }
  };

  const discard = async (f: GitFile) => {
    const ok = await confirm({
      title: t('git.discardTitle'),
      message: t('git.discardConfirm', { path: f.path }),
      confirmLabel: t('git.discard'),
    });
    if (ok) void fileAction(() => invoke('git_discard_file', { mdxPath, filePath: f.path }));
  };

  const remoteOp = async (kind: 'fetch' | 'pull' | 'push' | 'sync') => {
    setOp(kind);
    try {
      const out = await invoke<string>(`git_${kind}`, { mdxPath });
      toast.success(t(`git.done.${kind}`), out && out !== 'Done.' ? out : undefined);
    } catch (e) {
      toast.error(t(`git.failed.${kind}`), String(e));
    } finally {
      setOp(null);
      await refresh();
    }
  };

  const commit = async () => {
    const msg = message.trim();
    if (!msg || !status) return;
    setOp('commit');
    try {
      if (staged.length > 0 || amend) {
        await invoke('git_commit_staged', { mdxPath, message: msg, amend });
      } else {
        await invoke('git_commit', { mdxPath, message: msg });
      }
      toast.success(amend ? t('git.amended') : t('git.committed'), msg.split('\n')[0]);
      setMessage('');
      setAmend(false);
      setSelected(null);
    } catch (e) {
      toast.error(t('git.commitFailed'), String(e));
    } finally {
      setOp(null);
      await refresh();
    }
  };

  const toggleAmend = () => {
    const next = !amend;
    setAmend(next);
    if (next && !message.trim() && commits[0]) setMessage(commits[0].message);
  };

  /* ── Render states ── */

  if (!status) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="skeleton" style={{ height: 62, borderRadius: 14 }} />
        <div className="skeleton" style={{ height: 280, borderRadius: 14 }} />
      </div>
    );
  }

  if (!status.is_repo) {
    return (
      <div className="empty-state mac-fade-in">
        <div className="empty-illustration">🌱</div>
        <p className="empty-state-title">{t('git.notRepo')}</p>
        <p className="empty-state-hint">{t('git.notRepoHint')}</p>
        <button
          onClick={async () => {
            try { await invoke('git_init', { mdxPath }); toast.success(t('git.initialized')); await refresh(); }
            catch (e) { toast.error(t('git.actionFailed'), String(e)); }
          }}
          className="mac-btn mac-btn-fun"
        >
          <IconSparkles size={15} />{t('git.initializeRepo')}
        </button>
      </div>
    );
  }

  const busy = op !== null;
  const hasRemote = Boolean(status.remote);
  const canCommit = message.trim() !== '' && !busy && (status.files.length > 0 || amend);
  const commitLabel = amend
    ? t('git.amendCommit')
    : staged.length > 0
      ? t('git.commitCount', { n: staged.length })
      : t('git.commitAll');

  const selectedFile = selected
    ? (selected.section === 'staged' ? staged : unstaged).find(f => f.path === selected.path)
    : undefined;

  return (
    <div className="space-y-4 mac-fade-in">
      {/* ── Hero: branch, remote, sync ── */}
      <div className="git-hero">
        <BranchPicker mdxPath={mdxPath} status={status} disabled={busy} onChanged={refresh} />

        {status.upstream ? (
          <div className="flex items-center gap-1.5">
            {status.ahead === 0 && status.behind === 0 ? (
              <span className="badge badge-green"><IconCheck size={11} />{t('git.upToDate')}</span>
            ) : (
              <>
                {status.ahead > 0 && <span className="badge badge-accent" title={t('git.aheadHint')}><IconArrowUp size={11} />{status.ahead}</span>}
                {status.behind > 0 && <span className="badge badge-orange" title={t('git.behindHint')}><IconArrowDown size={11} />{status.behind}</span>}
              </>
            )}
          </div>
        ) : hasRemote && status.has_commits ? (
          <span className="badge">{t('git.notPublished')}</span>
        ) : null}

        <RemoteControl mdxPath={mdxPath} remote={status.remote} onChanged={refresh} />

        <div className="flex items-center gap-1.5" style={{ marginInlineStart: 'auto' }}>
          <button className="icon-btn" onClick={() => void remoteOp('fetch')} disabled={busy || !hasRemote} title={t('git.fetch')} aria-label={t('git.fetch')}>
            <IconCloudDown size={16} className={op === 'fetch' ? 'spin' : undefined} />
          </button>
          <button className="mac-btn mac-btn-sm" onClick={() => void remoteOp('pull')} disabled={busy || !status.upstream} title={!status.upstream ? t('git.noUpstream') : undefined}>
            <IconArrowDown size={13} className={op === 'pull' ? 'spin' : undefined} />{t('git.pull')}
          </button>
          <button className="mac-btn mac-btn-sm" onClick={() => void remoteOp('push')} disabled={busy || !hasRemote || !status.has_commits} title={!hasRemote ? t('git.noRemote') : undefined}>
            <IconArrowUp size={13} className={op === 'push' ? 'spin' : undefined} />{t('git.push')}
          </button>
          <button className="mac-btn mac-btn-primary mac-btn-sm" onClick={() => void remoteOp('sync')} disabled={busy || !hasRemote || !status.has_commits}>
            <IconSync size={13} className={op === 'sync' ? 'spin' : undefined} />{t('git.sync')}
          </button>
          <button className="icon-btn" onClick={() => void refresh()} disabled={loading} title={t('git.refresh')} aria-label={t('git.refresh')}>
            <IconRefresh size={15} className={loading ? 'spin' : undefined} />
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="mac-segmented">
        <button className={`mac-segment${tab === 'changes' ? ' active' : ''}`} onClick={() => setTab('changes')}>
          <IconFile size={13} />{t('git.changes')}
          {status.files.length > 0 && <span className="tab-count attention">{status.files.length}</span>}
        </button>
        <button className={`mac-segment${tab === 'history' ? ' active' : ''}`} onClick={() => setTab('history')}>
          <IconHistory size={13} />{t('git.history')}
          {commits.length > 0 && <span className="tab-count">{commits.length}</span>}
        </button>
      </div>

      {tab === 'changes' ? (
        <div className="git-layout">
          {/* Left: commit box + file lists */}
          <div className="space-y-3">
            <div className="commit-box">
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                onKeyDown={e => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); if (canCommit) void commit(); }
                }}
                placeholder={t('git.commitPlaceholder')}
                rows={3}
                dir="auto"
              />
              <div className="flex items-center gap-2 px-3 pb-3 pt-1">
                {status.has_commits && (
                  <label className="inline-flex items-center gap-1.5 text-[12px] cursor-pointer select-none" style={{ color: 'var(--text-muted)' }}>
                    <input type="checkbox" checked={amend} onChange={toggleAmend} />
                    {t('git.amend')}
                  </label>
                )}
                <span className="text-[11px] hidden xl:inline" style={{ color: 'var(--text-faint)' }}>{MOD}Enter</span>
                <button className="mac-btn mac-btn-primary mac-btn-sm" style={{ marginInlineStart: 'auto' }} onClick={() => void commit()} disabled={!canCommit}>
                  <IconCommit size={14} className={op === 'commit' ? 'spin' : undefined} />{commitLabel}
                </button>
              </div>
            </div>

            {status.files.length === 0 ? (
              <div className="panel">
                <div className="empty-state" style={{ padding: '36px 20px' }}>
                  <div className="empty-illustration" style={{ width: 64, height: 64, fontSize: 28, borderRadius: 20 }}>✨</div>
                  <p className="empty-state-title">{t('git.clean')}</p>
                  <p className="empty-state-hint" style={{ marginBottom: 0 }}>{t('git.noChanges')}</p>
                </div>
              </div>
            ) : (
              <div className="panel" style={{ paddingBottom: 6 }}>
                {staged.length > 0 && (
                  <>
                    <div className="git-section-title">
                      <span className="inline-flex items-center gap-2">{t('git.staged')}<span className="tab-count">{staged.length}</span></span>
                      <button className="toolbar-btn px-2 py-1 text-[11.5px]" disabled={fileBusy} onClick={() => void fileAction(() => invoke('git_unstage_all', { mdxPath }))}>
                        {t('git.unstageAll')}
                      </button>
                    </div>
                    <div className="px-1.5">
                      {staged.map(f => (
                        <FileRow
                          key={`s:${f.path}`}
                          file={f}
                          section="staged"
                          busy={fileBusy}
                          selected={selected?.section === 'staged' && selected.path === f.path}
                          onSelect={() => setSelected({ path: f.path, section: 'staged' })}
                          onStage={() => {}}
                          onUnstage={() => void fileAction(() => invoke('git_unstage_file', { mdxPath, filePath: f.path }))}
                          onDiscard={() => {}}
                        />
                      ))}
                    </div>
                  </>
                )}
                {unstaged.length > 0 && (
                  <>
                    <div className="git-section-title" style={staged.length > 0 ? { borderTop: '1px solid var(--border)', marginTop: 6 } : undefined}>
                      <span className="inline-flex items-center gap-2">{t('git.unstaged')}<span className="tab-count">{unstaged.length}</span></span>
                      <button className="toolbar-btn px-2 py-1 text-[11.5px]" disabled={fileBusy} onClick={() => void fileAction(() => invoke('git_stage_all', { mdxPath }))}>
                        {t('git.stageAll')}
                      </button>
                    </div>
                    <div className="px-1.5">
                      {unstaged.map(f => (
                        <FileRow
                          key={`u:${f.path}`}
                          file={f}
                          section="unstaged"
                          busy={fileBusy}
                          selected={selected?.section === 'unstaged' && selected.path === f.path}
                          onSelect={() => setSelected({ path: f.path, section: 'unstaged' })}
                          onStage={() => void fileAction(() => invoke('git_stage_file', { mdxPath, filePath: f.path }))}
                          onUnstage={() => {}}
                          onDiscard={() => void discard(f)}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Right: diff */}
          <div className="panel" style={{ position: 'sticky', top: 0, maxHeight: 'calc(100vh - 260px)', display: 'flex', flexDirection: 'column' }}>
            {selectedFile ? (
              <>
                <div className="panel-header" style={{ padding: '10px 14px' }}>
                  <div className="min-w-0">
                    <p className="panel-title truncate dir-ltr">{splitPath(selectedFile.path).base}</p>
                    <p className="panel-subtitle truncate dir-ltr">
                      {selectedFile.orig_path ? `${selectedFile.orig_path} → ${selectedFile.path}` : selectedFile.path}
                    </p>
                  </div>
                  <span className={`badge ${selected?.section === 'staged' ? 'badge-green' : 'badge-orange'}`}>
                    {selected?.section === 'staged' ? t('git.staged') : t('git.unstaged')}
                  </span>
                </div>
                <div className="flex-1 overflow-auto">
                  {diffLoading && diff === null
                    ? <div className="p-4 space-y-2">{[70, 90, 55, 80].map((w, i) => <div key={i} className="skeleton" style={{ width: `${w}%`, height: 12 }} />)}</div>
                    : <DiffView diff={diff ?? ''} showFileHeaders={false} />}
                </div>
              </>
            ) : (
              <div className="empty-state" style={{ padding: '56px 24px' }}>
                <div className="empty-illustration" style={{ width: 64, height: 64, fontSize: 28, borderRadius: 20 }}>👀</div>
                <p className="empty-state-title">{t('git.pickFile')}</p>
                <p className="empty-state-hint" style={{ marginBottom: 0 }}>{t('git.pickFileHint')}</p>
              </div>
            )}
          </div>
        </div>
      ) : commits.length === 0 ? (
        <div className="empty-state">
          <div className="empty-illustration">📜</div>
          <p className="empty-state-title">{t('git.noCommits')}</p>
          <p className="empty-state-hint">{t('git.noCommitsHint')}</p>
        </div>
      ) : (
        <div className="timeline">
          {commits.map(c => (
            <CommitItem
              key={c.hash}
              commit={c}
              mdxPath={mdxPath}
              open={openCommit === c.hash}
              onToggle={() => setOpenCommit(o => (o === c.hash ? null : c.hash))}
            />
          ))}
        </div>
      )}

      {confirmationDialog}
    </div>
  );
}
