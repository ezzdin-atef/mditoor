import { useTranslation } from 'react-i18next';
import { IconGrid, IconList } from './Icons';
import type { CollectionView } from '../features/settings/viewPrefs';

export function ViewToggle({ value, onChange }: { value: CollectionView; onChange: (v: CollectionView) => void }) {
  const { t } = useTranslation();
  return (
    <div className="mac-segmented" role="radiogroup" aria-label={t('view.label')}>
      {(['gallery', 'list'] as const).map(v => (
        <button
          key={v}
          role="radio"
          aria-checked={value === v}
          title={t(`view.${v}`)}
          onClick={() => onChange(v)}
          className={`mac-segment${value === v ? ' active' : ''}`}
        >
          {v === 'gallery' ? <IconGrid size={14} /> : <IconList size={14} />}
          <span className="hidden md:inline">{t(`view.${v}`)}</span>
        </button>
      ))}
    </div>
  );
}
