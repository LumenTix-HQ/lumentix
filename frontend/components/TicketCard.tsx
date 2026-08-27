"use client";

import { useState, useCallback } from "react";
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

/** Format ISO date as YYYYMMDDTHHmmSSZ for calendar URLs */
function toCalendarFormat(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Build Google Calendar URL */
function googleCalendarUrl(title: string, date: string, desc?: string, loc?: string): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${toCalendarFormat(date)}/${toCalendarFormat(date)}`,
  });
  if (desc) params.set("details", desc);
  if (loc) params.set("location", loc);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Build Outlook Calendar URL */
function outlookCalendarUrl(title: string, date: string, desc?: string, loc?: string): string {
  const params = new URLSearchParams({
    rdv: "1",
    path: "/calendar/action/compose",
    mode: "edit",
    subject: title,
    startdt: new Date(date).toISOString(),
    enddt: new Date(date).toISOString(),
  });
  if (desc) params.set("body", desc);
  if (loc) params.set("location", loc);
  return `https://outlook.office.com/calendar/0/deeplink/compose?${params.toString()}`;
}

export default function TicketCard({ ticket }: TicketCardProps) {
  const [showQR, setShowQR] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showCalendarMenu, setShowCalendarMenu] = useState(false);
  const [downloadingIcs, setDownloadingIcs] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const icsUrl = `${apiUrl}/tickets/${ticket.id}/ical`;

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const token = getAccessToken();
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

  const handleDownloadIcs = useCallback(async () => {
    setDownloadingIcs(true);
    try {
      const token = getAccessToken();
      const response = await fetch(icsUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) throw new Error("Failed to download .ics");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `event-${ticket.id}.ics`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("ICS download failed:", err);
    } finally {
      setDownloadingIcs(false);
      setShowCalendarMenu(false);
    }
  }, [icsUrl, ticket.id]);

  const isConfirmed = ticket.status === "confirmed";

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

        <div className="flex flex-col gap-2 mt-1">
          <div className="flex gap-2">
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

          {isConfirmed && (
            <div className="relative">
              <button
                onClick={() => setShowCalendarMenu((prev) => !prev)}
                className="w-full py-2 px-3 rounded-lg bg-gray-700/60 hover:bg-gray-600 text-blue-300 hover:text-blue-200 text-sm font-medium transition border border-gray-600/50"
              >
                📅 Add to Calendar
              </button>

              {showCalendarMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowCalendarMenu(false)}
                  />
                  <div className="absolute bottom-full mb-2 left-0 right-0 z-20 bg-gray-900 border border-gray-700 rounded-xl shadow-xl overflow-hidden">
                    <a
                      href={googleCalendarUrl(ticket.eventTitle, ticket.eventDate)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-800 transition text-sm text-gray-200"
                      onClick={() => setShowCalendarMenu(false)}
                    >
                      <span className="w-5 h-5 flex items-center justify-center text-blue-400">G</span>
                      Google Calendar
                    </a>
                    <a
                      href={outlookCalendarUrl(ticket.eventTitle, ticket.eventDate)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-800 transition text-sm text-gray-200"
                      onClick={() => setShowCalendarMenu(false)}
                    >
                      <span className="w-5 h-5 flex items-center justify-center text-blue-400">O</span>
                      Outlook Calendar
                    </a>
                    <button
                      onClick={handleDownloadIcs}
                      disabled={downloadingIcs}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800 transition text-sm text-gray-200"
                    >
                      <span className="w-5 h-5 flex items-center justify-center text-gray-400">🍎</span>
                      {downloadingIcs ? "Downloading…" : "Apple / iCal (.ics)"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
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
