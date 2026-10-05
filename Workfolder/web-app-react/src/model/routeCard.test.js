import {
    INSTRUCTION_ITEMS, INSTRUCTION_FIELDS, SCHEMA_VERSION, newRouteCard, normaliseRouteCard, validateRouteCard, migrateInstructionsV1,
} from './routeCard';

test('instruction items are numbered 1-16 in sequence with field-book labels', () => {
    expect(INSTRUCTION_ITEMS.map(i => i.no)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    expect(INSTRUCTION_ITEMS.map(i => i.label)).toEqual([
        'Move From', 'Move To', 'Time/Date at Start Point', 'Location of Start Point', 'Location of Release Point',
        'Average speed', 'Packet Intervals', 'Vehicle Distances', 'Halts', 'Lights', 'Traffic', 'Medical', 'Recovery',
        'Convoy Flags', 'Contact Telephone', 'Critical Points',
    ]);
    const keys = INSTRUCTION_FIELDS.map(f => f.key);
    expect(new Set(keys).size).toBe(keys.length);
});

test('new cards carry the field-book defaults', () => {
    const card = newRouteCard();
    expect(card.schemaVersion).toBe(2);
    expect(card.instructions).toMatchObject({
        vehDistDayMway: '100 m', vehDistDayARoads: '50 m', vehDistNightMway: '50 m', vehDistNightARoads: '50 m',
        lts: 'Dipped', tfc: 'Varying',
        convoyFlagFront: 'Blue Flag', convoyFlagRear: 'Green Flag', convoyFlagBreakdown: 'Yellow Flag',
        movFrom: '', contactTelSqnOps: '', contactTelTpComd: '', criticalPts: '',
    });
});

test('v1 instructions migrate to v2 keys without inventing values', () => {
    const out = migrateInstructionsV1({
        movFrom: 'A', date: '2026-10-12', timePastSp: '0800', distBetweenVehsDay: '120 m', distBetweenVehsNight: '60 m',
        convoyFlags: 'Blue front', contactTel: '01234', lts: '', tfc: 'Light',
    });
    expect(out).toEqual({
        movFrom: 'A', timeDateSp: '0800 12/10/2026',
        vehDistDayMway: '120 m', vehDistDayARoads: '120 m', vehDistNightMway: '60 m', vehDistNightARoads: '60 m',
        convoyFlagFront: 'Blue front', convoyFlagRear: '', convoyFlagBreakdown: '',
        contactTelSqnOps: '01234', lts: '', tfc: 'Light',
    });
});

test('normaliseRouteCard upgrades v1 cards and keeps v2 values', () => {
    const v1 = { schemaVersion: 1, instructions: { movFrom: 'X', date: '2026-01-02', timePastSp: '' }, serials: [] };
    expect(validateRouteCard(v1)).toEqual([]);
    const n = normaliseRouteCard(v1);
    expect(n.schemaVersion).toBe(SCHEMA_VERSION);
    expect(n.instructions.timeDateSp).toBe('02/01/2026');
    expect(n.instructions).not.toHaveProperty('date');
    expect(n.instructions.lts).toBe('Dipped');

    const v2 = normaliseRouteCard({ schemaVersion: 2, instructions: { lts: 'Full', convoyFlagRear: '' }, serials: [] });
    expect(v2.instructions.lts).toBe('Full');
    expect(v2.instructions.convoyFlagRear).toBe('');
    expect(v2.instructions.convoyFlagFront).toBe('Blue Flag');
    expect(validateRouteCard({ schemaVersion: 3, instructions: {}, serials: [] })).not.toEqual([]);
});
