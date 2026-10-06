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

// Inverse of the above (same Helmert approximation, so ~5 m vs Ordnance Survey's OSTN15).
export function osgbToWgs84(e, n) {
    const [lon, lat] = proj4('EPSG:27700', 'EPSG:4326', [e, n]);
    return { lat, lon };
}

function gridSquareLetters(e100k, n100k) {
    let l1 = 19 - n100k - ((19 - n100k) % 5) + Math.floor((e100k + 10) / 5);
    let l2 = (((19 - n100k) * 5) % 25) + (e100k % 5);
    if (l1 > 7) l1++; // grid letters skip 'I'
    if (l2 > 7) l2++;
    return String.fromCharCode(l1 + 65) + String.fromCharCode(l2 + 65);
}

// 100 km squares covering the British National Grid (E 0-700 km, N 0-1300 km).
const GRID_SQUARES = (() => {
    const map = {};
    for (let e = 0; e < 7; e++) for (let n = 0; n < 13; n++) map[gridSquareLetters(e, n)] = { e: e * 100000, n: n * 100000 };
    return map;
})();

export const GRID_REF_DIGITS = [4, 6, 8, 10];

// Find an OS grid reference such as "ST 668 664", "ST668664" or "st 6680 6640" in free text.
// Returns null when the text contains no letter-prefixed grid reference, otherwise
// { ok: true, ref, letters, digits, e, n, resolutionM } where e/n are the CENTRE of the referenced square,
// or { ok: false, error } for a recognisable but invalid reference.
export function parseOsGridRef(text) {
    const re = /(?:^|[^A-Za-z0-9])([A-Za-z]{2})\s*(\d+)(?:\s+(\d+))?(?![\d.])/g;
    let invalid = null;
    for (const m of String(text || '').matchAll(re)) {
        const letters = m[1].toUpperCase();
        const sq = GRID_SQUARES[letters];
        if (!sq) {
            // Only complain about upper-case pairs; lower-case words ("rd 12") are probably not grid refs.
            if (!invalid && m[1] === letters) invalid = { ok: false, error: `"${m[0].trim()}" is not a valid British National Grid square (${letters}).` };
            continue;
        }
        let ee, nn;
        if (m[3] !== undefined) {
            if (m[2].length !== m[3].length) {
                return { ok: false, error: `"${m[0].trim()}" has unequal easting and northing lengths (${m[2].length} and ${m[3].length} digits).` };
            }
            [ee, nn] = [m[2], m[3]];
        } else {
            if (m[2].length % 2) return { ok: false, error: `"${m[0].trim()}" has an odd number of digits (${m[2].length}); use 4, 6, 8 or 10 figures.` };
            ee = m[2].slice(0, m[2].length / 2);
            nn = m[2].slice(m[2].length / 2);
        }
        const digits = ee.length * 2;
        if (!GRID_REF_DIGITS.includes(digits)) {
            return { ok: false, error: `"${m[0].trim()}" is a ${digits}-figure reference; use 4, 6, 8 or 10 figures.` };
        }
        const resolutionM = 10 ** (5 - ee.length);
        return {
            ok: true,
            ref: `${letters} ${ee} ${nn}`,
            letters,
            digits,
            resolutionM,
            e: sq.e + parseInt(ee, 10) * resolutionM + resolutionM / 2,
            n: sq.n + parseInt(nn, 10) * resolutionM + resolutionM / 2,
        };
    }
    return invalid;
}

// True when the text looks like a grid reference without its 100 km square letters, e.g. "668 664" or "668664".
export function looksLikeBareGridRef(text) {
    const t = String(text || '');
    return /(?:^|[^\w.-])\d{2,5}\s+\d{2,5}(?![\w.])/.test(t) || /(?:^|[^\w.-])\d{4,10}(?![\w.])/.test(t);
}

// Explicit decimal "lat, lon" pair, e.g. "51.39578, -2.47742". Both values must contain a decimal point.
export function parseDecimalLatLon(text) {
    const m = String(text || '').match(/(-?\d{1,2}\.(\d+))\s*,\s*(-?\d{1,3}\.(\d+))/);
    if (!m) return null;
    const lat = parseFloat(m[1]);
    const lon = parseFloat(m[3]);
    if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return null;
    return { lat, lon, decimals: Math.min(m[2].length, m[4].length) };
}

// Returns e.g. "SU 123 456" (digits = total figures, 6/8/10), or null if outside the GB grid.
export function toOsGridRef(lat, lon, digits = 6) {
    const { e, n } = toOsgbEastingNorthing(lat, lon);
    if (!(e >= 0 && e < 700000 && n >= 0 && n < 1300000)) return null;
    const e100k = Math.floor(e / 100000);
    const n100k = Math.floor(n / 100000);
    const letters = gridSquareLetters(e100k, n100k);
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
