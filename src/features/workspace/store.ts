import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { DEFAULT_PROFILE, DEFAULT_STORAGE, FRAMEWORK_PRESETS, normalizeProfile, normalizeStorage } from './types';
import type { FieldType, Framework, MetadataField, ProjectInfo, SiteProfile, StorageConfig, Workspace } from './types';

const LS_KEY = 'mditoor:workspaces';
const FILE   = 'workspaces.json';
const DEFAULT_WORKSPACE_ICON = '📝';

// Only id/name/icon/mdxPath/rootPath/colorIdx/createdAt go in workspaces.json.
// metadataFields, storage and profile live in per-workspace .mditoor.json.
export type StoredWorkspace = Omit<Workspace, 'metadataFields' | 'storage' | 'profile'>;

const withWorkspaceDefaults = (w: StoredWorkspace): Workspace => ({
  ...w,
  icon: w.icon ?? DEFAULT_WORKSPACE_ICON,
  metadataFields: [],
  storage: { ...DEFAULT_STORAGE },
  profile: { ...DEFAULT_PROFILE },
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
    ({ metadataFields: _f, storage: _s, profile: _p, ...rest }) => rest,
  );
  localStorage.setItem(LS_KEY, JSON.stringify(toStore));
  invoke('write_app_data', { file: FILE, content: JSON.stringify(toStore, null, 2) })
    .catch(() => { /* non-fatal */ });
};

interface WorkspaceConfig {
  metadataFields: MetadataField[];
  storage?: Partial<StorageConfig>;
  profile?: Partial<SiteProfile>;
}

type ConfigParts = Pick<Workspace, 'metadataFields' | 'storage' | 'profile'>;

const readConfig = async (mdxPath: string): Promise<ConfigParts & { hasProfile: boolean; hasStorage: boolean }> => {
  try {
    const json = await invoke<string>('read_workspace_config', { mdxPath });
    const cfg: WorkspaceConfig = JSON.parse(json);
    return {
      metadataFields: cfg.metadataFields ?? [],
      storage: normalizeStorage(cfg.storage),
      profile: normalizeProfile(cfg.profile),
      hasProfile: Boolean(cfg.profile),
      hasStorage: Boolean(cfg.storage),
    };
  } catch {
    return { metadataFields: [], storage: { ...DEFAULT_STORAGE }, profile: { ...DEFAULT_PROFILE }, hasProfile: false, hasStorage: false };
  }
};

const writeConfig = (w: Pick<Workspace, 'mdxPath'> & ConfigParts): Promise<void> => {
  const cfg: WorkspaceConfig = { metadataFields: w.metadataFields, storage: w.storage, profile: w.profile };
  return invoke('write_workspace_config', { mdxPath: w.mdxPath, config: JSON.stringify(cfg, null, 2) });
};

export const detectProject = (path: string) => invoke<ProjectInfo>('detect_project', { path });

const countPosts = (path: string, profile: SiteProfile) =>
  invoke<string[]>('list_mdx_slugs', { path, profile }).catch(() => [] as string[]);

/**
 * The framework preset is a guess; existing posts are the truth. Hugo and Eleventy sites
 * use both page bundles and single files, so pick whichever layout finds more posts.
 */
async function inferProfile(mdxPath: string, preset: SiteProfile): Promise<SiteProfile> {
  const [folder, flat] = await Promise.all([
    countPosts(mdxPath, { ...preset, layout: 'folder' }),
    countPosts(mdxPath, { ...preset, layout: 'flat' }),
  ]);
  if (folder.length === 0 && flat.length === 0) return preset;
  if (folder.length > flat.length) return { ...preset, layout: 'folder' };
  const dated = flat.filter(slug => /^\d{4}-\d{2}-\d{2}-/.test(slug)).length;
  return { ...preset, layout: dated > flat.length / 2 ? 'dated' : 'flat' };
}

export interface NewWorkspace {
  name: string;
  mdxPath: string;
  rootPath?: string;
  icon?: string;
  framework?: Framework;
}

interface Store {
  workspaces: Workspace[];
  activeId: string | null;
  hydrateWorkspaces: (stored: StoredWorkspace[]) => void;
  addWorkspace: (input: NewWorkspace) => Promise<void>;
  updateWorkspace: (id: string, updates: Partial<Pick<Workspace, 'name' | 'mdxPath' | 'rootPath' | 'icon'>>) => Promise<void>;
  deleteWorkspace: (id: string) => void;
  setActive: (id: string | null) => Promise<void>;
  addField: (workspaceId: string, field: Omit<MetadataField, 'id'>) => Promise<void>;
  updateField: (workspaceId: string, fieldId: string, updates: Partial<Omit<MetadataField, 'id'>>) => Promise<void>;
  deleteField: (workspaceId: string, fieldId: string) => Promise<void>;
  reorderFields: (workspaceId: string, orderedFieldIds: string[]) => Promise<void>;
  updateStorage: (workspaceId: string, storage: StorageConfig) => Promise<void>;
  updateProfile: (workspaceId: string, profile: SiteProfile) => Promise<void>;
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
    set({ workspaces });
    // withWorkspaceDefaults always resets metadataFields to []; setActive re-reads
    // the per-workspace .mditoor.json so the restored workspace's fields aren't lost.
    void get().setActive(activeId);
  },

  addWorkspace: async ({ name, mdxPath, rootPath, icon, framework = 'generic' }) => {
    // An existing .mditoor.json (e.g. committed by a teammate) wins over the detected defaults.
    const existing = await readConfig(mdxPath);
    const preset = FRAMEWORK_PRESETS[framework];
    const w: Workspace = {
      id: crypto.randomUUID(),
      name,
      icon: icon || DEFAULT_WORKSPACE_ICON,
      mdxPath,
      rootPath,
      colorIdx: nextColor++ % 8,
      metadataFields: existing.metadataFields,
      storage: existing.hasStorage ? existing.storage : { ...DEFAULT_STORAGE, local: { ...preset.local } },
      profile: existing.hasProfile ? existing.profile : await inferProfile(mdxPath, preset.profile),
      createdAt: new Date().toISOString(),
    };
    const workspaces = [...get().workspaces, w];
    save(workspaces);
    await writeConfig(w);
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
      await writeConfig(updated);
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
    const { metadataFields, storage, profile } = await readConfig(workspace.mdxPath);
    // Workspaces created before project roots existed: find the root once and remember it.
    const rootPath = workspace.rootPath
      ?? await detectProject(workspace.mdxPath).then(p => p.root ?? undefined).catch(() => undefined);
    const workspaces = get().workspaces.map(w =>
      w.id === id ? { ...w, metadataFields, storage, profile, rootPath } : w,
    );
    set({ workspaces });
    if (rootPath !== workspace.rootPath) save(workspaces);
  },

  addField: async (workspaceId, field) => {
    const workspaces = get().workspaces.map(w =>
      w.id === workspaceId
        ? { ...w, metadataFields: [...w.metadataFields, { ...field, id: crypto.randomUUID() }] }
        : w,
    );
    set({ workspaces });
    const ws = workspaces.find(w => w.id === workspaceId);
    if (ws) await writeConfig(ws);
  },

  updateField: async (workspaceId, fieldId, updates) => {
    const workspaces = get().workspaces.map(w =>
      w.id === workspaceId
        ? { ...w, metadataFields: w.metadataFields.map(f => f.id === fieldId ? { ...f, ...updates } : f) }
        : w,
    );
    set({ workspaces });
    const ws = workspaces.find(w => w.id === workspaceId);
    if (ws) await writeConfig(ws);
  },

  deleteField: async (workspaceId, fieldId) => {
    const workspaces = get().workspaces.map(w =>
      w.id === workspaceId
        ? { ...w, metadataFields: w.metadataFields.filter(f => f.id !== fieldId) }
        : w,
    );
    set({ workspaces });
    const ws = workspaces.find(w => w.id === workspaceId);
    if (ws) await writeConfig(ws);
  },

  reorderFields: async (workspaceId, orderedFieldIds) => {
    const workspaces = get().workspaces.map(w => {
      if (w.id !== workspaceId) return w;
      const byId = new Map(w.metadataFields.map(f => [f.id, f]));
      const reordered = orderedFieldIds.map(id => byId.get(id)).filter((f): f is MetadataField => !!f);
      return { ...w, metadataFields: reordered };
    });
    set({ workspaces });
    const ws = workspaces.find(w => w.id === workspaceId);
    if (ws) await writeConfig(ws);
  },

  updateStorage: async (workspaceId, storage) => {
    const workspaces = get().workspaces.map(w =>
      w.id === workspaceId ? { ...w, storage } : w,
    );
    set({ workspaces });
    const ws = workspaces.find(w => w.id === workspaceId);
    if (ws) await writeConfig(ws);
  },

  updateProfile: async (workspaceId, profile) => {
    const workspaces = get().workspaces.map(w =>
      w.id === workspaceId ? { ...w, profile } : w,
    );
    set({ workspaces });
    const ws = workspaces.find(w => w.id === workspaceId);
    if (ws) await writeConfig(ws);
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
