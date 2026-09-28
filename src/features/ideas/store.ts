import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export type IdeaStatus = 'inbox' | 'next' | 'drafted';
export const IDEA_STATUSES: IdeaStatus[] = ['inbox', 'next', 'drafted'];

export interface Idea {
  id: string;
  title: string;
  notes: string;
  tags: string[];
  status: IdeaStatus;
  starred: boolean;
  /** Post created from this idea, once "Start writing" was used. */
  slug?: string;
  createdAt: string;
  updatedAt: string;
}

interface IdeasFile {
  version: 1;
  ideas: Idea[];
}

interface IdeasState {
  /** Ideas per workspace folder (mdxPath). */
  byPath: Record<string, Idea[]>;
  loading: Record<string, boolean>;
  error: Record<string, string | null>;
  load: (mdxPath: string, force?: boolean) => Promise<Idea[]>;
  add: (mdxPath: string, draft: Partial<Idea> & { title: string }) => Promise<Idea>;
  update: (mdxPath: string, id: string, patch: Partial<Omit<Idea, 'id' | 'createdAt'>>) => void;
  remove: (mdxPath: string, id: string) => void;
  removeMany: (mdxPath: string, ids: string[]) => void;
}

const inflight = new Map<string, Promise<Idea[]>>();
const saveTimers = new Map<string, number>();

function normalize(raw: unknown): Idea[] {
  const list = (raw as Partial<IdeasFile>)?.ideas;
  if (!Array.isArray(list)) return [];
  return list
    .filter(i => i && typeof i.id === 'string' && typeof i.title === 'string')
    .map(i => ({
      ...i,
      notes: i.notes ?? '',
      tags: Array.isArray(i.tags) ? i.tags : [],
      status: IDEA_STATUSES.includes(i.status) ? i.status : 'inbox',
      starred: Boolean(i.starred),
    }));
}

export const useIdeas = create<IdeasState>((set, get) => {
  // Debounced write so typing in notes doesn't hit the disk on every keystroke.
  const persist = (mdxPath: string) => {
    const prev = saveTimers.get(mdxPath);
    if (prev) window.clearTimeout(prev);
    saveTimers.set(mdxPath, window.setTimeout(() => {
      saveTimers.delete(mdxPath);
      const file: IdeasFile = { version: 1, ideas: get().byPath[mdxPath] ?? [] };
      invoke('write_ideas', { mdxPath, content: JSON.stringify(file, null, 2) + '\n' })
        .catch(e => set(s => ({ error: { ...s.error, [mdxPath]: String(e) } })));
    }, 350));
  };

  const mutate = (mdxPath: string, fn: (ideas: Idea[]) => Idea[]) => {
    set(s => ({ byPath: { ...s.byPath, [mdxPath]: fn(s.byPath[mdxPath] ?? []) } }));
    persist(mdxPath);
  };

  return {
    byPath: {},
    loading: {},
    error: {},

    load: (mdxPath, force = false) => {
      const cached = get().byPath[mdxPath];
      if (cached && !force) return Promise.resolve(cached);
      // A pending save means memory is newer than disk; don't clobber it.
      if (saveTimers.has(mdxPath) && cached) return Promise.resolve(cached);
      const pending = inflight.get(mdxPath);
      if (pending) return pending;

      set(s => ({ loading: { ...s.loading, [mdxPath]: true }, error: { ...s.error, [mdxPath]: null } }));
      const p = invoke<string>('read_ideas', { mdxPath })
        .then(json => {
          const ideas = normalize(JSON.parse(json));
          set(s => ({ byPath: { ...s.byPath, [mdxPath]: ideas } }));
          return ideas;
        })
        .catch(e => {
          set(s => ({ error: { ...s.error, [mdxPath]: String(e) } }));
          return get().byPath[mdxPath] ?? [];
        })
        .finally(() => {
          inflight.delete(mdxPath);
          set(s => ({ loading: { ...s.loading, [mdxPath]: false } }));
        });
      inflight.set(mdxPath, p);
      return p;
    },

    add: async (mdxPath, draft) => {
      // Make sure the file is loaded first, or the first save would overwrite it.
      await get().load(mdxPath);
      const now = new Date().toISOString();
      const idea: Idea = {
        id: crypto.randomUUID(),
        notes: '',
        tags: [],
        status: 'inbox',
        starred: false,
        ...draft,
        title: draft.title.trim(),
        createdAt: now,
        updatedAt: now,
      };
      mutate(mdxPath, ideas => [idea, ...ideas]);
      return idea;
    },

    update: (mdxPath, id, patch) => {
      mutate(mdxPath, ideas => ideas.map(i =>
        i.id === id ? { ...i, ...patch, updatedAt: new Date().toISOString() } : i,
      ));
    },

    remove: (mdxPath, id) => {
      mutate(mdxPath, ideas => ideas.filter(i => i.id !== id));
    },

    removeMany: (mdxPath, ids) => {
      const drop = new Set(ids);
      mutate(mdxPath, ideas => ideas.filter(i => !drop.has(i.id)));
    },
  };
});

/** Starred first, then most recently touched. */
export function sortIdeas(ideas: Idea[]): Idea[] {
  return [...ideas].sort((a, b) =>
    Number(b.starred) - Number(a.starred) || b.updatedAt.localeCompare(a.updatedAt));
}
