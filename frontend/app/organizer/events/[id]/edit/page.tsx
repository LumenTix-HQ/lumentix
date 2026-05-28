"use client";

import { useEffect, useMemo, useState } from "react";
import EventForm, { type EventFormDiff } from "@/components/events/EventForm";
import {
    defaultCreateEventValues,
    type CreateEventFormInput,
    type CreateEventFormValues,
} from "@/lib/schemas/create-event.schema";

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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const EDITABLE_STATUSES = new Set(["draft", "published"]);

function toLocalDateTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function toApiDate(value: string): string {
    return new Date(value).toISOString();
}

async function parseApiError(response: Response): Promise<string> {
    const payload = await response.json().catch(() => null);
    if (typeof payload?.message === "string") return payload.message;
    if (Array.isArray(payload?.message)) return payload.message.join(", ");
    return `Request failed with status ${response.status}`;
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
    const [event, setEvent] = useState<EventRecord | null>(null);
    const [authToken, setAuthToken] = useState("");
    const [walletPublicKey, setWalletPublicKey] = useState("");
    const [loadError, setLoadError] = useState<string | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

    useEffect(() => {
        setAuthToken(window.localStorage.getItem("lumentix_access_token") ?? "");
        setWalletPublicKey(window.localStorage.getItem("lumentix_wallet_public_key") ?? "");

        const loadEvent = async () => {
            setLoadError(null);
            try {
                const response = await fetch(`${API_BASE_URL}/events/${params.id}`, { cache: "no-store" });
                if (!response.ok) throw new Error(await parseApiError(response));
                setEvent((await response.json()) as EventRecord);
            } catch (error) {
                setLoadError(error instanceof Error ? error.message : "Could not load event");
            }
        };

        void loadEvent();
    }, [params.id]);

    const initialValues = useMemo<CreateEventFormInput>(() => {
        if (!event) return { ...defaultCreateEventValues, authToken, walletPublicKey };
        return {
            title: event.title ?? "",
            description: event.description ?? "",
            location: event.location ?? "",
            startDate: toLocalDateTime(event.startDate),
            endDate: toLocalDateTime(event.endDate),
            ticketPrice: Number(event.ticketPrice ?? 0),
            currency: event.currency ?? "USD",
            status: event.status,
            authToken,
            walletPublicKey,
            sponsorshipEnabled: false,
            sponsorTiers: [],
        };
    }, [authToken, event, walletPublicKey]);

    const handleSubmit = async (values: CreateEventFormValues) => {
        setSubmitError(null);
        setSubmitSuccess(null);

        try {
            window.localStorage.setItem("lumentix_access_token", values.authToken);
            window.localStorage.setItem("lumentix_wallet_public_key", values.walletPublicKey);

            const response = await fetch(`${API_BASE_URL}/events/${params.id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${values.authToken}`,
                },
                body: JSON.stringify({
                    title: values.title,
                    description: values.description || undefined,
                    location: values.location || undefined,
                    startDate: toApiDate(values.startDate),
                    endDate: toApiDate(values.endDate),
                    ticketPrice: values.ticketPrice,
                    currency: values.currency,
                    status: values.status,
                }),
            });

            if (!response.ok) throw new Error(await parseApiError(response));
            setEvent((await response.json()) as EventRecord);
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
