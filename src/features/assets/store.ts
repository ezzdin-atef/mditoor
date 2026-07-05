import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface S3Config {
  endpoint: string;
  bucket: string;
  region: string;
  accessKey: string;
  secretKey: string;
  publicUrlPrefix: string;
  keyPrefix: string;
}

const DEFAULTS: S3Config = {
  endpoint: '',
  bucket: '',
  region: 'us-east-1',
  accessKey: '',
  secretKey: '',
  publicUrlPrefix: '',
  keyPrefix: 'images/',
};

const FILE = 's3-config.json';

interface S3Store {
  config: S3Config;
  loaded: boolean;
  load: () => Promise<void>;
  save: (config: S3Config) => Promise<void>;
}

export const useS3Store = create<S3Store>((set) => ({
  config: { ...DEFAULTS },
  loaded: false,

  load: async () => {
    try {
      const json = await invoke<string>('read_app_data', { file: FILE });
      const config = json ? { ...DEFAULTS, ...JSON.parse(json) } : { ...DEFAULTS };
      set({ config, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  save: async (config) => {
    await invoke('write_app_data', { file: FILE, content: JSON.stringify(config, null, 2) });
    set({ config });
  },
}));
