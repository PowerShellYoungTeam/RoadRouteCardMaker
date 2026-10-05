import { analyseElements, buildOverpassQuery, criticalPointsText, parseLength, parseWeight, simplifyLine } from './overpass';

test('parse OSM length values', () => {
    expect(parseLength('4.5')).toBe(4.5);
    expect(parseLength('4.5 m')).toBe(4.5);
    expect(parseLength(`14'6"`)).toBeCloseTo(4.4196, 3);
    expect(parseLength(`13'`)).toBeCloseTo(3.9624, 3);
    expect(parseLength('default')).toBeNull();
    expect(parseLength('none')).toBeNull();
});

test('parse OSM weight values', () => {
    expect(parseWeight('7.5')).toBe(7.5);
    expect(parseWeight('18 t')).toBe(18);
    expect(parseWeight('3500 kg')).toBe(3.5);
    expect(parseWeight('signals')).toBeNull();
});

const routeLine = [[51.0, -1.0], [51.0, -0.99], [51.0, -0.98]];

const elements = [
    // Low bridge on the route (way follows the route)
    { type: 'way', id: 1, tags: { highway: 'primary', ref: 'A30', maxheight: `13'6"` }, geometry: [{ lat: 51.0, lon: -0.995 }, { lat: 51.0, lon: -0.994 }] },
    // Weight limit on a road that only crosses the route
    { type: 'way', id: 2, tags: { highway: 'unclassified', name: 'Mill Lane', maxweight: '7.5' }, geometry: [{ lat: 51.0, lon: -0.985 }, { lat: 51.01, lon: -0.985 }] },
    // HGV ban on route
    { type: 'way', id: 3, tags: { highway: 'residential', name: 'High St', hgv: 'no' }, geometry: [{ lat: 51.0, lon: -0.989 }, { lat: 51.0, lon: -0.988 }] },
    // Height restrictor barrier without a value
    { type: 'node', id: 4, lat: 51.0, lon: -0.982, tags: { barrier: 'height_restrictor' } },
];

test('analyseElements flags conflicts against the vehicle profile', () => {
    const r = analyseElements(elements, routeLine, { heightM: '4.5', weightT: '30' }, 30);
    const byId = Object.fromEntries(r.map(x => [x.id, x]));
    expect(byId['way/1/maxheight'].onRoute).toBe(true);
    expect(byId['way/1/maxheight'].conflict).toBe(true);
    expect(byId['way/1/maxheight'].description).toMatch(/Height limit: 4\.11 m \(13'6"\) - A30/);
    expect(byId['way/2/maxweight'].onRoute).toBe(false);
    expect(byId['way/2/maxweight'].conflict).toBe(false);
    expect(byId['way/3/hgv'].conflict).toBe(true);
    expect(byId['node/4/barrier'].onRoute).toBe(true);
    expect(r[0].conflict).toBe(true); // conflicts sorted first
});

test('no conflict when vehicle fits', () => {
    const r = analyseElements(elements, routeLine, { heightM: '3.0' }, 30);
    expect(r.find(x => x.id === 'way/1/maxheight').conflict).toBe(false);
});

test('critical points text lists on-route restrictions only', () => {
    const r = analyseElements(elements, routeLine, { heightM: '4.5' }, 30);
    const text = criticalPointsText(r);
    expect(text).toMatch(/^!! Height limit/);
    expect(text).not.toMatch(/Mill Lane/);
    expect(text).toMatch(/@ [A-Z]{2} \d{3} \d{3}/);
});

test('overpass query uses around filter and simplifies straight lines', () => {
    expect(simplifyLine(routeLine)).toHaveLength(2);
    const q = buildOverpassQuery(routeLine, 25);
    expect(q).toContain('(around:25,51.000000,-1.000000,51.000000,-0.980000)');
    expect(q).toContain('height_restrictor');
});
