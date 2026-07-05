import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { DEFAULT_STORAGE } from './types';
import type { FieldType, MetadataField, StorageConfig, Workspace } from './types';

const LS_KEY = 'mditoor:workspaces';
const FILE   = 'workspaces.json';
const DEFAULT_WORKSPACE_ICON = '📝';

// Only id/name/icon/mdxPath/colorIdx/createdAt go in workspaces.json.
// metadataFields and storage live in per-workspace .mditoor.json.
export type StoredWorkspace = Omit<Workspace, 'metadataFields' | 'storage'>;

const withWorkspaceDefaults = (w: StoredWorkspace): Workspace => ({
  ...w,
  icon: w.icon ?? DEFAULT_WORKSPACE_ICON,
  metadataFields: [],
  storage: { ...DEFAULT_STORAGE },
});

const load = (): Workspace[] => {
  try {
    const stored: StoredWorkspace[] = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]');
    return stored.map(withWorkspaceDefaults);
  } catch {
    return [];
  }
};

const save = (workspaces: Workspace[]) => {
  const toStore: StoredWorkspace[] = workspaces.map(
    ({ metadataFields: _f, storage: _s, ...rest }) => rest,
  );
  localStorage.setItem(LS_KEY, JSON.stringify(toStore));
  invoke('write_app_data', { file: FILE, content: JSON.stringify(toStore, null, 2) })
    .catch(() => { /* non-fatal */ });
};

interface WorkspaceConfig {
  metadataFields: MetadataField[];
  storage?: StorageConfig;
}

const readConfig = async (mdxPath: string): Promise<{ metadataFields: MetadataField[]; storage: StorageConfig }> => {
  try {
    const json = await invoke<string>('read_workspace_config', { mdxPath });
    const cfg: WorkspaceConfig = JSON.parse(json);
    return {
      metadataFields: cfg.metadataFields ?? [],
      storage: cfg.storage ? { ...DEFAULT_STORAGE, ...cfg.storage } : { ...DEFAULT_STORAGE },
    };
  } catch {
    return { metadataFields: [], storage: { ...DEFAULT_STORAGE } };
  }
};

const writeConfig = (mdxPath: string, metadataFields: MetadataField[], storage: StorageConfig): Promise<void> => {
  const cfg: WorkspaceConfig = { metadataFields, storage };
  return invoke('write_workspace_config', { mdxPath, config: JSON.stringify(cfg, null, 2) });
};

interface Store {
  workspaces: Workspace[];
  activeId: string | null;
  hydrateWorkspaces: (stored: StoredWorkspace[]) => void;
  addWorkspace: (name: string, mdxPath: string) => Promise<void>;
  updateWorkspace: (id: string, updates: Partial<Pick<Workspace, 'name' | 'mdxPath' | 'icon'>>) => Promise<void>;
  deleteWorkspace: (id: string) => void;
  setActive: (id: string | null) => Promise<void>;
  addField: (workspaceId: string, field: Omit<MetadataField, 'id'>) => Promise<void>;
  updateField: (workspaceId: string, fieldId: string, updates: Partial<Omit<MetadataField, 'id'>>) => Promise<void>;
  deleteField: (workspaceId: string, fieldId: string) => Promise<void>;
  updateStorage: (workspaceId: string, storage: StorageConfig) => Promise<void>;
}

let nextColor = 0;

export const useStore = create<Store>((set, get) => ({
  workspaces: load(),
  activeId: null,

  hydrateWorkspaces: (stored) => {
    const workspaces = stored.map(withWorkspaceDefaults);
    localStorage.setItem(LS_KEY, JSON.stringify(stored));
    const currentId = get().activeId;
    const activeId  = workspaces.some(w => w.id === currentId) ? currentId : (workspaces[0]?.id ?? null);
    set({ workspaces, activeId });
  },

  addWorkspace: async (name, mdxPath) => {
    const w: Workspace = {
      id: crypto.randomUUID(),
      name,
      icon: DEFAULT_WORKSPACE_ICON,
      mdxPath,
      colorIdx: nextColor++ % 8,
      metadataFields: [],
      storage: { ...DEFAULT_STORAGE },
      createdAt: new Date().toISOString(),
    };
    const workspaces = [...get().workspaces, w];
    save(workspaces);
    await writeConfig(mdxPath, [], { ...DEFAULT_STORAGE });
    set({ workspaces, activeId: w.id });
  },

  updateWorkspace: async (id, updates) => {
    const current = get().workspaces.find(w => w.id === id);
    if (!current) return;

    const nextWorkspaces = get().workspaces.map(w =>
      w.id === id
        ? {
            ...w,
            ...updates,
            name: updates.name?.trim() || w.name,
            mdxPath: updates.mdxPath?.trim() || w.mdxPath,
            icon: updates.icon?.trim() || w.icon || DEFAULT_WORKSPACE_ICON,
          }
        : w,
    );

    set({ workspaces: nextWorkspaces });
    save(nextWorkspaces);

    const updated = nextWorkspaces.find(w => w.id === id);
    if (updated && updated.mdxPath !== current.mdxPath) {
      await writeConfig(updated.mdxPath, current.metadataFields, current.storage);
    }
  },

  deleteWorkspace: (id) => {
    const workspaces = get().workspaces.filter(w => w.id !== id);
    save(workspaces);
    const activeId = get().activeId === id ? (workspaces[0]?.id ?? null) : get().activeId;
    set({ workspaces, activeId });
  },

  setActive: async (id) => {
    set({ activeId: id });
    if (!id) return;
    const workspace = get().workspaces.find(w => w.id === id);
    if (!workspace) return;
    const { metadataFields, storage } = await readConfig(workspace.mdxPath);
    set(state => ({
      workspaces: state.workspaces.map(w =>
        w.id === id ? { ...w, metadataFields, storage } : w,
      ),
    }));
  },

  addField: async (workspaceId, field) => {
    const workspaces = get().workspaces.map(w =>
      w.id === workspaceId
        ? { ...w, metadataFields: [...w.metadataFields, { ...field, id: crypto.randomUUID() }] }
        : w,
    );
    set({ workspaces });
    const ws = workspaces.find(w => w.id === workspaceId);
    if (ws) await writeConfig(ws.mdxPath, ws.metadataFields, ws.storage);
  },

  updateField: async (workspaceId, fieldId, updates) => {
    const workspaces = get().workspaces.map(w =>
      w.id === workspaceId
        ? { ...w, metadataFields: w.metadataFields.map(f => f.id === fieldId ? { ...f, ...updates } : f) }
        : w,
    );
    set({ workspaces });
    const ws = workspaces.find(w => w.id === workspaceId);
    if (ws) await writeConfig(ws.mdxPath, ws.metadataFields, ws.storage);
  },

  deleteField: async (workspaceId, fieldId) => {
    const workspaces = get().workspaces.map(w =>
      w.id === workspaceId
        ? { ...w, metadataFields: w.metadataFields.filter(f => f.id !== fieldId) }
        : w,
    );
    set({ workspaces });
    const ws = workspaces.find(w => w.id === workspaceId);
    if (ws) await writeConfig(ws.mdxPath, ws.metadataFields, ws.storage);
  },

  updateStorage: async (workspaceId, storage) => {
    const workspaces = get().workspaces.map(w =>
      w.id === workspaceId ? { ...w, storage } : w,
    );
    set({ workspaces });
    const ws = workspaces.find(w => w.id === workspaceId);
    if (ws) await writeConfig(ws.mdxPath, ws.metadataFields, storage);
  },
}));

// macOS system palette
export const COLORS = [
  { start: '#007AFF', end: '#005EC4' },
  { start: '#34C759', end: '#248A3D' },
  { start: '#FF9500', end: '#C97800' },
  { start: '#FF3B30', end: '#D70015' },
  { start: '#AF52DE', end: '#8944AB' },
  { start: '#FF2D55', end: '#C9001F' },
  { start: '#32ADE6', end: '#0071A4' },
  { start: '#5856D6', end: '#3634A3' },
] as const;

export const fieldTypeMap: Record<
  FieldType,
  { label: string; emoji: string; desc: string }
> = {
  text:    { label: 'Text',    emoji: '📝', desc: 'Plain text string' },
  number:  { label: 'Number',  emoji: '123', desc: 'Numeric value' },
  boolean: { label: 'Boolean', emoji: '◉', desc: 'True / false toggle' },
  date:    { label: 'Date',    emoji: '📅', desc: 'Date or datetime' },
  select:  { label: 'Select',  emoji: '≡', desc: 'One of many options' },
  tags:    { label: 'Tags',    emoji: '#', desc: 'Array of strings' },
  image:   { label: 'Image',   emoji: '🖼', desc: 'Image upload / URL' },
};
