import { create } from 'zustand';

export type Route =
  | { page: 'workspace' }
  | {
      page: 'editor';
      workspaceId: string;
      slug: string;
      isNew: boolean;
      /** Starting content for a new post (e.g. created from an idea). */
      seed?: { title?: string; body?: string };
    }
  | { page: 'settings' };

interface RouterStore {
  route: Route;
  navigate: (r: Route) => void;
}

export const useRouter = create<RouterStore>(set => ({
  route: { page: 'workspace' },
  navigate: route => set({ route }),
}));
