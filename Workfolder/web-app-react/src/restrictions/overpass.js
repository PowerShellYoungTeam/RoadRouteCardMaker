import { distanceToPolylineMetres, haversineMetres, toOsGridRef } from '../geo/geo';

// overpass-api.de and its z./lz4. aliases are separate front-ends that fail (504/429) independently,
// so they are tried in rotation before the less reliable third-party mirrors.
export const OVERPASS_URLS = [
    'https://overpass-api.de/api/interpreter',
    'https://z.overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
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
    return `[out:json][timeout:60];
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

// Split a route into sections of roughly `sectionM` metres (sections share their end point).
export function splitLine(line, sectionM = 25000) {
    if (line.length < 2) return [line];
    const sections = [];
    let start = 0, run = 0;
    for (let i = 1; i < line.length; i++) {
        run += haversineMetres({ lat: line[i - 1][0], lon: line[i - 1][1] }, { lat: line[i][0], lon: line[i][1] });
        if (run >= sectionM && i < line.length - 1) {
            sections.push(line.slice(start, i + 1));
            start = i;
            run = 0;
        }
    }
    sections.push(line.slice(start));
    return sections;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function postOverpass(url, query, timeoutMs) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl && setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `data=${encodeURIComponent(query)}`,
            signal: ctrl?.signal,
        });
        if (!res.ok) throw Object.assign(new Error(`${new URL(url).host} returned ${res.status}`), { status: res.status });
        const data = await res.json();
        if (data.remark && /runtime error|timed out|out of memory/i.test(data.remark)) throw new Error(`${new URL(url).host}: ${data.remark}`);
        return data.elements || [];
    } catch (e) {
        if (e.name === 'AbortError') throw Object.assign(new Error(`${new URL(url).host} timed out`), { timedOut: true });
        throw e;
    } finally {
        if (timer) clearTimeout(timer);
    }
}

// Public Overpass servers frequently answer 504/429 even to tiny queries, so each route section is
// retried across the mirrors with backoff. Mirrors that time out are dropped for the rest of the run.
export async function fetchRestrictions(routeLine, vehicle, {
    bufferM = 30,
    urls = OVERPASS_URLS,
    timeoutMs = 75000,
    sectionM = 50000,
    maxRounds = 4,
    backoffMs = [0, 3000, 8000, 15000],
    onProgress = () => {},
    wait = sleep,
} = {}) {
    let mirrors = [...new Set(urls.filter(Boolean))];
    const sections = splitLine(routeLine, sectionM);
    const byId = new Map();
    let next = 0;
    for (let s = 0; s < sections.length; s++) {
        const query = buildOverpassQuery(sections[s], bufferM);
        let done = false, lastError;
        for (let round = 0; round < maxRounds && !done; round++) {
            if (round > 0) await wait(backoffMs[Math.min(round, backoffMs.length - 1)]);
            for (let m = 0; m < mirrors.length && !done; m++) {
                const url = mirrors[(next + m) % mirrors.length];
                onProgress({ section: s + 1, sections: sections.length, attempt: round + 1, host: new URL(url).host });
                try {
                    for (const el of await postOverpass(url, query, timeoutMs)) byId.set(`${el.type}/${el.id}`, el);
                    done = true;
                    next = (next + m) % mirrors.length; // stick with a mirror that works
                } catch (e) {
                    lastError = e;
                    if (e.timedOut && mirrors.length > 1) { mirrors = mirrors.filter(u => u !== url); m--; }
                    if (e.status === 429) await wait(2000);
                }
            }
        }
        if (!done) {
            throw new Error(`Overpass request failed for section ${s + 1}/${sections.length} after ${maxRounds} rounds `
                + `(${lastError?.message}) - the public servers are busy, try again in a few minutes or set your own Overpass URL in Settings.`);
        }
    }
    return analyseElements([...byId.values()], routeLine, vehicle, bufferM);
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
