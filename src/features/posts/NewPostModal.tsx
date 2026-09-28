import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconUndo, IconX } from '../../components/Icons';
import type { SiteProfile } from '../workspace/types';
import { newPostSlug, postFileName, slugify } from './postMeta';

/**
 * Asks for the post title and derives the slug from it. The slug stays in sync
 * with the title until the user edits it by hand.
 */
export function NewPostModal({ profile, existing, onCreate, onClose }: {
  profile: Pick<SiteProfile, 'layout' | 'extension'>;
  existing: Set<string>;
  onCreate: (slug: string, title: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [slugDraft, setSlugDraft] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const base = slugify(slugEdited ? slugDraft : title);
  const slug = newPostSlug(profile, base);
  const taken = slug !== '' && existing.has(slug);
  const canCreate = Boolean(title.trim() && slug && !taken);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canCreate) onCreate(slug, title.trim());
  };

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal mac-sheet" role="dialog" aria-modal="true" aria-labelledby="new-post-title">
        <div className="px-6 pt-6 pb-4 flex items-start gap-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex-1 min-w-0">
            <h2 id="new-post-title" className="text-[18px] font-bold" style={{ color: 'var(--text)', letterSpacing: '-0.01em' }}>
              {t('posts.new')}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="icon-btn" aria-label={t('common.close')}>
            <IconX size={16} />
          </button>
        </div>

        <form onSubmit={submit} className="px-6 pt-5 pb-6 space-y-5">
          <div>
            <label className="field-label" htmlFor="new-post-title-input">{t('posts.titleLabel')}</label>
            <input
              id="new-post-title-input"
              ref={titleRef}
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={t('posts.titlePlaceholder')}
              className="mac-input"
              dir="auto"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="new-post-slug">{t('posts.slugLabel')}</label>
            <div className="flex gap-2">
              <input
                id="new-post-slug"
                type="text"
                value={slugEdited ? slugDraft : base}
                onChange={e => { setSlugDraft(e.target.value); setSlugEdited(true); }}
                onBlur={() => { if (slugEdited) setSlugDraft(slugify(slugDraft)); }}
                placeholder={t('posts.slugPlaceholder')}
                className="mac-input mac-input-mono flex-1 dir-ltr"
                style={{ borderColor: taken ? 'var(--red)' : undefined }}
                aria-invalid={taken}
              />
              {slugEdited && (
                <button
                  type="button"
                  onClick={() => { setSlugEdited(false); setSlugDraft(''); }}
                  className="icon-btn flex-shrink-0"
                  title={t('posts.slugReset')}
                  aria-label={t('posts.slugReset')}
                  style={{ height: 36, width: 36 }}
                >
                  <IconUndo size={14} />
                </button>
              )}
            </div>
            <p className="field-hint ui-mono dir-ltr" style={{ color: taken ? 'var(--red)' : undefined }}>
              {taken ? t('posts.slugTaken') : slug ? postFileName(profile, slug) : t('posts.slugHint')}
            </p>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="mac-btn flex-1" style={{ height: 38 }}>
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={!canCreate} className="mac-btn mac-btn-fun flex-1" style={{ height: 38 }}>
              {t('posts.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
