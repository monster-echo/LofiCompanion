import { useCallback, useMemo, useState } from 'react';

type ToastTone = 'success' | 'info' | 'error';
export type ToastState = Readonly<{ id: number; message: string; tone: ToastTone }>;
export type ConfirmState = Readonly<{
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
}>;

export function useFeedbackState() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const showToast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = Date.now();
    setToast({ id, message, tone });
    setTimeout(() => setToast((value) => value?.id === id ? null : value), 2400);
  }, []);
  return useMemo(() => ({
    toast,
    confirm,
    showToast,
    showConfirm: setConfirm,
    closeConfirm: () => setConfirm(null),
  }), [confirm, showToast, toast]);
}
