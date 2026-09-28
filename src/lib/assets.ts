import { convertFileSrc, invoke } from '@tauri-apps/api/core';

const granted = new Map<string, Promise<void>>();

/**
 * Grants the asset protocol read access to a workspace folder (once per folder),
 * so thumbnails can be loaded straight from disk by the webview.
 */
export function allowAssetDir(dir: string): Promise<void> {
  let p = granted.get(dir);
  if (!p) {
    p = invoke<void>('allow_asset_dir', { path: dir }).catch(() => { granted.delete(dir); });
    granted.set(dir, p);
  }
  return p;
}

/** URL the webview can load a local file from; `version` busts the cache after edits. */
export function fileUrl(path: string, version?: number): string {
  const url = convertFileSrc(path);
  return version ? `${url}?v=${version}` : url;
}
