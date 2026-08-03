/**
 * Client-side helpers for the event cover-image upload flow.
 *
 * Validation runs before anything touches the network so an oversized or
 * unsupported file never leaves the browser, and the upload itself goes through
 * `XMLHttpRequest` rather than `fetch` because only XHR exposes byte-level
 * progress events (`fetch` has no upload-progress equivalent yet).
 */

/** MIME types the backend accepts for event cover images. */
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png"] as const;

/** Extensions shown in the native file picker / used as a filename fallback. */
export const ACCEPTED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png"] as const;

/** Hard size ceiling enforced both here and by the backend (5 MB). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type ImageValidationResult = { ok: true } | { ok: false; error: string };

/** Human-readable byte count, e.g. `5 MB` or `1.4 MB`. */
export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    const mb = bytes / (1024 * 1024);
    return `${mb >= 10 ? Math.round(mb) : Number(mb.toFixed(1))} MB`;
}

/**
 * Validate a user-selected file against the accepted type and size rules.
 *
 * Some browsers report an empty `type` for files dragged from odd sources, so
 * we fall back to the filename extension before rejecting.
 */
export function validateImageFile(file: File): ImageValidationResult {
    const type = file.type.toLowerCase();
    const name = file.name.toLowerCase();

    const typeAllowed = (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(type);
    const extensionAllowed = ACCEPTED_IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext));

    if (!typeAllowed && !(type === "" && extensionAllowed)) {
        return {
            ok: false,
            error: "Unsupported file type. Upload a JPEG or PNG image.",
        };
    }

    if (file.size > MAX_IMAGE_BYTES) {
        return {
            ok: false,
            error: `Image is ${formatBytes(file.size)}. The maximum size is ${formatBytes(MAX_IMAGE_BYTES)}.`,
        };
    }

    if (file.size === 0) {
        return { ok: false, error: "The selected file is empty." };
    }

    return { ok: true };
}

export type UploadEventImageOptions = {
    eventId: string;
    file: File;
    /** Called with an integer 0-100 as bytes are flushed to the server. */
    onProgress?: (percent: number) => void;
    /** Abort the in-flight upload (e.g. the user removed the image). */
    signal?: AbortSignal;
};

export type UploadEventImageResult = {
    imageUrl?: string;
    [key: string]: unknown;
};

/** Error thrown when the upload endpoint responds with a non-2xx status. */
export class ImageUploadError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.name = "ImageUploadError";
        this.status = status;
    }
}

function extractErrorMessage(raw: string, status: number): string {
    if (!raw) return `Image upload failed (${status})`;
    try {
        const parsed = JSON.parse(raw) as { message?: string | string[] };
        if (Array.isArray(parsed.message)) return parsed.message[0];
        if (parsed.message) return parsed.message;
    } catch {
        // Non-JSON error body — fall through to the raw text.
    }
    return raw;
}

/**
 * POST the image to `/events/:id/image` as multipart form data, reporting
 * progress along the way. Resolves with the parsed JSON body on success.
 */
export function uploadEventImage({
    eventId,
    file,
    onProgress,
    signal,
}: UploadEventImageOptions): Promise<UploadEventImageResult> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("Upload aborted", "AbortError"));
            return;
        }

        const form = new FormData();
        form.append("file", file, file.name);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/proxy/events/${encodeURIComponent(eventId)}/image`);
        // Let the browser set `Content-Type` so the multipart boundary is correct.
        xhr.responseType = "text";

        const onAbort = () => xhr.abort();
        signal?.addEventListener("abort", onAbort, { once: true });

        const cleanup = () => signal?.removeEventListener("abort", onAbort);

        xhr.upload.onprogress = (event) => {
            if (!event.lengthComputable) return;
            onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
        };

        xhr.onload = () => {
            cleanup();
            const body = typeof xhr.response === "string" ? xhr.response : "";
            if (xhr.status < 200 || xhr.status >= 300) {
                reject(new ImageUploadError(xhr.status, extractErrorMessage(body, xhr.status)));
                return;
            }
            onProgress?.(100);
            try {
                resolve(body ? (JSON.parse(body) as UploadEventImageResult) : {});
            } catch {
                resolve({});
            }
        };

        xhr.onerror = () => {
            cleanup();
            reject(new ImageUploadError(0, "Network error while uploading the image."));
        };

        xhr.onabort = () => {
            cleanup();
            reject(new DOMException("Upload aborted", "AbortError"));
        };

        xhr.send(form);
    });
}
