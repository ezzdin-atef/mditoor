import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Workspace } from '../workspace/types';

export function CrosspostDialog({ targets, targetId, canonicalUrl, alreadyPublished, busy, onTargetChange, onCanonicalChange, onClose, onSend }: {
  targets: Workspace[];
  targetId: string;
  canonicalUrl: string;
  alreadyPublished: boolean;
  busy: boolean;
  onTargetChange: (id: string) => void;
  onCanonicalChange: (url: string) => void;
  onClose: () => void;
  onSend: (publish: boolean) => void;
}) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);
  return <dialog ref={dialogRef} className="modal mac-sheet crosspost-dialog" aria-labelledby="crosspost-title" onCancel={onClose}>
      <div className="px-6 pt-6 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <h2 id="crosspost-title" className="text-[18px] font-bold">{t('dev.sendToDev')}</h2>
        <p className="text-[12px] mt-1" style={{ color: 'var(--text-muted)' }}>{t('dev.crosspostHint')}</p>
      </div>
      <div className="px-6 py-5 space-y-4">
        <div>
          <label className="field-label" htmlFor="cross-target">{t('dev.account')}</label>
          <select id="cross-target" className="mac-input w-full" value={targetId} onChange={e => onTargetChange(e.target.value)}>
            {targets.map(target => <option key={target.id} value={target.id}>@{target.devUsername}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="cross-canonical">{t('dev.canonicalUrl')}</label>
          <input id="cross-canonical" type="url" className="mac-input w-full dir-ltr" value={canonicalUrl} onChange={e => onCanonicalChange(e.target.value)} placeholder="https://example.com/post" />
          <p className="field-hint">{t('dev.canonicalHint')}</p>
        </div>
        <div className="flex gap-2 justify-end flex-wrap">
          <button type="button" className="mac-btn" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
          <button type="button" className="mac-btn" onClick={() => onSend(alreadyPublished)} disabled={busy}>{alreadyPublished ? t('dev.syncChanges') : t('dev.saveDraft')}</button>
          {!alreadyPublished && <button type="button" className="mac-btn mac-btn-fun" onClick={() => onSend(true)} disabled={busy}>{busy ? t('dev.syncing') : t('dev.publish')}</button>}
        </div>
      </div>
  </dialog>;
}
