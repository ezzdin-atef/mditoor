import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { marked } from 'marked';
import { useTranslation } from 'react-i18next';
import { pickImageFile, uploadImage } from '../../assets/imageUpload';
import { useRouter, type Route } from '../../../router';
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
import { EditorImagesProvider, ResolvedHtml } from '../components/EditorImages';
import { IconArrowLeft, IconCheck, IconAlert, IconFolder, IconTrash } from '../../../components/Icons';
import { ActionMenu } from '../../../components/ActionMenu';
import { usePostDelete } from '../../posts/usePostDelete';
import { postFileName } from '../../posts/postMeta';
import type { FrontmatterFormat } from '../../workspace/types';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { toast } from '../../../components/Toast';
import {
  buildContent,
  defaultMeta,
  parseFrontmatter,
  type MetaValues,
} from '../utils/frontmatter';

type ViewMode = 'edit' | 'split' | 'preview';
type EditorMode = 'blocks' | 'markdown';
type EditorRoute = Extract<Route, { page: 'editor' }>;

// Hooks must run unconditionally, so the route guard lives in a thin wrapper.
export function EditorPage() {
  const { route } = useRouter();
  if (route.page !== 'editor') return null;
  return <EditorScreen route={route} />;
}

function EditorScreen({ route }: { route: EditorRoute }) {
  const { navigate } = useRouter();
  const { workspaces } = useStore();
  const settings = useSettings();
  const { t } = useTranslation();

  const workspace = workspaces.find(w => w.id === route.workspaceId) ?? null;

  const [body,       setBodyRaw]    = useState('');
  const [meta,       setMeta]       = useState<MetaValues>({});
  // Frontmatter format the post was read in; null (new post, or none yet) uses the workspace default.
  const [fmFormat, setFmFormat] = useState<FrontmatterFormat | null>(null);
  // Original frontmatter text; fields outside the schema are copied back from it on save.
  const [fmRaw, setFmRaw] = useState('');
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
    setFmFormat(null);
    setFmRaw('');
    if (route.isNew) {
      const meta = defaultMeta(workspace.metadataFields);
      let body = route.seed?.body?.trim() ? `${route.seed.body.trim()}\n` : '';
      const seedTitle = route.seed?.title?.trim();
      if (seedTitle) {
        // Put the title in the schema's title field; without one, open the body with an H1.
        const titleField =
          workspace.metadataFields.find(f => f.type === 'text' && f.name.toLowerCase() === 'title') ??
          workspace.metadataFields.find(f => f.type === 'text');
        if (titleField) meta[titleField.name] = seedTitle;
        else body = `# ${seedTitle}\n\n${body}`;
      }
      setMeta(meta);
      setBodyRaw(body);
      // Seeded posts are marked dirty so auto-save (or Ctrl+S) writes them out.
      setDirty(Boolean(route.seed));
      setLoading(false);
      return;
    }
    invoke<string>('read_post', { mdxPath: workspace.mdxPath, slug: route.slug, profile: workspace.profile })
      .then(content => {
        const p = parseFrontmatter(content);
        setMeta(p.meta);
        setFmFormat(p.format);
        setFmRaw(p.raw);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.id, route.slug, route.isNew]);

  // Set once the post is deleted so a pending auto-save can't re-create the file.
  const deletedRef = useRef(false);
  // Whether the post file exists on disk (false for a new post until its first save).
  const [onDisk, setOnDisk] = useState(!route.isNew);
  const { deletePost, confirmationDialog } = usePostDelete();

  const save = useCallback(async (): Promise<boolean> => {
    if (!workspace || saving || !dirty || deletedRef.current) return true;
    setSaving(true);
    setSaveStatus('saving');
    try {
      const content = buildContent(workspace.metadataFields, meta, body, fmFormat ?? workspace.profile.frontmatter, fmRaw);
      await invoke('write_post', { mdxPath: workspace.mdxPath, slug: route.slug, content, profile: workspace.profile });
      setOnDisk(true);
      setDirty(false);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2500);
      return true;
    } catch (e) {
      setSaveStatus('error');
      toast.error(t('editor.saveFailed'), String(e));
      setTimeout(() => setSaveStatus('idle'), 3000);
      return false;
    } finally {
      setSaving(false);
    }
  }, [body, dirty, fmFormat, fmRaw, meta, route.slug, saving, t, workspace]);

  // Leaving with unsaved edits used to drop them silently; save first.
  const goBack = useCallback(async () => {
    if (dirty && !(await save())) return;
    navigate({ page: 'workspace' });
  }, [dirty, navigate, save]);

  const removePost = useCallback(async () => {
    if (!workspace) return;
    if (!onDisk) {
      // Never saved: nothing on disk to delete, just drop the draft.
      deletedRef.current = true;
      navigate({ page: 'workspace' });
      return;
    }
    const title = typeof meta.title === 'string' && meta.title.trim() ? meta.title : route.slug;
    if (await deletePost(workspace, route.slug, title)) {
      deletedRef.current = true;
      navigate({ page: 'workspace' });
    }
  }, [deletePost, meta.title, navigate, onDisk, route.slug, workspace]);

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
      const url = await uploadImage(filePath, workspace, route.slug);
      setUploadMessage(null);
      return url;
    } catch (e) {
      console.error('Upload failed:', e);
      setUploadMessage(e instanceof Error ? e.message : t('storage.notConfiguredHint'));
      return null;
    }
  }, [route.slug, t, workspace]);

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
      if (!mod) return;
      if (e.key.toLowerCase() === 's') { e.preventDefault(); void save(); return; }
      // Formatting shortcuts target the raw textarea; block mode handles its own.
      if (editorMode !== 'markdown') return;
      if (e.shiftKey && e.key.toLowerCase() === 'i') { e.preventDefault(); void handleInsertImage(); return; }
      if (e.key === 'b') { e.preventDefault(); wrapInline('**'); }
      if (e.key === 'i') { e.preventDefault(); wrapInline('*'); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

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

  const previewHtml = useMemo(() => {
    if (viewMode === 'edit') return '';
    try { return marked.parse(body) as string; }
    catch { return body; }
  }, [body, viewMode]);

  const title = typeof meta.title === 'string' && meta.title.trim() ? meta.title : null;

  if (!workspace) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 mac-fade-in" style={{ background: 'var(--bg)' }}>
        <div className="empty-illustration">🧭</div>
        <p className="empty-state-title">{t('editor.notFound')}</p>
        <button onClick={() => navigate({ page: 'workspace' })} className="mac-btn mac-btn-primary">
          {t('editor.goBack')}
        </button>
      </div>
    );
  }

  return (
    <EditorImagesProvider workspace={workspace} slug={route.slug}>
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* ═══ Header ═══ */}
      <header className="editor-header flex items-center gap-2 px-3 flex-shrink-0 border-b">
        <button
          onClick={() => void goBack()}
          className="editor-back-btn flex items-center gap-2 flex-shrink-0"
          title={t('nav.back')}
        >
          <IconArrowLeft size={15} mirror />
          <span className="editor-workspace-icon flex-shrink-0" aria-hidden="true">{workspace.icon}</span>
          <span className="text-[13px] font-medium hidden sm:block">{workspace.name}</span>
        </button>

        <span className="flex-shrink-0" style={{ color: 'var(--text-faint)' }}>/</span>

        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }} dir="auto">
            {title ?? route.slug}
          </span>
          {title && (
            <span className="text-[11.5px] mac-input-mono truncate hidden md:inline" style={{ color: 'var(--text-faint)' }}>
              {postFileName(workspace.profile, route.slug)}
            </span>
          )}
          {route.isNew && <span className="badge badge-accent flex-shrink-0">{t('editor.new')}</span>}
        </div>

        {/* Save status */}
        <span className="flex items-center gap-1.5 text-[12px] flex-shrink-0" aria-live="polite">
          {dirty && saveStatus === 'idle' && (
            <><span className="editor-dirty-dot" /><span className="hidden lg:inline" style={{ color: 'var(--text-muted)' }}>{t('editor.unsaved')}</span></>
          )}
          {saveStatus === 'saving' && <span style={{ color: 'var(--text-muted)' }}>{t('editor.saving')}</span>}
          {saveStatus === 'saved' && (
            <span className="inline-flex items-center gap-1 mac-fade-slide" style={{ color: 'var(--green)' }}><IconCheck size={13} />{t('editor.saved')}</span>
          )}
          {saveStatus === 'error' && (
            <span className="inline-flex items-center gap-1" style={{ color: 'var(--red)' }}><IconAlert size={13} />{t('editor.error')}</span>
          )}
        </span>

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

        <button
          onClick={() => void save()}
          disabled={saving || !dirty}
          className="mac-btn mac-btn-primary flex-shrink-0"
        >
          {saving ? t('editor.saving') : t('editor.save')}
        </button>

        <ActionMenu
          label={t('posts.actions.more')}
          items={[
            ...(onDisk ? [{
              label: t('posts.actions.reveal'),
              icon: <IconFolder size={14} />,
              onSelect: () => {
                invoke<string>('post_path', { mdxPath: workspace.mdxPath, slug: route.slug, profile: workspace.profile })
                  .then(revealItemInDir)
                  .catch(e => toast.error(t('posts.actions.revealFailed'), String(e)));
              },
            }] : []),
            {
              label: onDisk ? t('posts.actions.delete') : t('posts.actions.discard'),
              icon: <IconTrash size={14} />,
              danger: true,
              separated: onDisk,
              onSelect: () => void removePost(),
            },
          ]}
        />
      </header>
      {confirmationDialog}

      {/* ═══ Body ═══ */}
      {loading ? (
        <div className="flex-1 flex flex-col items-center pt-24 gap-3">
          <div className="w-[min(60ch,80%)] space-y-3">
            <div className="skeleton" style={{ height: 28, width: '60%' }} />
            <div className="skeleton" style={{ height: 14 }} />
            <div className="skeleton" style={{ height: 14, width: '90%' }} />
            <div className="skeleton" style={{ height: 14, width: '75%' }} />
          </div>
        </div>
      ) : (
        <div className="editor-body flex-1 flex overflow-hidden">
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

          <div className="flex-1 flex overflow-hidden">
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
                    className="mx-auto mt-3 max-w-2xl px-3 py-2 text-xs mac-fade-slide flex items-start gap-2"
                    style={{
                      background: 'color-mix(in srgb, var(--orange) 10%, var(--bg))',
                      border: '1px solid color-mix(in srgb, var(--orange) 30%, transparent)',
                      borderRadius: 10,
                      color: 'var(--text-muted)',
                    }}
                  >
                    <IconAlert size={14} style={{ color: 'var(--orange)', flexShrink: 0, marginTop: 1 }} />
                    <span><strong style={{ color: 'var(--text)' }}>{t('storage.notConfigured')}.</strong>{' '}{uploadMessage}</span>
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

                          const continueWith = (cont: string, content: string) => {
                            e.preventDefault();
                            if (!content.trim()) {
                              setBody(body.slice(0, lineStart) + body.slice(s));
                              requestAnimationFrame(() => { ta.setSelectionRange(lineStart, lineStart); ta.focus(); });
                            } else {
                              setBody(body.slice(0, s) + cont + body.slice(s));
                              requestAnimationFrame(() => { ta.setSelectionRange(s + cont.length, s + cont.length); ta.focus(); });
                            }
                          };

                          if (bulletM) {
                            const [, indent, marker, content] = bulletM;
                            continueWith(`\n${indent}${marker} `, content);
                          } else if (orderedM) {
                            const [, indent, numStr, content] = orderedM;
                            continueWith(`\n${indent}${parseInt(numStr, 10) + 1}. `, content);
                          } else if (quoteM) {
                            const [, prefix, content] = quoteM;
                            continueWith(`\n${prefix}`, content);
                          }
                        }
                      }}
                      spellCheck
                      placeholder={t('editor.placeholder')}
                      className="editor-markdown-textarea flex-1 resize-none focus:outline-none"
                      style={{ ...editorStyle, unicodeBidi: 'plaintext', textAlign: 'start' }}
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

            {(viewMode === 'preview' || viewMode === 'split') && (
              <div className="editor-preview-pane flex-1 overflow-y-auto">
                {body.trim() === '' ? (
                  <div className="empty-state h-full">
                    <div className="empty-illustration">👀</div>
                    <p className="empty-state-title">{t('editor.noPreview')}</p>
                    <p className="empty-state-hint">{t('editor.noPreviewHint')}</p>
                  </div>
                ) : (
                  <ResolvedHtml
                    html={previewHtml}
                    dir="auto"
                    className="prose editor-prose"
                    style={{ color: 'var(--text)', unicodeBidi: 'plaintext' }}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </EditorImagesProvider>
  );
}
