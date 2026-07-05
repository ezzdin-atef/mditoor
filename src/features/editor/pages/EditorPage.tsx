import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { marked } from 'marked';
import { useTranslation } from 'react-i18next';
import { pickImageFile, uploadImage } from '../../assets/imageUpload';
import { useRouter } from '../../../router';
import { useStore } from '../../workspace/store';
import {
  EDITOR_FONT,
  EDITOR_FONT_SIZE,
  EDITOR_LINE_HEIGHT,
  useSettings,
} from '../../settings/store';
import { FloatingToolbar } from '../components/FloatingToolbar';
import { BlockEditor } from '../components/BlockEditor';
import { MetadataSidebar } from '../components/MetadataSidebar';
import {
  buildContent,
  defaultMeta,
  parseFrontmatter,
  type MetaValues,
} from '../utils/frontmatter';

type ViewMode = 'edit' | 'split' | 'preview';
type EditorMode = 'blocks' | 'markdown';

export function EditorPage() {
  const { route, navigate } = useRouter();
  const { workspaces } = useStore();
  const settings = useSettings();
  const { t } = useTranslation();

  if (route.page !== 'editor') return null;

  const workspace = workspaces.find(w => w.id === route.workspaceId) ?? null;

  const [body,       setBodyRaw]    = useState('');
  const [meta,       setMeta]       = useState<MetaValues>({});
  const [viewMode,   setViewMode]   = useState<ViewMode>('edit');
  const [editorMode, setEditorMode] = useState<EditorMode>('blocks');
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [dirty,      setDirty]      = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const setBody = useCallback((v: string) => {
    setBodyRaw(v);
    setDirty(true);
  }, []);

  useEffect(() => {
    if (!workspace) { setLoading(false); return; }
    setLoading(true);
    setSaveStatus('idle');
    setDirty(false);
    setUploadMessage(null);
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
      .finally(() => {
        setDirty(false);
        setLoading(false);
      });
  }, [workspace?.id, route.slug, route.isNew]);

  const save = useCallback(async () => {
    if (!workspace || saving || !dirty) return;
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
  }, [body, dirty, meta, route.slug, saving, workspace]);

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

  // Shared upload handler: pick a file → upload per workspace storage → return URL
  const handleUploadImage = useCallback(async (): Promise<string | null> => {
    if (!workspace) return null;
    try {
      const filePath = await pickImageFile();
      if (!filePath) return null;
      const url = await uploadImage(filePath, workspace.storage);
      setUploadMessage(null);
      return url;
    } catch (e) {
      console.error('Upload failed:', e);
      setUploadMessage(e instanceof Error ? e.message : t('storage.notConfiguredHint'));
      return null;
    }
  }, [t, workspace]);

  // Upload an image and insert MDX syntax at cursor
  const handleInsertImage = useCallback(async () => {
    const url = await handleUploadImage();
    if (!url) return;
    const filename = url.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'image';
    const md = `![${filename}](${url})`;
    const ta = textareaRef.current;
    if (ta) {
      const s = ta.selectionStart;
      setBody(body.slice(0, s) + md + body.slice(s));
      requestAnimationFrame(() => {
        ta.setSelectionRange(s + md.length, s + md.length);
        ta.focus();
      });
    } else {
      setBody(body + md);
    }
  }, [handleUploadImage, body, setBody]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 's') { e.preventDefault(); void save(); }
      if (mod && e.key === 'b') { e.preventDefault(); wrapInline('**'); }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        void handleInsertImage();
        return;
      }
      if (mod && e.key === 'i') { e.preventDefault(); wrapInline('*'); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [body, handleInsertImage, save]);

  useEffect(() => {
    if (!settings.autoSave || !dirty || loading || saving) return;
    const id = window.setTimeout(() => { void save(); }, settings.autoSaveInterval);
    return () => window.clearTimeout(id);
  }, [dirty, loading, save, saving, settings.autoSave, settings.autoSaveInterval]);

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
        className="flex flex-col items-center justify-center h-screen gap-4 mac-fade-in"
        style={{ background: 'var(--bg)' }}
      >
        <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{t('editor.notFound')}</p>
        <button
          onClick={() => navigate({ page: 'workspace' })}
          className="mac-btn mac-btn-primary"
        >
          {t('editor.goBack')}
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
        className="editor-header flex items-center gap-2 px-3 flex-shrink-0 border-b"
      >
        {/* Back */}
        <button
          onClick={() => navigate({ page: 'workspace' })}
          className="editor-back-btn flex items-center gap-1.5 flex-shrink-0"
        >
          <span className="rtl-mirror text-xs" style={{ color: 'var(--sb-muted)' }}>&larr;</span>
          <div
            className="editor-workspace-icon flex-shrink-0"
            aria-hidden="true"
          >
            {workspace.icon}
          </div>
          <span className="text-xs hidden sm:block" style={{ color: 'var(--sb-muted)' }}>
            {workspace.name}
          </span>
        </button>

        {/* Divider */}
        <div className="w-px h-3.5 flex-shrink-0" style={{ background: 'var(--sb-border)' }} />

        {/* Breadcrumb */}
        <div className="flex items-center gap-0.5 min-w-0 flex-1">
          <span
            className="text-xs mac-input-mono truncate"
            style={{ color: 'var(--sb-muted)' }}
          >
            {route.slug}
          </span>
          <span className="text-xs mac-input-mono flex-shrink-0" style={{ color: 'var(--sb-muted)', opacity: 0.45 }}>
            /index.mdx
          </span>
          {route.isNew && (
            <span
              className="text-[10px] px-1.5 py-0.5 flex-shrink-0 mac-fade-slide"
              style={{ marginInlineStart: '0.375rem', background: 'var(--accent-faint)', color: 'var(--accent)' }}
            >
              {t('editor.new')}
            </span>
          )}
        </div>

        {/* Save status */}
        {dirty && saveStatus === 'idle' && (
          <div
            className="editor-dirty-dot flex-shrink-0"
            title={t('editor.unsaved')}
          />
        )}
        {saveStatus === 'saving' && (
          <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--sb-muted)' }}>
            {t('editor.saving')}
          </span>
        )}
        {saveStatus === 'saved' && (
          <span className="text-[11px] flex-shrink-0 mac-fade-slide" style={{ color: 'var(--green)' }}>
            {t('editor.saved')}
          </span>
        )}
        {saveStatus === 'error' && (
          <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--red)' }}>{t('editor.error')}</span>
        )}

        {/* View mode segment control */}
        <div className="mac-segmented flex-shrink-0">
          {(['blocks', 'markdown'] as EditorMode[]).map(m => (
            <button
              key={m}
              onClick={() => setEditorMode(m)}
              title={t(`editor.${m}`)}
              className={`mac-segment${editorMode === m ? ' active' : ''}`}
            >
              {t(`editor.${m}`)}
            </button>
          ))}
        </div>

        <div className="mac-segmented flex-shrink-0">
          {(['edit', 'split', 'preview'] as ViewMode[]).map(m => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              title={t(`editor.${m}`)}
              className={`mac-segment${viewMode === m ? ' active' : ''}`}
            >
              {t(`editor.${m}`)}
            </button>
          ))}
        </div>

        {/* Save button */}
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="mac-btn mac-btn-primary flex-shrink-0 disabled:opacity-30"
        >
          {saving ? '...' : t('editor.save')}
        </button>
      </header>

      {/* ═══ Body ═══ */}
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <p className="text-sm" style={{ color: 'var(--text-faint)' }}>{t('common.loading')}</p>
        </div>
      ) : (
        <div className="editor-body flex-1 flex overflow-hidden">
          {/* Metadata sidebar */}
          {viewMode !== 'preview' && (
            <MetadataSidebar
              fields={workspace.metadataFields}
              values={meta}
              onChange={(key, val) => {
                setMeta(prev => ({ ...prev, [key]: val }));
                setDirty(true);
              }}
              body={body}
              slug={route.slug}
              onUploadImage={handleUploadImage}
            />
          )}

          {/* Editor + preview */}
          <div className="flex-1 flex overflow-hidden">
            {/* Edit pane */}
            {(viewMode === 'edit' || viewMode === 'split') && (
              <div
                className="editor-pane flex flex-col overflow-hidden"
                style={{
                  flex: viewMode === 'split' ? '0 0 50%' : '1 1 0',
                  borderInlineEnd: viewMode === 'split' ? '1px solid var(--border)' : 'none',
              }}
            >
                {uploadMessage && (
                  <div
                    className="mx-auto mt-3 max-w-2xl rounded px-3 py-2 text-xs mac-fade-slide"
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <strong style={{ color: 'var(--text)' }}>{t('storage.notConfigured')}.</strong>{' '}
                    {uploadMessage}
                  </div>
                )}
                {editorMode === 'blocks' ? (
                  <div className="editor-scroll flex-1 overflow-y-auto">
                    <BlockEditor
                      value={body}
                      onChange={setBody}
                      editorStyle={editorStyle}
                      onInsertImage={handleUploadImage}
                    />
                  </div>
                ) : (
                  <>
                    <textarea
                      ref={textareaRef}
                      value={body}
                      dir="auto"
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
                      placeholder={t('editor.placeholder')}
                      className="editor-markdown-textarea flex-1 resize-none focus:outline-none"
                      style={{
                        ...editorStyle,
                        unicodeBidi: 'plaintext',
                        textAlign: 'start',
                      }}
                    />
                    <FloatingToolbar
                      textareaRef={textareaRef}
                      body={body}
                      setBody={setBody}
                      onInsertImage={handleInsertImage}
                    />
                  </>
                )}
              </div>
            )}

            {/* Preview pane */}
            {(viewMode === 'preview' || viewMode === 'split') && (
              <div
                className="editor-preview-pane flex-1 overflow-y-auto"
              >
                {body.trim() === '' ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-8">
                    <p className="text-sm" style={{ color: 'var(--text-faint)' }}>
                      {t('editor.noPreview')}
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>
                      {t('editor.noPreviewHint')}
                    </p>
                  </div>
                ) : (
                  <div
                    dir="auto"
                    className="prose editor-prose"
                    style={{ color: 'var(--text)', unicodeBidi: 'plaintext' }}
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
