"use client";

import { useEffect, useRef } from "react";

interface QRModalProps {
  qrUrl: string;
  ticketTitle: string;
  onClose: () => void;
}

export default function QRModal({ qrUrl, ticketTitle, onClose }: QRModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }

      if (e.key === "Tab") {
        const focusable = overlayRef.current?.querySelectorAll<HTMLElement>(
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
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={handleBackdropClick}
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-modal-title"
    >
      <div className="bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 flex flex-col items-center gap-4">
        <div className="flex items-center justify-between w-full">
          <h2 id="qr-modal-title" className="text-white font-semibold text-lg truncate pr-4">
            {ticketTitle}
          </h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="text-gray-400 hover:text-white transition rounded-full p-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Close QR modal"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="bg-white rounded-xl p-3">
          <img
            src={qrUrl}
            alt={`QR code for ${ticketTitle}`}
            className="w-48 h-48 object-contain"
          />
        </div>

        <p className="text-gray-400 text-sm text-center">
          Present this QR code at the event entrance
        </p>
      </div>
    </div>
  );
}
