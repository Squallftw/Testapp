import { useState } from 'react';
import { Modal } from './Modal';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Body explaining the consequence. Plain text or ReactNode. */
  description: React.ReactNode;
  /** Label for the destructive button. Default « Confirmer ». */
  confirmLabel?: string;
  /** Label for the cancel button. Default « Annuler ». */
  cancelLabel?: string;
  /** Color the confirm button as destructive (terracotta). */
  destructive?: boolean;
  /**
   * Called when the user confirms. Async — the dialog shows a pending state
   * while the promise is in flight and stays open on rejection.
   */
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} size="md">
      <div className="text-sm text-bati-text leading-relaxed">{description}</div>
      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          disabled={pending}
          className="px-4 py-2 text-sm font-medium text-bati-text hover:bg-bati-border-soft rounded-md transition-colors disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={pending}
          className={
            destructive
              ? 'px-4 py-2 text-sm font-medium text-white bg-bati-terra hover:opacity-90 rounded-md transition-opacity disabled:opacity-50'
              : 'px-4 py-2 text-sm font-medium text-white bg-bati-teal hover:opacity-90 rounded-md transition-opacity disabled:opacity-50'
          }
        >
          {pending ? '...' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
