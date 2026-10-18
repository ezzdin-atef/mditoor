import { create } from 'zustand';
import { getVersion } from '@tauri-apps/api/app';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'upToDate'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error';

interface UpdaterStore {
  status: UpdateStatus;
  currentVersion: string;
  update: Update | null;
  progress: number | null; // 0..1, null when total size is unknown
  error: string | null;
  lastChecked: number | null;
  /** Set when something asks Settings to scroll the updates card into view. */
  reveal: boolean;
  loadVersion: () => Promise<void>;
  checkForUpdates: () => Promise<Update | null>;
  installUpdate: () => Promise<void>;
}

export const useUpdater = create<UpdaterStore>((set, get) => ({
  status: 'idle',
  currentVersion: '',
  update: null,
  progress: null,
  error: null,
  lastChecked: null,
  reveal: false,

  loadVersion: async () => {
    if (get().currentVersion) return;
    try { set({ currentVersion: await getVersion() }); } catch { /* not running in Tauri */ }
  },

  checkForUpdates: async () => {
    const { status } = get();
    if (status === 'checking' || status === 'downloading' || status === 'ready') return get().update;
    set({ status: 'checking', error: null });
    await get().loadVersion();
    try {
      const update = await check();
      set({ update, status: update ? 'available' : 'upToDate', lastChecked: Date.now() });
      return update;
    } catch (e) {
      set({ status: 'error', error: String(e), lastChecked: Date.now() });
      return null;
    }
  },

  installUpdate: async () => {
    const { update } = get();
    if (!update) return;
    set({ status: 'downloading', progress: null, error: null });
    let total = 0;
    let received = 0;
    try {
      await update.downloadAndInstall(event => {
        if (event.event === 'Started') total = event.data.contentLength ?? 0;
        if (event.event === 'Progress') {
          received += event.data.chunkLength;
          if (total) set({ progress: Math.min(received / total, 1) });
        }
      });
      // On Windows the NSIS installer closes the app itself; elsewhere restart.
      set({ status: 'ready', progress: 1 });
      await relaunch();
    } catch (e) {
      // Keep the update so the user can retry the install.
      set({ status: 'error', error: String(e) });
    }
  },
}));

export const hasPendingUpdate = (s: UpdaterStore) =>
  s.update != null && (s.status === 'available' || s.status === 'downloading' || s.status === 'ready' || s.status === 'error');

