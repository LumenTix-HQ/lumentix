'use client';

import { useEffect, useState, useRef } from 'react';
import { geocodeLocation, getGoogleMapsUrl, type GeocodingResult } from '@/lib/geocoding/nominatim';

interface VenueMapProps {
  location: string;
  venueName?: string;
}

export default function VenueMap({ location, venueName }: VenueMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [geoResult, setGeoResult] = useState<GeocodingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadMap() {
      setLoading(true);

      const result = await geocodeLocation(location);
      if (!mounted) return;

      if (!result) {
        setError(true);
        setLoading(false);
        return;
      }

      setGeoResult(result);
      setError(false);

      // Dynamically import Leaflet (client-side only)
      try {
        const L = (await import('leaflet')).default;
        await import('leaflet/dist/leaflet.css');

        if (!mounted || !mapRef.current) return;

        // Fix Leaflet's default icon paths (broken with bundlers)
        delete (L.Icon.Default.prototype as any)._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
          iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        });

        if (!mapInstanceRef.current) {
          mapInstanceRef.current = L.map(mapRef.current, {
            zoomControl: true,
            scrollWheelZoom: true,
          }).setView([result.lat, result.lng], 15);

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 19,
          }).addTo(mapInstanceRef.current);

          markerRef.current = L.marker([result.lat, result.lng])
            .addTo(mapInstanceRef.current)
            .bindPopup(
              `<strong>${venueName || 'Venue'}</strong><br/>${result.displayName}`,
            )
            .openPopup();
        } else {
          mapInstanceRef.current.setView([result.lat, result.lng], 15);
          markerRef.current?.setLatLng([result.lat, result.lng]);
          markerRef.current?.setPopupContent(
            `<strong>${venueName || 'Venue'}</strong><br/>${result.displayName}`,
          );
        }
      } catch (err) {
        console.warn('Leaflet failed to load:', err);
        setError(true);
      } finally {
        setLoading(false);
      }
    }

    loadMap();

    return () => {
      mounted = false;
    };
  }, [location, venueName]);

  if (error) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
        <p className="text-sm text-gray-500 mb-2">Map unavailable for this location</p>
        <a
          href={getGoogleMapsUrl(location)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
          View on Google Maps
        </a>
      </div>
    );
  }

  return (
    <div className="relative rounded-lg overflow-hidden border border-gray-200">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Loading map...
          </div>
        </div>
      )}
      <div ref={mapRef} className="h-64 w-full" style={{ minHeight: '16rem' }} />
    </div>
  );
}
