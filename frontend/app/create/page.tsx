"use client";

import { useEffect, useState, useCallback } from "react";
import EventForm, { type EventFormSubmitValues } from "@/components/events/EventForm";
import EventPreviewOverlay from "@/components/EventPreviewOverlay";
import { defaultCreateEventValues, type CreateEventFormValues } from "@/lib/schemas/create-event.schema";
import { localDateTimeToUTC } from "@/lib/utils/datetime";

type EventRecord = { id: string; title: string; location?: string };

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

function toApiDate(value: string, timezone: string): string {
    // The picker emits a wall-clock string like "2025-06-15T15:00". Interpret
    // it in the organizer's chosen IANA zone and convert to a UTC ISO string.
    return localDateTimeToUTC(value, timezone);
}

async function parseApiError(response: Response): Promise<string> {
    const payload = await response.json().catch(() => null);
    if (typeof payload?.message === "string") return payload.message;
    if (Array.isArray(payload?.message)) return payload.message.join(", ");
    return `Request failed with status ${response.status}`;
}

export default function CreateEventPage() {
    const [events, setEvents] = useState<EventRecord[]>([]);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    const fetchEvents = async () => {
        setLoadError(null);
        try {
            const response = await fetch(`${API_BASE_URL}/events?page=1&limit=10`, { cache: "no-store" });
            if (!response.ok) throw new Error(await parseApiError(response));
            const payload = (await response.json()) as { data?: EventRecord[] };
            setEvents(payload.data ?? []);
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : "Could not load events");
        }
    };

    useEffect(() => {
        void fetchEvents();
    }, []);

    const handleSubmit = async (values: EventFormSubmitValues) => {
        setSubmitError(null);
        setSubmitSuccess(null);
        try {
            window.localStorage.setItem("lumentix_access_token", values.authToken);
            window.localStorage.setItem("lumentix_wallet_public_key", values.walletPublicKey);

            const response = await fetch(`${API_BASE_URL}/events`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${values.authToken}` },
                body: JSON.stringify({
                    title: values.title,
                    description: values.description || undefined,
                    location: values.location || undefined,
                    startDate: toApiDate(values.startDate, values.timezone),
                    endDate: toApiDate(values.endDate, values.timezone),
                    timezone: values.timezone,
                    ticketPrice: values.ticketPrice,
                    currency: values.currency,
                    status: values.status,
                }),
            });

            if (!response.ok) throw new Error(await parseApiError(response));
            const created = (await response.json()) as EventRecord;
            setSubmitSuccess(`Event "${created.title}" created successfully.`);
            await fetchEvents();
        } catch (error) {
            setSubmitError(error instanceof Error ? error.message : "Event creation failed");
        }
    };

    const [showPreview, setShowPreview] = useState(false);
    const [formData, setFormData] = useState<EventFormSubmitValues | null>(null);

    const handlePreview = useCallback((values: EventFormSubmitValues) => {
        setFormData(values);
        setShowPreview(true);
    }, []);

    const initialValues = {
        ...defaultCreateEventValues,
        authToken: typeof window === "undefined" ? "" : window.localStorage.getItem("lumentix_access_token") ?? "",
        walletPublicKey: typeof window === "undefined" ? "" : window.localStorage.getItem("lumentix_wallet_public_key") ?? "",
    };

    return (
        <>
            {showPreview && formData && (
                <EventPreviewOverlay
                    formValues={{
                        title: formData.title,
                        description: formData.description,
                        location: formData.location,
                        startDate: formData.startDate,
                        endDate: formData.endDate,
                        ticketPrice: formData.ticketPrice,
                        currency: formData.currency,
                        category: formData.category || '',
                        maxAttendees: formData.maxAttendees ?? null,
                        imageUrl: formData.imageUrl || '',
                    }}
                    onClose={() => setShowPreview(false)}
                    onSubmit={() => {
                        setShowPreview(false);
                        handleSubmit(formData);
                    }}
                />
            )}
            <main className="min-h-screen bg-gradient-to-tr from-black via-gray-900 to-purple-950 px-4 pb-16 pt-28 text-white sm:px-8">
            <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-8 lg:grid-cols-2">
                <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-md sm:p-8">
                    <h1 className="mb-2 bg-gradient-to-r from-purple-300 to-pink-400 bg-clip-text text-3xl font-extrabold text-transparent sm:text-4xl">Create New Event</h1>
                    <p className="mb-6 text-sm text-gray-300">Organizers can publish events and optional sponsor tiers.</p>
                    <EventForm mode="create" initialValues={initialValues} submitLabel="Create Event" loadingLabel="Creating Event..." successMessage={submitSuccess} errorMessage={submitError} onSubmit={handleSubmit} />
                </section>
                <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-md sm:p-8">
                    <h2 className="mb-5 text-2xl font-bold">Recent Events</h2>
                    {loadError ? <p className="rounded-xl bg-red-500/15 p-3 text-sm text-red-200">{loadError}</p> : null}
                    <div className="space-y-3">
                        {events.map((event) => (
                            <article key={event.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <h3 className="text-sm font-semibold text-white sm:text-base">{event.title}</h3>
                                <p className="mt-1 text-xs text-gray-400">{event.location || "Location TBA"}</p>
                                <a href={`/organizer/events/${event.id}/edit`} className="mt-3 inline-block text-xs font-semibold text-purple-200 underline">Edit event</a>
                            </article>
                        ))}
                    </div>
                </section>
            </div>
        </main>
        </>
    );
}
