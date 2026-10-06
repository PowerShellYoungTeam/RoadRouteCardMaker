import { bearing, compassPoint, formatDistance, formatDuration, formatLocation, METRES_PER_MILE, parseOsGridRef, toOsGridRef } from '../geo/geo';
import { simplifyLine } from '../restrictions/overpass';

/*
 * A serial (row in ROUTE DETAILS) keeps raw data plus display strings:
 * { fromPoint, toPoint, steps, distanceM, durationS, overrides: { from?, to?, route?, dir? },
 *   fromCp?, toCp?, legEndName?,
 *   ser, from, to, route, dir, distance, totalDistance, totalTime }
 * Display strings are derived by recompute(); a user-edited column is flagged in overrides and kept.
 * In junction mode each step also carries `shape`: simplified road bend points between its start and end,
 * used only by the GPX export. Full router step geometry is never stored on serials.
 */

const MIN_ROAD_M = 300; // roads shorter than this are left out of the Route summary
const AUTO_MIN_SERIAL_M = 1000; // auto mode: shorter road sections are folded into the previous serial
const JUNCTION_MIN_STEP_M = 25; // junction mode: shorter manoeuvres (slip-road fragments etc.) are folded into the next
const JUNCTION_MIN_UNNAMED_STEP_M = 100; // junction mode: unnamed manoeuvres (mostly roundabouts) shorter than this are folded too
export const DEFAULT_BEND_TOLERANCE_M = 20;

const shortName = name => (name || '').split(',')[0].trim();

export function summariseRoads(steps, minM = MIN_ROAD_M) {
    const totals = new Map();
    steps.forEach(s => s.road && totals.set(s.road, (totals.get(s.road) || 0) + s.distanceM));
    const roads = [];
    for (const s of steps) {
        if (!s.road || (totals.get(s.road) < minM && steps.length > 1)) continue;
        if (roads[roads.length - 1] !== s.road) roads.push(s.road);
    }
    if (roads.length === 0) {
        const any = steps.find(s => s.road);
        return any ? any.road : 'Unnamed roads';
    }
    return roads.join(' → ');
}

function makeSerial(fromPoint, toPoint, steps) {
    return {
        fromPoint,
        toPoint,
        steps: steps.map(({ geometry, ...st }) => st),
        distanceM: steps.reduce((a, s) => a + (s.distanceM || 0), 0),
        durationS: steps.reduce((a, s) => a + (s.durationS || 0), 0),
        overrides: {},
    };
}

function waypointSerials(route, waypoints) {
    return route.legs.map((leg, i) => {
        const s = makeSerial(
            { ...waypoints[i], name: shortName(waypoints[i].name) },
            { ...waypoints[i + 1], name: shortName(waypoints[i + 1].name) },
            leg.steps.filter(st => st.distanceM > 0)
        );
        s.distanceM = leg.distanceM;
        s.durationS = leg.durationS;
        return s;
    });
}

function autoSerials(route, waypoints) {
    const serials = [];
    route.legs.forEach((leg, li) => {
        const groups = [];
        for (const step of leg.steps) {
            if (step.distanceM <= 0) continue;
            const g = groups[groups.length - 1];
            if (g && (g.road === step.road || !step.road || step.distanceM < AUTO_MIN_SERIAL_M / 4)) g.steps.push(step);
            else groups.push({ road: step.road, steps: [step] });
        }
        // Fold short sections into the previous serial so the card stays readable.
        const merged = [];
        for (const g of groups) {
            const len = g.steps.reduce((a, s) => a + s.distanceM, 0);
            if (merged.length && len < AUTO_MIN_SERIAL_M) merged[merged.length - 1].steps.push(...g.steps);
            else merged.push({ ...g, steps: [...g.steps], len });
        }
        // A short opening section (e.g. leaving camp) has no previous serial, so fold it forward instead.
        if (merged.length > 1 && merged[0].len < AUTO_MIN_SERIAL_M) {
            const [head, next] = merged.splice(0, 2);
            merged.unshift({ ...next, steps: [...head.steps, ...next.steps] });
        }
        const legEndName = shortName(waypoints[li + 1].name);
        merged.forEach((g, gi) => {
            const first = g.steps[0];
            const last = g.steps[g.steps.length - 1];
            const prevRoad = gi > 0 ? merged[gi - 1].road : null;
            const nextRoad = gi < merged.length - 1 ? merged[gi + 1].road : null;
            const fromPoint = gi === 0
                ? { ...waypoints[li], name: shortName(waypoints[li].name) }
                : { ...first.start, name: prevRoad && g.road ? `Jn ${prevRoad}/${g.road}` : '' };
            const toPoint = gi === merged.length - 1
                ? { ...waypoints[li + 1], name: shortName(waypoints[li + 1].name) }
                : { ...last.end, name: g.road && nextRoad ? `Jn ${g.road}/${nextRoad}` : '' };
            serials.push({ ...makeSerial(fromPoint, toPoint, g.steps), legEndName });
        });
    });
    return serials;
}

const round6 = v => Math.round(v * 1e6) / 1e6;

// Road bend points of one router step, simplified to `toleranceM`, excluding the step's own start and end.
export function stepShape(step, toleranceM = DEFAULT_BEND_TOLERANCE_M) {
    const g = step.geometry;
    if (!g || g.length < 3) return [];
    return simplifyLine(g, Math.max(1, Number(toleranceM) || DEFAULT_BEND_TOLERANCE_M))
        .slice(1, -1)
        .map(([lat, lon]) => ({ lat: round6(lat), lon: round6(lon) }));
}

const mainRoad = steps => [...steps].filter(s => s.road).sort((a, b) => b.distanceM - a.distanceM)[0]?.road || '';

// One serial per junction/turn (router manoeuvre). Each junction is named as a GPX checkpoint (toCp), e.g. "J3 A342/A303";
// the end of every waypoint leg is named after the waypoint. Bends are kept as unnamed step shape points.
function junctionSerials(route, waypoints, settings) {
    const serials = [];
    let jn = 0;
    route.legs.forEach((leg, li) => {
        const groups = [];
        let pending = [];
        for (const step of leg.steps) {
            if (step.distanceM <= 0) continue;
            pending.push({ ...step, shape: stepShape(step, settings.bendToleranceM) });
            // Short steps, and short unnamed ones such as roundabouts, are folded into the next serial.
            const minM = step.road ? JUNCTION_MIN_STEP_M : JUNCTION_MIN_UNNAMED_STEP_M;
            if (step.distanceM >= minM) { groups.push(pending); pending = []; }
        }
        if (pending.length) (groups.length ? groups[groups.length - 1].push(...pending) : groups.push(pending));
        const legEndName = shortName(waypoints[li + 1].name);
        groups.forEach((steps, gi) => {
            const road = mainRoad(steps);
            const prevRoad = gi > 0 ? mainRoad(groups[gi - 1]) : null;
            const nextRoad = gi < groups.length - 1 ? mainRoad(groups[gi + 1]) : null;
            const jnName = (a, b) => (a && b && a !== b ? `Jn ${a}/${b}` : '');
            const fromPoint = gi === 0
                ? { ...waypoints[li], name: shortName(waypoints[li].name) }
                : { ...steps[0].start, name: jnName(prevRoad, road) };
            const last = gi === groups.length - 1;
            const toPoint = last
                ? { ...waypoints[li + 1], name: legEndName }
                : { ...steps[steps.length - 1].end, name: jnName(road, nextRoad) };
            let toCp;
            if (last) toCp = legEndName || `WP ${li + 2}`;
            else {
                jn += 1;
                toCp = road && nextRoad && road !== nextRoad ? `J${jn} ${road}/${nextRoad}` : `J${jn} ${nextRoad || road || 'turn'}`;
            }
            serials.push({
                ...makeSerial(fromPoint, toPoint, steps),
                legEndName,
                ...(serials.length === 0 ? { fromCp: shortName(waypoints[0].name) || 'Start' } : {}),
                toCp,
            });
        });
    });
    return serials;
}

export function buildSerials(route, waypoints, settings) {
    if (settings.serialMode === 'junction') return junctionSerials(route, waypoints, settings);
    return settings.serialMode === 'auto' ? autoSerials(route, waypoints) : waypointSerials(route, waypoints);
}

function deriveDir(serial) {
    if (!serial.fromPoint || !serial.toPoint || serial.fromPoint.lat == null || serial.toPoint.lat == null) return '';
    const cp = compassPoint(bearing(serial.fromPoint, serial.toPoint));
    const toName = shortName(serial.toPoint.name);
    const towards = [...(serial.steps || [])].reverse().find(s => s.towards)?.towards
        || (toName && !toName.startsWith('Jn ') ? toName : serial.legEndName || '');
    return towards ? `${cp} towards ${towards}` : cp;
}

export function serialDurationS(serial, settings, instructions) {
    const speed = parseFloat(instructions?.averageSpeed);
    if (settings.timeSource === 'speed' && speed > 0) {
        const unitM = settings.units === 'mi' ? METRES_PER_MILE : 1000;
        return (serial.distanceM / (speed * unitM)) * 3600;
    }
    return serial.durationS;
}

export function recompute(serials, settings, instructions) {
    let totalM = 0;
    let totalS = 0;
    const unitM = settings.units === 'mi' ? METRES_PER_MILE : 1000;
    return serials.map((s, i) => {
        const o = s.overrides || {};
        const hasDistance = typeof s.distanceM === 'number';
        // Manually typed rows contribute to totals from their typed distance (in card units).
        const typed = parseFloat(s.distance);
        const dM = hasDistance ? s.distanceM : typed > 0 ? typed * unitM : 0;
        totalM += dM;
        totalS += serialDurationS({ ...s, distanceM: dM, durationS: s.durationS || 0 }, settings, instructions) || 0;
        return {
            ...s,
            overrides: o,
            ser: i + 1,
            from: o.from || !s.fromPoint ? s.from || '' : formatLocation(s.fromPoint, settings.locationFormat),
            to: o.to || !s.toPoint ? s.to || '' : formatLocation(s.toPoint, settings.locationFormat),
            route: o.route ? s.route : s.steps && s.steps.length ? summariseRoads(s.steps) : s.route || '',
            dir: o.dir ? s.dir : deriveDir(s) || s.dir || '',
            distance: hasDistance ? formatDistance(s.distanceM, settings.units) : s.distance || '',
            totalDistance: totalM > 0 ? formatDistance(totalM, settings.units) : '',
            totalTime: totalS > 0 ? formatDuration(totalS) : '',
        };
    });
}

// Grid reference of one end of a serial: the map point unless the cell was typed over, else a grid ref in the text.
export function endpointGridRef(serial, which) {
    if (!serial) return '';
    const point = serial[`${which}Point`];
    if (!serial.overrides?.[which] && point && Number.isFinite(point.lat) && Number.isFinite(point.lon)) {
        return toOsGridRef(point.lat, point.lon) || '';
    }
    const grid = parseOsGridRef(serial[which]);
    return grid && grid.ok ? grid.ref : '';
}

// 4. Location of Start Point = first From grid ref; 5. Location of Release Point = last To grid ref.
export function derivedStartRelease(serials = []) {
    return { sp: endpointGridRef(serials[0], 'from'), relPt: endpointGridRef(serials[serials.length - 1], 'to') };
}

// Blank SP / Rel Pt follow the route table; anything typed in the instructions wins.
export function resolveInstructions(instructions, serials) {
    const d = derivedStartRelease(serials);
    const pick = k => (String(instructions[k] || '').trim() ? instructions[k] : d[k]);
    return { ...instructions, sp: pick('sp'), relPt: pick('relPt') };
}

export function editSerial(serials, index, key, value) {
    return serials.map((s, i) => (i === index ? { ...s, [key]: value, overrides: { ...s.overrides, [key]: true } } : s));
}

// Optional checkpoint names (fromCp / toCp) used only for GPX export; they are not route-card overrides.
export function setCheckpoint(serials, index, key, value) {
    return serials.map((s, i) => (i === index ? { ...s, [key]: value } : s));
}

const keepCp = (key, value) => (value ? { [key]: value } : {});

export function mergeWithNext(serials, index) {
    if (index < 0 || index >= serials.length - 1) return serials;
    const a = serials[index];
    const b = serials[index + 1];
    const merged = {
        ...keepCp('fromCp', a.fromCp),
        ...keepCp('toCp', b.toCp),
        fromPoint: a.fromPoint,
        toPoint: b.toPoint,
        steps: [...(a.steps || []), ...(b.steps || [])],
        distanceM: (a.distanceM || 0) + (b.distanceM || 0),
        durationS: (a.durationS || 0) + (b.durationS || 0),
        overrides: {},
        legEndName: b.legEndName,
    };
    return [...serials.slice(0, index), merged, ...serials.slice(index + 2)];
}

// Split a serial at the step boundary closest to half its distance.
export function splitSerial(serials, index) {
    const s = serials[index];
    if (!s || !s.steps || s.steps.length < 2) return serials;
    let acc = 0;
    let cut = 1;
    let bestDiff = Infinity;
    const half = s.steps.reduce((a, st) => a + st.distanceM, 0) / 2;
    for (let i = 0; i < s.steps.length - 1; i++) {
        acc += s.steps[i].distanceM;
        if (Math.abs(acc - half) < bestDiff) {
            bestDiff = Math.abs(acc - half);
            cut = i + 1;
        }
    }
    const stepsA = s.steps.slice(0, cut);
    const stepsB = s.steps.slice(cut);
    const roadA = stepsA[stepsA.length - 1].road;
    const roadB = stepsB[0].road;
    const mid = { ...stepsB[0].start, name: roadA && roadB && roadA !== roadB ? `Jn ${roadA}/${roadB}` : '' };
    const a = { ...makeSerial(s.fromPoint, mid, stepsA), legEndName: s.legEndName, ...keepCp('fromCp', s.fromCp) };
    const b = { ...makeSerial(mid, s.toPoint, stepsB), legEndName: s.legEndName, ...keepCp('toCp', s.toCp) };
    // Keep router totals consistent when the leg total differs from the step sum.
    const stepSum = a.distanceM + b.distanceM;
    if (stepSum > 0) {
        a.distanceM *= s.distanceM / stepSum;
        b.distanceM *= s.distanceM / stepSum;
    }
    return [...serials.slice(0, index), a, b, ...serials.slice(index + 1)];
}

export function addBlankSerial(serials) {
    return [...serials, { overrides: { from: true, to: true, route: true, dir: true }, from: '', to: '', route: '', dir: '', steps: [] }];
}

export function removeSerial(serials, index) {
    return serials.filter((_, i) => i !== index);
}
