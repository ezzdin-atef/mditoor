import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { marked } from 'marked';
import { useRouter } from '../../../router';
import { COLORS, useStore } from '../../workspace/store';
import {
  EDITOR_FONT,
  EDITOR_FONT_SIZE,
  EDITOR_LINE_HEIGHT,
  useSettings,
} from '../../settings/store';
import { Toolbar } from '../components/Toolbar';
import { MetadataSidebar } from '../components/MetadataSidebar';
import {
  buildContent,
  defaultMeta,
  parseFrontmatter,
  type MetaValues,
} from '../utils/frontmatter';

type ViewMode = 'edit' | 'split' | 'preview';
type TextDir  = 'ltr' | 'rtl' | 'auto';

const MODE_ICONS: Record<ViewMode, string> = {
  edit:    '✏️',
  split:   '⚡',
  preview: '👁️',
};

export function EditorPage() {
  const { route, navigate } = useRouter();
  const { workspaces } = useStore();
  const settings = useSettings();

  if (route.page !== 'editor') return null;

  const workspace = workspaces.find(w => w.id === route.workspaceId) ?? null;
  const color     = workspace ? COLORS[workspace.colorIdx % COLORS.length] : COLORS[0];

  const [body,       setBodyRaw]    = useState('');
  const [meta,       setMeta]       = useState<MetaValues>({});
  const [viewMode,   setViewMode]   = useState<ViewMode>('edit');
  const [textDir,    setTextDir]    = useState<TextDir>('ltr');
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [dirty,      setDirty]      = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const setBody = useCallback((v: string) => {
    setBodyRaw(v);
    setDirty(true);
  }, []);

  useEffect(() => {
    if (!workspace) { setLoading(false); return; }
    if (route.isNew) {
      setMeta(defaultMeta(workspace.metadataFields));
      setBodyRaw('');
      setLoading(false);
      return;
    }
    invoke<string>('read_post', { mdxPath: workspace.mdxPath, slug: route.slug })
      .then(content => {
        const p = parseFrontmatter(content);
        setMeta(p.meta);
        setBodyRaw(p.body);
      })
      .catch(() => {
        setMeta(defaultMeta(workspace?.metadataFields ?? []));
        setBodyRaw('');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 's') { e.preventDefault(); save(); }
      if (mod && e.key === 'b') { e.preventDefault(); wrapInline('**'); }
      if (mod && e.key === 'i') { e.preventDefault(); wrapInline('*'); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [body, meta]);

  const wrapInline = (mark: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const s   = ta.selectionStart;
    const e   = ta.selectionEnd;
    const sel = body.slice(s, e) || 'text';
    setBody(body.slice(0, s) + mark + sel + mark + body.slice(e));
    requestAnimationFrame(() => {
      ta.setSelectionRange(s + mark.length, s + mark.length + sel.length);
      ta.focus();
    });
  };

  const save = async () => {
    if (!workspace || saving) return;
    setSaving(true);
    setSaveStatus('saving');
    try {
      const content = buildContent(workspace.metadataFields, meta, body);
      await invoke('write_post', { mdxPath: workspace.mdxPath, slug: route.slug, content });
      setDirty(false);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      setSaving(false);
    }
  };

  const editorStyle = {
    fontFamily: EDITOR_FONT[settings.editorFont],
    fontSize:   EDITOR_FONT_SIZE[settings.editorFontSize],
    lineHeight: EDITOR_LINE_HEIGHT[settings.editorLineHeight],
  };

  const previewHtml = (() => {
    try { return marked.parse(body) as string; }
    catch { return body; }
  })();

  if (!workspace) {
    return (
      <div
        className="flex flex-col items-center justify-center h-screen gap-5 animate-slide-up"
        style={{ background: 'var(--bg)' }}
      >
        <div className="text-7xl animate-float select-none">😱</div>
        <p className="text-lg font-black" style={{ color: 'var(--text)' }}>Workspace not found!</p>
        <button
          onClick={() => navigate({ page: 'workspace' })}
          className="joy-btn px-6 py-3 rounded-2xl text-white font-black text-sm"
          style={{
            background: 'linear-gradient(135deg, #a78bfa, #7c3aed)',
            boxShadow: '0 6px 22px rgba(167,139,250,0.42)',
          }}
        >
          ← Go back
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{ background: 'var(--bg)' }}
    >
      {/* ═══ Header ═══ */}
      <header
        className="flex items-center gap-3 px-4 flex-shrink-0"
        style={{
          background: 'var(--sb-bg)',
          borderBottom: '1px solid var(--sb-border)',
          minHeight: '52px',
        }}
      >
        {/* Back + workspace badge */}
        <button
          onClick={() => navigate({ page: 'workspace' })}
          className="joy-btn flex items-center gap-2 flex-shrink-0"
        >
          <span className="text-sm leading-none" style={{ color: 'var(--sb-muted)' }}>←</span>
          <div
            className="w-6 h-6 rounded-xl flex items-center justify-center text-white text-[11px] font-black"
            style={{
              background: `linear-gradient(135deg, ${color.start}, ${color.end})`,
              boxShadow: `0 2px 8px ${color.start}55`,
            }}
          >
            {workspace.name[0]?.toUpperCase() ?? '?'}
          </div>
          <span
            className="text-xs font-bold hidden sm:block"
            style={{ color: 'var(--sb-muted)' }}
          >
            {workspace.name}
          </span>
        </button>

        {/* Divider */}
        <div
          className="w-px h-4 flex-shrink-0"
          style={{ background: 'var(--sb-border)' }}
        />

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 min-w-0 flex-1">
          <span
            className="text-xs font-mono font-bold truncate"
            style={{ color: 'rgba(234,213,255,0.55)' }}
          >
            {route.slug}
          </span>
          <span
            className="text-xs font-mono flex-shrink-0"
            style={{ color: 'rgba(234,213,255,0.2)' }}
          >
            /index.mdx
          </span>
          {route.isNew && (
            <span
              className="ml-1 text-[10px] px-2 py-0.5 rounded-full font-black flex-shrink-0 animate-pop"
              style={{ background: 'rgba(167,139,250,0.25)', color: '#a78bfa' }}
            >
              new ✨
            </span>
          )}
        </div>

        {/* Save status indicators */}
        {dirty && saveStatus === 'idle' && (
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ background: color.start }}
            title="Unsaved changes"
          />
        )}
        {saveStatus === 'saving' && (
          <span
            className="text-[11px] font-black flex-shrink-0"
            style={{ color: 'rgba(234,213,255,0.45)' }}
          >
            Saving...
          </span>
        )}
        {saveStatus === 'saved' && (
          <span
            className="text-[11px] font-black flex-shrink-0 animate-pop"
            style={{ color: 'var(--joy-green)' }}
          >
            ✓ Saved!
          </span>
        )}
        {saveStatus === 'error' && (
          <span className="text-[11px] font-black flex-shrink-0" style={{ color: '#f87171' }}>
            ✕ Error
          </span>
        )}

        {/* View mode switcher */}
        <div
          className="flex items-center gap-0.5 p-1 rounded-2xl flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.07)' }}
        >
          {(['edit', 'split', 'preview'] as ViewMode[]).map(m => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              title={`${m[0].toUpperCase() + m.slice(1)} mode`}
              className="joy-btn flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black capitalize transition-all duration-150"
              style={
                viewMode === m
                  ? {
                      background: `linear-gradient(135deg, ${color.start}, ${color.end})`,
                      color: '#fff',
                      boxShadow: `0 2px 10px ${color.start}55`,
                    }
                  : { color: 'rgba(234,213,255,0.35)', background: 'transparent' }
              }
            >
              <span className="text-sm leading-none">{MODE_ICONS[m]}</span>
              <span className="hidden sm:inline">{m}</span>
            </button>
          ))}
        </div>

        {/* Save button */}
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="joy-btn flex-shrink-0 px-5 py-2 rounded-2xl text-xs font-black text-white disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            background: `linear-gradient(135deg, ${color.start}, ${color.end})`,
            boxShadow: dirty ? `0 4px 16px ${color.start}55` : 'none',
          }}
        >
          {saving ? '...' : '💾 Save'}
        </button>
      </header>

      {/* ═══ Body ═══ */}
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 animate-slide-up">
          <div className="text-5xl animate-spin-joy select-none">⭐</div>
          <p className="text-sm font-black" style={{ color: 'var(--text-faint)' }}>
            Loading post...
          </p>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Metadata sidebar */}
          {viewMode !== 'preview' && (
            <MetadataSidebar
              fields={workspace.metadataFields}
              values={meta}
              onChange={(key, val) => {
                setMeta(prev => ({ ...prev, [key]: val }));
                setDirty(true);
              }}
            />
          )}

          {/* Editor + preview */}
          <div className="flex-1 flex overflow-hidden">
            {/* Edit pane */}
            {(viewMode === 'edit' || viewMode === 'split') && (
              <div
                className="flex flex-col overflow-hidden"
                style={{
                  flex: viewMode === 'split' ? '0 0 50%' : '1 1 0',
                  borderRight: viewMode === 'split' ? '2px solid var(--border)' : 'none',
                }}
              >
                <Toolbar
                  textareaRef={textareaRef}
                  body={body}
                  setBody={setBody}
                  dir={textDir}
                  onDirChange={setTextDir}
                />

                <textarea
                  ref={textareaRef}
                  value={body}
                  dir={textDir}
                  onChange={e => setBody(e.target.value)}
                  onKeyDown={e => {
                    const ta = e.currentTarget;

                    if (e.key === 'Tab') {
                      e.preventDefault();
                      const s   = ta.selectionStart;
                      const nxt = body.slice(0, s) + '  ' + body.slice(s);
                      setBody(nxt);
                      requestAnimationFrame(() => ta.setSelectionRange(s + 2, s + 2));
                      return;
                    }

                    if (e.key === 'Enter' && !e.shiftKey && ta.selectionStart === ta.selectionEnd) {
                      const s         = ta.selectionStart;
                      const lineStart = body.lastIndexOf('\n', s - 1) + 1;
                      const line      = body.slice(lineStart, s);

                      const bulletM  = /^(\s*)([-*+])\s(.*)$/.exec(line);
                      const orderedM = /^(\s*)(\d+)\.\s(.*)$/.exec(line);
                      const quoteM   = /^(>+\s?)(.*)$/.exec(line);

                      if (bulletM) {
                        e.preventDefault();
                        const [, indent, marker, content] = bulletM;
                        if (!content.trim()) {
                          setBody(body.slice(0, lineStart) + body.slice(s));
                          requestAnimationFrame(() => { ta.setSelectionRange(lineStart, lineStart); ta.focus(); });
                        } else {
                          const cont = `\n${indent}${marker} `;
                          setBody(body.slice(0, s) + cont + body.slice(s));
                          requestAnimationFrame(() => { ta.setSelectionRange(s + cont.length, s + cont.length); ta.focus(); });
                        }
                      } else if (orderedM) {
                        e.preventDefault();
                        const [, indent, numStr, content] = orderedM;
                        if (!content.trim()) {
                          setBody(body.slice(0, lineStart) + body.slice(s));
                          requestAnimationFrame(() => { ta.setSelectionRange(lineStart, lineStart); ta.focus(); });
                        } else {
                          const cont = `\n${indent}${parseInt(numStr, 10) + 1}. `;
                          setBody(body.slice(0, s) + cont + body.slice(s));
                          requestAnimationFrame(() => { ta.setSelectionRange(s + cont.length, s + cont.length); ta.focus(); });
                        }
                      } else if (quoteM) {
                        e.preventDefault();
                        const [, prefix, content] = quoteM;
                        if (!content.trim()) {
                          setBody(body.slice(0, lineStart) + body.slice(s));
                          requestAnimationFrame(() => { ta.setSelectionRange(lineStart, lineStart); ta.focus(); });
                        } else {
                          const cont = `\n${prefix}`;
                          setBody(body.slice(0, s) + cont + body.slice(s));
                          requestAnimationFrame(() => { ta.setSelectionRange(s + cont.length, s + cont.length); ta.focus(); });
                        }
                      }
                    }
                  }}
                  spellCheck
                  placeholder={
                    textDir === 'rtl'
                      ? 'ابدأ الكتابة هنا…\n\nنصائح:\n  - استخدم شريط الأدوات لتنسيق النص\n  - Ctrl+B للخط العريض، Ctrl+I للمائل\n  - Ctrl+S للحفظ'
                      : 'Start writing your MDX here…\n\nTips:\n  · Toolbar above formats selected text\n  · Ctrl+B bold  ·  Ctrl+I italic\n  · Ctrl+S save  ·  Tab inserts 2 spaces'
                  }
                  className="flex-1 resize-none focus:outline-none"
                  style={{
                    ...editorStyle,
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    caretColor: color.start,
                    padding: '2rem 2.5rem',
                    unicodeBidi: textDir === 'rtl' ? 'plaintext' : undefined,
                  }}
                />
              </div>
            )}

            {/* Preview pane */}
            {(viewMode === 'preview' || viewMode === 'split') && (
              <div
                className="flex-1 overflow-y-auto"
                style={{ background: 'var(--surface)' }}
              >
                {body.trim() === '' ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-8">
                    <div className="text-5xl mb-4 select-none animate-float opacity-30">📄</div>
                    <p className="text-sm font-black" style={{ color: 'var(--text-faint)' }}>
                      Nothing to preview yet
                    </p>
                    <p className="text-xs mt-1 font-bold" style={{ color: 'var(--text-faint)' }}>
                      Switch to Edit mode and start writing.
                    </p>
                  </div>
                ) : (
                  <div
                    dir={textDir}
                    className="prose max-w-2xl mx-auto px-10 py-10"
                    style={{ color: 'var(--text)' }}
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
