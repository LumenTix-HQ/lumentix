"use client";

import { useState } from "react";
import QRModal from "./QRModal";
import { getAccessToken } from "@/lib/auth/auth";

export interface Ticket {
  id: string;
  eventTitle: string;
  eventDate: string;
  status: "confirmed" | "cancelled" | "pending";
  qrUrl?: string;
}

interface TicketCardProps {
  ticket: Ticket;
}

const STATUS_STYLES: Record<Ticket["status"], string> = {
  confirmed: "bg-green-900/40 text-green-400 border border-green-800",
  cancelled: "bg-red-900/40 text-red-400 border border-red-800",
  pending: "bg-gray-700/60 text-gray-400 border border-gray-600",
};

const STATUS_LABELS: Record<Ticket["status"], string> = {
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  pending: "Pending",
};

export default function TicketCard({ ticket }: TicketCardProps) {
  const [showQR, setShowQR] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const token = getAccessToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

      const response = await fetch(`${apiUrl}/tickets/${ticket.id}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        throw new Error("Failed to download PDF");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `ticket-${ticket.id}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF download failed:", err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 flex flex-col gap-3 hover:border-gray-600 transition">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-white font-semibold text-base leading-snug">
            {ticket.eventTitle}
          </h3>
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${STATUS_STYLES[ticket.status]}`}
          >
            {STATUS_LABELS[ticket.status]}
          </span>
        </div>

        <p className="text-gray-400 text-sm">
          {new Date(ticket.eventDate).toLocaleDateString("en-US", {
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </p>

        <div className="flex gap-2 mt-1">
          {ticket.qrUrl && (
            <button
              onClick={() => setShowQR(true)}
              className="flex-1 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition"
            >
              View QR
            </button>
          )}
          <button
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="flex-1 py-2 px-3 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white text-sm font-medium transition"
          >
            {downloading ? "Downloading…" : "Download PDF"}
          </button>
        </div>
      </div>

      {showQR && ticket.qrUrl && (
        <QRModal
          qrUrl={ticket.qrUrl}
          ticketTitle={ticket.eventTitle}
          onClose={() => setShowQR(false)}
        />
      )}
    </>
  );
}
