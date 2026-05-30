export interface GeocodingResult {
  lat: number;
  lng: number;
  displayName: string;
}

/**
 * Geocode a location string using OpenStreetMap Nominatim API.
 * Returns null if geocoding fails.
 */
export async function geocodeLocation(
  location: string,
): Promise<GeocodingResult | null> {
  try {
    const encoded = encodeURIComponent(location);
    const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`;

    const response = await fetch(url, {
      headers: {
        'Accept-Language': 'en',
        'User-Agent': 'Lumentix/1.0 (event-discovery-platform)',
      },
    });

    if (!response.ok) {
      console.warn(`Nominatim geocoding failed: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    const result = data[0];
    return {
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      displayName: result.display_name,
    };
  } catch (err) {
    console.warn('Geocoding error:', err);
    return null;
  }
}

/**
 * Generate a Google Maps URL for the given location as a fallback.
 */
export function getGoogleMapsUrl(location: string): string {
  return `https://www.google.com/maps/search/${encodeURIComponent(location)}`;
}
