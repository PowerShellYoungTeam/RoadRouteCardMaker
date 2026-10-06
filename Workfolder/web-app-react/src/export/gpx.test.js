import { buildGpxRoute, defaultRouteName, escapeXml, gpxFilename, MIN_JOIN_TOLERANCE_M, resolveEndpoint, ROAD_SHAPE_WARNING, serialViaPoints, STRAIGHT_LINE_WARNING, toGpx } from './gpx';
import fs from 'fs';
import path from 'path';
import { haversineMetres, osgbToWgs84, parseOsGridRef, toOsGridRef } from '../geo/geo';
import { recompute } from '../card/serials';
import { normaliseRouteCard } from '../model/routeCard';

// Manual (typed) leg, as produced by "Add manual serial" and editing the From/To cells.
const leg = (from, to, extra = {}) => ({ from, to, route: '', overrides: { from: true, to: true }, ...extra });

const parseXml = xml => new DOMParser().parseFromString(xml, 'application/xml');

describe('OS grid reference parsing and conversion', () => {
    // Reference WGS84 values from PROJ/pyproj using Ordnance Survey's OSTN15 grid
    // ("OSGB36 to WGS 84 (9)", the definitive transformation) at the centre of each 10-figure (1 m) square.
    // The app uses proj4's 7-parameter Helmert transform, which OS documents as accurate to a few metres
    // (measured 0.3-4.3 m against OSTN15 at these points, worst at Land's End). 8 m allows for that with margin
    // while still catching any real error such as a wrong square, swapped axes or a datum omission (~100 m+).
    const TOLERANCE_M = 8;
    const REFERENCES = [
        ['NN 16670 71250', 'Ben Nevis', 56.796552, -5.003582],
        ['TQ 33617 80568', 'Tower of London', 51.508258, -0.076023],
        ['SU 12259 42190', 'Stonehenge', 51.178814, -1.825988],
        ['SW 34200 25100', "Land's End", 50.066472, -5.715682],
        ['NT 25100 73500', 'Edinburgh Castle', 55.948674, -3.200918],
        ['HU 47700 41300', 'Lerwick', 60.153422, -1.142651],
    ];

    test.each(REFERENCES)('%s (%s) converts within tolerance of OSTN15', (ref, _name, lat, lon) => {
        const g = parseOsGridRef(ref);
        expect(g.ok).toBe(true);
        expect(g.digits).toBe(10);
        const p = osgbToWgs84(g.e, g.n);
        expect(haversineMetres(p, { lat, lon })).toBeLessThan(TOLERANCE_M);
        // Forward/inverse consistency with the existing grid-ref formatter.
        expect(toOsGridRef(p.lat, p.lon, 10)).toBe(ref);
    });

    test('supports 4, 6, 8 and 10 figure references and returns the square centre', () => {
        expect(parseOsGridRef('ST 66 66')).toMatchObject({ ok: true, digits: 4, resolutionM: 1000, e: 366500, n: 166500 });
        expect(parseOsGridRef('ST 668 664')).toMatchObject({ ok: true, digits: 6, resolutionM: 100, e: 366850, n: 166450 });
        expect(parseOsGridRef('ST 6680 6640')).toMatchObject({ ok: true, digits: 8, resolutionM: 10, e: 366805, n: 166405 });
        expect(parseOsGridRef('ST 66800 66400')).toMatchObject({ ok: true, digits: 10, resolutionM: 1, e: 366800.5, n: 166400.5 });
    });

    test('accepts compact, lower-case and embedded forms', () => {
        const expected = { ok: true, ref: 'ST 668 664', e: 366850, n: 166450 };
        expect(parseOsGridRef('ST668664')).toMatchObject(expected);
        expect(parseOsGridRef('st 668 664')).toMatchObject(expected);
        expect(parseOsGridRef('Saltford - ST 668 664 (51.39578, -2.47742)')).toMatchObject(expected);
    });

    test.each([
        ['ST 6686 64', /unequal/],
        ['ST 66866', /odd number/],
        ['ST 6 6', /2-figure/],
        ['ST 668000 664000', /12-figure/],
        ['IA 123 456', /not a valid British National Grid square/],
    ])('rejects invalid reference %s', (text, msg) => {
        const g = parseOsGridRef(text);
        expect(g.ok).toBe(false);
        expect(g.error).toMatch(msg);
    });

    test('returns null when there is no lettered grid reference', () => {
        expect(parseOsGridRef('668 664')).toBeNull();
        expect(parseOsGridRef('Bath Rd')).toBeNull();
    });
});

describe('endpoint resolution', () => {
    test('rejects bare numeric grid references as ambiguous', () => {
        for (const text of ['668 664', '668664', '6680 6640']) {
            const r = resolveEndpoint(leg(text, 'ST 700 650'), 'from');
            expect(r.error).toMatch(/without its two-letter 100 km square.*ambiguous/);
        }
    });

    test('reports missing and unrecognised references with the affected leg and field', () => {
        const { errors, points } = buildGpxRoute([leg('ST 668 664', 'ST 700 650'), leg('', 'Bath')]);
        expect(points).toEqual([]);
        expect(errors).toEqual([
            expect.stringMatching(/^Leg 2 From \(b\) is empty/),
            expect.stringMatching(/^Leg 2 To \(c\): no OS grid reference/),
        ]);
    });

    test('uses stored map points unless the cell text was overridden', () => {
        const stored = { from: 'anything', to: 'anything', overrides: {}, fromPoint: { lat: 51.1, lon: -2.1 }, toPoint: { lat: 51.2, lon: -2.2 } };
        expect(resolveEndpoint(stored, 'from')).toMatchObject({ lat: 51.1, lon: -2.1 });
        const edited = { ...stored, from: 'ST 668 664', overrides: { from: true } };
        const r = resolveEndpoint(edited, 'from');
        expect(haversineMetres(r, { lat: 51.396106, lon: -2.47787 })).toBeLessThan(8);
    });

    test('accepts an explicit decimal lat, lon and cross-checks it against a grid ref in the same cell', () => {
        expect(resolveEndpoint(leg('51.39578, -2.47742', 'x'), 'from')).toMatchObject({ lat: 51.39578, lon: -2.47742 });
        expect(resolveEndpoint(leg('ST 668 664 (51.39578, -2.47742)', 'x'), 'from').error).toBeUndefined();
        expect(resolveEndpoint(leg('ST 668 664 (51.5, -2.47742)', 'x'), 'from').error).toMatch(/disagree/);
    });
});

describe('buildGpxRoute', () => {
    const A = 'ST 668 664';
    const B = 'ST 700 650';
    const C = 'ST 750 620';
    const D = 'ST 800 600';

    test('deduplicates shared endpoints between adjacent legs and preserves order', () => {
        const { points, errors, warnings } = buildGpxRoute([leg(A, B), leg(B, C), leg(C, D)]);
        expect(errors).toEqual([]);
        expect(points).toHaveLength(4);
        const refs = points.map(p => toOsGridRef(p.lat, p.lon, 6));
        expect(refs).toEqual([A, B, C, D]);
        expect(warnings[0]).toBe(STRAIGHT_LINE_WARNING);
    });

    test('joins endpoints given at different precision and keeps the more precise one', () => {
        const { points, errors } = buildGpxRoute([leg(A, 'ST 700 650'), leg('ST 7004 6503', C)]);
        expect(errors).toEqual([]);
        expect(points).toHaveLength(3);
        expect(toOsGridRef(points[1].lat, points[1].lon, 8)).toBe('ST 7004 6503');
    });

    test('blocks export when adjacent legs are disconnected', () => {
        const { points, errors } = buildGpxRoute([leg(A, B), leg(C, D)]);
        expect(points).toEqual([]);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatch(/^Leg 1 and leg 2 are not connected: leg 1 ends \d+\.\d\d km from where leg 2 starts/);
        expect(errors[0]).toMatch(/never bridged automatically/);
    });

    test('keeps intentional later revisits of the same place', () => {
        const { points, errors } = buildGpxRoute([leg(A, B), leg(B, A), leg(A, C)]);
        expect(errors).toEqual([]);
        expect(points.map(p => toOsGridRef(p.lat, p.lon, 6))).toEqual([A, B, A, C]);
    });

    test('collapses a zero-length leg with a warning', () => {
        const { points, warnings } = buildGpxRoute([leg(A, B), leg(B, B), leg(B, C)]);
        expect(points).toHaveLength(3);
        expect(warnings).toContain('Leg 2 starts and ends at the same location, so it adds no route point.');
    });

    test('requires at least two distinct points', () => {
        expect(buildGpxRoute([leg(A, A)]).errors).toContain('The route needs at least two different geographic points.');
        expect(buildGpxRoute([]).errors[0]).toMatch(/no legs/);
    });

    test('allows joins within the minimum tolerance for stored map points', () => {
        const p1 = { lat: 51.4, lon: -2.4 };
        const p2 = { lat: 51.45, lon: -2.35 };
        const near = { lat: p2.lat + 0.00002, lon: p2.lon }; // ~2 m
        const s = (fromPoint, toPoint) => ({ overrides: {}, fromPoint, toPoint });
        expect(MIN_JOIN_TOLERANCE_M).toBeGreaterThan(2);
        expect(buildGpxRoute([s(p1, p2), s(near, p1)]).points).toHaveLength(3);
    });

    describe('checkpoint names', () => {
        test('names only the points the user named', () => {
            const { points } = buildGpxRoute([leg(A, B, { fromCp: 'Start' }), leg(B, C), leg(C, D, { toCp: 'Finish' })]);
            expect(points.map(p => p.name)).toEqual(['Start', undefined, undefined, 'Finish']);
        });

        test('preserves a name from either side of a shared endpoint', () => {
            expect(buildGpxRoute([leg(A, B, { toCp: 'CP1' }), leg(B, C)]).points[1].name).toBe('CP1');
            expect(buildGpxRoute([leg(A, B), leg(B, C, { fromCp: 'CP1' })]).points[1].name).toBe('CP1');
            const same = buildGpxRoute([leg(A, B, { toCp: 'CP1' }), leg(B, C, { fromCp: ' cp1 ' })]);
            expect(same.errors).toEqual([]);
            expect(same.points[1].name).toBe('CP1');
        });

        test('flags conflicting names at a shared endpoint', () => {
            const { errors, points } = buildGpxRoute([leg(A, B, { toCp: 'CP1' }), leg(B, C, { fromCp: 'Bridge' })]);
            expect(points).toEqual([]);
            expect(errors).toEqual([expect.stringMatching(/Conflicting checkpoint names.*"CP1" \(Leg 1 To\).*"Bridge" \(Leg 2 From\)/)]);
        });

        test('warns when nothing is named', () => {
            expect(buildGpxRoute([leg(A, B)]).warnings).toContain('No checkpoint names are set, so ATAK will import the route without named checkpoints.');
        });
    });

    describe('junction mode road shape', () => {
        const p1 = { lat: 51.40, lon: -2.40 };
        const bend1 = { lat: 51.41, lon: -2.38 };
        const mid = { lat: 51.42, lon: -2.36 };
        const bend2 = { lat: 51.43, lon: -2.34 };
        const p2 = { lat: 51.44, lon: -2.32 };
        const bend3 = { lat: 51.45, lon: -2.30 };
        const p3 = { lat: 51.46, lon: -2.28 };
        const j = (fromPoint, toPoint, steps, extra = {}) => ({ overrides: {}, fromPoint, toPoint, steps, ...extra });
        const serials = [
            j(p1, p2, [{ start: p1, shape: [bend1] }, { start: mid, shape: [bend2] }], { fromCp: 'Start', toCp: 'J1 A4/A36' }),
            j(p2, p3, [{ start: p2, shape: [bend3] }], { toCp: 'Finish' }),
        ];

        test('serialViaPoints lists bends and internal step starts in order', () => {
            expect(serialViaPoints(serials[0])).toEqual([bend1, mid, bend2]);
            expect(serialViaPoints({ steps: [{ start: p1 }] })).toBeNull();
            expect(serialViaPoints({ ...serials[0], overrides: { to: true } })).toEqual([]);
        });

        test('inserts unnamed via points between named junctions', () => {
            const { points, errors, warnings } = buildGpxRoute(serials);
            expect(errors).toEqual([]);
            expect(points.map(p => [p.lat, p.lon])).toEqual([p1, bend1, mid, bend2, p2, bend3, p3].map(p => [p.lat, p.lon]));
            expect(points.map(p => p.name)).toEqual(['Start', undefined, undefined, undefined, 'J1 A4/A36', undefined, 'Finish']);
            expect(warnings[0]).toBe(ROAD_SHAPE_WARNING);
            expect(warnings).not.toContain(STRAIGHT_LINE_WARNING);
        });

        test('skips via points within 1 m of a neighbour', () => {
            const near = { lat: p2.lat - 0.000005, lon: p2.lon }; // ~0.5 m before p2
            const { points } = buildGpxRoute([j(p1, p2, [{ start: p1, shape: [bend1, near] }])]);
            expect(points.map(p => [p.lat, p.lon])).toEqual([p1, bend1, p2].map(p => [p.lat, p.lon]));
        });

        test('an edited From/To drops that serial\'s shape with a warning', () => {
            const edited = [serials[0], { ...serials[1], overrides: { to: true }, to: 'ST 760 700' }];
            const { points, warnings } = buildGpxRoute(edited);
            expect(points).toHaveLength(6);
            expect(warnings).toContain('Leg 2 From/To was edited, so its road bend points were left out; it exports as a straight line.');
        });

        test('toGpx writes via points as unnamed rtept', () => {
            const doc = parseXml(toGpx(buildGpxRoute(serials).points, { name: 'Demo' }));
            const pts = [...doc.getElementsByTagName('rtept')];
            expect(pts).toHaveLength(7);
            expect(pts.filter(e => e.getElementsByTagName('name').length).length).toBe(3);
        });
    });

    test('adds point descriptions from Route (d) only when opted in', () => {
        const legs = [leg(A, B, { route: 'A4 Bath Rd' }), leg(B, C, { route: 'A36' })];
        expect(buildGpxRoute(legs).points.some(p => p.desc)).toBe(false);
        expect(buildGpxRoute(legs, { includeDescriptions: true }).points.map(p => p.desc)).toEqual(['Ser 1: A4 Bath Rd', 'Ser 2: A36', undefined]);
    });
});

describe('toGpx', () => {
    const points = [
        { lat: 51.396106, lon: -2.47787, name: 'Start' },
        { lat: 51.4, lon: -2.4 },
        { lat: 51.45, lon: -2.35, name: 'Finish', desc: 'Ser 2: A36' },
    ];

    test('produces a GPX 1.1 document with a single named route and ordered route points', () => {
        const doc = parseXml(toGpx(points, { name: 'Exercise route', desc: 'Demo only' }));
        expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
        const gpx = doc.documentElement;
        expect(gpx.localName).toBe('gpx');
        expect(gpx.namespaceURI).toBe('http://www.topografix.com/GPX/1/1');
        expect(gpx.getAttribute('version')).toBe('1.1');
        expect(gpx.getAttribute('creator')).toBe('RoadRouteCardMaker');
        expect(doc.getElementsByTagName('wpt')).toHaveLength(0);
        expect(doc.getElementsByTagName('trk')).toHaveLength(0);
        const rtes = doc.getElementsByTagName('rte');
        expect(rtes).toHaveLength(1);
        const rte = rtes[0];
        expect(rte.children[0].localName).toBe('name');
        expect(rte.children[0].textContent).toBe('Exercise route');
        expect(rte.children[1].textContent).toBe('Demo only');
        const rtepts = [...rte.getElementsByTagName('rtept')];
        expect(rtepts.map(p => [p.getAttribute('lat'), p.getAttribute('lon')])).toEqual([
            ['51.396106', '-2.477870'], ['51.400000', '-2.400000'], ['51.450000', '-2.350000'],
        ]);
        expect(rtepts.map(p => p.getElementsByTagName('name')[0]?.textContent)).toEqual(['Start', undefined, 'Finish']);
        // GPX 1.1 schema order within a point: name before desc.
        expect([...rtepts[2].children].map(c => c.localName)).toEqual(['name', 'desc']);
    });

    test('escapes XML special characters and strips illegal control characters', () => {
        const nasty = `Tom & "Jerry's" <route>\u0007`;
        const xml = toGpx([{ ...points[0], name: nasty, desc: '</desc><wpt/>' }, points[1]], { name: nasty, desc: nasty });
        expect(xml).toContain('Tom &amp; &quot;Jerry&apos;s&quot; &lt;route&gt;');
        expect(xml).not.toContain('\u0007');
        const doc = parseXml(xml);
        expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
        expect(doc.getElementsByTagName('wpt')).toHaveLength(0);
        expect(doc.getElementsByTagName('rtept')[0].getElementsByTagName('name')[0].textContent).toBe(`Tom & "Jerry's" <route>`);
        expect(escapeXml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;');
    });

    test('excludes personal and identifying card metadata', () => {
        const card = {
            title: 'Route Card',
            instructions: { movFrom: 'Saltford', movTo: 'Keynsham', timeDateSp: '0800 14/06/2025', contactTelSqnOps: '07700 900123', contactTelTpComd: '07700 900456' },
            driver: 'Pte Example', truck: 'TRUCK-42', vehicle: { registration: 'AB12 CDE' },
        };
        const serials = [leg('ST 668 664', 'ST 700 650', { fromCp: 'Start' })];
        const { points } = buildGpxRoute(serials);
        const xml = toGpx(points, { name: defaultRouteName(card) });
        expect(xml).toContain('<name>Saltford to Keynsham</name>');
        for (const secret of ['14/06/2025', '07700', 'Pte Example', 'TRUCK-42', 'AB12 CDE', '<time', '<author', '<email', '<link']) {
            expect(xml).not.toContain(secret);
        }
    });
});

test('gpxFilename produces a safe filename', () => {
    expect(gpxFilename('Saltford to Keynsham')).toBe('Saltford_to_Keynsham.gpx');
    expect(gpxFilename('../../etc/passwd')).toBe('etc_passwd.gpx');
    expect(gpxFilename('  <>:"|?*  ')).toBe('route.gpx');
    expect(gpxFilename('x'.repeat(200))).toBe(`${'x'.repeat(80)}.gpx`);
});

test('export makes no network requests', () => {
    const original = global.fetch;
    global.fetch = jest.fn();
    try {
        const { points } = buildGpxRoute([leg('ST 668 664', 'ST 700 650'), leg('ST 700 650', 'ST 750 620')]);
        toGpx(points, { name: 'Offline' });
        expect(global.fetch).not.toHaveBeenCalled();
    } finally {
        global.fetch = original;
    }
});

describe('fictional sample route (Workfolder/schema/sample-atak-demo-route.*)', () => {
    const dir = path.join(__dirname, '../../../schema');
    const SAMPLE_NAME = 'EX DEMO - Bath to Bristol (fictional)';
    const SAMPLE_DESC = 'Fictional demonstration route using public places. Straight-line segments only.';

    test('builds without errors and matches the committed sample GPX', () => {
        const card = normaliseRouteCard(JSON.parse(fs.readFileSync(path.join(dir, 'sample-atak-demo-route.json'), 'utf8')));
        const { points, errors } = buildGpxRoute(recompute(card.serials, card.settings, card.instructions));
        expect(errors).toEqual([]);
        expect(points).toHaveLength(6);
        expect(points.filter(p => p.name).map(p => p.name)).toEqual(['SP Royal Crescent', 'CP1 Saltford', 'CP2 Brislington', 'RP Temple Meads']);
        const committed = fs.readFileSync(path.join(dir, 'sample-atak-demo-route.gpx'), 'utf8').replace(/\r\n/g, '\n');
        expect(toGpx(points, { name: SAMPLE_NAME, desc: SAMPLE_DESC })).toBe(committed);
    });
});
