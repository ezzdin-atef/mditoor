import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useTranslation } from 'react-i18next';
import { AppLogo } from './AppLogo';

/** macOS keeps its native traffic-light title bar; Windows/Linux use this one. */
export const USE_CUSTOM_TITLEBAR =
  typeof navigator !== 'undefined' && !/Mac|iPhone|iPad/.test(navigator.platform);

/**
 * Frameless-window title bar painted with the app's own background so the
 * window chrome blends with the page. `tone` follows the page underneath it.
 */
export function TitleBar({ title, tone }: { title: string; tone: 'app' | 'page' }) {
  const { t } = useTranslation();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    win.isMaximized().then(setMaximized).catch(() => {});
    win.onResized(() => { win.isMaximized().then(setMaximized).catch(() => {}); })
      .then(fn => { unlisten = fn; })
      .catch(() => {});
    return () => unlisten?.();
  }, []);

  const win = () => getCurrentWindow();

  return (
    <div className={`titlebar titlebar-${tone}`} data-tauri-drag-region>
      <AppLogo size={16} className="titlebar-logo" />
      <span className="titlebar-title" data-tauri-drag-region>{title}</span>
      <div className="titlebar-controls">
        <button className="titlebar-btn" onClick={() => void win().minimize()} aria-label={t('window.minimize')} title={t('window.minimize')}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M0 5h10" stroke="currentColor" strokeWidth="1" /></svg>
        </button>
        <button className="titlebar-btn" onClick={() => void win().toggleMaximize()} aria-label={maximized ? t('window.restore') : t('window.maximize')} title={maximized ? t('window.restore') : t('window.maximize')}>
          {maximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <rect x="0.5" y="2.5" width="7" height="7" stroke="currentColor" />
              <path d="M2.5 2.5V0.5h7v7h-2" stroke="currentColor" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" /></svg>
          )}
        </button>
        <button className="titlebar-btn close" onClick={() => void win().close()} aria-label={t('window.close')} title={t('window.close')}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" /></svg>
        </button>
      </div>
    </div>
  );
}
