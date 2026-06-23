"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
    COMMON_TIMEZONES,
    formatDateTimeInTimezone,
    getTimezoneAbbreviation,
    getUserTimezone,
    localDateTimeToUTC,
} from "@/lib/utils/datetime";

export interface DateTimePickerProps {
    /** Local wall-clock value in "YYYY-MM-DDTHH:mm" form. */
    value: string;
    /** IANA timezone the wall-clock value is interpreted in. */
    timezone: string;
    onChange: (next: { value: string; timezone: string }) => void;
    label?: string;
    name?: string;
    id?: string;
    required?: boolean;
    disabled?: boolean;
    min?: string;
    max?: string;
    error?: string;
    /** Visible help text under the picker. Defaults to a UTC preview. */
    helpText?: string;
    className?: string;
}

/**
 * Timezone-aware datetime picker.
 *
 * Internally renders a native `datetime-local` input plus a timezone selector.
 * The viewer's detected IANA zone is auto-injected as the default option, and
 * the component shows a live preview of the resulting UTC instant so the
 * organizer always sees what will be stored on the server.
 */
export default function DateTimePicker({
    value,
    timezone,
    onChange,
    label,
    name,
    id,
    required,
    disabled,
    min,
    max,
    error,
    helpText,
    className,
}: DateTimePickerProps) {
    const reactId = useId();
    const inputId = id ?? `${reactId}-dt`;
    const tzId = `${reactId}-tz`;

    // The detected zone is only available client-side. We still render the
    // value provided by the parent; this state purely augments the option
    // list so the user's zone always appears even if it isn't curated.
    const [detectedZone, setDetectedZone] = useState<string | null>(null);
    useEffect(() => {
        setDetectedZone(getUserTimezone());
    }, []);

    const zoneOptions = useMemo(() => {
        const seen = new Set<string>();
        const out: string[] = [];
        const push = (tz: string | null | undefined) => {
            if (!tz || seen.has(tz)) return;
            seen.add(tz);
            out.push(tz);
        };
        push(detectedZone);
        push(timezone);
        for (const tz of COMMON_TIMEZONES) push(tz);
        return out;
    }, [detectedZone, timezone]);

    const utcPreview = useMemo(() => {
        if (!value || !timezone) return null;
        try {
            const iso = localDateTimeToUTC(value, timezone);
            const utcText = formatDateTimeInTimezone(iso, "UTC", {
                year: "numeric",
                month: "short",
                day: "2-digit",
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
            });
            return `${utcText} UTC`;
        } catch {
            return null;
        }
    }, [value, timezone]);

    const tzAbbr = useMemo(() => {
        if (!timezone) return "";
        try {
            return getTimezoneAbbreviation(timezone);
        } catch {
            return "";
        }
    }, [timezone]);

    return (
        <div className={className}>
            {label ? (
                <label htmlFor={inputId} className="mb-2 block text-sm text-gray-300">
                    {label}
                    {required ? <span className="ml-1 text-red-400" aria-hidden="true">*</span> : null}
                </label>
            ) : null}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <input
                    id={inputId}
                    name={name}
                    type="datetime-local"
                    value={value}
                    min={min}
                    max={max}
                    required={required}
                    disabled={disabled}
                    aria-invalid={Boolean(error)}
                    aria-describedby={`${inputId}-help`}
                    onChange={(event) => onChange({ value: event.target.value, timezone })}
                    className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm outline-none transition-all focus:border-purple-400 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <select
                    id={tzId}
                    aria-label={label ? `${label} timezone` : "Timezone"}
                    value={timezone}
                    disabled={disabled}
                    onChange={(event) => onChange({ value, timezone: event.target.value })}
                    className="rounded-xl border border-white/15 bg-gray-900 px-3 py-3 text-sm outline-none transition-all focus:border-purple-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {zoneOptions.map((tz) => (
                        <option key={tz} value={tz}>
                            {tz}
                            {tzAbbr && tz === timezone ? ` (${tzAbbr})` : ""}
                        </option>
                    ))}
                </select>
            </div>

            <p id={`${inputId}-help`} className="mt-1 text-xs text-gray-400">
                {error ? (
                    <span className="text-red-300">{error}</span>
                ) : helpText ? (
                    helpText
                ) : utcPreview ? (
                    <>Stored as <span className="font-mono">{utcPreview}</span></>
                ) : (
                    <>Time is captured in the selected timezone and stored in UTC.</>
                )}
            </p>
        </div>
    );
}
