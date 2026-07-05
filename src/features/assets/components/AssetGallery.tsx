import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { useConfirmDialog } from '../../../components/ConfirmDialog';
import { imageUrl, pickImageFile, uploadImage } from '../imageUpload';
import type { StorageConfig } from '../../workspace/types';

interface ImageAsset {
  path: string;
  rel_path: string;
  name: string;
  ext: string;
  size: number;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function AssetGallery({
  mdxPath,
  storage,
}: {
  mdxPath: string;
  storage: StorageConfig;
}) {
  const [images, setImages]   = useState<ImageAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [usedNames, setUsedNames] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [results, setResults]     = useState<Record<string, { url?: string; err?: string }>>({});
  const [filter, setFilter] = useState<'all' | 'used' | 'unused'>('all');
  const { t } = useTranslation();
  const { confirm, confirmationDialog } = useConfirmDialog();

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      invoke<ImageAsset[]>('list_images', { mdxPath }),
      invoke<string[]>('analyze_image_usage', { mdxPath }),
    ])
      .then(([imgs, used]) => {
        setImages(imgs);
        setUsedNames(new Set(used));
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [mdxPath]);

  useEffect(() => { refresh(); }, [refresh]);

  const s3Ready = Boolean(storage.s3.bucket && storage.s3.accessKey);

  const handleUpload = async (img: ImageAsset) => {
    setUploading(prev => ({ ...prev, [img.path]: true }));
    try {
      const url = await uploadImage(img.path, storage);
      setResults(prev => ({ ...prev, [img.path]: { url } }));
    } catch (e) {
      setResults(prev => ({ ...prev, [img.path]: { err: String(e) } }));
    } finally {
      setUploading(prev => ({ ...prev, [img.path]: false }));
    }
  };

  const handleAddImage = async () => {
    const filePath = await pickImageFile();
    if (!filePath) return;
    try {
      await uploadImage(filePath, storage);
      refresh();
    } catch (e) {
      alert(String(e));
    }
  };

  const handleDelete = async (img: ImageAsset) => {
    const confirmed = await confirm({
      title: t('images.deleteTitle'),
      message: t('images.deleteConfirm', { name: img.name }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
    });
    if (!confirmed) return;
    try {
      await invoke('delete_image', { path: img.path });
      refresh();
    } catch (e) {
      alert(String(e));
    }
  };

  const copyMdx = (img: ImageAsset) => {
    const alt  = img.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    const url  = results[img.path]?.url ?? imageUrl(img.name, storage);
    navigator.clipboard.writeText(`![${alt}](${url})`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Scanning images...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-sm font-medium" style={{ color: 'var(--red)' }}>{error}</p>
        <button onClick={refresh} className="mac-btn mt-3">Retry</button>
      </div>
    );
  }

  const visible = images.filter(img => {
    if (filter === 'used')   return usedNames.has(img.name);
    if (filter === 'unused') return !usedNames.has(img.name);
    return true;
  });

  const usedCount   = images.filter(i => usedNames.has(i.name)).length;
  const unusedCount = images.length - usedCount;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-1.5 flex-1 flex-wrap">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {images.length} {images.length === 1 ? 'image' : 'images'}
          </span>
          {images.length > 0 && (
            <>
              <span className="text-xs" style={{ color: 'var(--text-faint)' }}>·</span>
              <span className="text-xs" style={{ color: 'var(--green)' }}>{usedCount} used</span>
              {unusedCount > 0 && (
                <>
                  <span className="text-xs" style={{ color: 'var(--text-faint)' }}>·</span>
                  <span className="text-xs" style={{ color: 'var(--orange)' }}>{unusedCount} unused</span>
                </>
              )}
            </>
          )}
        </div>

        {images.length > 0 && (
          <div className="mac-segmented">
            {(['all', 'used', 'unused'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`mac-segment${filter === f ? ' active' : ''}`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        )}

        <button onClick={handleAddImage} className="mac-btn mac-btn-primary text-xs">
          + Add Image
        </button>
        <button onClick={refresh} className="mac-btn text-xs">Refresh</button>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center mac-fade-in">
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
            {images.length === 0 ? 'No images found' : `No ${filter} images`}
          </p>
          {images.length === 0 && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Click "+ Add Image" to import an image into your workspace.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {visible.map(img => (
            <ImageCard
              key={img.path}
              img={img}
              used={usedNames.has(img.name)}
              busy={uploading[img.path] ?? false}
              result={results[img.path]}
              showUpload={s3Ready}
              onCopy={() => copyMdx(img)}
              onUpload={() => handleUpload(img)}
              onDelete={() => handleDelete(img)}
            />
          ))}
        </div>
      )}

      {!s3Ready && (
        <p className="text-[11px] mt-4" style={{ color: 'var(--text-faint)' }}>
          Configure S3 credentials in the workspace Config tab to enable uploads.
        </p>
      )}

      {confirmationDialog}
    </div>
  );
}

function ImageCard({
  img,
  used,
  busy,
  result,
  showUpload,
  onCopy,
  onUpload,
  onDelete,
}: {
  img: ImageAsset;
  used: boolean;
  busy: boolean;
  result?: { url?: string; err?: string };
  showUpload: boolean;
  onCopy: () => void;
  onUpload: () => void;
  onDelete: () => void;
}) {
  const [src, setSrc]       = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    invoke<string>('read_image_base64', { path: img.path })
      .then(setSrc)
      .catch(() => setSrc('error'));
  }, [img.path]);

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div
      className="mac-card overflow-hidden group"
      style={{ border: '1px solid var(--border-2)', background: 'var(--surface)', position: 'relative' }}
    >
      {/* Usage badge */}
      <div
        className="absolute top-1.5 z-10 text-[9px] px-1 py-px font-semibold"
        style={{
          insetInlineStart: '0.375rem',
          background: 'var(--surface-2)',
          color:      used ? 'var(--green)' : 'var(--text-faint)',
        }}
      >
        {used ? 'used' : 'unused'}
      </div>

      {/* Thumbnail */}
      <div
        className="relative"
        style={{ aspectRatio: '4/3', background: 'var(--surface-2)', overflow: 'hidden' }}
      >
        {src && src !== 'error' ? (
          <img
            src={src}
            alt={img.name}
            style={{
              width: '100%',
              height: '100%',
              objectFit: img.ext === 'svg' ? 'contain' : 'cover',
              padding:   img.ext === 'svg' ? '8px' : 0,
            }}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-[11px]"
            style={{ color: 'var(--text-faint)' }}
          >
            {src === 'error' ? '—' : '...'}
          </div>
        )}

        {/* Hover overlay */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: 'rgba(28,16,8,0.72)', backdropFilter: 'blur(2px)' }}
        >
          <button
            onClick={handleCopy}
            className="text-[11px] px-2.5 py-1 font-medium"
            style={{ background: 'var(--bg)', color: 'var(--text)', border: '1.5px solid var(--border-2)' }}
          >
            {copied ? 'Copied!' : 'Copy MDX'}
          </button>
          {showUpload && (
            <button
              onClick={onUpload}
              disabled={busy}
              className="text-[11px] px-2.5 py-1 font-medium disabled:opacity-50"
              style={{ background: 'var(--accent)', color: 'var(--on-fill)', border: 'none' }}
            >
              {busy ? 'Uploading...' : 'Upload S3'}
            </button>
          )}
          <button
            onClick={onDelete}
            className="text-[11px] px-2.5 py-1 font-medium"
            style={{ background: 'var(--red)', color: '#fff', border: 'none' }}
          >
            Delete
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="px-2.5 py-2">
        <p className="text-[11px] font-medium truncate" style={{ color: 'var(--text)' }}>{img.name}</p>
        <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-faint)' }}>
          {img.ext.toUpperCase()} · {fmtSize(img.size)}
        </p>
        {result?.url && (
          <button
            onClick={() => navigator.clipboard.writeText(result.url!)}
            className="text-[9px] mt-1 block truncate max-w-full"
            style={{ color: 'var(--green)' }}
            title={result.url}
          >
            Uploaded — copy URL
          </button>
        )}
        {result?.err && (
          <p className="text-[9px] mt-1 truncate" style={{ color: 'var(--red)' }} title={result.err}>
            Failed
          </p>
        )}
      </div>
    </div>
  );
}
