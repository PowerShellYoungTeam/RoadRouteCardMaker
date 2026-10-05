import {
    bearing, compassPoint, decodePolyline, distanceToPolylineMetres, formatDistance, formatDuration,
    formatLocation, haversineMetres, toOsGridRef,
} from './geo';

test('compass points', () => {
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(359)).toBe('N');
    expect(compassPoint(45)).toBe('NE');
    expect(compassPoint(100)).toBe('E');
    expect(compassPoint(202.5)).toBe('SSW');
    expect(compassPoint(270, 8)).toBe('W');
    expect(compassPoint(-90)).toBe('W');
});

test('bearing between points', () => {
    expect(bearing({ lat: 51, lon: 0 }, { lat: 52, lon: 0 })).toBeCloseTo(0, 5);
    expect(bearing({ lat: 51, lon: 0 }, { lat: 51, lon: 1 })).toBeCloseTo(89.6, 0);
});

test('haversine', () => {
    // 1 degree of latitude ~ 111.2 km
    expect(haversineMetres({ lat: 51, lon: 0 }, { lat: 52, lon: 0 }) / 1000).toBeCloseTo(111.2, 0);
});

test('OS grid reference (Ben Nevis summit = NN 166 712)', () => {
    expect(toOsGridRef(56.796849, -5.003525)).toBe('NN 166 712');
    expect(toOsGridRef(56.796849, -5.003525, 10)).toMatch(/^NN 166\d\d 712\d\d$/);
    expect(toOsGridRef(48.8566, 2.3522)).toBeNull(); // Paris is outside the GB grid
});

test('location formatting', () => {
    const p = { lat: 56.796849, lon: -5.003525, name: 'Ben Nevis' };
    expect(formatLocation(p, 'grid')).toBe('Ben Nevis - NN 166 712');
    expect(formatLocation(p, 'latlon')).toBe('Ben Nevis - 56.79685, -5.00352');
    expect(formatLocation({ lat: 56.796849, lon: -5.003525 }, 'both')).toBe('NN 166 712 (56.79685, -5.00352)');
});

test('distance and duration formatting', () => {
    expect(formatDistance(12345, 'km')).toBe('12.3 km');
    expect(formatDistance(1609.344 * 2, 'mi')).toBe('2.0 mi');
    expect(formatDuration(3600 + 25 * 60)).toBe('01:25');
});

test('polyline decoding', () => {
    // Example from the Google encoded polyline docs
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
});

test('distance to polyline', () => {
    const line = [[51, 0], [51, 0.01]];
    expect(distanceToPolylineMetres({ lat: 51, lon: 0.005 }, line)).toBeLessThan(1);
    expect(distanceToPolylineMetres({ lat: 51.001, lon: 0.005 }, line)).toBeCloseTo(111, -1);
});
