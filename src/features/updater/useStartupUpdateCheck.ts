import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '../../components/Toast';
import { useSettings } from '../settings/store';
import { useUpdater } from './store';

// Quietly checks for a new release a few seconds after launch (production
// builds only, unless the user turned it off). A found update shows a toast
// once and leaves a pill in the title bar until it is installed.
export function useStartupUpdateCheck() {
  const { t } = useTranslation();

  useEffect(() => {
    void useUpdater.getState().loadVersion();
    if (import.meta.env.DEV) return;
    // The delay also lets settings hydrate from disk before we read them.
    const timer = window.setTimeout(async () => {
      if (!useSettings.getState().autoCheckUpdates) return;
      const update = await useUpdater.getState().checkForUpdates();
      if (update) toast.info(t('updater.availableToast', { version: update.version }), t('updater.availableToastHint'));
    }, 5000);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
