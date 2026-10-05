// Nominatim (OSM) geocoding. Public usage policy: max 1 request/second, no bulk use.
const NOMINATIM = 'https://nominatim.openstreetmap.org';

export async function searchPlace(query) {
    const url = `${NOMINATIM}/search?format=jsonv2&limit=5&countrycodes=gb&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en-GB' } });
    if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
    const data = await res.json();
    return data.map(d => ({ lat: Number(d.lat), lon: Number(d.lon), name: d.display_name }));
}

export async function reverseGeocode(lat, lon) {
    const url = `${NOMINATIM}/reverse?format=jsonv2&zoom=14&lat=${lat}&lon=${lon}`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en-GB' } });
    if (!res.ok) return '';
    const d = await res.json();
    const a = d.address || {};
    return a.village || a.town || a.city || a.hamlet || a.suburb || a.road || (d.display_name || '').split(',')[0] || '';
}
