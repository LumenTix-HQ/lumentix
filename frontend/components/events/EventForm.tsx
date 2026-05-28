"use client";

import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
    createEventSchema,
    defaultCreateEventValues,
    type CreateEventFormInput,
    type CreateEventFormValues,
} from "@/lib/schemas/create-event.schema";

export type EventFormDiff = {
    field: string;
    before: string;
    after: string;
};

type EventFormProps = {
    mode: "create" | "edit";
    initialValues?: Partial<CreateEventFormInput>;
    submitLabel?: string;
    loadingLabel?: string;
    successMessage?: string | null;
    errorMessage?: string | null;
    onSubmit: (values: CreateEventFormValues) => Promise<void>;
    onPreviewSubmit?: (values: CreateEventFormValues) => EventFormDiff[] | null;
};

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

    const { fields, append, remove } = useFieldArray({ control, name: "sponsorTiers" });
    const sponsorshipEnabled = watch("sponsorshipEnabled");

    useEffect(() => {
        reset(defaultValues);
    }, [defaultValues, reset]);

    const buttonLabel = isSubmitting ? (loadingLabel ?? "Saving...") : (submitLabel ?? (mode === "create" ? "Create Event" : "Save Changes"));

    const submitHandler: SubmitHandler<CreateEventFormValues> = async (values) => {
        const previewDiffs = onPreviewSubmit?.(values);
        if (previewDiffs) {
            setDiffs(previewDiffs);
            setPendingValues(values);
            return;
        }
        await onSubmit(values);
    };

    return (
        <>
            <form className="space-y-5" onSubmit={handleSubmit(submitHandler)} noValidate>
                <div>
                    <label className="mb-2 block text-sm text-gray-300">Organizer Access Token</label>
                    <input type="password" placeholder="Paste your bearer token" className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm outline-none transition-all focus:border-purple-400" {...register("authToken")} />
                    {errors.authToken ? <p className="mt-1 text-xs text-red-300">{errors.authToken.message}</p> : null}
                </div>

                <div>
                    <label className="mb-2 block text-sm text-gray-300">Wallet Public Key</label>
                    <input type="text" placeholder="G..." className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm outline-none transition-all focus:border-purple-400" {...register("walletPublicKey")} />
                    {errors.walletPublicKey ? <p className="mt-1 text-xs text-red-300">{errors.walletPublicKey.message}</p> : null}
                </div>

                <div>
                    <label className="mb-2 block text-sm text-gray-300">Event Title</label>
                    <input type="text" placeholder="Lumentix Builder Summit" className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm outline-none transition-all focus:border-purple-400" {...register("title")} />
                    {errors.title ? <p className="mt-1 text-xs text-red-300">{errors.title.message}</p> : null}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                        <label className="mb-2 block text-sm text-gray-300">Start Date & Time</label>
                        <input type="datetime-local" className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm outline-none transition-all focus:border-purple-400" {...register("startDate")} />
                        {errors.startDate ? <p className="mt-1 text-xs text-red-300">{errors.startDate.message}</p> : null}
                    </div>
                    <div>
                        <label className="mb-2 block text-sm text-gray-300">End Date & Time</label>
                        <input type="datetime-local" className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm outline-none transition-all focus:border-purple-400" {...register("endDate")} />
                        {errors.endDate ? <p className="mt-1 text-xs text-red-300">{errors.endDate.message}</p> : null}
                    </div>
                </div>

                <div>
                    <label className="mb-2 block text-sm text-gray-300">Location</label>
                    <input type="text" placeholder="Accra, Ghana" className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm outline-none transition-all focus:border-purple-400" {...register("location")} />
                    {errors.location ? <p className="mt-1 text-xs text-red-300">{errors.location.message}</p> : null}
                </div>

                <div>
                    <label className="mb-2 block text-sm text-gray-300">Description</label>
                    <textarea rows={4} placeholder="Describe the event agenda and audience..." className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm outline-none transition-all focus:border-purple-400" {...register("description")} />
                    {errors.description ? <p className="mt-1 text-xs text-red-300">{errors.description.message}</p> : null}
                </div>

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
                                            <input type="text" className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-purple-400" {...register(`sponsorTiers.${index}.name`)} />
                                            {errors.sponsorTiers?.[index]?.name ? <p className="mt-1 text-xs text-red-300">{errors.sponsorTiers[index]?.name?.message}</p> : null}
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-xs text-gray-300">Benefits</label>
                                            <input type="text" className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-purple-400" {...register(`sponsorTiers.${index}.benefits`)} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                        <div>
                                            <label className="mb-1 block text-xs text-gray-300">Tier Price</label>
                                            <input type="number" step="0.01" min="0.01" className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-purple-400" {...register(`sponsorTiers.${index}.price`, { valueAsNumber: true })} />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-xs text-gray-300">Max Sponsors</label>
                                            <input type="number" min="1" step="1" className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-purple-400" {...register(`sponsorTiers.${index}.maxSponsors`, { valueAsNumber: true })} />
                                        </div>
                                        <div className="flex items-end">
                                            <button type="button" onClick={() => remove(index)} className="w-full rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/20">Remove Tier</button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <button type="button" onClick={() => append({ name: "", price: 0.01, benefits: "", maxSponsors: 1 })} className="rounded-lg border border-white/25 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15">Add Sponsor Tier</button>
                        </div>
                    ) : null}
                </div>

                {errorMessage ? <p className="rounded-xl bg-red-500/15 p-3 text-sm text-red-200">{errorMessage}</p> : null}
                {successMessage ? <p className="rounded-xl bg-green-500/15 p-3 text-sm text-green-200">{successMessage}</p> : null}

                <button type="submit" disabled={isSubmitting} className="w-full rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 py-3 text-sm font-bold transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-80">
                    {buttonLabel}
                </button>
            </form>

            {pendingValues ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
                    <div className="w-full max-w-2xl rounded-3xl border border-white/15 bg-gray-950 p-6 text-white shadow-2xl">
                        <h2 className="text-2xl font-bold">Confirm published event changes</h2>
                        <p className="mt-2 text-sm text-yellow-200">Editing a published event will notify registered attendees</p>
                        <div className="mt-5 max-h-80 space-y-3 overflow-y-auto">
                            {diffs.length === 0 ? <p className="text-sm text-gray-300">No field changes detected.</p> : diffs.map((diff) => (
                                <div key={diff.field} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
                                    <p className="font-semibold text-purple-200">{diff.field}</p>
                                    <p className="mt-1 text-red-200">Before: {diff.before || "-"}</p>
                                    <p className="text-green-200">After: {diff.after || "-"}</p>
                                </div>
                            ))}
                        </div>
                        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                            <button type="button" onClick={() => setPendingValues(null)} className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-gray-100">Cancel</button>
                            <button type="button" onClick={() => { const values = pendingValues; setPendingValues(null); void onSubmit(values); }} className="rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-2 text-sm font-bold">Confirm & Notify</button>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}
