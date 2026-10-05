import proj4 from 'proj4';

// OSGB36 / British National Grid with 7-parameter Helmert shift from WGS84 (accuracy ~5 m, fine for route cards).
proj4.defs(
    'EPSG:27700',
    '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy ' +
    '+towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs'
);

const COMPASS_16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const toRad = d => (d * Math.PI) / 180;
const toDeg = r => (r * 180) / Math.PI;

export function bearing(from, to) {
    const φ1 = toRad(from.lat);
    const φ2 = toRad(to.lat);
    const Δλ = toRad(to.lon - from.lon);
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function compassPoint(deg, points = 16) {
    const step = 360 / points;
    const idx = Math.round((((deg % 360) + 360) % 360) / step) % points;
    return COMPASS_16[idx * (16 / points)];
}

export function haversineMetres(a, b) {
    const R = 6371008.8;
    const dφ = toRad(b.lat - a.lat);
    const dλ = toRad(b.lon - a.lon);
    const h = Math.sin(dφ / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dλ / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

export function toOsgbEastingNorthing(lat, lon) {
    const [e, n] = proj4('EPSG:4326', 'EPSG:27700', [lon, lat]);
    return { e, n };
}

// Returns e.g. "SU 123 456" (digits = total figures, 6/8/10), or null if outside the GB grid.
export function toOsGridRef(lat, lon, digits = 6) {
    const { e, n } = toOsgbEastingNorthing(lat, lon);
    if (!(e >= 0 && e < 700000 && n >= 0 && n < 1300000)) return null;
    const e100k = Math.floor(e / 100000);
    const n100k = Math.floor(n / 100000);
    let l1 = 19 - n100k - ((19 - n100k) % 5) + Math.floor((e100k + 10) / 5);
    let l2 = (((19 - n100k) * 5) % 25) + (e100k % 5);
    if (l1 > 7) l1++; // grid letters skip 'I'
    if (l2 > 7) l2++;
    const letters = String.fromCharCode(l1 + 65) + String.fromCharCode(l2 + 65);
    const half = digits / 2;
    const scale = 10 ** (5 - half);
    const ee = String(Math.floor((e % 100000) / scale)).padStart(half, '0');
    const nn = String(Math.floor((n % 100000) / scale)).padStart(half, '0');
    return `${letters} ${ee} ${nn}`;
}

export function formatLatLon(lat, lon) {
    return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

export function formatLocation(point, format = 'both') {
    if (!point || point.lat == null) return '';
    const name = point.name ? `${point.name} ` : '';
    const ll = formatLatLon(point.lat, point.lon);
    const grid = toOsGridRef(point.lat, point.lon);
    let loc;
    if (format === 'latlon' || !grid) loc = ll;
    else if (format === 'grid') loc = grid;
    else loc = `${grid} (${ll})`;
    return `${name}${name ? '- ' : ''}${loc}`.trim();
}

export const METRES_PER_MILE = 1609.344;

export function formatDistance(metres, units = 'km') {
    if (metres == null || Number.isNaN(metres)) return '';
    const v = units === 'mi' ? metres / METRES_PER_MILE : metres / 1000;
    return `${v.toFixed(1)} ${units}`;
}

export function formatDuration(seconds) {
    if (seconds == null || Number.isNaN(seconds)) return '';
    const totalMin = Math.round(seconds / 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Decode an encoded polyline (Google algorithm); precision 5 for OSRM/ORS, 6 for Valhalla.
export function decodePolyline(str, precision = 5) {
    const factor = 10 ** precision;
    const coords = [];
    let index = 0, lat = 0, lon = 0;
    while (index < str.length) {
        for (const which of [0, 1]) {
            let shift = 0, result = 0, byte;
            do {
                byte = str.charCodeAt(index++) - 63;
                result |= (byte & 0x1f) << shift;
                shift += 5;
            } while (byte >= 0x20);
            const delta = result & 1 ? ~(result >> 1) : result >> 1;
            if (which === 0) lat += delta; else lon += delta;
        }
        coords.push([lat / factor, lon / factor]);
    }
    return coords;
}

// Shortest distance in metres from point p to a polyline ([[lat,lon],...]), using a local equirectangular projection.
export function distanceToPolylineMetres(p, line) {
    if (!line || line.length === 0) return Infinity;
    const R = 6371008.8;
    const cosLat = Math.cos(toRad(p.lat));
    const proj = ([lat, lon]) => [toRad(lon - p.lon) * cosLat * R, toRad(lat - p.lat) * R];
    let best = Infinity;
    let prev = proj(line[0]);
    if (line.length === 1) return Math.hypot(prev[0], prev[1]);
    for (let i = 1; i < line.length; i++) {
        const cur = proj(line[i]);
        const dx = cur[0] - prev[0], dy = cur[1] - prev[1];
        const len2 = dx * dx + dy * dy;
        const t = len2 ? Math.max(0, Math.min(1, -(prev[0] * dx + prev[1] * dy) / len2)) : 0;
        best = Math.min(best, Math.hypot(prev[0] + t * dx, prev[1] + t * dy));
        prev = cur;
    }
    return best;
}
