import { createContext, useContext } from 'react';

export interface ToastOptions {
  message: string;
  tone?: 'success' | 'error';
  /** A one-tap action, like Undo. */
  actionLabel?: string;
  onAction?: () => void;
}

export interface ToastApi {
  showToast: (options: ToastOptions) => void;
}

export const ToastContext = createContext<ToastApi>({ showToast: () => undefined });

export const useToast = () => useContext(ToastContext);
