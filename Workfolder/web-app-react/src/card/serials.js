import { bearing, compassPoint, formatDistance, formatDuration, formatLocation, METRES_PER_MILE } from '../geo/geo';

/*
 * A serial (row in ROUTE DETAILS) keeps raw data plus display strings:
 * { fromPoint, toPoint, steps, distanceM, durationS, overrides: { from?, to?, route?, dir? },
 *   ser, from, to, route, dir, distance, totalDistance, totalTime }
 * Display strings are derived by recompute(); a user-edited column is flagged in overrides and kept.
 */

const MIN_ROAD_M = 300; // roads shorter than this are left out of the Route summary
const AUTO_MIN_SERIAL_M = 1000; // auto mode: shorter road sections are folded into the previous serial

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
        steps,
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

export function buildSerials(route, waypoints, settings) {
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

export function editSerial(serials, index, key, value) {
    return serials.map((s, i) => (i === index ? { ...s, [key]: value, overrides: { ...s.overrides, [key]: true } } : s));
}

export function mergeWithNext(serials, index) {
    if (index < 0 || index >= serials.length - 1) return serials;
    const a = serials[index];
    const b = serials[index + 1];
    const merged = {
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
    const a = { ...makeSerial(s.fromPoint, mid, stepsA), legEndName: s.legEndName };
    const b = { ...makeSerial(mid, s.toPoint, stepsB), legEndName: s.legEndName };
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
