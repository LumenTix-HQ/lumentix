"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useFieldArray, useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
    createEventSchema,
    defaultCreateEventValues,
    type CreateEventFormInput,
    type CreateEventFormValues,
} from "@/lib/schemas/create-event.schema";
import SponsorTierPreview from "@/components/SponsorTierPreview";
import DateTimePicker from "@/components/DateTimePicker";
import { getUserTimezone } from "@/lib/utils/datetime";

export type EventFormDiff = {
    field: string;
    before: string;
    after: string;
};

/**
 * Submit payload emitted by `EventForm`. The form augments the schema's values
 * with the IANA timezone the organizer chose in the date picker, so callers
 * can convert wall-clock datetimes to UTC before sending them to the API.
 */
export type EventFormSubmitValues = CreateEventFormValues & { timezone: string };

type EventFormProps = {
    mode: "create" | "edit";
    initialValues?: Partial<CreateEventFormInput> & { timezone?: string };
    submitLabel?: string;
    loadingLabel?: string;
    successMessage?: string | null;
    errorMessage?: string | null;
    onSubmit: (values: EventFormSubmitValues) => Promise<void>;
    onPreviewSubmit?: (values: EventFormSubmitValues) => EventFormDiff[] | null;
};

const MAX_TIERS = 5;

export default function EventForm({
    mode,
    initialValues,
    submitLabel,
    loadingLabel,
    successMessage,
    errorMessage,
    onSubmit,
    onPreviewSubmit,
}: EventFormProps) {
    const [pendingValues, setPendingValues] = useState<CreateEventFormValues | null>(null);
    const [diffs, setDiffs] = useState<EventFormDiff[]>([]);

    // Drag-and-drop state
    const dragIndexRef = useRef<number | null>(null);

    // The organizer's chosen IANA timezone for both start and end pickers.
    // We seed with the supplied initial timezone (e.g. when editing an event
    // that already stores one) and otherwise default to the browser's zone.
    const [timezone, setTimezone] = useState<string>(
        () => initialValues?.timezone ?? "UTC",
    );
    useEffect(() => {
        if (initialValues?.timezone) {
            setTimezone(initialValues.timezone);
        } else if (typeof window !== "undefined") {
            setTimezone(getUserTimezone());
        }
    }, [initialValues?.timezone]);

    const defaultValues = useMemo<CreateEventFormInput>(() => ({
        ...defaultCreateEventValues,
        ...initialValues,
    }), [initialValues]);

    const {
        register,
        control,
        handleSubmit,
        watch,
        reset,
        formState: { errors, isSubmitting },
    } = useForm<CreateEventFormInput, unknown, CreateEventFormValues>({
        resolver: zodResolver(createEventSchema),
        defaultValues,
    });

    const { fields, append, remove, move } = useFieldArray({ control, name: "sponsorTiers" });
    const sponsorshipEnabled = watch("sponsorshipEnabled");
    const watchedTiers = watch("sponsorTiers");

    useEffect(() => {
        reset(defaultValues);
    }, [defaultValues, reset]);

    const buttonLabel = isSubmitting
        ? (loadingLabel ?? "Saving...")
        : (submitLabel ?? (mode === "create" ? "Create Event" : "Save Changes"));

    const submitHandler: SubmitHandler<CreateEventFormValues> = async (values) => {
        const payload: EventFormSubmitValues = { ...values, timezone };
        const previewDiffs = onPreviewSubmit?.(payload);
        if (previewDiffs) {
            setDiffs(previewDiffs);
            setPendingValues(payload);
            return;
        }
        await onSubmit(payload);
    };

    // -------------------------------------------------------------------------
    // Drag-and-drop handlers
    // -------------------------------------------------------------------------

    const handleDragStart = (index: number) => {
        dragIndexRef.current = index;
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
    };

    const handleDrop = (targetIndex: number) => {
        if (dragIndexRef.current === null || dragIndexRef.current === targetIndex) return;
        move(dragIndexRef.current, targetIndex);
        dragIndexRef.current = null;
    };

    return (
        <>
            <form className="space-y-5" onSubmit={handleSubmit(submitHandler)} noValidate>
                {/* Auth token */}
                <div>
                    <label className="mb-2 block text-sm text-gray-300">Organizer Access Token</label>
                    <input type="password" placeholder="Paste your bearer token" className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm outline-none transition-all focus:border-purple-400" {...register("authToken")} />
                    {errors.authToken ? <p className="mt-1 text-xs text-red-300">{errors.authToken.message}</p> : null}
                </div>

                {/* Wallet */}
                <div>
                    <label className="mb-2 block text-sm text-gray-300">Wallet Public Key</label>
                    <input type="text" placeholder="G..." className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm outline-none transition-all focus:border-purple-400" {...register("walletPublicKey")} />
                    {errors.walletPublicKey ? <p className="mt-1 text-xs text-red-300">{errors.walletPublicKey.message}</p> : null}
                </div>

                {/* Title */}
                <div>
                    <label className="mb-2 block text-sm text-gray-300">Event Title</label>
                    <input type="text" placeholder="Lumentix Builder Summit" className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm outline-none transition-all focus:border-purple-400" {...register("title")} />
                    {errors.title ? <p className="mt-1 text-xs text-red-300">{errors.title.message}</p> : null}
                </div>

                {/* Dates — timezone-aware pickers (one shared zone for the event) */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Controller
                        control={control}
                        name="startDate"
                        render={({ field }) => (
                            <DateTimePicker
                                label="Start Date & Time"
                                name={field.name}
                                value={field.value ?? ""}
                                timezone={timezone}
                                required
                                error={errors.startDate?.message}
                                onChange={({ value, timezone: nextTz }) => {
                                    field.onChange(value);
                                    if (nextTz !== timezone) setTimezone(nextTz);
                                }}
                            />
                        )}
                    />
                    <Controller
                        control={control}
                        name="endDate"
                        render={({ field }) => (
                            <DateTimePicker
                                label="End Date & Time"
                                name={field.name}
                                value={field.value ?? ""}
                                timezone={timezone}
                                required
                                error={errors.endDate?.message}
                                onChange={({ value, timezone: nextTz }) => {
                                    field.onChange(value);
                                    if (nextTz !== timezone) setTimezone(nextTz);
                                }}
                            />
                        )}
                    />
                </div>

                {/* Location */}
                <div>
                    <label className="mb-2 block text-sm text-gray-300">Location</label>
                    <input type="text" placeholder="Accra, Ghana" className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm outline-none transition-all focus:border-purple-400" {...register("location")} />
                    {errors.location ? <p className="mt-1 text-xs text-red-300">{errors.location.message}</p> : null}
                </div>

                {/* Description */}
                <div>
                    <label className="mb-2 block text-sm text-gray-300">Description</label>
                    <textarea rows={4} placeholder="Describe the event agenda and audience..." className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm outline-none transition-all focus:border-purple-400" {...register("description")} />
                    {errors.description ? <p className="mt-1 text-xs text-red-300">{errors.description.message}</p> : null}
                </div>

                {/* Price / Currency / Status */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                        <label className="mb-2 block text-sm text-gray-300">Ticket Price</label>
                        <input type="number" min="0" step="0.0001" className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm outline-none transition-all focus:border-purple-400" {...register("ticketPrice", { valueAsNumber: true })} />
                        {errors.ticketPrice ? <p className="mt-1 text-xs text-red-300">{errors.ticketPrice.message}</p> : null}
                    </div>
                    <div>
                        <label className="mb-2 block text-sm text-gray-300">Currency</label>
                        <input type="text" maxLength={3} className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm uppercase outline-none transition-all focus:border-purple-400" {...register("currency")} />
                        {errors.currency ? <p className="mt-1 text-xs text-red-300">{errors.currency.message}</p> : null}
                    </div>
                    <div>
                        <label className="mb-2 block text-sm text-gray-300">Status</label>
                        <select className="w-full rounded-xl border border-white/15 bg-gray-900 px-4 py-3 text-sm outline-none transition-all focus:border-purple-400" {...register("status")}>
                            <option value="draft">Draft</option>
                            <option value="published">Published</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                        </select>
                    </div>
                </div>

                {/* ---------------------------------------------------------------- */}
                {/* Sponsor tiers                                                    */}
                {/* ---------------------------------------------------------------- */}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <label className="mb-3 flex cursor-pointer items-center gap-3 text-sm text-gray-200">
                        <input type="checkbox" className="h-4 w-4" {...register("sponsorshipEnabled")} />
                        Enable sponsor options
                    </label>

                    {sponsorshipEnabled ? (
                        <div className="space-y-4">
                            <p className="text-xs text-gray-400">
                                {fields.length}/{MAX_TIERS} tiers &mdash; drag rows to reorder
                            </p>

                            {fields.map((field, index) => (
                                <div
                                    key={field.id}
                                    draggable
                                    onDragStart={() => handleDragStart(index)}
                                    onDragOver={handleDragOver}
                                    onDrop={() => handleDrop(index)}
                                    className="cursor-grab rounded-xl border border-white/10 bg-black/20 p-3 active:cursor-grabbing"
                                >
                                    {/* Drag handle hint */}
                                    <div className="mb-2 flex items-center gap-2 text-xs text-gray-500 select-none">
                                        <svg className="w-4 h-4 opacity-50" fill="currentColor" viewBox="0 0 20 20">
                                            <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 9a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
                                        </svg>
                                        Tier {index + 1}
                                    </div>

                                    <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        {/* Tier Name */}
                                        <div>
                                            <label className="mb-1 block text-xs text-gray-300">Tier Name</label>
                                            <input type="text" className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-purple-400" {...register(`sponsorTiers.${index}.name`)} />
                                            {errors.sponsorTiers?.[index]?.name ? (
                                                <p className="mt-1 text-xs text-red-300">{errors.sponsorTiers[index]?.name?.message}</p>
                                            ) : null}
                                        </div>
                                        {/* Benefits */}
                                        <div>
                                            <label className="mb-1 block text-xs text-gray-300">Benefits</label>
                                            <input type="text" className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-purple-400" {...register(`sponsorTiers.${index}.benefits`)} />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                        {/* Min Amount */}
                                        <div>
                                            <label className="mb-1 block text-xs text-gray-300">Min Amount ($)</label>
                                            <input type="number" step="0.01" min="0.01" className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-purple-400" {...register(`sponsorTiers.${index}.minAmount`, { valueAsNumber: true })} />
                                            {errors.sponsorTiers?.[index]?.minAmount ? (
                                                <p className="mt-1 text-xs text-red-300">{errors.sponsorTiers[index]?.minAmount?.message}</p>
                                            ) : null}
                                        </div>
                                        {/* Max Contributors */}
                                        <div>
                                            <label className="mb-1 block text-xs text-gray-300">Max Contributors</label>
                                            <input type="number" min="1" step="1" placeholder="Unlimited" className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-purple-400" {...register(`sponsorTiers.${index}.maxContributors`, { valueAsNumber: true })} />
                                            {errors.sponsorTiers?.[index]?.maxContributors ? (
                                                <p className="mt-1 text-xs text-red-300">{errors.sponsorTiers[index]?.maxContributors?.message}</p>
                                            ) : null}
                                        </div>
                                        {/* Remove */}
                                        <div className="flex items-end">
                                            <button type="button" onClick={() => remove(index)} className="w-full rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/20">
                                                Remove Tier
                                            </button>
                                        </div>
                                    </div>

                                    {/* Inline real-time preview for this tier */}
                                    <div className="mt-3">
                                        <SponsorTierPreview
                                            index={index}
                                            tier={{
                                                name: watchedTiers?.[index]?.name ?? "",
                                                price: watchedTiers?.[index]?.minAmount ?? 0,
                                                benefits: watchedTiers?.[index]?.benefits ?? "",
                                                maxSponsors: watchedTiers?.[index]?.maxContributors ?? 0,
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}

                            <button
                                type="button"
                                disabled={fields.length >= MAX_TIERS}
                                onClick={() => append({ name: "", minAmount: 100, maxContributors: undefined, benefits: "" })}
                                className="rounded-lg border border-white/25 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {fields.length >= MAX_TIERS ? `Max ${MAX_TIERS} tiers reached` : "Add Sponsor Tier"}
                            </button>

                            {errors.sponsorTiers?.root?.message ? (
                                <p className="text-xs text-red-300">{errors.sponsorTiers.root.message}</p>
                            ) : null}
                        </div>
                    ) : null}
                </div>

                {errorMessage ? <p className="rounded-xl bg-red-500/15 p-3 text-sm text-red-200">{errorMessage}</p> : null}
                {successMessage ? <p className="rounded-xl bg-green-500/15 p-3 text-sm text-green-200">{successMessage}</p> : null}

                <button type="submit" disabled={isSubmitting} className="w-full rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 py-3 text-sm font-bold transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-80">
                    {buttonLabel}
                </button>
            </form>

            {/* Published-event change confirmation modal */}
            {pendingValues ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
                    <div className="w-full max-w-2xl rounded-3xl border border-white/15 bg-gray-950 p-6 text-white shadow-2xl">
                        <h2 className="text-2xl font-bold">Confirm published event changes</h2>
                        <p className="mt-2 text-sm text-yellow-200">Editing a published event will notify registered attendees</p>
                        <div className="mt-5 max-h-80 space-y-3 overflow-y-auto">
                            {diffs.length === 0
                                ? <p className="text-sm text-gray-300">No field changes detected.</p>
                                : diffs.map((diff) => (
                                    <div key={diff.field} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
                                        <p className="font-semibold text-purple-200">{diff.field}</p>
                                        <p className="mt-1 text-red-200">Before: {diff.before || "-"}</p>
                                        <p className="text-green-200">After: {diff.after || "-"}</p>
                                    </div>
                                ))
                            }
                        </div>
                        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                            <button type="button" onClick={() => setPendingValues(null)} className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-gray-100">Cancel</button>
                            <button
                                type="button"
                                onClick={() => { const values = pendingValues; setPendingValues(null); void onSubmit(values); }}
                                className="rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-2 text-sm font-bold"
                            >
                                Confirm & Notify
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}
