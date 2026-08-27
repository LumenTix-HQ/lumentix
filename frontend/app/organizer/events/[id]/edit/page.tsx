"use client";

import { useEffect, useMemo, useState } from "react";
import EventForm, { type EventFormDiff } from "@/components/events/EventForm";
import {
    defaultCreateEventValues,
    type CreateEventFormInput,
    type CreateEventFormValues,
} from "@/lib/schemas/create-event.schema";
import { apiGet, apiPatch } from "@/lib/api-client";
import { useWallet } from "@/contexts/WalletContext";

type EventRecord = {
    id: string;
    title: string;
    description?: string;
    location?: string;
    startDate: string;
    endDate: string;
    ticketPrice: number;
    currency: string;
    status: "draft" | "published" | "completed" | "cancelled";
};

const EDITABLE_STATUSES = new Set(["draft", "published"]);

function toLocalDateTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function toApiDate(value: string): string {
    return new Date(value).toISOString();
}

function buildDiffs(event: EventRecord, values: CreateEventFormValues): EventFormDiff[] {
    return [
        ["Title", event.title ?? "", values.title],
        ["Description", event.description ?? "", values.description ?? ""],
        ["Location", event.location ?? "", values.location ?? ""],
        ["Start Date", toLocalDateTime(event.startDate), values.startDate],
        ["End Date", toLocalDateTime(event.endDate), values.endDate],
        ["Ticket Price", String(event.ticketPrice ?? 0), String(values.ticketPrice)],
        ["Currency", event.currency ?? "USD", values.currency],
        ["Status", event.status, values.status],
    ]
        .filter(([, before, after]) => before !== after)
        .map(([field, before, after]) => ({ field, before, after }));
}

export default function EditEventPage({ params }: { params: { id: string } }) {
    const { publicKey } = useWallet();
    const [event, setEvent] = useState<EventRecord | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

    useEffect(() => {
        const loadEvent = async () => {
            setLoadError(null);
            try {
                setEvent(await apiGet<EventRecord>(`events/${params.id}`));
            } catch (error) {
                setLoadError(error instanceof Error ? error.message : "Could not load event");
            }
        };

        void loadEvent();
    }, [params.id]);

    const initialValues = useMemo<CreateEventFormInput>(() => {
        if (!event) return defaultCreateEventValues;
        return {
            title: event.title ?? "",
            description: event.description ?? "",
            location: event.location ?? "",
            startDate: toLocalDateTime(event.startDate),
            endDate: toLocalDateTime(event.endDate),
            ticketPrice: Number(event.ticketPrice ?? 0),
            currency: event.currency ?? "USD",
            status: event.status,
            sponsorshipEnabled: false,
            sponsorTiers: [],
        };
    }, [event]);

    const handleSubmit = async (values: CreateEventFormValues) => {
        setSubmitError(null);
        setSubmitSuccess(null);

        try {
            if (!publicKey) {
                throw new Error("Connect your wallet before editing an event.");
            }
            const updated = await apiPatch<EventRecord>(`events/${params.id}`, {
                title: values.title,
                description: values.description || undefined,
                location: values.location || undefined,
                startDate: toApiDate(values.startDate),
                endDate: toApiDate(values.endDate),
                ticketPrice: values.ticketPrice,
                currency: values.currency,
                status: values.status,
            });
            setEvent(updated);
            setSubmitSuccess("Event updated successfully.");
        } catch (error) {
            setSubmitError(error instanceof Error ? error.message : "Event update failed");
        }
    };

    return (
        <main className="min-h-screen bg-gradient-to-tr from-black via-gray-900 to-purple-950 px-4 pb-16 pt-28 text-white sm:px-8">
            <section className="mx-auto w-full max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-md sm:p-8">
                <h1 className="bg-gradient-to-r from-purple-300 to-pink-400 bg-clip-text text-3xl font-extrabold text-transparent sm:text-4xl">Edit Event</h1>
                <p className="mb-6 mt-2 text-sm text-gray-300">Update event details with validation and confirmation for published events.</p>

                {loadError ? <p className="rounded-xl bg-red-500/15 p-3 text-sm text-red-200">{loadError}</p> : null}
                {!event && !loadError ? <p className="text-sm text-gray-300">Loading event...</p> : null}
                {event && !EDITABLE_STATUSES.has(event.status) ? <p className="rounded-xl bg-yellow-500/15 p-3 text-sm text-yellow-100">Only draft or published events can be edited.</p> : null}
                {event?.status === "published" ? <p className="mb-5 rounded-xl bg-yellow-500/15 p-3 text-sm text-yellow-100">Editing a published event will notify registered attendees</p> : null}

                {event && EDITABLE_STATUSES.has(event.status) ? (
                    <EventForm
                        mode="edit"
                        initialValues={initialValues}
                        submitLabel="Save Changes"
                        loadingLabel="Saving Changes..."
                        successMessage={submitSuccess}
                        errorMessage={submitError}
                        onSubmit={handleSubmit}
                        onPreviewSubmit={(values) => (event.status === "published" ? buildDiffs(event, values) : null)}
                    />
                ) : null}
            </section>
        </main>
    );
}
