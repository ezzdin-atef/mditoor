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

/** Runs before leaving the current page; resolving false cancels (e.g. a save failed). */
type LeaveGuard = () => Promise<boolean>;

interface RouterStore {
  route: Route;
  /** Visited pages, oldest first; `index` is the current one. Back/forward move along it. */
  history: Route[];
  index: number;
  navigate: (r: Route) => void;
  back: () => Promise<void>;
  forward: () => Promise<void>;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  /** The current page registers a guard while it has something to save; returns an unregister. */
  setLeaveGuard: (guard: LeaveGuard) => () => void;
}

const sameRoute = (a: Route, b: Route) =>
  a.page === b.page &&
  (a.page !== 'editor' || (b.page === 'editor' && a.workspaceId === b.workspaceId && a.slug === b.slug));

// A post is only "new" (and seeded) the first time it opens. Coming back to it later must
// read the saved file, not start a fresh draft that would overwrite it.
const revisit = (r: Route): Route => (r.page === 'editor' ? { ...r, isNew: false, seed: undefined } : r);

const MAX_HISTORY = 50;
let guard: LeaveGuard | null = null;

export const useRouter = create<RouterStore>((set, get) => ({
  route: { page: 'workspace' },
  history: [{ page: 'workspace' }],
  index: 0,

  navigate: route => {
    const { history, index, route: current } = get();
    if (sameRoute(current, route)) { set({ route }); return; }
    // Going to the page we just came from (e.g. the editor's own Back button) is a step back,
    // so the next mouse Back doesn't bounce into the page that was just left.
    if (index > 0 && sameRoute(history[index - 1], route)) {
      set({ route: revisit(route), index: index - 1 });
      return;
    }
    const next = [...history.slice(0, index + 1), route].slice(-MAX_HISTORY);
    set({ route, history: next, index: next.length - 1 });
  },

  back: async () => {
    const { history, index } = get();
    if (index === 0) return;
    if (guard && !(await guard())) return;
    set({ route: revisit(history[index - 1]), index: index - 1 });
  },

  forward: async () => {
    const { history, index } = get();
    if (index >= history.length - 1) return;
    if (guard && !(await guard())) return;
    set({ route: revisit(history[index + 1]), index: index + 1 });
  },

  canGoBack: () => get().index > 0,
  canGoForward: () => get().index < get().history.length - 1,

  setLeaveGuard: g => {
    guard = g;
    return () => { if (guard === g) guard = null; };
  },
}));

/**
 * Mouse side buttons (back = 3, forward = 4) and Alt+Left / Alt+Right move through the
 * app's history like a browser. Call once at the app root.
 */
export function installHistoryInput(): () => void {
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  // Swallow the side buttons' own press too, so the webview never tries its own navigation.
  const swallow = (e: MouseEvent) => { if (e.button === 3 || e.button === 4) e.preventDefault(); };
  const onMouseUp = (e: MouseEvent) => {
    if (e.button === 3) { e.preventDefault(); void useRouter.getState().back(); }
    if (e.button === 4) { e.preventDefault(); void useRouter.getState().forward(); }
  };
  // Alt+arrows only off macOS, where Option+arrows move the cursor by word.
  const onKey = (e: KeyboardEvent) => {
    if (isMac || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); void useRouter.getState().back(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); void useRouter.getState().forward(); }
  };
  window.addEventListener('mousedown', swallow);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('auxclick', swallow);
  window.addEventListener('keydown', onKey);
  return () => {
    window.removeEventListener('mousedown', swallow);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('auxclick', swallow);
    window.removeEventListener('keydown', onKey);
  };
}
