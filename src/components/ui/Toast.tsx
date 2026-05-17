/* eslint-disable react-refresh/only-export-components */
// This file intentionally co-locates the <Toaster /> component with a thin
// `toast` helper so call sites can `import { toast } from '@/components/ui/Toast'`
// without juggling two paths. Fast Refresh of the Toaster component is not
// a concern in practice (it never has internal state).
import { Toaster as SonnerToaster, toast as sonnerToast } from 'sonner';

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      richColors
      closeButton
      duration={4000}
      toastOptions={{
        className: 'bati-toast',
        style: {
          fontFamily: 'inherit',
          fontSize: '13px',
        },
      }}
    />
  );
}

// Thin French-flavoured wrapper. Keeps call sites short and consistent.
export const toast = {
  success(message: string) {
    sonnerToast.success(message);
  },
  error(message: string) {
    sonnerToast.error(message);
  },
  info(message: string) {
    sonnerToast.info(message);
  },
  /** For caught errors: prefer the typed DAL message when available. */
  fromError(err: unknown, fallback = 'Une erreur est survenue') {
    const message = err instanceof Error ? err.message : fallback;
    sonnerToast.error(message);
  },
};
