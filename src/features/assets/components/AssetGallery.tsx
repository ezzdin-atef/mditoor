import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { useConfirmDialog } from '../../../components/ConfirmDialog';
import { toast } from '../../../components/Toast';
import { ViewToggle } from '../../../components/ViewToggle';
import { IconCopy, IconPlus, IconRefresh, IconSearch, IconSparkles, IconTrash, IconUpload } from '../../../components/Icons';
import { useViewPrefs } from '../../settings/viewPrefs';
import { formatBytes, relativeTime, useInView } from '../../../lib/ui';
import { allowAssetDir, fileUrl } from '../../../lib/assets';
import { imageUrl, optimizeImage, pickImageFile, publicAssetDir, s3Ready, uploadImage } from '../imageUpload';
import type { Workspace } from '../../workspace/types';

interface ImageAsset {
  path: string;
  rel_path: string;
  name: string;
  ext: string;
  size: number;
  modified: number;
  /** Set for images in the public asset folder: the URL the site serves them at. */
  publicUrl?: string;
}

type Filter = 'all' | 'used' | 'unused';

// Formats the optimizer can re-encode (GIF, SVG and AVIF are left as they are).
const OPTIMIZABLE = new Set(['jpg', 'jpeg', 'png', 'webp']);

function Thumb({ img, fit = 'cover' }: { img: ImageAsset; fit?: 'cover' | 'contain' }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (inView) setSrc(fileUrl(img.path, img.modified));
  }, [inView, img.path, img.modified]);

  const isVector = img.ext === 'svg';
  return (
    <div ref={ref} className="w-full h-full flex items-center justify-center">
      {src && !failed ? (
        <img
          src={src}
          alt={img.name}
          decoding="async"
          onError={() => setFailed(true)}
          style={{ objectFit: isVector ? 'contain' : fit, padding: isVector ? 12 : 0 }}
        />
      ) : failed ? (
        <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{img.ext.toUpperCase()}</span>
      ) : (
        <div className="skeleton w-full h-full" style={{ borderRadius: 0 }} />
      )}
    </div>
  );
}

export function AssetGallery({ workspace }: { workspace: Workspace }) {
  const { mdxPath, storage } = workspace;
  const publicDir = storage.provider === 'local' && storage.local.mode === 'public' ? publicAssetDir(workspace) : null;
  const urlPrefix = storage.local.urlPrefix.replace(/\/+$/, '');
  const { t, i18n } = useTranslation();
  const { confirm, confirmationDialog } = useConfirmDialog();
  const { imagesView, set } = useViewPrefs();
  const [images, setImages]       = useState<ImageAsset[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [usedNames, setUsedNames] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [uploaded, setUploaded]   = useState<Record<string, string>>({});
  const [optimizing, setOptimizing] = useState<Record<string, boolean>>({});
  const [filter, setFilter]       = useState<Filter>('all');
  const [query, setQuery]         = useState('');

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    // In public mode images also live outside the posts folder (e.g. <root>/public/images).
    const listPublic = publicDir
      ? allowAssetDir(publicDir)
          .then(() => invoke<ImageAsset[]>('list_images', { mdxPath: publicDir }))
          .then(imgs => imgs.map(img => ({ ...img, publicUrl: `${urlPrefix}/${img.rel_path}` })))
      : Promise.resolve([] as ImageAsset[]);
    allowAssetDir(mdxPath)
      .then(() => Promise.all([
        invoke<ImageAsset[]>('list_images', { mdxPath }),
        listPublic,
        invoke<string[]>('analyze_image_usage', { mdxPath }),
      ]))
      .then(([imgs, publicImgs, used]) => {
        const seen = new Set(imgs.map(i => i.path));
        setImages([...imgs, ...publicImgs.filter(i => !seen.has(i.path))]);
        setUsedNames(new Set(used));
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [mdxPath, publicDir, urlPrefix]);

  useEffect(() => { refresh(); }, [refresh]);

  const usesS3 = storage.provider === 's3';
  const canUploadS3 = usesS3 && s3Ready(storage.s3);

  const handleUpload = async (img: ImageAsset) => {
    setUploading(prev => ({ ...prev, [img.path]: true }));
    try {
      const url = await uploadImage(img.path, workspace);
      setUploaded(prev => ({ ...prev, [img.path]: url }));
      await navigator.clipboard.writeText(url).catch(() => {});
      toast.success(t('images.uploadedToast'), url);
    } catch (e) {
      toast.error(t('images.failed'), e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(prev => ({ ...prev, [img.path]: false }));
    }
  };

  // Imports always copy into the project (per the local storage settings) so the gallery can show them;
  // with S3 selected they can then be pushed with the upload button.
  const handleImport = async () => {
    const filePath = await pickImageFile();
    if (!filePath) return;
    try {
      const url = await uploadImage(filePath, { ...workspace, storage: { ...storage, provider: 'local' } });
      toast.success(t('images.imported'), url);
      refresh();
    } catch (e) {
      toast.error(t('images.importFailed'), String(e));
    }
  };

  // Manual, per image: works whether or not automatic optimization is enabled.
  const handleOptimize = async (img: ImageAsset) => {
    setOptimizing(prev => ({ ...prev, [img.path]: true }));
    try {
      const { before, after } = await optimizeImage(img.path, storage);
      if (after < before) {
        toast.success(t('images.optimized'), t('images.optimizedDetail', {
          before: formatBytes(before),
          after: formatBytes(after),
          pct: Math.round((1 - after / before) * 100),
        }));
        refresh();
      } else {
        toast.info(t('images.alreadyOptimized'));
      }
    } catch (e) {
      toast.error(t('images.optimizeFailed'), String(e));
    } finally {
      setOptimizing(prev => ({ ...prev, [img.path]: false }));
    }
  };

  const handleDelete = async (img: ImageAsset) => {
    const ok = await confirm({
      title: t('images.deleteTitle'),
      message: t('images.deleteConfirm', { name: img.name }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
    try {
      await invoke('delete_image', { path: img.path });
      toast.success(t('images.deleted', { name: img.name }));
      refresh();
    } catch (e) {
      toast.error(t('images.deleteFailed'), String(e));
    }
  };

  const copyMdx = async (img: ImageAsset) => {
    const alt = img.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    const url = uploaded[img.path]
      ?? img.publicUrl
      ?? (usesS3 && storage.s3.publicUrlPrefix ? imageUrl(img.name, storage) : `/${img.rel_path}`);
    try {
      await navigator.clipboard.writeText(`![${alt}](${url})`);
      toast.info(t('images.copied'), `![${alt}](${url})`);
    } catch (e) {
      toast.error(t('images.copyFailed'), String(e));
    }
  };

  const usedCount = useMemo(() => images.filter(i => usedNames.has(i.name)).length, [images, usedNames]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return images.filter(img => {
      if (filter === 'used' && !usedNames.has(img.name)) return false;
      if (filter === 'unused' && usedNames.has(img.name)) return false;
      return !q || img.rel_path.toLowerCase().includes(q);
    });
  }, [images, usedNames, filter, query]);

  if (error) {
    return (
      <div className="empty-state">
        <div className="empty-illustration">🖼️</div>
        <p className="empty-state-title">{t('images.loadFailed')}</p>
        <p className="empty-state-hint ui-mono break-all">{error}</p>
        <button onClick={refresh} className="mac-btn"><IconRefresh size={14} />{t('common.retry')}</button>
      </div>
    );
  }

  const counts: Record<Filter, number> = { all: images.length, used: usedCount, unused: images.length - usedCount };

  return (
    <div className="space-y-5">
      <div className="toolbar-row">
        <div className="search-field">
          <IconSearch size={15} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('images.search')} aria-label={t('images.search')} />
        </div>
        <div className="mac-segmented">
          {(['all', 'used', 'unused'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`mac-segment${filter === f ? ' active' : ''}`}>
              {t(`images.filters.${f}`)}
              <span className="tab-count">{counts[f]}</span>
            </button>
          ))}
        </div>
        <ViewToggle value={imagesView} onChange={v => set('imagesView', v)} />
        <button onClick={refresh} className="icon-btn" title={t('posts.refresh')} aria-label={t('posts.refresh')}>
          <IconRefresh size={15} className={loading ? 'spin' : undefined} />
        </button>
        <div className="flex-1" />
        <button onClick={handleImport} className="mac-btn mac-btn-fun">
          <IconPlus size={15} />{t('images.addImage')}
        </button>
      </div>

      {usesS3 && !canUploadS3 && images.length > 0 && (
        <p className="text-[12px] flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
          <span className="badge">S3</span>{t('images.s3Hint')}
        </p>
      )}

      {loading && images.length === 0 ? (
        <div className="image-grid">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton" style={{ aspectRatio: '4 / 3.6', borderRadius: 14 }} />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="empty-state mac-fade-in">
          <div className="empty-illustration">🖼️</div>
          <p className="empty-state-title">
            {images.length === 0 ? t('images.empty') : t('images.emptyFiltered', { filter: t(`images.filters.${filter}`).toLowerCase() })}
          </p>
          {images.length === 0 && <p className="empty-state-hint">{t('images.emptyHint')}</p>}
          {images.length === 0 && (
            <button onClick={handleImport} className="mac-btn mac-btn-fun"><IconPlus size={15} />{t('images.addImage')}</button>
          )}
        </div>
      ) : imagesView === 'gallery' ? (
        <div className="image-grid stagger">
          {visible.map(img => {
            const used = usedNames.has(img.name);
            return (
              <div key={img.path} className="image-card">
                <div className="image-thumb">
                  <Thumb img={img} />
                  <span className={`glass-badge ${used ? '' : 'draft'}`} style={{ position: 'absolute', top: 8, insetInlineStart: 8 }}>
                    {used ? t('images.used') : t('images.unused')}
                  </span>
                  <div className="image-overlay">
                    <button className="overlay-btn" onClick={() => void copyMdx(img)} title={t('images.copyMdx')} aria-label={t('images.copyMdx')}>
                      <IconCopy size={15} />
                    </button>
                    {OPTIMIZABLE.has(img.ext) && (
                      <button className="overlay-btn" disabled={optimizing[img.path]} onClick={() => void handleOptimize(img)} title={t('images.optimize')} aria-label={t('images.optimize')}>
                        <IconSparkles size={15} className={optimizing[img.path] ? 'spin' : undefined} />
                      </button>
                    )}
                    {canUploadS3 && (
                      <button className="overlay-btn primary" disabled={uploading[img.path]} onClick={() => void handleUpload(img)} title={t('images.uploadS3')} aria-label={t('images.uploadS3')}>
                        <IconUpload size={15} className={uploading[img.path] ? 'spin' : undefined} />
                      </button>
                    )}
                    <button className="overlay-btn danger" onClick={() => void handleDelete(img)} title={t('common.delete')} aria-label={t('common.delete')}>
                      <IconTrash size={15} />
                    </button>
                  </div>
                </div>
                <div className="px-3 py-2.5">
                  <p className="text-[12.5px] font-semibold truncate dir-ltr" style={{ color: 'var(--text)' }} title={img.rel_path}>{img.name}</p>
                  <p className="text-[11px] mt-0.5 flex items-center gap-1.5" style={{ color: 'var(--text-faint)' }}>
                    <span>{img.ext.toUpperCase()}</span><span>·</span><span>{formatBytes(img.size)}</span>
                    {uploaded[img.path] && <span className="badge badge-green" style={{ height: 16, marginInlineStart: 'auto' }}>S3</span>}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="post-list stagger">
          {visible.map(img => {
            const used = usedNames.has(img.name);
            return (
              <div key={img.path} className="post-row" style={{ cursor: 'default' }}>
                <div className="post-thumb image-thumb" style={{ aspectRatio: 'auto' }}><Thumb img={img} /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold truncate dir-ltr" style={{ color: 'var(--text)' }}>{img.name}</p>
                  <p className="text-[11.5px] truncate dir-ltr" style={{ color: 'var(--text-faint)' }}>{img.rel_path}</p>
                </div>
                <span className={`badge ${used ? 'badge-green' : 'badge-orange'}`}>{used ? t('images.used') : t('images.unused')}</span>
                <span className="hidden sm:inline text-[11.5px] w-20 text-end" style={{ color: 'var(--text-faint)' }}>{formatBytes(img.size)}</span>
                <span className="hidden md:inline text-[11.5px] w-28 text-end" style={{ color: 'var(--text-faint)' }}>{relativeTime(img.modified, i18n.language)}</span>
                <div className="flex items-center gap-0.5">
                  <button className="icon-btn icon-btn-sm" onClick={() => void copyMdx(img)} title={t('images.copyMdx')} aria-label={t('images.copyMdx')}><IconCopy size={14} /></button>
                  {OPTIMIZABLE.has(img.ext) && (
                    <button className="icon-btn icon-btn-sm" disabled={optimizing[img.path]} onClick={() => void handleOptimize(img)} title={t('images.optimize')} aria-label={t('images.optimize')}>
                      <IconSparkles size={14} className={optimizing[img.path] ? 'spin' : undefined} />
                    </button>
                  )}
                  {canUploadS3 && (
                    <button className="icon-btn icon-btn-sm" disabled={uploading[img.path]} onClick={() => void handleUpload(img)} title={t('images.uploadS3')} aria-label={t('images.uploadS3')}>
                      <IconUpload size={14} className={uploading[img.path] ? 'spin' : undefined} />
                    </button>
                  )}
                  <button className="icon-btn icon-btn-sm danger" onClick={() => void handleDelete(img)} title={t('common.delete')} aria-label={t('common.delete')}><IconTrash size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {confirmationDialog}
    </div>
  );
}
