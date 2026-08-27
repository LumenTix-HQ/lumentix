'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { estimateFee } from '@/lib/stellar/fee-estimator';

interface TransactionSummaryModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  amount: string;
  destinationKey: string;
  eventTitle: string;
}

function truncateKey(key: string): string {
  if (key.length <= 10) return key;
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

function stroopsToXlm(stroops: string): string {
  const num = parseInt(stroops, 10);
  if (isNaN(num)) return '0.0000100';
  return (num / 10_000_000).toFixed(7);
}

export function TransactionSummaryModal({
  isOpen,
  onConfirm,
  onCancel,
  amount,
  destinationKey,
  eventTitle,
}: TransactionSummaryModalProps) {
  const [estimatedFee, setEstimatedFee] = useState<string | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const titleId = 'tx-summary-title';

  // Fetch fee estimate when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setFeeLoading(true);
    estimateFee()
      .then((fee) => setEstimatedFee(fee))
      .catch(() => setEstimatedFee('100'))
      .finally(() => setFeeLoading(false));
  }, [isOpen]);

  // Focus the confirm button when modal opens
  useEffect(() => {
    if (isOpen && confirmBtnRef.current) {
      confirmBtnRef.current.focus();
    }
  }, [isOpen]);

  // Keyboard handler: Escape = cancel, focus trap
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        onCancel();
        return;
      }
      if (e.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    [onCancel],
  );

  if (!isOpen) return null;

  const feeXlm = estimatedFee ? stroopsToXlm(estimatedFee) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      aria-hidden={!isOpen}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-md rounded-xl bg-gray-900 border border-gray-700 p-6 shadow-2xl"
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        <h2
          id={titleId}
          className="text-xl font-semibold text-white mb-1"
        >
          Confirm Transaction
        </h2>
        <p className="text-sm text-gray-400 mb-6">
          Review the details before signing with Freighter.
        </p>

        <dl className="space-y-4 mb-6">
          <div className="flex justify-between items-center border-b border-gray-700 pb-3">
            <dt className="text-sm text-gray-400">Event</dt>
            <dd className="text-sm font-medium text-white text-right max-w-[60%] truncate">
              {eventTitle}
            </dd>
          </div>

          <div className="flex justify-between items-center border-b border-gray-700 pb-3">
            <dt className="text-sm text-gray-400">Amount</dt>
            <dd className="text-sm font-semibold text-white">
              {amount} <span className="text-gray-400 font-normal">XLM</span>
            </dd>
          </div>

          <div className="flex justify-between items-center border-b border-gray-700 pb-3">
            <dt className="text-sm text-gray-400">Destination</dt>
            <dd className="text-sm font-mono text-white">
              {truncateKey(destinationKey)}
            </dd>
          </div>

          <div className="flex justify-between items-center">
            <dt className="text-sm text-gray-400">Estimated Fee</dt>
            <dd className="text-sm text-white">
              {feeLoading ? (
                <span className="text-gray-500 animate-pulse">Estimating…</span>
              ) : feeXlm ? (
                <>
                  {feeXlm}{' '}
                  <span className="text-gray-400 text-xs">
                    XLM ({estimatedFee} stroops)
                  </span>
                </>
              ) : (
                <span className="text-gray-500">Unavailable</span>
              )}
            </dd>
          </div>
        </dl>

        <div className="flex gap-3">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-600 px-4 py-2.5 text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            Cancel
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            Confirm &amp; Sign
          </button>
        </div>
      </div>
    </div>
  );
}
