import { decodePolyline } from '../geo/geo';

/*
 * Every adapter returns the same normalised shape:
 * {
 *   engine, truckAware,
 *   geometry: [[lat, lon], ...], distanceM, durationS,
 *   legs: [{ distanceM, durationS, geometry, steps: [
 *     { road, instruction, distanceM, durationS, start: {lat, lon}, end: {lat, lon}, towards }
 *   ] }]
 * }
 * One leg per pair of consecutive waypoints.
 */

const num = v => (v === '' || v == null || Number.isNaN(Number(v)) ? undefined : Number(v));
const prune = obj => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== false));
const pt = ([lat, lon]) => ({ lat, lon });

export function hasVehicleProfile(vehicle = {}) {
    return ['heightM', 'widthM', 'lengthM', 'weightT', 'axleLoadT'].some(k => num(vehicle[k]) !== undefined) || !!vehicle.hazmat;
}

async function fetchJson(url, options) {
    const res = await fetch(url, options);
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = undefined; }
    if (!res.ok) {
        const msg = body?.error?.message || body?.error || body?.message || text || res.statusText;
        throw new Error(`Routing request failed (${res.status}): ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
    }
    return body;
}

// ---- Valhalla (truck costing) ----
export async function routeValhalla(waypoints, vehicle, { baseUrl }) {
    const truck = hasVehicleProfile(vehicle);
    const costing = truck ? 'truck' : 'auto';
    const body = {
        locations: waypoints.map(w => ({ lat: w.lat, lon: w.lon, type: 'break' })),
        costing,
        costing_options: truck
            ? {
                truck: prune({
                    height: num(vehicle.heightM),
                    width: num(vehicle.widthM),
                    length: num(vehicle.lengthM),
                    weight: num(vehicle.weightT),
                    axle_load: num(vehicle.axleLoadT),
                    hazmat: !!vehicle.hazmat,
                }),
            }
            : undefined,
        units: 'kilometers',
        directions_options: { units: 'kilometers', language: 'en-GB' },
    };
    const data = await fetchJson(`${baseUrl.replace(/\/$/, '')}/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return normaliseValhalla(data, truck);
}

export function normaliseValhalla(data, truckAware = true) {
    const legs = data.trip.legs.map(leg => {
        const geometry = decodePolyline(leg.shape, 6);
        const steps = leg.maneuvers.map(m => {
            const towards = m.sign?.exit_toward_elements?.map(e => e.text).join(' / ') || '';
            return {
                road: (m.street_names && m.street_names[0]) || (m.begin_street_names && m.begin_street_names[0]) || '',
                instruction: m.instruction,
                distanceM: (m.length || 0) * 1000,
                durationS: m.time || 0,
                start: pt(geometry[m.begin_shape_index] || geometry[0]),
                end: pt(geometry[m.end_shape_index] || geometry[geometry.length - 1]),
                towards,
            };
        });
        return { distanceM: leg.summary.length * 1000, durationS: leg.summary.time, geometry, steps };
    });
    return {
        engine: 'valhalla',
        truckAware,
        geometry: legs.flatMap(l => l.geometry),
        distanceM: data.trip.summary.length * 1000,
        durationS: data.trip.summary.time,
        legs,
    };
}

// ---- OpenRouteService (driving-hgv) ----
export async function routeOrs(waypoints, vehicle, { baseUrl, apiKey }) {
    if (!apiKey) throw new Error('OpenRouteService needs an API key (free at openrouteservice.org).');
    const restrictions = prune({
        height: num(vehicle.heightM),
        width: num(vehicle.widthM),
        length: num(vehicle.lengthM),
        weight: num(vehicle.weightT),
        axleload: num(vehicle.axleLoadT),
    });
    const body = {
        coordinates: waypoints.map(w => [w.lon, w.lat]),
        instructions: true,
        units: 'm',
        language: 'en',
        options: { vehicle_type: 'hgv', profile_params: { restrictions: { ...restrictions, ...(vehicle.hazmat ? { hazmat: true } : {}) } } },
    };
    const data = await fetchJson(`${baseUrl.replace(/\/$/, '')}/v2/directions/driving-hgv/json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: apiKey },
        body: JSON.stringify(body),
    });
    return normaliseOrs(data);
}

export function normaliseOrs(data) {
    const r = data.routes[0];
    const geometry = typeof r.geometry === 'string' ? decodePolyline(r.geometry, 5) : r.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
    const legs = r.segments.map(seg => {
        const first = seg.steps[0]?.way_points?.[0] ?? 0;
        const last = seg.steps[seg.steps.length - 1]?.way_points?.[1] ?? geometry.length - 1;
        return {
            distanceM: seg.distance,
            durationS: seg.duration,
            geometry: geometry.slice(first, last + 1),
            steps: seg.steps.map(s => ({
                road: s.name && s.name !== '-' ? s.name : '',
                instruction: s.instruction,
                distanceM: s.distance,
                durationS: s.duration,
                start: pt(geometry[s.way_points[0]]),
                end: pt(geometry[s.way_points[1]]),
                towards: s.exit_number ? `exit ${s.exit_number}` : '',
            })),
        };
    });
    return { engine: 'ors', truckAware: true, geometry, distanceM: r.summary.distance, durationS: r.summary.duration, legs };
}

// ---- OSRM (car only) ----
export async function routeOsrm(waypoints, _vehicle, { baseUrl }) {
    const coords = waypoints.map(w => `${w.lon},${w.lat}`).join(';');
    const data = await fetchJson(
        `${baseUrl.replace(/\/$/, '')}/route/v1/driving/${coords}?overview=full&geometries=polyline&steps=true`
    );
    if (data.code !== 'Ok') throw new Error(`OSRM: ${data.message || data.code}`);
    return normaliseOsrm(data);
}

function osrmInstruction(s) {
    const { type, modifier } = s.maneuver;
    const road = s.ref || s.name || 'road';
    if (type === 'depart') return `Depart on ${road}`;
    if (type === 'arrive') return 'Arrive at destination';
    if (type === 'roundabout' || type === 'rotary') return `At roundabout take exit ${s.maneuver.exit || ''} onto ${road}`.trim();
    return `${type.replace(/^\w/, c => c.toUpperCase())}${modifier ? ` ${modifier}` : ''} onto ${road}`;
}

export function normaliseOsrm(data) {
    const r = data.routes[0];
    const legs = r.legs.map(leg => {
        const steps = leg.steps.map(s => {
            const g = decodePolyline(s.geometry, 5);
            return {
                road: [s.ref, s.name].filter(Boolean)[0] || '',
                instruction: osrmInstruction(s),
                distanceM: s.distance,
                durationS: s.duration,
                start: { lat: s.maneuver.location[1], lon: s.maneuver.location[0] },
                end: pt(g[g.length - 1] || [s.maneuver.location[1], s.maneuver.location[0]]),
                towards: s.destinations || '',
                _geometry: g,
            };
        });
        const geometry = steps.flatMap(s => s._geometry);
        steps.forEach(s => delete s._geometry);
        return { distanceM: leg.distance, durationS: leg.duration, geometry, steps };
    });
    return {
        engine: 'osrm',
        truckAware: false,
        geometry: decodePolyline(r.geometry, 5),
        distanceM: r.distance,
        durationS: r.duration,
        legs,
    };
}

export const ENGINES = {
    valhalla: { label: 'Valhalla (truck, no key)', route: routeValhalla, truckAware: true, needsKey: false },
    ors: { label: 'OpenRouteService HGV (API key)', route: routeOrs, truckAware: true, needsKey: true },
    osrm: { label: 'OSRM (car only)', route: routeOsrm, truckAware: false, needsKey: false },
};

export async function getRoute(engine, waypoints, vehicle, settings, apiKey) {
    const def = ENGINES[engine];
    if (!def) throw new Error(`Unknown routing engine ${engine}`);
    if (waypoints.length < 2) throw new Error('At least two waypoints are needed.');
    return def.route(waypoints, vehicle, { baseUrl: settings.engineUrls[engine], apiKey });
}
