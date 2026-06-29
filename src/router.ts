import { create } from 'zustand';

export type Route =
  | { page: 'workspace' }
  | { page: 'editor'; workspaceId: string; slug: string; isNew: boolean }
  | { page: 'settings' };

interface RouterStore {
  route: Route;
  navigate: (r: Route) => void;
}

export const useRouter = create<RouterStore>(set => ({
  route: { page: 'workspace' },
  navigate: route => set({ route }),
}));
