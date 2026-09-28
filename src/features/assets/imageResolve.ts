import { invoke } from '@tauri-apps/api/core';
import { fileUrl } from '../../lib/assets';
import type { Workspace } from '../workspace/types';
import { publicAssetDir } from './imageUpload';

type ResolveWorkspace = Pick<Workspace, 'mdxPath' | 'rootPath' | 'storage'>;

export interface ResolvedImage {
  /** The reference as written in the post (title and angle brackets removed). */
  src: string;
  /** URL the webview can load, or null when the file wasn't found. */
  url: string | null;
  /** File on disk; null for remote images and missing files. */
  path: string | null;
  remote: boolean;
  /** Bytes, when known (local files). */
  size: number;
  /** Where the lookup searched, most likely first (for the "not found" state). */
  tried: string[];
}

interface ImageLookup {
  path: string | null;
  size: number;
  modified: number;
  tried: string[];
}

const REMOTE = /^(https?:|data:|blob:)/i;

/** `<a b.png>` → `a b.png`; `x.png "Title"` → `x.png`. */
export function normalizeImageSrc(src: string): string {
  return src.trim().replace(/^<(.*)>$/, '$1').replace(/\s+("[^"]*"|'[^']*')$/, '').trim();
}

/** Tells the Rust lookup where the site serves static files from. */
export function imageHints(workspace: Pick<Workspace, 'rootPath' | 'storage'>) {
  return {
    rootPath: workspace.rootPath ?? null,
    publicDir: publicAssetDir(workspace),
    urlPrefix: workspace.storage.local.urlPrefix || null,
  };
}

const cache = new Map<string, Promise<ResolvedImage>>();

/**
 * Resolves an image reference from a post the way the site would serve it, to a URL the
 * webview can load. Found results are cached; missing ones are looked up again next time,
 * so an image added later appears without a reload.
 */
export function resolveImage(workspace: ResolveWorkspace, slug: string, rawSrc: string): Promise<ResolvedImage> {
  const src = normalizeImageSrc(rawSrc);
  if (!src) return Promise.resolve({ src, url: null, path: null, remote: false, size: 0, tried: [] });
  if (REMOTE.test(src)) return Promise.resolve({ src, url: src, path: null, remote: true, size: 0, tried: [] });

  const key = `${workspace.mdxPath}|${slug}|${src}`;
  let p = cache.get(key);
  if (!p) {
    p = invoke<ImageLookup>('resolve_post_image', { mdxPath: workspace.mdxPath, slug, src, hints: imageHints(workspace) })
      .then(({ path, size, modified, tried }) => ({
        src,
        url: path ? fileUrl(path, modified) : null,
        path,
        remote: false,
        size,
        tried,
      }));
    cache.set(key, p);
    p.then(r => { if (!r.path) cache.delete(key); }, () => cache.delete(key));
  }
  return p;
}

/** Forget cached lookups, e.g. after a file was optimized or replaced on disk. */
export function invalidateImages() {
  cache.clear();
}
