import { create } from 'zustand';
import { IconAlert, IconCheck, IconInfo, IconX } from './Icons';

type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  detail?: string;
}

interface ToastStore {
  items: ToastItem[];
  push: (kind: ToastKind, title: string, detail?: string) => void;
  dismiss: (id: number) => void;
}

let seq = 0;

const useToastStore = create<ToastStore>((set, get) => ({
  items: [],
  push: (kind, title, detail) => {
    const id = ++seq;
    set({ items: [...get().items.slice(-3), { id, kind, title, detail }] });
    // Errors linger longer so their output can be read.
    window.setTimeout(() => get().dismiss(id), kind === 'error' ? 9000 : 3800);
  },
  dismiss: id => set({ items: get().items.filter(t => t.id !== id) }),
}));

export const toast = {
  success: (title: string, detail?: string) => useToastStore.getState().push('success', title, detail),
  error:   (title: string, detail?: string) => useToastStore.getState().push('error', title, detail),
  info:    (title: string, detail?: string) => useToastStore.getState().push('info', title, detail),
};

export function Toaster() {
  const { items, dismiss } = useToastStore();
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {items.map(item => (
        <div key={item.id} className={`toast ${item.kind}`}>
          <span className="toast-icon">
            {item.kind === 'success' ? <IconCheck size={14} /> : item.kind === 'error' ? <IconAlert size={14} /> : <IconInfo size={14} />}
          </span>
          <div className="flex-1 min-w-0">
            <div className="toast-title">{item.title}</div>
            {item.detail && <div className="toast-detail ui-mono">{item.detail}</div>}
          </div>
          <button className="icon-btn icon-btn-sm" onClick={() => dismiss(item.id)} aria-label="Dismiss">
            <IconX size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
