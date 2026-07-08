import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { useConfirmDialog } from '../../../components/ConfirmDialog';

interface GitFile {
  path: string;
  staged: string;
  unstaged: string;
}

interface GitStatusData {
  is_repo: boolean;
  branch: string;
  remote: string | null;
  ahead: number;
  behind: number;
  files: GitFile[];
}

interface GitCommit {
  hash: string;
  date: string;
  author: string;
  message: string;
}

interface OpState {
  running: boolean;
  output: string | null;
  error: string | null;
}

const IDLE: OpState = { running: false, output: null, error: null };

const STATUS_META: Record<string, { labelKey: string; color: string }> = {
  M:   { labelKey: 'modified',  color: 'var(--accent)'      },
  A:   { labelKey: 'added',     color: 'var(--green)'       },
  D:   { labelKey: 'deleted',   color: 'var(--red)'         },
  R:   { labelKey: 'renamed',   color: 'var(--orange)'      },
  C:   { labelKey: 'copied',    color: 'var(--orange)'      },
  U:   { labelKey: 'conflict',  color: 'var(--orange)'      },
  '?': { labelKey: 'untracked', color: 'var(--text-muted)'  },
};

function statusMeta(c: string) {
  return STATUS_META[c] ?? { labelKey: c, color: 'var(--text-muted)' };
}

function isStaged(f: GitFile)   { return f.staged !== ' ' && f.staged !== '?'; }
function isUnstaged(f: GitFile) { return f.unstaged !== ' ' || f.staged === '?'; }

// ── Diff renderer ─────────────────────────────────────────────────────────────

function DiffView({ diff }: { diff: string }) {
  const { t } = useTranslation();
  if (!diff.trim()) {
    return (
      <p className="text-[11px] px-3 py-2 italic" style={{ color: 'var(--text-faint)' }}>
        {t('git.noDiff')}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto text-[11px] mac-input-mono dir-ltr" style={{ background: 'var(--sb-bg)' }}>
      {diff.split('\n').map((line, i) => {
        let color = 'var(--text-faint)';
        let bg = 'transparent';
        if (line.startsWith('+') && !line.startsWith('+++'))      { color = 'var(--green)'; bg = 'color-mix(in srgb, var(--green) 8%, transparent)'; }
        else if (line.startsWith('-') && !line.startsWith('---')) { color = 'var(--red)';   bg = 'color-mix(in srgb, var(--red) 8%, transparent)'; }
        else if (line.startsWith('@@'))                           { color = 'var(--teal)';  bg = 'color-mix(in srgb, var(--teal) 6%, transparent)'; }
        else if (!line.startsWith('---') && !line.startsWith('+++') && !line.startsWith('diff ') && !line.startsWith('index ')) {
          color = 'var(--text)';
        }
        return (
          <div key={i} style={{ color, background: bg, padding: '1px 12px', whiteSpace: 'pre', lineHeight: '1.65' }}>
            {line || ' '}
          </div>
        );
      })}
    </div>
  );
}

// ── File row ──────────────────────────────────────────────────────────────────

function FileRow({ file, mdxPath, section, onAction }: {
  file: GitFile;
  mdxPath: string;
  section: 'staged' | 'unstaged';
  onAction: () => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [diff, setDiff]         = useState<string | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [busy, setBusy] = useState(false);
  const { confirm, confirmationDialog } = useConfirmDialog();

  const toggleDiff = async () => {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (diff !== null) return;
    setLoadingDiff(true);
    try {
      const d = await invoke<string>('git_diff_file', { mdxPath, filePath: file.path });
      setDiff(d);
    } finally {
      setLoadingDiff(false);
    }
  };

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await onAction(); } finally { setBusy(false); }
  };

  const handleStage   = () => act(() => invoke('git_stage_file',   { mdxPath, filePath: file.path }));
  const handleUnstage = () => act(() => invoke('git_unstage_file', { mdxPath, filePath: file.path }));
  const handleDiscard = async () => {
    const confirmed = await confirm({
      title: t('git.discardTitle'),
      message: t('git.discardConfirm', { path: file.path }),
      confirmLabel: t('git.discard'),
    });
    if (!confirmed) return;
    void act(() => invoke('git_discard_file', { mdxPath, filePath: file.path }));
  };

  const isUntracked = file.staged === '?';
  const statusChar  = section === 'staged' ? file.staged : file.unstaged;
  const meta        = isUntracked ? statusMeta('?') : statusMeta(statusChar);

  return (
    <div
      className="overflow-hidden transition-all"
      style={{ border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)' }}
    >
      <div className="flex items-center gap-2.5 px-3 py-2 group">
        <span
          className="text-[9px] font-bold mac-input-mono px-1.5 py-px flex-shrink-0"
          style={{ background: `color-mix(in srgb, ${meta.color} 12%, transparent)`, color: meta.color, borderRadius: 3 }}
        >
          {t(`git.status.${meta.labelKey}`, { defaultValue: meta.labelKey })}
        </span>

        <button onClick={toggleDiff} className="flex-1 min-w-0 text-left" title={t('git.toggleDiff')}>
          <span className="text-xs mac-input-mono truncate block" style={{ color: 'var(--text)' }}>
            {file.path}
          </span>
        </button>

        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {section === 'unstaged' && !isUntracked && (
            <button
              onClick={handleDiscard}
              disabled={busy}
              className="text-[10px] px-2 py-0.5 disabled:opacity-40 transition-colors"
              style={{ color: 'var(--red)', background: 'color-mix(in srgb, var(--red) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--red) 30%, transparent)', borderRadius: 4 }}
            >
              {t('git.discard')}
            </button>
          )}
          {section === 'staged' && (
            <button
              onClick={handleUnstage}
              disabled={busy}
              className="mac-btn text-[10px] px-2 py-0.5 disabled:opacity-40"
            >
              {t('git.unstage')}
            </button>
          )}
          {section === 'unstaged' && (
            <button
              onClick={handleStage}
              disabled={busy}
              className="mac-btn mac-btn-primary text-[10px] px-2 py-0.5 disabled:opacity-40"
            >
              {t('git.stage')}
            </button>
          )}
          <button
            onClick={toggleDiff}
            className="w-5 h-5 flex items-center justify-center transition-colors"
            style={{ color: 'var(--text-faint)', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 10 }}
          >
            {expanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {loadingDiff
            ? <p className="text-[11px] px-3 py-2" style={{ color: 'var(--text-faint)' }}>{t('common.loading')}</p>
            : <DiffView diff={diff ?? ''} />}
        </div>
      )}

      {confirmationDialog}
    </div>
  );
}

// ── Commit row ────────────────────────────────────────────────────────────────

function CommitRow({ commit, mdxPath }: { commit: GitCommit; mdxPath: string }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [show, setShow]         = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  const toggle = async () => {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (show !== null) return;
    setLoading(true);
    try {
      const d = await invoke<string>('git_show_commit', { mdxPath, hash: commit.hash });
      setShow(d);
    } catch { setShow(''); } finally { setLoading(false); }
  };

  return (
    <div
      className="overflow-hidden"
      style={{ border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)' }}
    >
      <button onClick={toggle} className="w-full flex items-center gap-3 px-3 py-2.5 text-left group">
        <span
          className="text-[9px] mac-input-mono flex-shrink-0 px-1.5 py-px"
          style={{ background: 'var(--surface-2)', color: 'var(--text-faint)', borderRadius: 3, letterSpacing: '0.04em' }}
        >
          {commit.hash.slice(0, 7)}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>{commit.message}</p>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-faint)' }}>
            {commit.author} · {commit.date}
          </p>
        </div>
        <span className="text-[10px] flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-faint)' }}>
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {loading
            ? <p className="text-[11px] px-3 py-2" style={{ color: 'var(--text-faint)' }}>{t('common.loading')}</p>
            : <DiffView diff={show ?? ''} />}
        </div>
      )}
    </div>
  );
}

// ── Op banner ─────────────────────────────────────────────────────────────────

function OpBanner({ output, error, onDismiss }: {
  output: string | null;
  error: string | null;
  onDismiss: () => void;
}) {
  return (
    <div
      className="p-3 mac-fade-slide"
      style={{
        background: error ? 'color-mix(in srgb, var(--red) 8%, transparent)' : 'color-mix(in srgb, var(--green) 8%, transparent)',
        border: `1px solid ${error ? 'color-mix(in srgb, var(--red) 30%, transparent)' : 'color-mix(in srgb, var(--green) 30%, transparent)'}`,
        borderRadius: 6,
      }}
    >
      <div className="flex items-start gap-2">
        <pre
          className="text-[11px] mac-input-mono whitespace-pre-wrap flex-1 min-w-0 m-0"
          style={{ color: error ? 'var(--red)' : 'var(--green)' }}
        >
          {error ?? output}
        </pre>
        <button
          onClick={onDismiss}
          style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0, opacity: 0.6 }}
        >
          &times;
        </button>
      </div>
    </div>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ label, count, color, action }: {
  label: string;
  count: number;
  color?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold" style={{ color: color ?? 'var(--text-muted)' }}>
          {label}
        </span>
        <span
          className="text-[10px] px-1.5 py-px font-medium"
          style={{ background: `color-mix(in srgb, ${color ?? 'var(--text-muted)'} 12%, transparent)`, color: color ?? 'var(--text-muted)', borderRadius: 10 }}
        >
          {count}
        </span>
      </div>
      {action}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function GitPanel({ mdxPath }: { mdxPath: string }) {
  const { t } = useTranslation();
  const [status, setStatus]       = useState<GitStatusData | null>(null);
  const [commits, setCommits]     = useState<GitCommit[]>([]);
  const [tab, setTab]             = useState<'changes' | 'log'>('changes');
  const [commitMsg, setCommitMsg] = useState('');
  const [loading, setLoading]     = useState(false);
  const [commitOp, setCommitOp]   = useState<OpState>(IDLE);
  const [pushOp, setPushOp]       = useState<OpState>(IDLE);
  const [pullOp, setPullOp]       = useState<OpState>(IDLE);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([
        invoke<GitStatusData>('git_status', { mdxPath }),
        invoke<GitCommit[]>('git_log', { mdxPath }).catch(() => [] as GitCommit[]),
      ]);
      setStatus(s);
      setCommits(c);
    } finally {
      setLoading(false);
    }
  }, [mdxPath]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleInit = async () => {
    try { await invoke('git_init', { mdxPath }); await refresh(); } catch { /* ignore */ }
  };

  const runCommit = async (stageAll: boolean) => {
    if (!commitMsg.trim()) return;
    setCommitOp({ running: true, output: null, error: null });
    try {
      const out = await invoke<string>(
        stageAll ? 'git_commit' : 'git_commit_staged',
        { mdxPath, message: commitMsg.trim() },
      );
      setCommitOp({ running: false, output: out, error: null });
      setCommitMsg('');
      await refresh();
    } catch (e) {
      setCommitOp({ running: false, output: null, error: String(e) });
    }
  };

  const handleStageAll = async () => {
    try { await invoke('git_stage_file', { mdxPath, filePath: '.' }); await refresh(); } catch { /* ignore */ }
  };

  const handlePush = async () => {
    setPushOp({ running: true, output: null, error: null });
    try {
      setPushOp({ running: false, output: await invoke<string>('git_push', { mdxPath }), error: null });
      await refresh();
    } catch (e) { setPushOp({ running: false, output: null, error: String(e) }); }
  };

  const handlePull = async () => {
    setPullOp({ running: true, output: null, error: null });
    try {
      setPullOp({ running: false, output: await invoke<string>('git_pull', { mdxPath }), error: null });
      await refresh();
    } catch (e) { setPullOp({ running: false, output: null, error: String(e) }); }
  };

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm" style={{ color: 'var(--text-faint)' }}>{t('common.loading')}</p>
      </div>
    );
  }
  if (!status) return null;

  if (!status.is_repo) {
    return (
      <div className="text-center py-16 mac-fade-in">
        <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>{t('git.notRepo')}</p>
        <p className="text-xs mb-5 max-w-xs mx-auto" style={{ color: 'var(--text-muted)' }}>
          {t('git.notRepoHint')}
        </p>
        <button onClick={handleInit} className="mac-btn mac-btn-primary">{t('git.initializeRepo')}</button>
      </div>
    );
  }

  const staged   = status.files.filter(isStaged);
  const unstaged = status.files.filter(isUnstaged);
  const anyBusy  = pushOp.running || pullOp.running;

  return (
    <div className="mac-fade-in space-y-3">

      {/* ── Branch bar ── */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 flex-wrap"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}
      >
        {/* Branch name */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style={{ color: 'var(--accent)', flexShrink: 0 }}>
            <path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm0 2.122a2.25 2.25 0 1 0-1.5 0v.878A2.25 2.25 0 0 0 5.75 8.5h1.5v2.128a2.251 2.251 0 1 0 1.5 0V8.5h1.5a2.25 2.25 0 0 0 2.25-2.25v-.878a2.25 2.25 0 1 0-1.5 0v.878a.75.75 0 0 1-.75.75h-4.5A.75.75 0 0 1 5 6.25v-.878zm3.75 7.378a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm3-8.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0z"/>
          </svg>
          <span
            className="text-xs font-semibold mac-input-mono px-2 py-0.5"
            style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)', color: 'var(--accent)', borderRadius: 4 }}
          >
            {status.branch || 'HEAD'}
          </span>
        </div>

        {(status.ahead > 0 || status.behind > 0) && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {status.ahead > 0 && (
              <span className="text-[10px] font-medium px-1.5 py-px" style={{ color: 'var(--green)', background: 'color-mix(in srgb, var(--green) 10%, transparent)', borderRadius: 4 }}>
                ↑{status.ahead}
              </span>
            )}
            {status.behind > 0 && (
              <span className="text-[10px] font-medium px-1.5 py-px" style={{ color: 'var(--orange)', background: 'color-mix(in srgb, var(--orange) 10%, transparent)', borderRadius: 4 }}>
                ↓{status.behind}
              </span>
            )}
          </div>
        )}

        {status.remote && (
          <span
            className="text-[10px] mac-input-mono truncate flex-1 min-w-0"
            style={{ color: 'var(--text-faint)' }}
            title={status.remote}
          >
            {status.remote.replace(/^https?:\/\//, '').replace(/\.git$/, '')}
          </span>
        )}

        <div className="flex items-center gap-1 flex-shrink-0" style={{ marginInlineStart: 'auto' }}>
          <button
            onClick={handlePull}
            disabled={anyBusy || !status.remote}
            className="mac-btn text-[11px] disabled:opacity-40"
            title={!status.remote ? t('git.noRemote') : t('git.pull')}
          >
            {pullOp.running ? '…' : `↓ ${t('git.pull')}`}
          </button>
          <button
            onClick={handlePush}
            disabled={anyBusy || !status.remote}
            className="mac-btn text-[11px] disabled:opacity-40"
            title={!status.remote ? t('git.noRemote') : t('git.push')}
          >
            {pushOp.running ? '…' : `↑ ${t('git.push')}`}
          </button>
          <button
            onClick={refresh}
            disabled={loading}
            className="mac-btn text-[11px] disabled:opacity-40"
            title={t('git.refresh')}
          >
            {loading ? '…' : '↺'}
          </button>
        </div>
      </div>

      {/* Op banners */}
      {(pushOp.output || pushOp.error) && (
        <OpBanner output={pushOp.output} error={pushOp.error} onDismiss={() => setPushOp(IDLE)} />
      )}
      {(pullOp.output || pullOp.error) && (
        <OpBanner output={pullOp.output} error={pullOp.error} onDismiss={() => setPullOp(IDLE)} />
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-0" style={{ borderBottom: '1px solid var(--border)' }}>
        {(['changes', 'log'] as const).map(tabKey => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className="px-4 py-2 text-xs font-medium capitalize transition-colors"
            style={
              tab === tabKey
                ? { color: 'var(--accent)', borderBottom: '2px solid var(--accent)', background: 'transparent', marginBottom: -1 }
                : { color: 'var(--text-muted)', borderBottom: '2px solid transparent', background: 'transparent', marginBottom: -1 }
            }
          >
            {tabKey === 'changes'
              ? `${t('git.changes')}${status.files.length > 0 ? ` (${status.files.length})` : ''}`
              : `${t('git.log')}${commits.length > 0 ? ` (${commits.length})` : ''}`}
          </button>
        ))}
      </div>

      {/* ── Changes tab ── */}
      {tab === 'changes' && (
        <div className="space-y-4">

          {status.files.length === 0 && (
            <div
              className="text-center py-10 border border-dashed"
              style={{ borderColor: 'var(--border-2)', borderRadius: 8 }}
            >
              <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>{t('git.clean')}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>{t('git.noChanges')}</p>
            </div>
          )}

          {staged.length > 0 && (
            <div>
              <SectionLabel label={t('git.staged')} count={staged.length} color="var(--green)" />
              <div className="space-y-1">
                {staged.map((f, i) => (
                  <FileRow key={i} file={f} mdxPath={mdxPath} section="staged" onAction={refresh} />
                ))}
              </div>
            </div>
          )}

          {unstaged.length > 0 && (
            <div>
              <SectionLabel
                label={t('git.unstaged')}
                count={unstaged.length}
                action={
                  <button onClick={handleStageAll} className="mac-btn text-[10px] px-2 py-0.5">
                    {t('git.stageAll')}
                  </button>
                }
              />
              <div className="space-y-1">
                {unstaged.map((f, i) => (
                  <FileRow key={i} file={f} mdxPath={mdxPath} section="unstaged" onAction={refresh} />
                ))}
              </div>
            </div>
          )}

          {status.files.length > 0 && (
            <div
              style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--surface)' }}
            >
              <div className="px-3 pt-3 pb-2">
                <textarea
                  value={commitMsg}
                  onChange={e => setCommitMsg(e.target.value)}
                  onKeyDown={e => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      e.preventDefault();
                      runCommit(false);
                    }
                  }}
                  placeholder={t('git.commitPlaceholder')}
                  rows={3}
                  className="mac-input resize-none"
                  style={{ fontFamily: 'inherit', fontSize: '12px', background: 'var(--surface-2)' }}
                />
              </div>
              <div
                className="flex items-center justify-between gap-2 px-3 py-2"
                style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}
              >
                <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>{t('git.commitShortcut')}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => runCommit(true)}
                    disabled={!commitMsg.trim() || commitOp.running}
                    className="mac-btn text-xs disabled:opacity-40"
                    title={t('git.stageAllAndCommit')}
                  >
                    {commitOp.running ? '…' : t('git.stageAllAndCommit')}
                  </button>
                  <button
                    onClick={() => runCommit(false)}
                    disabled={!commitMsg.trim() || commitOp.running || staged.length === 0}
                    className="mac-btn mac-btn-primary text-xs disabled:opacity-40"
                    title={staged.length === 0 ? t('git.stageFilesFirst') : undefined}
                  >
                    {commitOp.running ? '…' : t('git.commitStaged')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {(commitOp.output || commitOp.error) && (
            <OpBanner output={commitOp.output} error={commitOp.error} onDismiss={() => setCommitOp(IDLE)} />
          )}
        </div>
      )}

      {/* ── Log tab ── */}
      {tab === 'log' && (
        <div>
          {commits.length === 0 ? (
            <div
              className="text-center py-10 border border-dashed"
              style={{ borderColor: 'var(--border-2)', borderRadius: 8 }}
            >
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('git.noCommits')}</p>
            </div>
          ) : (
            <div className="space-y-1">
              {commits.map((c, i) => (
                <CommitRow key={i} commit={c} mdxPath={mdxPath} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
