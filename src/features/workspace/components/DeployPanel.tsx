import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { StorageConfig } from '../types';

/* ─── Types ──────────────────────────────────────────────────────────── */

interface ImageAsset {
  path: string;
  rel_path: string;
  name: string;
  ext: string;
  size: number;
}

type FileStatus = 'pending' | 'uploading' | 'done' | 'error';

interface FileEntry {
  asset: ImageAsset;
  status: FileStatus;
  url: string | null;
  error: string | null;
}

type Phase = 'idle' | 'loading' | 'deploying' | 'done';

/* ─── Helpers ────────────────────────────────────────────────────────── */

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/* ─── Icons ──────────────────────────────────────────────────────────── */

function IconCheck() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconX() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M3 3l7 7M10 3l-7 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function IconCopy() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.1" />
      <path d="M1 8V2a1 1 0 011-1h6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      width="12" height="12" viewBox="0 0 12 12"
      style={{ animation: 'spin 0.8s linear infinite' }}
      aria-hidden="true"
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" strokeOpacity="0.25" fill="none" />
      <path d="M6 1.5A4.5 4.5 0 0110.5 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/* ─── File row ───────────────────────────────────────────────────────── */

function FileRow({ entry }: { entry: FileEntry }) {
  const { asset, status, error } = entry;
  return (
    <div className="flex items-start gap-2.5 py-2 px-4">
      {/* Status icon */}
      <span
        className="flex-shrink-0 mt-0.5"
        style={{
          color:
            status === 'done' ? 'var(--green)' :
            status === 'error' ? 'var(--red)' :
            status === 'uploading' ? 'var(--accent)' :
            'var(--text-faint)',
        }}
      >
        {status === 'done'      ? <IconCheck /> :
         status === 'error'     ? <IconX /> :
         status === 'uploading' ? <Spinner /> :
         <span style={{ display: 'block', width: 12, height: 12, borderRadius: '50%', background: 'var(--surface-3)' }} />
        }
      </span>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <p
          className="text-[12px] mac-input-mono truncate leading-snug"
          style={{ color: status === 'error' ? 'var(--red)' : 'var(--text)' }}
        >
          {asset.rel_path}
        </p>
        {status === 'error' && error && (
          <p className="text-[10px] mt-0.5 leading-snug" style={{ color: 'var(--text-faint)' }}>
            {error.length > 80 ? error.slice(0, 80) + '…' : error}
          </p>
        )}
      </div>

      {/* Size */}
      <span className="text-[11px] flex-shrink-0 tabular-nums" style={{ color: 'var(--text-faint)' }}>
        {fmtSize(asset.size)}
      </span>
    </div>
  );
}

/* ─── Summary footer ─────────────────────────────────────────────────── */

function Summary({
  files,
  cdnBase,
}: {
  files: FileEntry[];
  cdnBase: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const done  = files.filter(f => f.status === 'done').length;
  const errors = files.filter(f => f.status === 'error').length;
  const total  = files.length;

  const handleCopy = () => {
    if (!cdnBase) return;
    navigator.clipboard.writeText(cdnBase).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  if (total === 0) {
    return (
      <p className="text-[12px] text-center" style={{ color: 'var(--text-muted)' }}>
        Nothing to deploy. Add images to your workspace first.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Status line */}
      <div className="flex items-center gap-2">
        <span
          className="text-[12px] font-medium"
          style={{ color: errors === 0 ? 'var(--green)' : errors === total ? 'var(--red)' : 'var(--orange)' }}
        >
          {errors === 0
            ? `${done} ${done === 1 ? 'image' : 'images'} deployed`
            : errors === total
              ? 'All uploads failed'
              : `${done} of ${total} deployed, ${errors} failed`
          }
        </span>
      </div>

      {/* CDN base URL */}
      {cdnBase && errors < total && (
        <div
          className="flex items-center gap-2 px-2.5 py-1.5"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)' }}
        >
          <span className="flex-1 text-[11px] mac-input-mono truncate" style={{ color: 'var(--text-muted)' }}>
            {cdnBase}
          </span>
          <button
            onClick={handleCopy}
            className="toolbar-btn p-1 flex items-center gap-1 flex-shrink-0"
            title="Copy CDN base URL"
            style={{ color: copied ? 'var(--green)' : 'var(--text-muted)' }}
          >
            <IconCopy />
            <span className="text-[10px]">{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Deploy Panel ───────────────────────────────────────────────────── */

export function DeployPanel({
  mdxPath,
  storage,
  onClose,
}: {
  mdxPath: string;
  storage: StorageConfig;
  onClose: () => void;
}) {
  const [phase,   setPhase]   = useState<Phase>('idle');
  const [files,   setFiles]   = useState<FileEntry[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  const s3 = storage.s3;
  const isConfigured = !!(s3.endpoint && s3.bucket && s3.accessKey && s3.secretKey);
  const cdnBase = s3.publicUrlPrefix?.replace(/\/$/, '') || null;

  // Auto-start when panel opens if configured
  useEffect(() => {
    if (isConfigured) deploy();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll log to bottom as entries change
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [files]);

  const deploy = useCallback(async () => {
    setPhase('loading');
    setFiles([]);

    let images: ImageAsset[];
    try {
      images = await invoke<ImageAsset[]>('list_images', { mdxPath });
    } catch {
      setPhase('done');
      return;
    }

    if (images.length === 0) {
      setPhase('done');
      return;
    }

    const entries: FileEntry[] = images.map(a => ({
      asset: a, status: 'pending', url: null, error: null,
    }));
    setFiles(entries);
    setPhase('deploying');

    for (let i = 0; i < entries.length; i++) {
      const a = entries[i].asset;
      setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'uploading' } : f));

      try {
        const prefix = s3.keyPrefix.replace(/\/$/, '');
        const key    = prefix ? `${prefix}/${a.name}` : a.name;
        await invoke<string>('upload_to_s3', {
          filePath:  a.path,
          s3Key:     key,
          endpoint:  s3.endpoint,
          bucket:    s3.bucket,
          region:    s3.region,
          accessKey: s3.accessKey,
          secretKey: s3.secretKey,
        });
        const url = cdnBase ? `${cdnBase}/${key}` : null;
        setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'done', url } : f));
      } catch (err) {
        setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'error', error: String(err) } : f));
      }
    }

    setPhase('done');
  }, [mdxPath, s3, cdnBase]);

  // Keyboard: Escape closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      {/* Backdrop — subtle, doesn't lock the rest of the UI */}
      <div
        className="fixed inset-0"
        style={{ zIndex: 40 }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="deploy-panel fixed top-0 h-full flex flex-col"
        style={{
          insetInlineEnd: 0,
          width: 320,
          zIndex: 41,
          background: 'var(--surface)',
          borderInlineStart: '1px solid var(--border)',
          boxShadow: 'var(--deploy-panel-shadow, -4px 0 24px rgba(0,0,0,0.10))',
          animation: 'deploy-slide-in 0.22s cubic-bezier(0.32,0.72,0,1) both',
        }}
        role="dialog"
        aria-label="Deploy to S3"
        aria-modal="false"
      >
        <style>{`
          @keyframes deploy-slide-in {
            from { transform: translateX(var(--deploy-slide-x, 100%)); opacity: 0; }
            to   { transform: translateX(0);    opacity: 1; }
          }
          @media (prefers-reduced-motion: reduce) {
            @keyframes deploy-slide-in {
              from { opacity: 0; }
              to   { opacity: 1; }
            }
          }
        `}</style>

        {/* Header */}
        <div
          className="flex items-center justify-between px-4 h-11 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <span className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
            Deploy to S3
          </span>
          <button
            onClick={onClose}
            className="toolbar-btn p-1.5 flex items-center justify-center"
            aria-label="Close deploy panel"
          >
            <IconClose />
          </button>
        </div>

        {/* Not configured */}
        {!isConfigured ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
            <p className="text-[13px]" style={{ color: 'var(--text)' }}>
              S3 is not configured.
            </p>
            <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
              Add your endpoint, bucket, and credentials in the Config tab.
            </p>
          </div>
        ) : (
          <>
            {/* Log area */}
            <div
              ref={logRef}
              className="flex-1 overflow-y-auto"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              {phase === 'loading' && (
                <div className="flex items-center justify-center h-full">
                  <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                    Scanning images…
                  </span>
                </div>
              )}

              {(phase === 'deploying' || phase === 'done') && files.length === 0 && (
                <div className="flex items-center justify-center h-full px-6 text-center">
                  <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                    Nothing to deploy. Add images to your workspace first.
                  </p>
                </div>
              )}

              {files.length > 0 && (
                <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {files.map((entry, i) => (
                    <FileRow key={i} entry={entry} />
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 px-4 py-3 space-y-3">
              {phase === 'done' && files.length > 0 && (
                <Summary files={files} cdnBase={cdnBase} />
              )}

              {/* Re-deploy button */}
              {phase === 'done' && (
                <button
                  onClick={deploy}
                  className="mac-btn w-full justify-center"
                  style={{ fontSize: '12px' }}
                >
                  Deploy Again
                </button>
              )}

              {phase === 'deploying' && (
                <p className="text-[11px] text-center" style={{ color: 'var(--text-faint)' }}>
                  Uploading {files.filter(f => f.status === 'done' || f.status === 'error').length}{' '}
                  of {files.length}…
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
