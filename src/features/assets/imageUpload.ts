import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { joinPath } from '../../lib/ui';
import type { ImageOptimizeConfig, S3StorageConfig, StorageConfig, Workspace } from '../workspace/types';

export async function pickImageFile(): Promise<string | null> {
  const result = await open({
    multiple: false,
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp'] }],
  });
  return typeof result === 'string' ? result : null;
}

type UploadWorkspace = Pick<Workspace, 'mdxPath' | 'rootPath' | 'storage' | 'profile'>;

const basename = (p: string) => p.replace(/\\/g, '/').split('/').pop() ?? 'image';
const trimSlash = (s: string) => s.replace(/\/+$/, '');

export interface OptimizeResult {
  path: string;
  before: number;
  after: number;
}

const optimizeOptions = ({ maxWidth, quality, sharpen }: ImageOptimizeConfig) => ({ maxWidth, quality, sharpen });

/** Options for the Rust commands, or null when automatic optimization is off. */
const autoOptimize = (storage: StorageConfig) => (storage.optimize.enabled ? optimizeOptions(storage.optimize) : null);

/** Resizes, sharpens and recompresses one image in place (the gallery's manual action). */
export function optimizeImage(path: string, storage: StorageConfig): Promise<OptimizeResult> {
  return invoke<OptimizeResult>('optimize_image', { path, options: optimizeOptions(storage.optimize) });
}

export function s3Ready(s3: S3StorageConfig): boolean {
  return Boolean(s3.bucket.trim() && s3.region.trim() && s3.accessKey.trim() && s3.secretKey.trim());
}

/** Absolute folder that `public`-mode images are copied into, or null without a project root. */
export function publicAssetDir(workspace: Pick<Workspace, 'rootPath' | 'storage'>): string | null {
  const { dir } = workspace.storage.local;
  if (/^([a-zA-Z]:)?[\\/]/.test(dir)) return dir;
  return workspace.rootPath ? joinPath(workspace.rootPath, dir) : null;
}

/**
 * Stores an image per the workspace's storage provider and returns the URL to embed in the post.
 * `slug` is the post being edited; without it (e.g. the gallery) colocated images go to `<posts>/images`.
 */
export async function uploadImage(filePath: string, workspace: UploadWorkspace, slug?: string): Promise<string> {
  const { storage } = workspace;
  return storage.provider === 's3'
    ? uploadToS3(filePath, storage)
    : saveLocal(filePath, workspace, slug);
}

async function saveLocal(filePath: string, workspace: UploadWorkspace, slug?: string): Promise<string> {
  const { local } = workspace.storage;
  const copy = (destFolder: string) =>
    invoke<string>('copy_image_local', { srcPath: filePath, destFolder, optimize: autoOptimize(workspace.storage) })
      .then(p => encodeURI(basename(p)));

  if (local.mode === 'public') {
    const dir = publicAssetDir(workspace);
    if (!dir) throw new Error('Set the project root in workspace Settings so images can be saved to the public folder.');
    return `${trimSlash(local.urlPrefix)}/${await copy(dir)}`;
  }

  // Folder-per-post layouts keep images beside index.mdx; flat layouts share an images/ folder.
  if (slug && workspace.profile.layout === 'folder') {
    return `./${await copy(joinPath(workspace.mdxPath, slug))}`;
  }
  // Notes: an images/ folder beside the note, so `./images/x.png` resolves from nested folders too.
  if (slug && workspace.profile.layout === 'tree') {
    const folder = slug.includes('/') ? slug.slice(0, slug.lastIndexOf('/')) : '';
    return `./images/${await copy(joinPath(folder ? joinPath(workspace.mdxPath, folder) : workspace.mdxPath, 'images'))}`;
  }
  return `./images/${await copy(joinPath(workspace.mdxPath, 'images'))}`;
}

async function uploadToS3(filePath: string, storage: StorageConfig): Promise<string> {
  const { s3 } = storage;
  if (!s3Ready(s3)) {
    throw new Error('Configure S3 image storage in workspace Settings before uploading. Add your bucket, region, access key, and secret key.');
  }
  const prefix = trimSlash(s3.keyPrefix);
  // A fresh key avoids overwriting another article's image with the same filename.
  // Keep the key URL-safe for the S3 signer and the public Markdown URL.
  const safeName = basename(filePath).normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '-').slice(-80) || 'image';
  const filename = `${crypto.randomUUID()}-${safeName}`;
  const key = prefix ? `${prefix}/${filename}` : filename;
  const rawUrl = await invoke<string>('upload_to_s3', {
    filePath,
    s3Key:     key,
    endpoint:  s3.endpoint,
    bucket:    s3.bucket,
    region:    s3.region,
    accessKey: s3.accessKey,
    secretKey: s3.secretKey,
    optimize:  autoOptimize(storage),
  });
  return s3.publicUrlPrefix ? `${trimSlash(s3.publicUrlPrefix)}/${key}` : rawUrl;
}

// Computes the public URL for an image by its filename.
export function imageUrl(imgName: string, storage: StorageConfig): string {
  const prefix  = trimSlash(storage.s3.keyPrefix);
  const key     = prefix ? `${prefix}/${imgName}` : imgName;
  const pubBase = storage.s3.publicUrlPrefix ? trimSlash(storage.s3.publicUrlPrefix) : '';
  return pubBase ? `${pubBase}/${key}` : imgName;
}
