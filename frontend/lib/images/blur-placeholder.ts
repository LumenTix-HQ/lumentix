/**
 * Generate a tiny base64-encoded WebP or PNG blur placeholder for use
 * as a `blurDataURL` in Next.js `Image` components.
 *
 * This produces a small (1x1 or tiny) solid-color image as a fallback
 * when a real placeholder cannot be generated at build time.
 */

/** A minimal 1x1 transparent GIF as a fallback placeholder */
export const TRANSPARENT_PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/**
 * Generate a solid-color base64 placeholder for a given hex color.
 * Useful for creating a colour-matched blur-up placeholder when the
 * dominant colour of an image is known ahead of time.
 *
 * @param hexColor - CSS hex colour (e.g. "#6366f1")
 * @returns A data-URI string suitable for `blurDataURL`
 */
export function solidColorPlaceholder(hexColor: string = '#6366f1'): string {
  // Create a tiny 4x4 PNG of the given colour
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);

  // Minimal 4x4 raw PNG (no alpha) using the colour bytes
  // IDAT chunk: 4x4 pixels of the specified colour
  // This is a pre-built minimal PNG structure
  const raw = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x04, // 4x4 pixels
    0x08, 0x02, 0x00, 0x00, 0x00, 0x26, 0x93, 0x69, 0x5d, // 8-bit RGB
    0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, // IDAT chunk
    0x08, 0xd7, 0x63, r, g, b, r, g, b, r, g, b, r, g, b, // pixel data
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82, // IEND
  ]);

  // Convert to base64 data URI
  const base64 = btoa(String.fromCharCode(...raw));
  return `data:image/png;base64,${base64}`;
}

/**
 * Parse a URL and return the image dimensions if available.
 * Useful for setting `width` and `height` on `next/image`.
 */
export function getImageDimensions(
  url: string,
): { width: number; height: number } | null {
  // For remote images, we cannot know dimensions from the URL alone.
  // Return null to use fill or intrinsic sizing.
  return null;
}
