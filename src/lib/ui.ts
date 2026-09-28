import { useEffect, useRef, useState } from 'react';

/** Modifier-key label for shortcut hints: "⌘" on macOS, "Ctrl+" elsewhere. */
export const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

/** True once the element has scrolled near the viewport (then stays true). */
export function useInView<T extends Element>(rootMargin = '200px') {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        setInView(true);
        io.disconnect();
      }
    }, { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [inView, rootMargin]);
  return [ref, inView] as const;
}

/** Localized "3 days ago" style string from a timestamp in milliseconds. */
export function relativeTime(ms: number, locale: string): string {
  if (!ms) return '';
  const diff = (ms - Date.now()) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000], ['month', 2592000], ['week', 604800],
    ['day', 86400], ['hour', 3600], ['minute', 60],
  ];
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, secs] of units) {
    if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
  }
  return rtf.format(Math.round(diff), 'second');
}

export function formatDate(value: string | number, locale: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Muted, readable-with-white-text colors for placeholders and avatars.
const SWATCHES = [
  '#0d8f86', '#2f78c4', '#d9663f', '#c28a12', '#3f9a5c', '#5b6fb8', '#c2566b', '#4f7f8c',
];

/** Deterministic solid color for placeholders and avatars. */
export function colorFor(seed: string): string {
  return SWATCHES[hash(seed) % SWATCHES.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = [...parts[0]][0] ?? '';
  const second = parts.length > 1 ? [...parts[parts.length - 1]][0] ?? '' : '';
  return (first + second).toUpperCase();
}

export function humanize(slug: string): string {
  const s = slug.replace(/[-_]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function joinPath(base: string, ...parts: string[]): string {
  const sep = base.includes('\\') && !base.includes('/') ? '\\' : '/';
  return [base.replace(/[\\/]+$/, ''), ...parts].join(sep);
}

const imageCache = new Map<string, Promise<string>>();

/** Memoizes async image loads (data URLs) so thumbnails survive re-renders and tab switches. */
export function cachedImage(key: string, load: () => Promise<string>): Promise<string> {
  let p = imageCache.get(key);
  if (!p) {
    p = load();
    imageCache.set(key, p);
    p.catch(() => imageCache.delete(key));
  }
  return p;
}

export function clearImageCache() {
  imageCache.clear();
}
