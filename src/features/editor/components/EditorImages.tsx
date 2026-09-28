import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { openUrl, revealItemInDir } from '@tauri-apps/plugin-opener';
import { IconAlert, IconCopy, IconFolder, IconImage, IconLink, IconMinus, IconPen, IconPlus, IconSparkles, IconX } from '../../../components/Icons';
import { toast } from '../../../components/Toast';
import { formatBytes } from '../../../lib/ui';
import { invalidateImages, resolveImage, type ResolvedImage } from '../../assets/imageResolve';
import { optimizeImage, pickImageFile, uploadImage } from '../../assets/imageUpload';
import type { Workspace } from '../../workspace/types';

/* ─── Context ────────────────────────────────────────────────────────── */

export interface ViewerRequest {
  src: string;
  alt?: string;
  /** Rewrites the reference in the post (after "Locate file…"). */
  onReplaceSrc?: (src: string) => void;
  /** Switches the image's block to markdown editing. */
  onEdit?: () => void;
}

interface EditorImages {
  workspace: Workspace;
  slug: string;
  /** Bumped when files change on disk so every image re-resolves. */
  version: number;
  refresh: () => void;
  openViewer: (req: ViewerRequest) => void;
}

const Ctx = createContext<EditorImages | null>(null);

/** Resolves post images against the workspace and hosts the image viewer. */
export function EditorImagesProvider({ workspace, slug, children }: { workspace: Workspace; slug: string; children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const [viewer, setViewer] = useState<ViewerRequest | null>(null);
  const refresh = useCallback(() => { invalidateImages(); setVersion(v => v + 1); }, []);
  const value = useMemo(
    () => ({ workspace, slug, version, refresh, openViewer: setViewer }),
    [workspace, slug, version, refresh],
  );
  return (
    <Ctx.Provider value={value}>
      {children}
      {viewer && <ImageViewer key={viewer.src} request={viewer} onClose={() => setViewer(null)} />}
    </Ctx.Provider>
  );
}

export const useEditorImages = () => useContext(Ctx);

type ImageState = { status: 'loading' } | { status: 'ready' | 'missing'; image: ResolvedImage };

/** Resolves `src` for display. Outside the provider the reference is used as-is. */
export function useResolvedImage(src: string): ImageState {
  const ctx = useContext(Ctx);
  const [state, setState] = useState<ImageState>({ status: 'loading' });
  const workspace = ctx?.workspace;
  const slug = ctx?.slug ?? '';
  const version = ctx?.version ?? 0;

  useEffect(() => {
    if (!workspace) {
      setState({ status: 'ready', image: { src, url: src, path: null, remote: true, size: 0, tried: [] } });
      return;
    }
    let alive = true;
    setState({ status: 'loading' });
    resolveImage(workspace, slug, src)
      .then(image => { if (alive) setState({ status: image.url ? 'ready' : 'missing', image }); })
      .catch(() => { if (alive) setState({ status: 'missing', image: { src, url: null, path: null, remote: false, size: 0, tried: [] } }); });
    return () => { alive = false; };
  }, [workspace, slug, src, version]);

  return state;
}

/* ─── Inline display ─────────────────────────────────────────────────── */

/** An image from the post, resolved to a local file; shows a clear placeholder when missing. */
export function ResolvedImg({ src, alt, className, onOpen }: {
  src: string;
  alt?: string;
  className?: string;
  onOpen?: () => void;
}) {
  const { t } = useTranslation();
  const state = useResolvedImage(src);
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);

  if (state.status === 'loading') return <div className="image-slot skeleton" aria-hidden="true" />;
  if (state.status === 'missing' || broken || !state.image.url) {
    const content = (
      <>
        <IconAlert size={15} />
        <span className="min-w-0">
          <span className="block font-medium">{t('viewer.notFound')}</span>
          <span className="block ui-mono dir-ltr truncate">{src}</span>
        </span>
      </>
    );
    // Without onOpen the parent is the clickable element; avoid nesting buttons.
    return onOpen
      ? <button type="button" className="image-missing" onClick={e => { e.stopPropagation(); onOpen(); }}>{content}</button>
      : <span className="image-missing">{content}</span>;
  }
  return <img src={state.image.url} alt={alt ?? ''} className={className} onError={() => setBroken(true)} />;
}

/**
 * Inline images inside rendered block HTML are emitted as `<img data-src>`; this fills in
 * their resolved `src` and makes them open the viewer instead of entering edit mode.
 */
export function useInlineImages(ref: RefObject<HTMLElement | null>, html: string) {
  const ctx = useContext(Ctx);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let alive = true;
    const imgs = Array.from(root.querySelectorAll<HTMLImageElement>('img[data-src]'));
    const cleanups: (() => void)[] = [];
    for (const img of imgs) {
      const src = img.dataset.src ?? '';
      if (!ctx) { img.src = src; continue; }
      resolveImage(ctx.workspace, ctx.slug, src).then(r => {
        if (!alive) return;
        if (r.url) img.src = r.url;
        else img.classList.add('inline-img-missing');
      });
      const open = (e: MouseEvent) => {
        e.stopPropagation();
        ctx.openViewer({ src, alt: img.alt });
      };
      img.addEventListener('click', open);
      cleanups.push(() => img.removeEventListener('click', open));
    }
    return () => { alive = false; cleanups.forEach(c => c()); };
  }, [ref, html, ctx]);
}

/** Rendered HTML (e.g. the markdown preview) whose images are resolved like the editor's. */
export function ResolvedHtml({ html, ...props }: { html: string } & React.HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  // Swap src for data-src so the webview never requests the unresolved path.
  const prepared = useMemo(() => html.replace(/<img\b([^>]*?)\ssrc=/gi, '<img$1 data-src='), [html]);
  useInlineImages(ref, prepared);
  return <div ref={ref} {...props} dangerouslySetInnerHTML={{ __html: prepared }} />;
}

/* ─── Viewer ─────────────────────────────────────────────────────────── */

const OPTIMIZABLE = /\.(jpe?g|png|webp)$/i;
const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

function ImageViewer({ request, onClose }: { request: ViewerRequest; onClose: () => void }) {
  const { t } = useTranslation();
  const ctx = useContext(Ctx)!;
  const state = useResolvedImage(request.src);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState<'fit' | number>('fit');
  const [busy, setBusy] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const image = state.status === 'loading' ? null : state.image;
  const name = decodeURIComponent(request.src.split(/[\\/]/).pop() ?? request.src);

  const step = useCallback((dir: 1 | -1) => {
    setZoom(z => {
      const current = z === 'fit' ? 1 : z;
      const next = dir > 0 ? ZOOM_STEPS.find(s => s > current) : [...ZOOM_STEPS].reverse().find(s => s < current);
      return next ?? current;
    });
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      else if (e.key === '+' || e.key === '=') step(1);
      else if (e.key === '-') step(-1);
      else if (e.key === '0') setZoom('fit');
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, step]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { toast.error(t('common.error'), String(e)); } finally { setBusy(false); }
  };

  const optimize = () => run(async () => {
    if (!image?.path) return;
    const { before, after } = await optimizeImage(image.path, ctx.workspace.storage);
    if (after < before) {
      toast.success(t('images.optimized'), t('images.optimizedDetail', {
        before: formatBytes(before), after: formatBytes(after), pct: Math.round((1 - after / before) * 100),
      }));
      ctx.refresh();
    } else {
      toast.info(t('images.alreadyOptimized'));
    }
  });

  // Copies the chosen file into the project (per storage settings) and points the post at it.
  const locate = () => run(async () => {
    const file = await pickImageFile();
    if (!file || !request.onReplaceSrc) return;
    const url = await uploadImage(file, ctx.workspace, ctx.slug);
    request.onReplaceSrc(url);
    ctx.refresh();
    ctx.openViewer({ ...request, src: url });
  });

  const copySrc = () => navigator.clipboard.writeText(request.src)
    .then(() => toast.info(t('viewer.copied'), request.src))
    .catch(e => toast.error(t('images.copyFailed'), String(e)));

  const fit = zoom === 'fit';
  const imgStyle: React.CSSProperties = fit || !natural
    ? { maxWidth: '100%', maxHeight: '100%' }
    : { width: natural.w * zoom, height: natural.h * zoom, maxWidth: 'none', maxHeight: 'none' };

  return (
    <div
      className="image-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={t('viewer.title', { name })}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="image-viewer-bar">
        <div className="min-w-0 flex-1">
          <p className="image-viewer-name dir-ltr truncate" title={request.src}>{name}</p>
          <p className="image-viewer-meta">
            {natural && <span>{natural.w} × {natural.h}</span>}
            {image && image.size > 0 && <span>{formatBytes(image.size)}</span>}
            {image?.remote && <span>{t('viewer.remote')}</span>}
          </p>
        </div>

        {state.status === 'ready' && (
          <div className="image-viewer-zoom" role="group" aria-label={t('viewer.zoom')}>
            <button type="button" className="icon-btn" onClick={() => step(-1)} aria-label={t('viewer.zoomOut')} title={t('viewer.zoomOut')}><IconMinus size={15} /></button>
            <button type="button" className="image-viewer-zoom-label" onClick={() => setZoom(fit ? 1 : 'fit')} title={t('viewer.toggleFit')}>
              {fit ? t('viewer.fit') : `${Math.round(zoom * 100)}%`}
            </button>
            <button type="button" className="icon-btn" onClick={() => step(1)} aria-label={t('viewer.zoomIn')} title={t('viewer.zoomIn')}><IconPlus size={15} /></button>
          </div>
        )}

        <div className="flex items-center gap-1">
          {image?.path && OPTIMIZABLE.test(image.path) && (
            <button type="button" className="icon-btn" disabled={busy} onClick={() => void optimize()} title={t('images.optimize')} aria-label={t('images.optimize')}>
              <IconSparkles size={15} className={busy ? 'spin' : undefined} />
            </button>
          )}
          {image?.path && (
            <button type="button" className="icon-btn" onClick={() => void revealItemInDir(image.path!)} title={t('posts.actions.reveal')} aria-label={t('posts.actions.reveal')}>
              <IconFolder size={15} />
            </button>
          )}
          {image?.remote && /^https?:/i.test(request.src) && (
            <button type="button" className="icon-btn" onClick={() => void openUrl(request.src)} title={t('viewer.openInBrowser')} aria-label={t('viewer.openInBrowser')}>
              <IconLink size={15} />
            </button>
          )}
          <button type="button" className="icon-btn" onClick={() => void copySrc()} title={t('viewer.copySrc')} aria-label={t('viewer.copySrc')}>
            <IconCopy size={15} />
          </button>
          {request.onEdit && (
            <button type="button" className="icon-btn" onClick={() => { onClose(); request.onEdit!(); }} title={t('viewer.editMarkdown')} aria-label={t('viewer.editMarkdown')}>
              <IconPen size={15} />
            </button>
          )}
          <button ref={closeRef} type="button" className="icon-btn" onClick={onClose} title={t('common.close')} aria-label={t('common.close')}>
            <IconX size={16} />
          </button>
        </div>
      </div>

      <div
        className={`image-viewer-stage${fit ? '' : ' zoomed'}`}
        onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
        onWheel={e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); step(e.deltaY < 0 ? 1 : -1); } }}
      >
        {state.status === 'loading' ? (
          <div className="image-viewer-empty"><IconImage size={28} /></div>
        ) : state.status === 'ready' && image?.url ? (
          <figure className="image-viewer-figure">
            <img
              src={image.url}
              alt={request.alt ?? ''}
              style={imgStyle}
              onLoad={e => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              onClick={() => setZoom(fit ? 1 : 'fit')}
              className={fit ? 'cursor-zoom-in' : 'cursor-zoom-out'}
            />
            {request.alt && <figcaption dir="auto">{request.alt}</figcaption>}
          </figure>
        ) : (
          <div className="image-viewer-missing">
            <IconAlert size={24} />
            <p className="font-semibold">{t('viewer.notFound')}</p>
            <code className="ui-mono dir-ltr">{request.src}</code>
            {image && image.tried.length > 0 && (
              <div className="image-viewer-tried">
                <p>{t('viewer.lookedIn')}</p>
                <ul className="ui-mono dir-ltr">
                  {image.tried.slice(0, 4).map(p => <li key={p} title={p}>{p}</li>)}
                </ul>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              {request.onReplaceSrc && (
                <button type="button" className="mac-btn mac-btn-primary" disabled={busy} onClick={() => void locate()}>
                  <IconFolder size={14} />{t('viewer.locate')}
                </button>
              )}
              {request.onEdit && (
                <button type="button" className="mac-btn" onClick={() => { onClose(); request.onEdit!(); }}>
                  <IconPen size={14} />{t('viewer.editMarkdown')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
