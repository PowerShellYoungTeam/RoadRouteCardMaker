// GPX 1.1 route export (intended for ATAK's GPX route import).
// Everything here runs locally: no geocoding, routing or other network calls.
import {
    haversineMetres,
    looksLikeBareGridRef,
    osgbToWgs84,
    parseDecimalLatLon,
    parseOsGridRef,
} from '../geo/geo';

// Minimum distance (m) at which two endpoints are treated as different places. Covers rounding of stored
// points and ATAK's own 1 m de-duplication of consecutive route points.
export const MIN_JOIN_TOLERANCE_M = 5;
// Allowed disagreement (beyond grid-square size) when a cell contains both a grid ref and a lat/lon.
const CROSS_CHECK_SLACK_M = 25;

export const STRAIGHT_LINE_WARNING =
    'GPX route points are joined by STRAIGHT LINES. This export does not calculate a road-following or HGV-safe ' +
    'route; add intermediate legs at bends and junctions and always confirm the route on the ground and against the route card.';

export const ROAD_SHAPE_WARNING =
    'Bend points from the router\'s road geometry are included between junctions, so the route follows the road to within the ' +
    'bend tolerance. Segments between points are still straight, and this is NOT a guarantee that the route is HGV-safe; ' +
    'always confirm it on the ground and against the route card.';
// ATAK drops consecutive route points closer than 1 m.
const MIN_VIA_SPACING_M = 1;

const LABEL = { from: 'From (b)', to: 'To (c)' };

// Road-shape points for a "Junctions & bends" serial: bend points of each step plus internal step boundaries, in order.
// Returns null when the serial carries no shape, and [] when its From/To were typed over (shape may no longer apply).
export function serialViaPoints(serial) {
    const steps = serial.steps || [];
    if (!steps.some(st => Array.isArray(st.shape))) return null;
    const o = serial.overrides || {};
    if (o.from || o.to) return [];
    const pts = [];
    steps.forEach((st, i) => {
        if (i > 0 && st.start) pts.push(st.start);
        (st.shape || []).forEach(p => pts.push(p));
    });
    return pts.filter(p => p && Number.isFinite(p.lat) && Number.isFinite(p.lon)).map(({ lat, lon }) => ({ lat, lon }));
}

const cleanName = v => String(v || '').replace(/\s+/g, ' ').trim();

// Resolve one leg endpoint to WGS84, or return { error }.
export function resolveEndpoint(serial, which) {
    const point = serial[`${which}Point`];
    const overridden = serial.overrides?.[which];
    if (!overridden && point && Number.isFinite(point.lat) && Number.isFinite(point.lon)) {
        return { lat: point.lat, lon: point.lon, toleranceM: MIN_JOIN_TOLERANCE_M, source: 'map point' };
    }
    const text = String(serial[which] || '').trim();
    if (!text) return { error: `${LABEL[which]} is empty. Enter an OS grid reference such as "ST 668 664".` };

    const grid = parseOsGridRef(text);
    if (grid && !grid.ok) return { error: `${LABEL[which]}: ${grid.error}` };
    const ll = parseDecimalLatLon(text);

    if (grid && ll) {
        const diff = haversineMetres(osgbToWgs84(grid.e, grid.n), ll);
        if (diff > grid.resolutionM + CROSS_CHECK_SLACK_M) {
            return { error: `${LABEL[which]}: grid reference ${grid.ref} and lat/lon ${ll.lat}, ${ll.lon} disagree by ${Math.round(diff)} m. Correct or remove one of them.` };
        }
    }
    if (ll) {
        const tol = Math.max(MIN_JOIN_TOLERANCE_M, 111320 * 10 ** -ll.decimals);
        return { lat: ll.lat, lon: ll.lon, toleranceM: tol, source: 'lat/lon' };
    }
    if (grid) {
        const { lat, lon } = osgbToWgs84(grid.e, grid.n);
        return { lat, lon, toleranceM: Math.max(MIN_JOIN_TOLERANCE_M, grid.resolutionM), source: `grid ref ${grid.ref}` };
    }
    if (looksLikeBareGridRef(text)) {
        return { error: `${LABEL[which]}: "${text}" looks like a grid reference without its two-letter 100 km square, which is ambiguous (the same digits occur in every square). Add the letters, e.g. "ST 668 664".` };
    }
    return { error: `${LABEL[which]}: no OS grid reference (e.g. "ST 668 664") or decimal "lat, lon" found in "${text}".` };
}

function mergeName(target, name, where, errors) {
    if (!name) return;
    if (!target.name) {
        target.name = name;
        target.nameFrom = where;
    } else if (target.name.toLowerCase() !== name.toLowerCase()) {
        errors.push(`Conflicting checkpoint names at the same point: "${target.name}" (${target.nameFrom}) and "${name}" (${where}). Use one name or clear one of them.`);
    }
}

// Absorb endpoint `p` into existing route point `target`, keeping the more precise coordinate.
function absorb(target, p) {
    if (p.toleranceM < target.toleranceM) Object.assign(target, { lat: p.lat, lon: p.lon, toleranceM: p.toleranceM });
}

/**
 * Build an ordered list of route points from the route-card serials.
 * Returns { points: [{lat, lon, name?, desc?}], errors: string[], warnings: string[] }.
 * Export must be blocked whenever errors is non-empty.
 */
export function buildGpxRoute(serials, { includeDescriptions = false } = {}) {
    const errors = [];
    const warnings = [STRAIGHT_LINE_WARNING];
    let usedShape = false;
    if (!serials || serials.length === 0) {
        return { points: [], errors: ['There are no legs to export. Plan a route or add serials first.'], warnings };
    }

    const resolved = serials.map((s, i) => {
        const from = resolveEndpoint(s, 'from');
        const to = resolveEndpoint(s, 'to');
        if (from.error) errors.push(`Leg ${i + 1} ${from.error}`);
        if (to.error) errors.push(`Leg ${i + 1} ${to.error}`);
        return { from, to };
    });
    if (errors.length) return { points: [], errors, warnings };

    const points = [];
    serials.forEach((s, i) => {
        const leg = `Leg ${i + 1}`;
        const { from, to } = resolved[i];
        const desc = includeDescriptions ? cleanName(s.route) : '';

        if (i === 0) {
            points.push({ lat: from.lat, lon: from.lon, toleranceM: from.toleranceM });
        } else {
            const prev = points[points.length - 1];
            const gap = haversineMetres(prev, from);
            if (gap > Math.max(prev.toleranceM, from.toleranceM)) {
                errors.push(`Leg ${i} and leg ${i + 1} are not connected: leg ${i} ends ${(gap / 1000).toFixed(2)} km from where leg ${i + 1} starts. ` +
                    `Make leg ${i + 1} From match leg ${i} To, or add a leg that joins them. Gaps are never bridged automatically.`);
            } else {
                absorb(prev, from);
            }
        }
        const start = points[points.length - 1];
        mergeName(start, cleanName(s.fromCp), `${leg} From`, errors);
        if (desc && !start.desc) start.desc = `Ser ${i + 1}: ${desc}`;

        const via = serialViaPoints(s);
        if (via) {
            usedShape = true;
            if (!via.length && (s.overrides?.from || s.overrides?.to)) {
                warnings.push(`${leg} From/To was edited, so its road bend points were left out; it exports as a straight line.`);
            }
        }
        let last = start;
        for (const v of via || []) {
            if (haversineMetres(last, v) <= MIN_VIA_SPACING_M || haversineMetres(v, to) <= MIN_VIA_SPACING_M) continue;
            last = { lat: v.lat, lon: v.lon, toleranceM: MIN_JOIN_TOLERANCE_M };
            points.push(last);
        }

        if (haversineMetres(last, to) <= Math.max(last.toleranceM, to.toleranceM)) {
            if (last === start) warnings.push(`${leg} starts and ends at the same location, so it adds no route point.`);
            absorb(last, to);
            mergeName(last, cleanName(s.toCp), `${leg} To`, errors);
        } else {
            const end = { lat: to.lat, lon: to.lon, toleranceM: to.toleranceM };
            mergeName(end, cleanName(s.toCp), `${leg} To`, errors);
            points.push(end);
        }
    });

    if (usedShape) warnings[0] = ROAD_SHAPE_WARNING;

    const distinct = new Set(points.map(p => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`));
    if (!errors.length && distinct.size < 2) errors.push('The route needs at least two different geographic points.');
    if (!errors.length && !points.some(p => p.name)) {
        warnings.push('No checkpoint names are set, so ATAK will import the route without named checkpoints.');
    }

    return {
        points: errors.length ? [] : points.map(({ lat, lon, name, desc }) => ({ lat, lon, ...(name && { name }), ...(desc && { desc }) })),
        errors,
        warnings,
    };
}

// XML 1.0 text/attribute escaping; also drops characters that are illegal in XML 1.0.
export function escapeXml(value) {
    return String(value ?? '')
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

const coord = v => Number(v).toFixed(6);

/**
 * Serialise route points as a GPX 1.1 document with a single <rte>.
 * Only the route name and optional route/point descriptions are written: no author, time,
 * driver, vehicle or date metadata.
 */
export function toGpx(points, { name = 'Route', desc = '' } = {}) {
    const routeName = cleanName(name) || 'Route';
    const routeDesc = cleanName(desc);
    const lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<gpx version="1.1" creator="RoadRouteCardMaker" xmlns="http://www.topografix.com/GPX/1/1" ' +
        'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
        'xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">',
        `  <metadata><name>${escapeXml(routeName)}</name></metadata>`,
        '  <rte>',
        `    <name>${escapeXml(routeName)}</name>`,
    ];
    if (routeDesc) lines.push(`    <desc>${escapeXml(routeDesc)}</desc>`);
    for (const p of points) {
        const children = [];
        if (p.name) children.push(`<name>${escapeXml(p.name)}</name>`);
        if (p.desc) children.push(`<desc>${escapeXml(p.desc)}</desc>`);
        const open = `    <rtept lat="${coord(p.lat)}" lon="${coord(p.lon)}"`;
        lines.push(children.length ? `${open}>${children.join('')}</rtept>` : `${open}/>`);
    }
    lines.push('  </rte>', '</gpx>', '');
    return lines.join('\n');
}

export function gpxFilename(name) {
    const safe = cleanName(name).replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
    return `${safe || 'route'}.gpx`;
}

export function defaultRouteName(card) {
    const { movFrom, movTo } = card?.instructions || {};
    if (movFrom && movTo) return `${movFrom} to ${movTo}`;
    return card?.title || 'Route';
}

export function downloadGpx(xml, filename) {
    const blob = new Blob([xml], { type: 'application/gpx+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
