/**
 * Unit tests for `lib/utils/datetime`.
 *
 * Run with: npm test (requires vitest, matching the existing test setup in
 * `tests/a11y/pages.test.tsx`).
 */
import { describe, expect, it } from "vitest";

import {
    COMMON_TIMEZONES,
    formatDateTimeInTimezone,
    formatLocalWithOriginalTimezone,
    getTimezoneAbbreviation,
    getTimezoneOffsetMinutes,
    getUserTimezone,
    localDateTimeToUTC,
    utcToLocalInputValue,
} from "@/lib/utils/datetime";

describe("getUserTimezone", () => {
    it("returns a non-empty IANA-like string", () => {
        const tz = getUserTimezone();
        expect(typeof tz).toBe("string");
        expect(tz.length).toBeGreaterThan(0);
    });
});

describe("getTimezoneOffsetMinutes", () => {
    it("returns 0 for UTC", () => {
        expect(getTimezoneOffsetMinutes("UTC", new Date("2025-06-15T00:00:00Z"))).toBe(0);
    });

    it("returns +60 for Africa/Lagos (WAT, no DST)", () => {
        // Lagos is fixed UTC+1 year-round.
        expect(getTimezoneOffsetMinutes("Africa/Lagos", new Date("2025-01-15T00:00:00Z"))).toBe(60);
        expect(getTimezoneOffsetMinutes("Africa/Lagos", new Date("2025-06-15T00:00:00Z"))).toBe(60);
    });

    it("reflects DST changes for America/New_York", () => {
        // EST = UTC-5 in January, EDT = UTC-4 in July.
        expect(getTimezoneOffsetMinutes("America/New_York", new Date("2025-01-15T12:00:00Z"))).toBe(-300);
        expect(getTimezoneOffsetMinutes("America/New_York", new Date("2025-07-15T12:00:00Z"))).toBe(-240);
    });
});

describe("localDateTimeToUTC", () => {
    it("treats input as UTC when timezone is UTC", () => {
        expect(localDateTimeToUTC("2025-06-15T15:00", "UTC")).toBe("2025-06-15T15:00:00.000Z");
    });

    it("subtracts the zone offset for zones ahead of UTC (Lagos = UTC+1)", () => {
        // 15:00 in Lagos == 14:00 UTC.
        expect(localDateTimeToUTC("2025-06-15T15:00", "Africa/Lagos")).toBe("2025-06-15T14:00:00.000Z");
    });

    it("adds the zone offset for zones behind UTC (New York summer = UTC-4)", () => {
        // 09:00 EDT == 13:00 UTC.
        expect(localDateTimeToUTC("2025-07-15T09:00", "America/New_York")).toBe("2025-07-15T13:00:00.000Z");
    });

    it("handles winter DST correctly for New York", () => {
        // 09:00 EST == 14:00 UTC.
        expect(localDateTimeToUTC("2025-01-15T09:00", "America/New_York")).toBe("2025-01-15T14:00:00.000Z");
    });

    it("supports values that include seconds", () => {
        expect(localDateTimeToUTC("2025-06-15T15:30:45", "UTC")).toBe("2025-06-15T15:30:45.000Z");
    });

    it("throws on malformed input", () => {
        expect(() => localDateTimeToUTC("not-a-date", "UTC")).toThrow();
        expect(() => localDateTimeToUTC("2025/06/15 15:00", "UTC")).toThrow();
    });
});

describe("utcToLocalInputValue", () => {
    it("round-trips with localDateTimeToUTC", () => {
        const original = "2025-06-15T15:00";
        const iso = localDateTimeToUTC(original, "Africa/Lagos");
        expect(utcToLocalInputValue(iso, "Africa/Lagos")).toBe(original);
    });

    it("formats correctly for UTC", () => {
        expect(utcToLocalInputValue("2025-06-15T15:00:00.000Z", "UTC")).toBe("2025-06-15T15:00");
    });

    it("returns an empty string for invalid ISO input", () => {
        expect(utcToLocalInputValue("not-iso", "UTC")).toBe("");
    });
});

describe("formatDateTimeInTimezone", () => {
    it("renders a UTC instant in the supplied zone", () => {
        const utc = "2025-06-15T13:00:00.000Z";
        // 13:00 UTC == 14:00 in Lagos (UTC+1).
        expect(formatDateTimeInTimezone(utc, "Africa/Lagos", { hour: "numeric", minute: "2-digit", hour12: false }))
            .toBe("14:00");
    });

    it("returns empty string for invalid input", () => {
        expect(formatDateTimeInTimezone("not-iso", "UTC")).toBe("");
    });
});

describe("getTimezoneAbbreviation", () => {
    it("returns 'UTC' for UTC", () => {
        expect(getTimezoneAbbreviation("UTC", new Date("2025-06-15T00:00:00Z"))).toBe("UTC");
    });

    it("returns a stable, non-empty short name for known zones", () => {
        const abbr = getTimezoneAbbreviation("Africa/Lagos", new Date("2025-06-15T00:00:00Z"));
        expect(abbr.length).toBeGreaterThan(0);
    });
});

describe("formatLocalWithOriginalTimezone", () => {
    const utc = "2025-06-15T13:00:00.000Z"; // 13:00 UTC

    it("shows the viewer's local time first and original in parentheses", () => {
        // Viewer in Lagos sees 2:00 PM WAT, original UTC is 1:00 PM UTC.
        const out = formatLocalWithOriginalTimezone(utc, "UTC", "Africa/Lagos");
        expect(out).toContain("2:00");
        expect(out).toContain("1:00");
        // Parens enclose the original zone.
        expect(out).toMatch(/\(1:00\s+\w+\)/);
    });

    it("collapses output when viewer and original timezone are the same", () => {
        const out = formatLocalWithOriginalTimezone(utc, "UTC", "UTC");
        expect(out).not.toContain("(");
        expect(out).toContain("UTC");
    });

    it("returns empty string for invalid ISO input", () => {
        expect(formatLocalWithOriginalTimezone("not-iso", "UTC", "UTC")).toBe("");
    });
});

describe("COMMON_TIMEZONES", () => {
    it("includes UTC and a representative selection of regions", () => {
        expect(COMMON_TIMEZONES).toContain("UTC");
        expect(COMMON_TIMEZONES).toContain("Africa/Lagos");
        expect(COMMON_TIMEZONES).toContain("America/New_York");
        expect(COMMON_TIMEZONES).toContain("Asia/Tokyo");
    });

    it("contains no duplicates", () => {
        expect(new Set(COMMON_TIMEZONES).size).toBe(COMMON_TIMEZONES.length);
    });
});
