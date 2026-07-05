import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { StorageConfig } from '../workspace/types';

export async function pickImageFile(): Promise<string | null> {
  const result = await open({
    multiple: false,
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp'] }],
  });
  return typeof result === 'string' ? result : null;
}

// Uploads a file to S3/R2/MinIO. Returns the public URL to embed in MDX.
export async function uploadImage(
  filePath: string,
  storage: StorageConfig,
): Promise<string> {
  const missingS3Config = !storage.s3.bucket ||
    !storage.s3.region ||
    !storage.s3.accessKey ||
    !storage.s3.secretKey;

  if (missingS3Config) {
    throw new Error('Configure S3 storage before inserting images. Open the workspace Config tab and add your bucket, region, access key, and secret key.');
  }

  const filename = filePath.replace(/\\/g, '/').split('/').pop() ?? 'image';
  const prefix = storage.s3.keyPrefix.replace(/\/$/, '');
  const key    = prefix ? `${prefix}/${filename}` : filename;
  const rawUrl = await invoke<string>('upload_to_s3', {
    filePath,
    s3Key:     key,
    endpoint:  storage.s3.endpoint,
    bucket:    storage.s3.bucket,
    region:    storage.s3.region,
    accessKey: storage.s3.accessKey,
    secretKey: storage.s3.secretKey,
  });
  return storage.s3.publicUrlPrefix
    ? `${storage.s3.publicUrlPrefix.replace(/\/$/, '')}/${key}`
    : rawUrl;
}

// Computes the public URL for an image by its filename.
export function imageUrl(imgName: string, storage: StorageConfig): string {
  const prefix  = storage.s3.keyPrefix.replace(/\/$/, '');
  const key     = prefix ? `${prefix}/${imgName}` : imgName;
  const pubBase = storage.s3.publicUrlPrefix?.replace(/\/$/, '');
  return pubBase ? `${pubBase}/${key}` : imgName;
}
