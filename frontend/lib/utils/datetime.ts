/**
 * Timezone-aware datetime utilities.
 *
 * The application stores all event datetimes in UTC (ISO-8601). The organizer's
 * IANA timezone is captured at creation time so viewers in other zones can see
 * both their local time and the original event time.
 *
 * These helpers do not depend on any third-party library — they use the
 * built-in `Intl` API which is available in modern browsers and in Node 18+.
 */

const INPUT_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;

/** Returns the viewer's IANA timezone (e.g. "Africa/Lagos"). */
export function getUserTimezone(): string {
    try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return tz && tz.length > 0 ? tz : "UTC";
    } catch {
        return "UTC";
    }
}

/**
 * Returns the short timezone abbreviation for a given IANA zone at a given
 * instant (e.g. "WAT", "UTC", "GMT+1"). Falls back to the IANA name if the
 * runtime cannot resolve a short name.
 */
export function getTimezoneAbbreviation(timezone: string, date: Date = new Date()): string {
    try {
        const parts = new Intl.DateTimeFormat("en-US", {
            timeZone: timezone,
            timeZoneName: "short",
        }).formatToParts(date);
        const tzPart = parts.find((p) => p.type === "timeZoneName");
        return tzPart?.value ?? timezone;
    } catch {
        return timezone;
    }
}

/**
 * Reads the wall-clock parts (year/month/day/hour/minute/second) of a UTC
 * instant as observed in the given IANA timezone.
 */
function getWallClockPartsInTimezone(date: Date, timezone: string): {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
} {
    const dtf = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
    const parts = dtf.formatToParts(date);
    const out: Record<string, string> = {};
    for (const p of parts) {
        if (p.type !== "literal") out[p.type] = p.value;
    }
    return {
        year: Number(out.year),
        // `Intl` returns "24" for midnight in some locales; normalize to 0.
        month: Number(out.month),
        day: Number(out.day),
        hour: Number(out.hour) % 24,
        minute: Number(out.minute),
        second: Number(out.second),
    };
}

/**
 * Returns the offset (in minutes) between the given IANA timezone and UTC at
 * the supplied instant. Positive when the zone is ahead of UTC.
 */
export function getTimezoneOffsetMinutes(timezone: string, date: Date = new Date()): number {
    const wall = getWallClockPartsInTimezone(date, timezone);
    const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
    return Math.round((asUtc - date.getTime()) / 60000);
}


export function localDateTimeToUTC(localDateTime: string, timezone: string): string {
    if (!INPUT_REGEX.test(localDateTime)) {
        throw new Error(`Invalid datetime format: "${localDateTime}". Expected "YYYY-MM-DDTHH:mm".`);
    }

    const [datePart, timePart] = localDateTime.split("T");
    const [yearStr, monthStr, dayStr] = datePart.split("-");
    const [hourStr, minuteStr, secondStr = "0"] = timePart.split(":");

    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    const hour = Number(hourStr);
    const minute = Number(minuteStr);
    const second = Number(secondStr);

    // Pretend the wall clock is UTC, then correct for the zone's offset at
    // that instant (handles DST automatically because we evaluate the offset
    // at the candidate instant itself).
    const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
    const probe = new Date(naiveUtcMs);
    const offsetMinutes = getTimezoneOffsetMinutes(timezone, probe);
    const trueUtcMs = naiveUtcMs - offsetMinutes * 60_000;

    return new Date(trueUtcMs).toISOString();
}

/**
 * Converts a UTC ISO-8601 string into a "YYYY-MM-DDTHH:mm" value suitable for
 * a `<input type="datetime-local">` populated in the supplied IANA timezone.
 */
export function utcToLocalInputValue(utcIso: string, timezone: string): string {
    const date = new Date(utcIso);
    if (Number.isNaN(date.getTime())) return "";
    const w = getWallClockPartsInTimezone(date, timezone);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}`;
}

/** Formats a UTC ISO-8601 string in the given IANA timezone. */
export function formatDateTimeInTimezone(
    utcIso: string,
    timezone: string,
    options: Intl.DateTimeFormatOptions = {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    },
): string {
    const date = new Date(utcIso);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-US", { timeZone: timezone, ...options }).format(date);
}

/**
 * Renders a datetime in the viewer's local timezone followed by the original
 * event timezone in parentheses, e.g.:
 *
 *   "3:00 PM WAT (1:00 PM UTC)"
 *
 * If both zones resolve to the same offset *and* the same abbreviation,
 * the parenthesised duplicate is omitted.
 */
export function formatLocalWithOriginalTimezone(
    utcIso: string,
    originalTimezone: string,
    viewerTimezone: string = getUserTimezone(),
    options: Intl.DateTimeFormatOptions = {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    },
): string {
    const date = new Date(utcIso);
    if (Number.isNaN(date.getTime())) return "";

    const localText = formatDateTimeInTimezone(utcIso, viewerTimezone, options);
    const localTz = getTimezoneAbbreviation(viewerTimezone, date);

    const originalText = formatDateTimeInTimezone(utcIso, originalTimezone, options);
    const originalTz = getTimezoneAbbreviation(originalTimezone, date);

    const sameZone =
        viewerTimezone === originalTimezone ||
        (localText === originalText && localTz === originalTz);

    return sameZone
        ? `${localText} ${localTz}`
        : `${localText} ${localTz} (${originalText} ${originalTz})`;
}

/**
 * A small curated list of IANA timezones useful as default options in pickers.
 * The viewer's detected zone should always be added on top of this list.
 */
export const COMMON_TIMEZONES: ReadonlyArray<string> = [
    "UTC",
    "Africa/Lagos",
    "Africa/Accra",
    "Africa/Johannesburg",
    "Africa/Cairo",
    "Africa/Nairobi",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Europe/Istanbul",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Sao_Paulo",
    "Asia/Dubai",
    "Asia/Karachi",
    "Asia/Kolkata",
    "Asia/Bangkok",
    "Asia/Singapore",
    "Asia/Shanghai",
    "Asia/Tokyo",
    "Australia/Sydney",
    "Pacific/Auckland",
];
