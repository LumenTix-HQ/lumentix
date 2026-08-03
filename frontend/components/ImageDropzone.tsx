"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
    ACCEPTED_IMAGE_EXTENSIONS,
    ACCEPTED_IMAGE_TYPES,
    MAX_IMAGE_BYTES,
    formatBytes,
    validateImageFile,
} from "@/lib/utils/image-upload";

export type ImageDropzoneProps = {
    /** Currently selected file, or `null` when nothing is staged. */
    file: File | null;
    /** Emitted with the validated file, or `null` when the user removes it. */
    onFileChange: (file: File | null) => void;
    /** 0-100 upload progress; only rendered while `status` is "uploading". */
    progress?: number;
    status?: "idle" | "uploading" | "success" | "error";
    /** Server-side error surfaced by the parent (upload failures). */
    uploadError?: string | null;
    /** Existing remote image (edit flows) shown when no local file is staged. */
    initialPreviewUrl?: string | null;
    disabled?: boolean;
    label?: string;
};

const ACCEPT_ATTR = [...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_IMAGE_EXTENSIONS].join(",");

/**
 * Accessible drag-and-drop image picker.
 *
 * The zone is a real `<button>` so it is focusable and activates on Enter/Space
 * for free; the `<input type="file">` stays visually hidden and is triggered
 * programmatically. Object URLs for the preview are revoked whenever the file
 * changes or the component unmounts so blobs are not leaked.
 */
export default function ImageDropzone({
    file,
    onFileChange,
    progress = 0,
    status = "idle",
    uploadError = null,
    initialPreviewUrl = null,
    disabled = false,
    label = "Event Image",
}: ImageDropzoneProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const descriptionId = useId();
    const errorId = useId();

    // Build (and tear down) the object URL for the staged file.
    useEffect(() => {
        if (!file) {
            setPreviewUrl(null);
            return;
        }
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    const acceptFile = useCallback(
        (candidate: File | undefined | null) => {
            if (!candidate) return;
            const result = validateImageFile(candidate);
            if (!result.ok) {
                setValidationError(result.error);
                onFileChange(null);
                return;
            }
            setValidationError(null);
            onFileChange(candidate);
        },
        [onFileChange],
    );

    const openPicker = useCallback(() => {
        if (disabled) return;
        inputRef.current?.click();
    }, [disabled]);

    const handleDragOver = (event: React.DragEvent<HTMLElement>) => {
        if (disabled) return;
        event.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (event: React.DragEvent<HTMLElement>) => {
        event.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (event: React.DragEvent<HTMLElement>) => {
        event.preventDefault();
        setIsDragging(false);
        if (disabled) return;
        acceptFile(event.dataTransfer?.files?.[0]);
    };

    const handleRemove = () => {
        setValidationError(null);
        if (inputRef.current) inputRef.current.value = "";
        onFileChange(null);
    };

    const shownPreview = previewUrl ?? initialPreviewUrl;
    const error = validationError ?? uploadError;
    const isUploading = status === "uploading";

    return (
        <div>
            <span className="mb-2 block text-sm text-gray-300">{label}</span>

            <input
                ref={inputRef}
                type="file"
                accept={ACCEPT_ATTR}
                className="sr-only"
                tabIndex={-1}
                disabled={disabled}
                aria-hidden="true"
                onChange={(event) => {
                    acceptFile(event.target.files?.[0]);
                    // Reset so re-selecting the same file still fires `change`.
                    event.target.value = "";
                }}
            />

            {shownPreview ? (
                <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-black/30">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={shownPreview}
                        alt={file ? `Preview of ${file.name}` : "Current event image"}
                        className="h-48 w-full object-cover"
                    />
                    <div className="flex items-center justify-between gap-3 px-4 py-3">
                        <p className="truncate text-xs text-gray-300">
                            {file ? `${file.name} — ${formatBytes(file.size)}` : "Current image"}
                        </p>
                        <div className="flex shrink-0 gap-2">
                            <button
                                type="button"
                                onClick={openPicker}
                                disabled={disabled || isUploading}
                                className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Replace
                            </button>
                            <button
                                type="button"
                                onClick={handleRemove}
                                disabled={disabled || isUploading}
                                aria-label="Remove selected image"
                                className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Remove
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={openPicker}
                    onDragOver={handleDragOver}
                    onDragEnter={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    disabled={disabled}
                    aria-describedby={`${descriptionId}${error ? ` ${errorId}` : ""}`}
                    data-dragging={isDragging || undefined}
                    className={`flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-10 text-center transition-colors outline-none focus-visible:border-purple-400 focus-visible:ring-2 focus-visible:ring-purple-400/60 disabled:cursor-not-allowed disabled:opacity-50 ${
                        isDragging
                            ? "border-purple-400 bg-purple-500/10"
                            : "border-white/20 bg-white/5 hover:border-purple-400/60"
                    } ${error ? "border-red-400/60" : ""}`}
                >
                    <svg className="h-8 w-8 text-purple-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V6m0 0L8.25 9.75M12 6l3.75 3.75M4.5 16.5v1.875A2.625 2.625 0 0 0 7.125 21h9.75a2.625 2.625 0 0 0 2.625-2.625V16.5" />
                    </svg>
                    <span className="text-sm font-semibold text-white">
                        Drag &amp; drop an image, or click to browse
                    </span>
                    <span id={descriptionId} className="text-xs text-gray-400">
                        JPEG or PNG, up to {formatBytes(MAX_IMAGE_BYTES)}
                    </span>
                </button>
            )}

            {isUploading ? (
                <div className="mt-3">
                    <div
                        role="progressbar"
                        aria-label="Image upload progress"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={progress}
                        className="h-2 w-full overflow-hidden rounded-full bg-white/10"
                    >
                        <div
                            className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-[width] duration-150"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <p className="mt-1 text-xs text-gray-400">Uploading image… {progress}%</p>
                </div>
            ) : null}

            {status === "success" && !error ? (
                <p className="mt-2 text-xs text-green-300">Image uploaded successfully.</p>
            ) : null}

            {error ? (
                <p id={errorId} role="alert" className="mt-2 text-xs text-red-300">
                    {error}
                </p>
            ) : null}
        </div>
    );
}
