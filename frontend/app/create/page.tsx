"use client";

import { useEffect, useState, useCallback } from "react";
import EventForm, { type EventFormSubmitValues } from "@/components/events/EventForm";
import EventPreviewOverlay from "@/components/EventPreviewOverlay";
import ImageDropzone from "@/components/ImageDropzone";
import { defaultCreateEventValues, type CreateEventFormValues } from "@/lib/schemas/create-event.schema";
import { localDateTimeToUTC } from "@/lib/utils/datetime";
import { apiGet, apiPost } from "@/lib/api-client";
import { uploadEventImage } from "@/lib/utils/image-upload";
import { useWallet } from "@/contexts/WalletContext";

type EventRecord = { id: string; title: string; location?: string };

type UploadStatus = "idle" | "uploading" | "success" | "error";

function toApiDate(value: string, timezone: string): string {
    return localDateTimeToUTC(value, timezone);
}

export default function CreateEventPage() {
    const { publicKey } = useWallet();
    const [events, setEvents] = useState<EventRecord[]>([]);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    // Cover-image upload state. The file is staged locally while the form is
    // filled in and only uploaded once the event exists and has an id.
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
    const [uploadError, setUploadError] = useState<string | null>(null);

    const handleImageChange = useCallback((file: File | null) => {
        setImageFile(file);
        setUploadError(null);
        setUploadProgress(0);
        setUploadStatus("idle");
        if (!file) setImagePreview(null);
    }, []);

    const fetchEvents = async () => {
        setLoadError(null);
        try {
            const payload = await apiGet<{ data?: EventRecord[] }>("events?page=1&limit=10");
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
            if (!publicKey) {
                throw new Error("Connect your wallet before creating an event.");
            }
            const created = await apiPost<EventRecord>("events", {
                title: values.title,
                description: values.description || undefined,
                location: values.location || undefined,
                startDate: toApiDate(values.startDate, values.timezone),
                endDate: toApiDate(values.endDate, values.timezone),
                timezone: values.timezone,
                ticketPrice: values.ticketPrice,
                currency: values.currency,
                status: values.status,
            });
            setSubmitSuccess(`Event "${created.title}" created successfully.`);

            // The image endpoint needs the event id, so the upload is a second
            // step. A failure here must not read as "the event was not created".
            if (imageFile) {
                setUploadStatus("uploading");
                setUploadProgress(0);
                setUploadError(null);
                try {
                    const result = await uploadEventImage({
                        eventId: created.id,
                        file: imageFile,
                        onProgress: setUploadProgress,
                    });
                    setUploadStatus("success");
                    if (typeof result.imageUrl === "string") {
                        setImagePreview(result.imageUrl);
                    }
                } catch (error) {
                    setUploadStatus("error");
                    setUploadError(
                        error instanceof Error
                            ? `${error.message} The event was created — you can add the image from the edit page.`
                            : "Image upload failed.",
                    );
                }
            }

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

    return (
        <>
            {showPreview && formData && (
                <EventPreviewOverlay
                    formValues={{
                        title: formData.title,
                        description: formData.description ?? "",
                        location: formData.location ?? "",
                        startDate: formData.startDate,
                        endDate: formData.endDate,
                        ticketPrice: formData.ticketPrice,
                        currency: formData.currency,
                        category: "",
                        maxAttendees: null,
                        imageUrl: imagePreview ?? "",
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
                    <div className="mb-6">
                        <ImageDropzone
                            file={imageFile}
                            onFileChange={handleImageChange}
                            progress={uploadProgress}
                            status={uploadStatus}
                            uploadError={uploadError}
                            initialPreviewUrl={imagePreview}
                        />
                    </div>
                    <EventForm mode="create" initialValues={defaultCreateEventValues} submitLabel="Create Event" loadingLabel="Creating Event..." successMessage={submitSuccess} errorMessage={submitError} onSubmit={handleSubmit} />
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
