'use client';

import React from 'react';
import { useToast, type Toast, type ToastType } from '@/contexts/ToastContext';

// ---------------------------------------------------------------------------
// Per-type styling
// ---------------------------------------------------------------------------

const typeStyles: Record<ToastType, { bar: string; icon: string; bg: string; border: string; text: string }> = {
  success: {
    bar: 'bg-green-500',
    icon: '✓',
    bg: 'bg-gray-900',
    border: 'border-green-500/40',
    text: 'text-green-300',
  },
  error: {
    bar: 'bg-red-500',
    icon: '✕',
    bg: 'bg-gray-900',
    border: 'border-red-500/40',
    text: 'text-red-300',
  },
  warning: {
    bar: 'bg-yellow-400',
    icon: '⚠',
    bg: 'bg-gray-900',
    border: 'border-yellow-400/40',
    text: 'text-yellow-300',
  },
  info: {
    bar: 'bg-blue-500',
    icon: 'ℹ',
    bg: 'bg-gray-900',
    border: 'border-blue-500/40',
    text: 'text-blue-300',
  },
};

// ---------------------------------------------------------------------------
// Single Toast item
// ---------------------------------------------------------------------------

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
  onMouseEnter: (id: string) => void;
  onMouseLeave: (id: string) => void;
}

function ToastItem({ toast, onDismiss, onMouseEnter, onMouseLeave }: ToastItemProps) {
  const styles = typeStyles[toast.type];

  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
      onMouseEnter={() => onMouseEnter(toast.id)}
      onMouseLeave={() => onMouseLeave(toast.id)}
      className={`
        relative flex items-start gap-3 w-80 max-w-[calc(100vw-2rem)]
        rounded-xl border ${styles.border} ${styles.bg}
        px-4 py-3 shadow-2xl shadow-black/60 backdrop-blur-sm
        animate-toast-in
      `}
    >
      {/* Coloured left accent bar */}
      <span className={`absolute left-0 top-3 bottom-3 w-0.5 rounded-full ${styles.bar}`} />

      {/* Icon */}
      <span className={`mt-0.5 shrink-0 text-sm font-bold ${styles.text}`}>
        {styles.icon}
      </span>

      {/* Message */}
      <p className="flex-1 text-sm leading-snug text-gray-100 break-words">
        {toast.message}
      </p>

      {/* Dismiss button */}
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
        className="mt-0.5 shrink-0 text-gray-500 hover:text-white transition-colors text-base leading-none"
      >
        ×
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toast container  — rendered once in layout
// ---------------------------------------------------------------------------

export default function ToastContainer() {
  const { toasts, dismiss } = useToast();

  // Timer reset on hover is handled in ToastContext; here we just propagate ids
  const handleMouseEnter = (id: string) => {
    // Expose id so context can clear the auto-dismiss timer via a custom event,
    // or we can lift the scheduleAutoDismiss here. We use a simple approach:
    // dispatch a custom event that ToastContext can listen to.
    window.dispatchEvent(new CustomEvent('toast:pause', { detail: id }));
  };

  const handleMouseLeave = (id: string) => {
    window.dispatchEvent(new CustomEvent('toast:resume', { detail: id }));
  };

  if (toasts.length === 0) return null;

  return (
    <div
      aria-label="Notifications"
      className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 items-end"
    >
      {toasts.map((t) => (
        <ToastItem
          key={t.id}
          toast={t}
          onDismiss={dismiss}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        />
      ))}
    </div>
  );
}
