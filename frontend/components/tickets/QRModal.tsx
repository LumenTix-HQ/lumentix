'use client';

import React from 'react';

interface QRModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticketId: string;
  qrUrl?: string;
}

export function QRModal({ isOpen, onClose, ticketId, qrUrl }: QRModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4">
        <h3 className="text-lg font-bold text-white">Ticket QR Code</h3>
        <p className="text-xs text-gray-400">Scan at the event entrance for quick check-in</p>

        <div className="bg-white p-4 rounded-xl inline-block shadow-inner my-2">
          {qrUrl ? (
            // Intentionally a plain <img>: qrUrl is a locally-generated data URI,
            // so next/image optimization does not apply.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrUrl} alt="Ticket QR Code" className="w-48 h-48 object-contain" />
          ) : (
            <div className="w-48 h-48 bg-gray-100 flex items-center justify-center text-gray-500 font-mono text-xs text-center p-2">
              QR Code Payload: {ticketId.substring(0, 8)}
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white text-xs font-semibold rounded-lg transition"
        >
          Close
        </button>
      </div>
    </div>
  );
}
