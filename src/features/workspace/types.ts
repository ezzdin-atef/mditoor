export type FieldType = 'text' | 'number' | 'boolean' | 'date' | 'select' | 'tags' | 'image';

export interface MetadataField {
  id: string;
  name: string;
  type: FieldType;
  required: boolean;
  options?: string[];
}

export interface S3StorageConfig {
  endpoint: string;
  bucket: string;
  region: string;
  accessKey: string;
  secretKey: string;
  publicUrlPrefix: string;
  keyPrefix: string;
}

export interface StorageConfig {
  s3: S3StorageConfig;
}

export const DEFAULT_STORAGE: StorageConfig = {
  s3: {
    endpoint: '',
    bucket: '',
    region: 'us-east-1',
    accessKey: '',
    secretKey: '',
    publicUrlPrefix: '',
    keyPrefix: 'images/',
  },
};

export interface Workspace {
  id: string;
  name: string;
  icon: string;
  mdxPath: string;
  colorIdx: number;
  metadataFields: MetadataField[];
  storage: StorageConfig;
  createdAt: string;
}
