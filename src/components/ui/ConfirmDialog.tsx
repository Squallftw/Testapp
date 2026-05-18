import { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

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
        <Button
          variant="ghost"
          onClick={() => onOpenChange(false)}
          disabled={pending}
        >
          {cancelLabel}
        </Button>
        <Button
          variant={destructive ? 'destructive' : 'primary'}
          onClick={handleConfirm}
          loading={pending}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
