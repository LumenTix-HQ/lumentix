"use client";

import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm, type SubmitHandler } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import {
    getAddress as getFreighterAddress,
    isConnected as isFreighterConnected,
    requestAccess as requestFreighterAccess,
} from "@stellar/freighter-api";

declare global {
    interface Window {
        freighterApi?: {
            getPublicKey: () => Promise<string>;
            isConnected?: () => Promise<boolean>;
        };
        freighter?: unknown;
    }
}

const sponsorTierSchema = z.object({
    name: z.string().min(2, "Tier name must be at least 2 characters"),
    price: z.number().min(0.01, "Tier price must be greater than 0"),
    benefits: z.string().max(500, "Benefits is too long").optional().or(z.literal("")),
    maxSponsors: z.number().int().min(1, "Max sponsors must be at least 1"),
});

const createEventSchema = z
    .object({
        title: z.string().min(3, "Title must be at least 3 characters"),
        description: z
            .string()
            .max(2000, "Description is too long")
            .optional()
            .or(z.literal("")),
        location: z.string().max(255, "Location is too long").optional().or(z.literal("")),
        startDate: z.string().min(1, "Start date is required"),
        endDate: z.string().min(1, "End date is required"),
        ticketPrice: z.number().min(0, "Price cannot be negative"),
        currency: z
            .string()
            .length(3, "Currency must be a 3-letter code")
            .transform((value) => value.toUpperCase()),
        status: z.enum(["draft", "published", "completed", "cancelled"]),
        authToken: z.string().min(10, "Organizer access token is required"),
        walletPublicKey: z
            .string()
            .min(10, "Connect your wallet or enter a valid public key"),
        sponsorshipEnabled: z.boolean(),
        sponsorTiers: z.array(sponsorTierSchema).default([]),
    })
    .superRefine((data, ctx) => {
        const start = new Date(data.startDate);
        const end = new Date(data.endDate);

        if (Number.isNaN(start.getTime())) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["startDate"],
                message: "Start date must be valid",
            });
        }

        if (Number.isNaN(end.getTime())) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["endDate"],
                message: "End date must be valid",
            });
        }

        if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end <= start) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["endDate"],
                message: "End date must be after start date",
            });
        }

        if (data.sponsorshipEnabled && data.sponsorTiers.length === 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["sponsorTiers"],
                message: "Add at least one sponsor tier or disable sponsor options",
            });
        }
    });

type CreateEventFormInput = z.input<typeof createEventSchema>;
type CreateEventFormValues = z.output<typeof createEventSchema>;

type EventRecord = {
    id: string;
    title: string;
    location?: string;
    description?: string;
    startDate: string;
    endDate: string;
    ticketPrice: number;
    currency: string;
    status: string;
    createdAt?: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

function toUserError(error: unknown): string {
    if (error instanceof TypeError && error.message.toLowerCase().includes("failed to fetch")) {
        return `Cannot reach API at ${API_BASE_URL}. Ensure backend is running and NEXT_PUBLIC_API_URL is correct.`;
    }

    if (error instanceof Error && error.message.toLowerCase().includes("rejected")) {
        return "Wallet connection was rejected. Approve the Freighter prompt and try again.";
    }

    return error instanceof Error ? error.message : "Request failed";
}

function toApiDate(localDateTime: string): string {
    return new Date(localDateTime).toISOString();
}

function formatDate(dateString?: string): string {
    if (!dateString) return "-";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString();
}

async function parseApiError(response: Response): Promise<string> {
    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
        const text = await response.text();
        if (text.trimStart().startsWith("<!DOCTYPE") || text.trimStart().startsWith("<html")) {
            return "API returned HTML instead of JSON. Check NEXT_PUBLIC_API_URL and backend port.";
        }
        return `Unexpected response format (status ${response.status}).`;
    }

    try {
        const payload = await response.json();
        if (typeof payload?.message === "string") {
            return payload.message;
        }
        if (Array.isArray(payload?.message)) {
            return payload.message.join(", ");
        }
    } catch {
        return `Request failed with status ${response.status}`;
    }
    return `Request failed with status ${response.status}`;
}

export default function CreateEventPage() {
    const [events, setEvents] = useState<EventRecord[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isConnectingWallet, setIsConnectingWallet] = useState(false);
    const [isLoadingEvents, setIsLoadingEvents] = useState(false);

    const {
        register,
        control,
        handleSubmit,
        watch,
        setValue,
        formState: { errors, isSubmitting },
        reset,
    } = useForm<CreateEventFormInput, unknown, CreateEventFormValues>({
        resolver: zodResolver(createEventSchema),
        defaultValues: {
            title: "",
            description: "",
            location: "",
            startDate: "",
            endDate: "",
            ticketPrice: 0,
            currency: "USD",
            status: "draft",
            authToken: "",
            walletPublicKey: "",
            sponsorshipEnabled: false,
            sponsorTiers: [],
        },
    });

    const { fields, append, remove } = useFieldArray({
        control,
        name: "sponsorTiers",
    });

    const sponsorshipEnabled = watch("sponsorshipEnabled");

    const createButtonLabel = useMemo(() => {
        if (isSubmitting) return "Creating Event...";
        return "Create Event";
    }, [isSubmitting]);

    const fetchEvents = async () => {
        setIsLoadingEvents(true);
        setLoadError(null);

        try {
            const response = await fetch(`${API_BASE_URL}/events?page=1&limit=10`, {
                method: "GET",
                headers: { "Content-Type": "application/json" },
                cache: "no-store",
            });

            if (!response.ok) {
                throw new Error(await parseApiError(response));
            }

            const payload = (await response.json()) as { data?: EventRecord[] };
            setEvents(payload.data ?? []);
        } catch (error) {
            setLoadError(toUserError(error));
        } finally {
            setIsLoadingEvents(false);
        }
    };

    useEffect(() => {
        const existingToken = window.localStorage.getItem("lumentix_access_token");
        if (existingToken) {
            setValue("authToken", existingToken);
        }

        const existingWallet = window.localStorage.getItem("lumentix_wallet_public_key");
        if (existingWallet) {
            setValue("walletPublicKey", existingWallet);
        }

        void fetchEvents();
    }, [setValue]);

    const connectWallet = async () => {
        setSubmitError(null);
        setSubmitSuccess(null);

        try {
            setIsConnectingWallet(true);
            const { isConnected, error: connectionError } = await isFreighterConnected();

            if (connectionError) {
                throw new Error(connectionError.message || "Unable to connect to Freighter.");
            }

            let publicKey = "";

            if (isConnected) {
                const accessResult = await requestFreighterAccess();

                if (accessResult.error) {
                    throw new Error(accessResult.error.message || "Freighter access request failed.");
                }

                publicKey = accessResult.address;

                if (!publicKey) {
                    const addressResult = await getFreighterAddress();

                    if (addressResult.error) {
                        throw new Error(addressResult.error.message || "Unable to read wallet address from Freighter.");
                    }

                    publicKey = addressResult.address;
                }
            }

            if (!publicKey && window.freighterApi?.getPublicKey) {
                publicKey = await window.freighterApi.getPublicKey();
            }

            if (!publicKey) {
                throw new Error("Freighter was not detected. Install/unlock Freighter and try again, or enter your wallet key manually.");
            }

            setValue("walletPublicKey", publicKey, { shouldValidate: true, shouldDirty: true });
            window.localStorage.setItem("lumentix_wallet_public_key", publicKey);
            setSubmitSuccess("Wallet connected successfully.");
        } catch (error) {
            setSubmitError(toUserError(error));
        } finally {
            setIsConnectingWallet(false);
        }
    };

    const onSubmit: SubmitHandler<CreateEventFormValues> = async (values) => {
        setSubmitError(null);
        setSubmitSuccess(null);

        const eventPayload = {
            title: values.title,
            description: values.description || undefined,
            location: values.location || undefined,
            startDate: toApiDate(values.startDate),
            endDate: toApiDate(values.endDate),
            ticketPrice: values.ticketPrice,
            currency: values.currency,
            status: values.status,
        };

        try {
            window.localStorage.setItem("lumentix_access_token", values.authToken);

            const createEventResponse = await fetch(`${API_BASE_URL}/events`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${values.authToken}`,
                },
                body: JSON.stringify(eventPayload),
            });

            if (!createEventResponse.ok) {
                throw new Error(await parseApiError(createEventResponse));
            }

            const createdEvent = (await createEventResponse.json()) as EventRecord;

            if (values.sponsorshipEnabled) {
                for (const tier of values.sponsorTiers) {
                    const tierResponse = await fetch(`${API_BASE_URL}/events/${createdEvent.id}/tiers`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${values.authToken}`,
                        },
                        body: JSON.stringify({
                            name: tier.name,
                            price: tier.price,
                            benefits: tier.benefits || undefined,
                            maxSponsors: tier.maxSponsors,
                        }),
                    });

                    if (!tierResponse.ok) {
                        throw new Error(
                            `Event created, but a sponsor tier failed: ${await parseApiError(tierResponse)}`,
                        );
                    }
                }
            }

            setSubmitSuccess(`Event \"${createdEvent.title}\" created successfully.`);
            setImagePreview(null);
            reset({
                title: "",
                description: "",
                location: "",
                startDate: "",
                endDate: "",
                ticketPrice: 0,
                currency: values.currency,
                status: "draft",
                authToken: values.authToken,
                walletPublicKey: values.walletPublicKey,
                sponsorshipEnabled: false,
                sponsorTiers: [],
            });
            await fetchEvents();
        } catch (error) {
            setSubmitError(toUserError(error));
        }
    };

    return (
        <main className="min-h-screen bg-gradient-to-tr from-black via-gray-900 to-purple-950 px-4 pb-16 pt-28 text-white sm:px-8">
            <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-8 lg:grid-cols-2">
                <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-md sm:p-8">
                    <h1 className="mb-2 text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-300 to-pink-400 sm:text-4xl">
                        Create New Event
                    </h1>
                    <p className="mb-6 text-sm text-gray-300">Organizers can publish events and optional sponsor tiers.</p>

                    <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
                        <div>
                            <label className="mb-2 block text-sm text-gray-300">Organizer Access Token</label>
                            <input
                                type="password"
                                placeholder="Paste your bearer token"
                                className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm outline-none transition-all focus:border-purple-400"
                                {...register("authToken")}
                            />
                            {errors.authToken ? <p className="mt-1 text-xs text-red-300">{errors.authToken.message}</p> : null}
                        </div>

                        <div>
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <label className="block text-sm text-gray-300">Wallet Public Key</label>
                                <button
                                    type="button"
                                    onClick={connectWallet}
                                    disabled={isConnectingWallet}
                                    className="rounded-lg border border-blue-400/40 bg-blue-500/15 px-3 py-1 text-xs font-semibold text-blue-200 transition hover:bg-blue-500/25 disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                    {isConnectingWallet ? "Connecting..." : "Connect Freighter"}
                                </button>
                            </div>
                            <input
                                type="text"
                                placeholder="G..."
                                className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm outline-none transition-all focus:border-purple-400"
                                {...register("walletPublicKey")}
                            />
                            {errors.walletPublicKey ? (
                                <p className="mt-1 text-xs text-red-300">{errors.walletPublicKey.message}</p>
                            ) : null}
                        </div>

                        <div>
                            <label className="mb-2 block text-sm text-gray-300">Event Title</label>
                            <input
                                type="text"
                                placeholder="Lumentix Builder Summit"
                                className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm outline-none transition-all focus:border-purple-400"
                                {...register("title")}
                            />
                            {errors.title ? <p className="mt-1 text-xs text-red-300">{errors.title.message}</p> : null}
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <label className="mb-2 block text-sm text-gray-300">Start Date & Time</label>
                                <input
                                    type="datetime-local"
                                    className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm outline-none transition-all focus:border-purple-400"
                                    {...register("startDate")}
                                />
                                {errors.startDate ? (
                                    <p className="mt-1 text-xs text-red-300">{errors.startDate.message}</p>
                                ) : null}
                            </div>

                            <div>
                                <label className="mb-2 block text-sm text-gray-300">End Date & Time</label>
                                <input
                                    type="datetime-local"
                                    className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm outline-none transition-all focus:border-purple-400"
                                    {...register("endDate")}
                                />
                                {errors.endDate ? <p className="mt-1 text-xs text-red-300">{errors.endDate.message}</p> : null}
                            </div>
                        </div>

                        <div>
                            <label className="mb-2 block text-sm text-gray-300">Location</label>
                            <input
                                type="text"
                                placeholder="Accra, Ghana"
                                className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm outline-none transition-all focus:border-purple-400"
                                {...register("location")}
                            />
                            {errors.location ? <p className="mt-1 text-xs text-red-300">{errors.location.message}</p> : null}
                        </div>

                        <div>
                            <label className="mb-2 block text-sm text-gray-300">Description</label>
                            <textarea
                                rows={4}
                                placeholder="Describe the event agenda and audience..."
                                className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm outline-none transition-all focus:border-purple-400"
                                {...register("description")}
                            />
                            {errors.description ? (
                                <p className="mt-1 text-xs text-red-300">{errors.description.message}</p>
                            ) : null}
                        </div>

                        <div>
                            <label className="mb-2 block text-sm text-gray-300">Event Image (Optional)</label>
                            <input
                                type="file"
                                accept="image/*"
                                className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-purple-500/30 file:px-3 file:py-1.5 file:text-white"
                                onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    if (!file) {
                                        setImagePreview(null);
                                        return;
                                    }
                                    const objectUrl = URL.createObjectURL(file);
                                    setImagePreview(objectUrl);
                                }}
                            />
                            {imagePreview ? (
                                <Image
                                    src={imagePreview}
                                    alt="Selected event"
                                    width={96}
                                    height={96}
                                    className="mt-3 h-24 w-24 rounded-lg object-cover"
                                    unoptimized
                                />
                            ) : null}
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <div>
                                <label className="mb-2 block text-sm text-gray-300">Ticket Price</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.0001"
                                    className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm outline-none transition-all focus:border-purple-400"
                                    {...register("ticketPrice", { valueAsNumber: true })}
                                />
                                {errors.ticketPrice ? (
                                    <p className="mt-1 text-xs text-red-300">{errors.ticketPrice.message}</p>
                                ) : null}
                            </div>
                            <div>
                                <label className="mb-2 block text-sm text-gray-300">Currency</label>
                                <input
                                    type="text"
                                    maxLength={3}
                                    className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm uppercase outline-none transition-all focus:border-purple-400"
                                    {...register("currency")}
                                />
                                {errors.currency ? <p className="mt-1 text-xs text-red-300">{errors.currency.message}</p> : null}
                            </div>
                            <div>
                                <label className="mb-2 block text-sm text-gray-300">Status</label>
                                <select
                                    className="w-full rounded-xl border border-white/15 bg-gray-900 px-4 py-3 text-sm outline-none transition-all focus:border-purple-400"
                                    {...register("status")}
                                >
                                    <option value="draft">Draft</option>
                                    <option value="published">Published</option>
                                    <option value="completed">Completed</option>
                                    <option value="cancelled">Cancelled</option>
                                </select>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <label className="mb-3 flex cursor-pointer items-center gap-3 text-sm text-gray-200">
                                <input type="checkbox" className="h-4 w-4" {...register("sponsorshipEnabled")} />
                                Enable sponsor options
                            </label>

                            {sponsorshipEnabled ? (
                                <div className="space-y-4">
                                    {fields.map((field, index) => (
                                        <div key={field.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                                            <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                <div>
                                                    <label className="mb-1 block text-xs text-gray-300">Tier Name</label>
                                                    <input
                                                        type="text"
                                                        className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-purple-400"
                                                        {...register(`sponsorTiers.${index}.name`)}
                                                    />
                                                    {errors.sponsorTiers?.[index]?.name ? (
                                                        <p className="mt-1 text-xs text-red-300">
                                                            {errors.sponsorTiers[index]?.name?.message}
                                                        </p>
                                                    ) : null}
                                                </div>
                                                <div>
                                                    <label className="mb-1 block text-xs text-gray-300">Benefits</label>
                                                    <input
                                                        type="text"
                                                        className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-purple-400"
                                                        {...register(`sponsorTiers.${index}.benefits`)}
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                                <div>
                                                    <label className="mb-1 block text-xs text-gray-300">Tier Price</label>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        min="0.01"
                                                        className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-purple-400"
                                                        {...register(`sponsorTiers.${index}.price`, { valueAsNumber: true })}
                                                    />
                                                    {errors.sponsorTiers?.[index]?.price ? (
                                                        <p className="mt-1 text-xs text-red-300">
                                                            {errors.sponsorTiers[index]?.price?.message}
                                                        </p>
                                                    ) : null}
                                                </div>
                                                <div>
                                                    <label className="mb-1 block text-xs text-gray-300">Max Sponsors</label>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        step="1"
                                                        className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-purple-400"
                                                        {...register(`sponsorTiers.${index}.maxSponsors`, { valueAsNumber: true })}
                                                    />
                                                    {errors.sponsorTiers?.[index]?.maxSponsors ? (
                                                        <p className="mt-1 text-xs text-red-300">
                                                            {errors.sponsorTiers[index]?.maxSponsors?.message}
                                                        </p>
                                                    ) : null}
                                                </div>
                                                <div className="flex items-end">
                                                    <button
                                                        type="button"
                                                        onClick={() => remove(index)}
                                                        className="w-full rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/20"
                                                    >
                                                        Remove Tier
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}

                                    <button
                                        type="button"
                                        onClick={() =>
                                            append({
                                                name: "",
                                                price: 0.01,
                                                benefits: "",
                                                maxSponsors: 1,
                                            })
                                        }
                                        className="rounded-lg border border-white/25 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15"
                                    >
                                        Add Sponsor Tier
                                    </button>

                                    {errors.sponsorTiers?.root?.message ? (
                                        <p className="text-xs text-red-300">{errors.sponsorTiers.root.message}</p>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>

                        {submitError ? <p className="rounded-xl bg-red-500/15 p-3 text-sm text-red-200">{submitError}</p> : null}
                        {submitSuccess ? (
                            <p className="rounded-xl bg-green-500/15 p-3 text-sm text-green-200">{submitSuccess}</p>
                        ) : null}

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 py-3 text-sm font-bold transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-80"
                        >
                            {createButtonLabel}
                        </button>
                    </form>
                </section>

                <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-md sm:p-8">
                    <div className="mb-5 flex items-center justify-between">
                        <h2 className="text-2xl font-bold">Recent Events</h2>
                        <button
                            type="button"
                            onClick={() => {
                                void fetchEvents();
                            }}
                            className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold text-gray-100 transition hover:bg-white/20"
                        >
                            Refresh
                        </button>
                    </div>

                    {isLoadingEvents ? <p className="text-sm text-gray-300">Loading events...</p> : null}
                    {loadError ? <p className="rounded-xl bg-red-500/15 p-3 text-sm text-red-200">{loadError}</p> : null}

                    {!isLoadingEvents && !loadError && events.length === 0 ? (
                        <p className="text-sm text-gray-300">No events found yet. Create your first one.</p>
                    ) : null}

                    <div className="space-y-3">
                        {events.map((event) => (
                            <article
                                key={event.id}
                                className="rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:bg-black/30"
                            >
                                <div className="mb-2 flex items-center justify-between gap-3">
                                    <h3 className="text-sm font-semibold text-white sm:text-base">{event.title}</h3>
                                    <span className="rounded-full border border-purple-400/40 bg-purple-500/10 px-2 py-1 text-[11px] uppercase text-purple-200">
                                        {event.status}
                                    </span>
                                </div>
                                <p className="mb-1 text-xs text-gray-300">Start: {formatDate(event.startDate)}</p>
                                <p className="mb-1 text-xs text-gray-300">End: {formatDate(event.endDate)}</p>
                                <p className="text-xs text-gray-300">
                                    Price: {event.ticketPrice} {event.currency}
                                </p>
                            </article>
                        ))}
                    </div>
                </section>
            </div>
        </main>
    );
}
