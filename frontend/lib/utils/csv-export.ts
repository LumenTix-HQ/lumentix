/**
 * Tiny client-side CSV export helpers.
 *
 * No external dependency: a plain `Blob` + object URL is enough to trigger a
 * download from the browser. Excel-friendly: fields containing commas, quotes,
 * carriage returns or newlines are quoted and embedded quotes are doubled,
 * matching RFC 4180.
 */

export type CsvCellValue = string | number | boolean | null | undefined | Date;

export interface CsvColumn<T> {
    /** CSV header label. */
    header: string;
    /** Selector that returns the cell value for a row. */
    accessor: (row: T) => CsvCellValue;
}

const NEEDS_QUOTING = /[",\r\n]/;

/** Stringifies a single cell value following RFC 4180 quoting rules. */
export function escapeCsvField(value: CsvCellValue): string {
    if (value === null || value === undefined) return "";
    const raw = value instanceof Date ? value.toISOString() : String(value);
    if (!NEEDS_QUOTING.test(raw)) return raw;
    return `"${raw.replace(/"/g, '""')}"`;
}

/**
 * Generates a CSV string from a row collection.
 *
 * - Uses CRLF line terminators for maximum spreadsheet compatibility.
 * - The header row is always emitted, even when `rows` is empty.
 */
export function toCsv<T>(rows: ReadonlyArray<T>, columns: ReadonlyArray<CsvColumn<T>>): string {
    const headerLine = columns.map((c) => escapeCsvField(c.header)).join(",");
    const dataLines = rows.map((row) =>
        columns.map((c) => escapeCsvField(c.accessor(row))).join(","),
    );
    return [headerLine, ...dataLines].join("\r\n");
}

/**
 * Triggers a client-side download of `csv` under `filename`. Prepends a UTF-8
 * BOM so Excel detects the encoding correctly when the file is opened.
 *
 * Returns `false` (no-op) when called in a non-browser environment.
 */
export function downloadCsv(filename: string, csv: string): boolean {
    if (typeof window === "undefined" || typeof document === "undefined") return false;

    const BOM = "\ufeff";
    const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    // Release the object URL on the next tick so Safari has time to start
    // the download before the resource is revoked.
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
}

/**
 * Convenience helper: build the CSV from rows + columns and download it.
 */
export function exportToCsv<T>(
    filename: string,
    rows: ReadonlyArray<T>,
    columns: ReadonlyArray<CsvColumn<T>>,
): boolean {
    return downloadCsv(filename, toCsv(rows, columns));
}
