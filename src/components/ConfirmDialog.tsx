import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';

interface ConfirmDialogOptions {
  title: ReactNode;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
}

interface PendingConfirmation extends ConfirmDialogOptions {
  resolve: (confirmed: boolean) => void;
}

function ConfirmDialog({
  options,
  onCancel,
  onConfirm,
}: {
  options: ConfirmDialogOptions;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const messageId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div
      className="confirm-dialog-overlay"
      role="presentation"
      onMouseDown={onCancel}
    >
      <section
        aria-describedby={messageId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="confirm-dialog mac-fade-in"
        role="alertdialog"
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="confirm-dialog-icon" aria-hidden="true">!</div>
        <div className="confirm-dialog-copy">
          <h2 id={titleId}>{options.title}</h2>
          <p id={messageId}>{options.message}</p>
        </div>
        <div className="confirm-dialog-actions">
          <button
            ref={cancelRef}
            className="mac-btn"
            onClick={onCancel}
            type="button"
          >
            {options.cancelLabel ?? 'Cancel'}
          </button>
          <button
            className="mac-btn confirm-dialog-danger-btn"
            onClick={onConfirm}
            type="button"
          >
            {options.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export function useConfirmDialog() {
  const [pending, setPending] = useState<PendingConfirmation | null>(null);

  const confirm = useCallback((options: ConfirmDialogOptions) => (
    new Promise<boolean>(resolve => {
      setPending({
        cancelLabel: 'Cancel',
        ...options,
        resolve,
      });
    })
  ), []);

  const cancel = useCallback(() => {
    setPending(current => {
      current?.resolve(false);
      return null;
    });
  }, []);

  const accept = useCallback(() => {
    setPending(current => {
      current?.resolve(true);
      return null;
    });
  }, []);

  return {
    confirm,
    confirmationDialog: pending ? (
      <ConfirmDialog
        options={pending}
        onCancel={cancel}
        onConfirm={accept}
      />
    ) : null,
  };
}
