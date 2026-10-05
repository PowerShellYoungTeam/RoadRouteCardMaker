import { buildSerials, editSerial, mergeWithNext, recompute, splitSerial, summariseRoads, addBlankSerial } from './serials';
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
