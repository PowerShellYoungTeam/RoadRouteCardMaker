import { normaliseOrs, normaliseOsrm, normaliseValhalla, hasVehicleProfile } from './routers';
import { parseCard, serialiseCard } from '../io/cardJson';
import { newRouteCard } from '../model/routeCard';

// Encode [[51,-1],[51.1,-0.9]] so the fixtures exercise the real decoder.
function encode(points, precision) {
    const f = 10 ** precision;
    let out = '', pLat = 0, pLon = 0;
    const enc = v => { v = v < 0 ? ~(v << 1) : v << 1; let s = ''; while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; } return s + String.fromCharCode(v + 63); };
    for (const [lat, lon] of points) {
        const a = Math.round(lat * f), b = Math.round(lon * f);
        out += enc(a - pLat) + enc(b - pLon);
        pLat = a; pLon = b;
    }
    return out;
}
const P5 = encode([[51, -1], [51.1, -0.9]], 5);
const P6 = encode([[51, -1], [51.1, -0.9]], 6);

test('hasVehicleProfile', () => {
    expect(hasVehicleProfile({ heightM: '' })).toBe(false);
    expect(hasVehicleProfile({ heightM: '4.2' })).toBe(true);
});

test('normaliseValhalla', () => {
    const r = normaliseValhalla({
        trip: {
            summary: { length: 12.5, time: 900 },
            legs: [{
                shape: P6,
                summary: { length: 12.5, time: 900 },
                maneuvers: [
                    { instruction: 'Drive north on A30.', street_names: ['A30'], length: 12.5, time: 900, begin_shape_index: 0, end_shape_index: 1,
                        sign: { exit_toward_elements: [{ text: 'Salisbury' }] } },
                    { instruction: 'You have arrived.', length: 0, time: 0, begin_shape_index: 1, end_shape_index: 1 },
                ],
            }],
        },
    });
    expect(r.distanceM).toBe(12500);
    expect(r.legs[0].geometry[1][0]).toBeCloseTo(51.1, 5);
    expect(r.legs[0].steps[0]).toMatchObject({ road: 'A30', distanceM: 12500, towards: 'Salisbury' });
    expect(r.legs[0].steps[0].geometry).toHaveLength(2);
    expect(r.legs[0].steps[0].geometry[1][0]).toBeCloseTo(51.1, 5);
});

test('normaliseOrs', () => {
    const r = normaliseOrs({
        routes: [{
            summary: { distance: 1000, duration: 100 },
            geometry: P5,
            segments: [{ distance: 1000, duration: 100, steps: [
                { distance: 1000, duration: 100, instruction: 'Head north on B3000', name: 'B3000', way_points: [0, 1] },
                { distance: 0, duration: 0, instruction: 'Arrive', name: '-', way_points: [1, 1] },
            ] }],
        }],
    });
    expect(r.legs[0].steps[0].road).toBe('B3000');
    expect(r.legs[0].steps[1].road).toBe('');
    expect(r.legs[0].steps[0].end.lat).toBeCloseTo(51.1, 5);
    expect(r.legs[0].steps[0].geometry).toHaveLength(2);
});

test('normaliseOsrm', () => {
    const r = normaliseOsrm({
        code: 'Ok',
        routes: [{
            distance: 1000, duration: 100, geometry: P5,
            legs: [{ distance: 1000, duration: 100, steps: [
                { distance: 1000, duration: 100, name: 'London Road', ref: 'A30', geometry: P5, destinations: 'Basingstoke',
                    maneuver: { type: 'depart', location: [-1, 51] } },
            ] }],
        }],
    });
    expect(r.truckAware).toBe(false);
    expect(r.legs[0].steps[0]).toMatchObject({ road: 'A30', instruction: 'Depart on A30', towards: 'Basingstoke' });
    expect(r.legs[0].steps[0].geometry).toHaveLength(2);
    expect(r.legs[0].geometry).toEqual(r.legs[0].steps[0].geometry);
});

test('route card JSON round trip', () => {
    const card = newRouteCard();
    card.instructions.movFrom = 'Tidworth';
    card.serials = [{ ser: 1, from: 'A', to: 'B', route: 'A303', dir: 'E', distance: '1.0 km', totalDistance: '1.0 km', totalTime: '00:02' }];
    const back = parseCard(serialiseCard(card));
    expect(back.instructions.movFrom).toBe('Tidworth');
    expect(back.serials[0].route).toBe('A303');
    expect(() => parseCard('{"schemaVersion":99}')).toThrow(/Not a valid route card/);
    expect(() => parseCard('nope')).toThrow(/Invalid JSON/);
});
