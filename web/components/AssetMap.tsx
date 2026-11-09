'use client';
import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

export interface Pin {
  lat: number;
  lng: number;
  color: string;
  title: string;
}

/** A simple read-only map. Leaflet needs `window`, so it is imported on mount. */
export default function AssetMap({ pins, height = 380 }: { pins: Pin[]; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const key = JSON.stringify(pins);

  useEffect(() => {
    let map: import('leaflet').Map | undefined;
    let cancelled = false;
    import('leaflet').then((L) => {
      if (cancelled || !el.current) return;
      map = L.map(el.current, { attributionControl: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map);
      const parsed: Pin[] = JSON.parse(key);
      parsed.forEach((p) => L.circleMarker([p.lat, p.lng], { radius: 7, color: '#fff', weight: 2, fillColor: p.color, fillOpacity: 1 }).bindTooltip(p.title).addTo(map!));
      if (parsed.length) map.fitBounds(L.latLngBounds(parsed.map((p) => [p.lat, p.lng] as [number, number])).pad(0.2), { maxZoom: 15 });
      else map.setView([0, 20], 3);
    });
    return () => { cancelled = true; map?.remove(); };
  }, [key]);

  return <div ref={el} style={{ height }} className="z-0 w-full rounded-2xl border border-edge" />;
}
