import { distanceToPolylineMetres, toOsGridRef } from '../geo/geo';

export const OVERPASS_URLS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const KIND_LABELS = {
    maxheight: 'Height limit',
    maxweight: 'Weight limit',
    maxaxleload: 'Axle load limit',
    maxwidth: 'Width limit',
    maxlength: 'Length limit',
    hgv: 'HGV access',
};
const VEHICLE_KEY = { maxheight: 'heightM', maxweight: 'weightT', maxaxleload: 'axleLoadT', maxwidth: 'widthM', maxlength: 'lengthM' };
const HGV_WEIGHT_T = 3.5;
const NO_LIMIT_VALUES = /^(default|none|no)$/i;
const MAX_PLAUSIBLE_M = 50;
const MAX_PLAUSIBLE_T = 200;

// ---------- value parsing (OSM tag values -> metres / tonnes) ----------
export function parseLength(raw) {
    if (raw == null) return null;
    const v = String(raw).trim().toLowerCase();
    const ftIn = v.match(/^(\d+(?:\.\d+)?)\s*'\s*(?:(\d+(?:\.\d+)?)\s*")?$/);
    if (ftIn) return Number(ftIn[1]) * 0.3048 + (ftIn[2] ? Number(ftIn[2]) * 0.0254 : 0);
    const m = v.match(/^(\d+(?:\.\d+)?)\s*(m|ft)?$/);
    if (!m) return null; // e.g. "default", "none", "below_default"
    return m[2] === 'ft' ? Number(m[1]) * 0.3048 : Number(m[1]);
}

export function parseWeight(raw) {
    if (raw == null) return null;
    const v = String(raw).trim().toLowerCase();
    const m = v.match(/^(\d+(?:\.\d+)?)\s*(t|kg|lbs|st|cwt)?$/);
    if (!m) return null;
    const n = Number(m[1]);
    switch (m[2]) {
        case 'kg': return n / 1000;
        case 'lbs': return n * 0.00045359237;
        case 'st': return n * 0.90718474; // short ton
        case 'cwt': return n * 0.0508023;
        default: return n;
    }
}

export function formatMetresWithFeet(m) {
    const totalIn = Math.round(m / 0.0254);
    return `${m.toFixed(2)} m (${Math.floor(totalIn / 12)}'${totalIn % 12}")`;
}

// ---------- geometry helpers ----------
// Douglas-Peucker in a local metric projection; keeps the shape of the route so Overpass `around` hugs the road.
export function simplifyLine(line, toleranceM = 10) {
    if (line.length <= 2) return line;
    const lat0 = (line[0][0] * Math.PI) / 180;
    const k = 6371008.8 * (Math.PI / 180);
    const xy = line.map(([lat, lon]) => [lon * k * Math.cos(lat0), lat * k]);
    const keep = new Uint8Array(line.length);
    keep[0] = keep[line.length - 1] = 1;
    const stack = [[0, line.length - 1]];
    while (stack.length) {
        const [a, b] = stack.pop();
        const [ax, ay] = xy[a], [bx, by] = xy[b];
        const dx = bx - ax, dy = by - ay;
        const len = Math.hypot(dx, dy) || 1;
        let maxD = -1, idx = -1;
        for (let i = a + 1; i < b; i++) {
            const d = Math.abs(dy * xy[i][0] - dx * xy[i][1] + bx * ay - by * ax) / len;
            if (d > maxD) { maxD = d; idx = i; }
        }
        if (maxD > toleranceM) {
            keep[idx] = 1;
            stack.push([a, idx], [idx, b]);
        }
    }
    return line.filter((_, i) => keep[i]);
}

export function buildOverpassQuery(line, bufferM = 30) {
    let tol = 10;
    let simple = simplifyLine(line, tol);
    while (simple.length > 1500 && tol < 200) simple = simplifyLine(line, (tol *= 2));
    const coords = simple.map(([lat, lon]) => `${lat.toFixed(6)},${lon.toFixed(6)}`).join(',');
    const a = `(around:${bufferM},${coords})`;
    return `[out:json][timeout:90];
(
  way${a}["highway"][~"^max(height|weight|axleload|width|length)(:physical|:hgv)?$"~"."];
  way${a}["highway"]["hgv"~"^(no|destination|delivery|discouraged)$"];
  node${a}[~"^max(height|weight|axleload|width|length)(:physical|:hgv)?$"~"."];
  node${a}["barrier"="height_restrictor"];
);
out geom tags;`;
}

// ---------- analysis ----------
function roadName(tags) {
    return [tags.ref, tags.name].filter(Boolean).join(' ') || tags.highway || tags.barrier || '';
}

export function isHgv(vehicle = {}) {
    const w = parseFloat(vehicle.weightT);
    return (w > HGV_WEIGHT_T) || ['heightM', 'widthM', 'lengthM', 'axleLoadT'].some(k => parseFloat(vehicle[k]) > 0);
}

export function analyseElements(elements, routeLine, vehicle = {}, bufferM = 30) {
    const out = [];
    for (const el of elements) {
        const tags = el.tags || {};
        const geom = el.type === 'node' ? [{ lat: el.lat, lon: el.lon }] : el.geometry || [];
        if (!geom.length) continue;
        const near = geom.filter(p => distanceToPolylineMetres(p, routeLine) <= bufferM);
        // A way is "on route" when 2+ of its nodes follow the route (a single near node is usually a crossing road).
        const onRoute = el.type === 'node' ? near.length > 0 : near.length >= 2 || (geom.length <= 2 && near.length === geom.length);
        const anchor = near[0] || geom[Math.floor(geom.length / 2)];
        const name = roadName(tags);

        const entries = [];
        for (const [key, value] of Object.entries(tags)) {
            const m = key.match(/^max(height|weight|axleload|width|length)(:physical|:hgv)?$/);
            if (m) entries.push({ kind: `max${m[1]}`, tag: key, value });
        }
        if (tags.barrier === 'height_restrictor' && !entries.some(e => e.kind === 'maxheight')) {
            entries.push({ kind: 'maxheight', tag: 'barrier', value: 'height_restrictor (unknown height)' });
        }
        if (/^(no|destination|delivery|discouraged)$/.test(tags.hgv || '')) entries.push({ kind: 'hgv', tag: 'hgv', value: tags.hgv });

        for (const e of entries) {
            const isLen = ['maxheight', 'maxwidth', 'maxlength'].includes(e.kind);
            // "default"/"none"/"no" mean no signed limit; skip them and obvious tagging errors (e.g. cm entered as m).
            if (e.kind !== 'hgv' && NO_LIMIT_VALUES.test(String(e.value).trim())) continue;
            const metric = e.kind === 'hgv' ? null : isLen ? parseLength(e.value) : parseWeight(e.value);
            if (metric != null && (metric <= 0 || metric > (isLen ? MAX_PLAUSIBLE_M : MAX_PLAUSIBLE_T))) continue;
            let conflict = false;
            if (e.kind === 'hgv') conflict = isHgv(vehicle) && e.value === 'no';
            else if (metric != null) {
                const vv = parseFloat(vehicle[VEHICLE_KEY[e.kind]]);
                conflict = vv > 0 && vv >= metric;
            }
            const valueText = metric != null ? (isLen ? formatMetresWithFeet(metric) : `${metric.toFixed(1)} t`) : e.value;
            out.push({
                id: `${el.type}/${el.id}/${e.tag}`,
                osmUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
                lat: anchor.lat,
                lon: anchor.lon,
                kind: e.kind,
                tag: e.tag,
                value: String(e.value),
                valueMetric: metric,
                name,
                onRoute,
                conflict: conflict && onRoute,
                description: `${KIND_LABELS[e.kind]}${e.tag.includes(':') ? ` (${e.tag.split(':')[1]})` : ''}: ${valueText}${name ? ` - ${name}` : ''}`,
            });
        }
    }
    // Conflicts first, then on-route, then nearby.
    return out.sort((a, b) => (b.conflict - a.conflict) || (b.onRoute - a.onRoute));
}

export async function fetchRestrictions(routeLine, vehicle, { bufferM = 30, urls = OVERPASS_URLS, timeoutMs = 60000 } = {}) {
    const query = buildOverpassQuery(routeLine, bufferM);
    let lastError;
    // Public Overpass servers are often busy (429/504), so try each mirror in turn.
    for (const url of urls.filter(Boolean)) {
        const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = ctrl && setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `data=${encodeURIComponent(query)}`,
                signal: ctrl?.signal,
            });
            if (!res.ok) throw new Error(`${new URL(url).host} returned ${res.status}`);
            const data = await res.json();
            return analyseElements(data.elements || [], routeLine, vehicle, bufferM);
        } catch (e) {
            lastError = e.name === 'AbortError' ? new Error(`${new URL(url).host} timed out`) : e;
        } finally {
            if (timer) clearTimeout(timer);
        }
    }
    throw new Error(`Overpass request failed (${lastError?.message}) - the public servers may be busy, try again shortly.`);
}

// Text for INSTRUCTIONS item 17 (Critical pts). Only restrictions that sit on the route are listed.
export function criticalPointsText(restrictions) {
    const lines = restrictions
        .filter(r => r.onRoute)
        .map(r => {
            const grid = toOsGridRef(r.lat, r.lon) || `${r.lat.toFixed(5)}, ${r.lon.toFixed(5)}`;
            return `${r.conflict ? '!! ' : ''}${r.description} @ ${grid}`;
        });
    return [...new Set(lines)].join('\n');
}
