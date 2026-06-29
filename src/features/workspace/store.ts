import { create } from 'zustand';
import type { FieldType, MetadataField, Workspace } from './types';

const KEY = 'mditoor:workspaces';

const load = (): Workspace[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
};

const save = (workspaces: Workspace[]) =>
  localStorage.setItem(KEY, JSON.stringify(workspaces));

interface Store {
  workspaces: Workspace[];
  activeId: string | null;
  addWorkspace: (name: string, mdxPath: string) => void;
  deleteWorkspace: (id: string) => void;
  setActive: (id: string | null) => void;
  addField: (workspaceId: string, field: Omit<MetadataField, 'id'>) => void;
  updateField: (workspaceId: string, fieldId: string, updates: Partial<Omit<MetadataField, 'id'>>) => void;
  deleteField: (workspaceId: string, fieldId: string) => void;
}

let nextColor = 0;

export const useStore = create<Store>((set, get) => ({
  workspaces: load(),
  activeId: null,

  addWorkspace: (name, mdxPath) => {
    const w: Workspace = {
      id: crypto.randomUUID(),
      name,
      mdxPath,
      colorIdx: nextColor++ % 8,
      metadataFields: [],
      createdAt: new Date().toISOString(),
    };
    const workspaces = [...get().workspaces, w];
    save(workspaces);
    set({ workspaces, activeId: w.id });
  },

  deleteWorkspace: (id) => {
    const workspaces = get().workspaces.filter(w => w.id !== id);
    save(workspaces);
    const activeId = get().activeId === id ? (workspaces[0]?.id ?? null) : get().activeId;
    set({ workspaces, activeId });
  },

  setActive: (id) => set({ activeId: id }),

  addField: (workspaceId, field) => {
    const workspaces = get().workspaces.map(w =>
      w.id === workspaceId
        ? { ...w, metadataFields: [...w.metadataFields, { ...field, id: crypto.randomUUID() }] }
        : w,
    );
    save(workspaces);
    set({ workspaces });
  },

  updateField: (workspaceId, fieldId, updates) => {
    const workspaces = get().workspaces.map(w =>
      w.id === workspaceId
        ? {
            ...w,
            metadataFields: w.metadataFields.map(f =>
              f.id === fieldId ? { ...f, ...updates } : f,
            ),
          }
        : w,
    );
    save(workspaces);
    set({ workspaces });
  },

  deleteField: (workspaceId, fieldId) => {
    const workspaces = get().workspaces.map(w =>
      w.id === workspaceId
        ? { ...w, metadataFields: w.metadataFields.filter(f => f.id !== fieldId) }
        : w,
    );
    save(workspaces);
    set({ workspaces });
  },
}));

export const COLORS = [
  { start: '#8b5cf6', end: '#6d28d9', bg: '#f5f3ff' },
  { start: '#3b82f6', end: '#1d4ed8', bg: '#eff6ff' },
  { start: '#10b981', end: '#059669', bg: '#ecfdf5' },
  { start: '#f59e0b', end: '#d97706', bg: '#fffbeb' },
  { start: '#ef4444', end: '#dc2626', bg: '#fef2f2' },
  { start: '#ec4899', end: '#db2777', bg: '#fdf2f8' },
  { start: '#06b6d4', end: '#0891b2', bg: '#ecfeff' },
  { start: '#84cc16', end: '#65a30d', bg: '#f7fee7' },
] as const;

export const fieldTypeMap: Record<
  FieldType,
  { label: string; emoji: string; desc: string }
> = {
  text:    { label: 'Text',    emoji: '📝', desc: 'Plain text string' },
  number:  { label: 'Number',  emoji: '🔢', desc: 'Numeric value' },
  boolean: { label: 'Boolean', emoji: '✅', desc: 'True / false toggle' },
  date:    { label: 'Date',    emoji: '📅', desc: 'Date or datetime' },
  select:  { label: 'Select',  emoji: '🎯', desc: 'One of many options' },
  tags:    { label: 'Tags',    emoji: '🏷️', desc: 'Array of strings' },
};
