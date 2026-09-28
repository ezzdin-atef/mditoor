import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { useConfirmDialog } from '../../components/ConfirmDialog';
import { toast } from '../../components/Toast';
import type { Workspace } from '../workspace/types';
import { postFileName } from './postMeta';

const MAX_LISTED = 5;

/**
 * Confirmed post deletion. The dialog lists what will be removed (the post
 * folder can also hold images), then the whole `<slug>/` folder is deleted,
 * or just the post file for flat layouts. Resolves true when the post was deleted.
 */
export function usePostDelete() {
  const { t } = useTranslation();
  const { confirm, confirmationDialog } = useConfirmDialog();

  const deletePost = useCallback(async (
    { mdxPath, profile }: Pick<Workspace, 'mdxPath' | 'profile'>,
    slug: string,
    title: string,
  ): Promise<boolean> => {
    let files: string[] = [];
    try { files = await invoke<string[]>('post_files', { mdxPath, slug, profile }); } catch { /* still confirm */ }
    const isFolder = profile.layout === 'folder';
    const extra = isFolder ? files.filter(f => !/^index\.(mdx?|markdown)$/.test(f)) : [];

    const ok = await confirm({
      title: t('posts.deleteTitle', { title }),
      message: (
        <>
          <span className="block">{t('posts.deleteMessage', { folder: isFolder ? `${slug}/` : postFileName(profile, slug) })}</span>
          {extra.length > 0 && (
            <span className="block mt-2">
              {t('posts.deleteAlsoFiles', { n: extra.length })}
              <span className="block mt-1 ui-mono text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
                {extra.slice(0, MAX_LISTED).join(' · ')}
                {extra.length > MAX_LISTED && ` · +${extra.length - MAX_LISTED}`}
              </span>
            </span>
          )}
          <span className="block mt-2" style={{ color: 'var(--text-faint)' }}>{t('posts.deleteGitHint')}</span>
        </>
      ),
      confirmLabel: t('posts.deleteConfirmButton'),
    });
    if (!ok) return false;

    try {
      await invoke('delete_post', { mdxPath, slug, profile });
      toast.success(t('posts.deleted', { title }));
      return true;
    } catch (e) {
      toast.error(t('posts.deleteFailed'), String(e));
      return false;
    }
  }, [confirm, t]);

  return { deletePost, confirmationDialog };
}
