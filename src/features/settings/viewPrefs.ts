import { create } from 'zustand';

export type CollectionView = 'gallery' | 'list';
export type PostSort = 'updated' | 'title' | 'date';
export type SidebarTab = 'meta' | 'seo';

interface ViewPrefs {
  postsView: CollectionView;
  imagesView: CollectionView;
  postSort: PostSort;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  sidebarTab: SidebarTab;
  ideasView: 'board' | 'list';
  set:<K extends Exclude<keyof ViewPrefs, 'set'>>(key: K, value: ViewPrefs[K]) => void;
}

const LS_KEY = 'mditoor:view-prefs';

type Stored = Omit<ViewPrefs, 'set'>;

const DEFAULTS: Stored = {
  postsView: 'gallery',
  imagesView: 'gallery',
  postSort: 'updated',
  sidebarWidth: 300,
  sidebarCollapsed: false,
  sidebarTab: 'meta',
  ideasView: 'board',
};

function load(): Stored {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

// Per-machine UI conveniences (how collections are displayed, sidebar size);
// not worth round-tripping through settings.json.
export const useViewPrefs = create<ViewPrefs>((set, get) => ({
  ...load(),
  set: (key, value) => {
    set({ [key]: value } as Partial<ViewPrefs>);
    const { set: _s, ...rest } = get();
    try { localStorage.setItem(LS_KEY, JSON.stringify(rest)); } catch { /* ignore */ }
  },
}));
