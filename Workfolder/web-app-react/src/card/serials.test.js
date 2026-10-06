import { buildSerials, stepShape, derivedStartRelease, resolveInstructions, editSerial, mergeWithNext, recompute, setCheckpoint, splitSerial, summariseRoads, addBlankSerial } from './serials';
import { defaultSettings } from '../model/routeCard';

const step = (road, km, start, end, extra = {}) => ({
    road, instruction: `Continue on ${road}`, distanceM: km * 1000, durationS: km * 60, start, end, towards: '', ...extra,
});

const A = { lat: 51.0, lon: -1.8 };
const B = { lat: 51.1, lon: -1.6 };
const C = { lat: 51.2, lon: -1.4 };
const J1 = { lat: 51.03, lon: -1.75 };
const J2 = { lat: 51.06, lon: -1.7 };

const route = {
    legs: [
        {
            distanceM: 20000, durationS: 1200,
            steps: [step('A345', 5, A, J1), step('A303', 10, J1, J2, { towards: 'Andover' }), step('Station Rd', 0.1, J2, J2), step('A3057', 4.9, J2, B)],
        },
        { distanceM: 10000, durationS: 600, steps: [step('A3057', 10, B, C)] },
    ],
};
const waypoints = [{ ...A, name: 'Tidworth Camp, Wiltshire' }, { ...B, name: 'Andover' }, { ...C, name: 'Stockbridge' }];

test('summariseRoads drops very short roads and dedupes', () => {
    expect(summariseRoads(route.legs[0].steps)).toBe('A345 → A303 → A3057');
});

test('waypoint mode: one serial per leg with cumulative totals', () => {
    const settings = defaultSettings();
    const serials = recompute(buildSerials(route, waypoints, settings), { ...settings, locationFormat: 'grid' }, { averageSpeed: '' });
    expect(serials).toHaveLength(2);
    expect(serials[0].ser).toBe(1);
    expect(serials[0].from).toMatch(/^Tidworth Camp - SU \d{3} \d{3}$/);
    expect(serials[0].route).toBe('A345 → A303 → A3057');
    expect(serials[0].dir).toBe('NE towards Andover');
    expect(serials[1].totalDistance).toBe('30.0 km');
    expect(serials[1].totalTime).toBe('00:30'); // router durations
});

test('average speed drives total time', () => {
    const settings = defaultSettings();
    const serials = recompute(buildSerials(route, waypoints, settings), settings, { averageSpeed: '40' });
    expect(serials[0].totalTime).toBe('00:30'); // 20 km @ 40 km/h
    expect(serials[1].totalTime).toBe('00:45');
});

test('auto mode: one serial per road change, short roads folded in', () => {
    const settings = { ...defaultSettings(), serialMode: 'auto' };
    const serials = recompute(buildSerials(route, waypoints, settings), settings, {});
    expect(serials.map(s => s.route)).toEqual(['A345', 'A303', 'A3057', 'A3057']);
    expect(serials[1].from).toMatch(/^Jn A345\/A303/);
    expect(serials[1].distance).toBe('10.1 km'); // 0.1 km Station Rd folded in
});

test('merge and split', () => {
    const settings = { ...defaultSettings(), serialMode: 'auto' };
    let raw = buildSerials(route, waypoints, settings);
    raw = mergeWithNext(raw, 0);
    let s = recompute(raw, settings, {});
    expect(s).toHaveLength(3);
    expect(s[0].route).toBe('A345 → A303');
    expect(s[0].distance).toBe('15.1 km');
    raw = splitSerial(raw, 0);
    s = recompute(raw, settings, {});
    expect(s).toHaveLength(4);
    expect(s[0].route).toBe('A345');
    expect(s[3].totalDistance).toBe('30.0 km');
});

test('manual edits are preserved and manual rows add to totals', () => {
    const settings = defaultSettings();
    let raw = buildSerials(route, waypoints, settings);
    raw = editSerial(raw, 0, 'route', 'A345 then A303 (avoid town centre)');
    raw = addBlankSerial(raw);
    raw = editSerial(raw, 2, 'distance', '5');
    const s = recompute(raw, { ...settings, locationFormat: 'latlon' }, {});
    expect(s[0].route).toBe('A345 then A303 (avoid town centre)');
    expect(s[0].from).toMatch(/^Tidworth Camp - 51\.00000/);
    expect(s[2].ser).toBe(3);
    expect(s[2].totalDistance).toBe('35.0 km');
});

test('checkpoint names are not overrides and survive merge and split', () => {
    const settings = defaultSettings();
    let s = buildSerials(route, waypoints, settings);
    s = setCheckpoint(s, 0, 'fromCp', 'Start');
    s = setCheckpoint(s, 1, 'toCp', 'Finish');
    expect(s[0].overrides).toEqual({});
    const split = splitSerial(s, 0);
    expect(split).toHaveLength(3);
    expect(split[0].fromCp).toBe('Start');
    expect(split[1].fromCp).toBeUndefined();
    expect(split[2].toCp).toBe('Finish');
    const merged = mergeWithNext(split, 1);
    expect(merged[0].fromCp).toBe('Start');
    expect(merged[1].toCp).toBe('Finish');
    expect(recompute(merged, settings, {})[1].toCp).toBe('Finish');
});

describe('Start Point / Release Point from the route table', () => {
    const serials = recompute(buildSerials(route, waypoints, defaultSettings()), defaultSettings(), {});
    const { toOsGridRef } = require('../geo/geo');

    test('SP is the first From grid ref and Rel Pt the last To grid ref', () => {
        expect(derivedStartRelease(serials)).toEqual({ sp: toOsGridRef(A.lat, A.lon), relPt: toOsGridRef(C.lat, C.lon) });
    });

    test('typed-over cells use the grid ref in the text, and none found gives blank', () => {
        let s = editSerial(serials, 0, 'from', 'Gate - SP 863 422');
        s = editSerial(s, s.length - 1, 'to', 'Somewhere');
        expect(derivedStartRelease(s)).toEqual({ sp: 'SP 863 422', relPt: '' });
        expect(derivedStartRelease([])).toEqual({ sp: '', relPt: '' });
    });

    test('typed instruction values win over the route table', () => {
        const r = resolveInstructions({ sp: ' ', relPt: 'SU 364 454', movFrom: 'X' }, serials);
        expect(r).toEqual({ sp: toOsGridRef(A.lat, A.lon), relPt: 'SU 364 454', movFrom: 'X' });
    });
});

describe('junction mode', () => {
    // A345 step with a real bend (~1 km off the straight line).
    const bend = { lat: 51.02, lon: -1.79 };
    const geomRoute = {
        legs: [
            {
                distanceM: 20000, durationS: 1200,
                steps: [
                    step('A345', 5, A, J1, { geometry: [[A.lat, A.lon], [bend.lat, bend.lon], [J1.lat, J1.lon]] }),
                    step('A303', 10, J1, J2, { towards: 'Andover', geometry: [[J1.lat, J1.lon], [J2.lat, J2.lon]] }),
                    step('Slip', 0.01, J2, J2),
                    step('', 0.06, J2, J2), // roundabout
                    step('A3057', 4.93, J2, B),
                ],
            },
            { distanceM: 10000, durationS: 600, steps: [step('A3057', 10, B, C)] },
        ],
    };
    const settings = { ...defaultSettings(), serialMode: 'junction' };

    test('stepShape keeps real bends, drops endpoints and sub-tolerance wiggles', () => {
        const g = [[A.lat, A.lon], [bend.lat, bend.lon], [J1.lat, J1.lon]];
        expect(stepShape({ geometry: g }, 20)).toEqual([bend]);
        expect(stepShape({ geometry: [[51, -1.8], [51.0000, -1.79999], [51, -1.79]] }, 20)).toEqual([]);
        expect(stepShape({ geometry: [[A.lat, A.lon], [J1.lat, J1.lon]] }, 20)).toEqual([]);
        expect(stepShape({}, 20)).toEqual([]);
    });

    test('one serial per junction, named checkpoints, short steps folded, geometry not stored', () => {
        const serials = recompute(buildSerials(geomRoute, waypoints, settings), { ...settings, locationFormat: 'grid' }, { averageSpeed: '' });
        expect(serials.map(s => s.route)).toEqual(['A345', 'A303', 'A3057', 'A3057']);
        expect(serials.map(s => s.toCp)).toEqual(['J1 A345/A303', 'J2 A303/A3057', 'Andover', 'Stockbridge']);
        expect(serials[0].fromCp).toBe('Tidworth Camp');
        expect(serials[2].steps.map(st => st.road)).toEqual(['Slip', '', 'A3057']);
        expect(serials[0].steps[0].shape).toEqual([bend]);
        expect(serials.every(s => s.steps.every(st => !('geometry' in st)))).toBe(true);
        expect(serials[3].totalDistance).toBe('30.0 km');
        expect(JSON.stringify(serials)).not.toContain('geometry');
    });

    test('a smaller tolerance keeps more bend points', () => {
        const zig = [[51, -1.8], [51.0001, -1.79], [51, -1.78]]; // ~11 m off the line
        expect(stepShape({ geometry: zig }, 20)).toEqual([]);
        expect(stepShape({ geometry: zig }, 5)).toHaveLength(1);
    });
});

