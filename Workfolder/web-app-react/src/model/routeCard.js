export const SCHEMA_VERSION = 2;

// INSTRUCTIONS block, worded as in the short-form field book (items 1-16).
// An item has either a single `key` or `groups` of sub-fields; `group.label` is an optional sub-heading.
// `default` values pre-fill new cards.
export const INSTRUCTION_ITEMS = [
    { no: 1, label: 'Move From', key: 'movFrom' },
    { no: 2, label: 'Move To', key: 'movTo' },
    { no: 3, label: 'Time/Date at Start Point', key: 'timeDateSp', placeholder: 'e.g. 0800 12/10/26' },
    { no: 4, label: 'Location of Start Point', key: 'sp', auto: 'grid ref of first From (b)' },
    { no: 5, label: 'Location of Release Point', key: 'relPt', auto: 'grid ref of last To (c)' },
    { no: 6, label: 'Average speed', key: 'averageSpeed', placeholder: 'e.g. 40 (used for Total Time)' },
    { no: 7, label: 'Packet Intervals', key: 'timeBetweenPackets' },
    {
        no: 8, label: 'Vehicle Distances', groups: [
            { label: 'Day', fields: [
                { key: 'vehDistDayMway', label: 'M/Way', default: '100 m' },
                { key: 'vehDistDayARoads', label: 'A Roads', default: '50 m' },
            ] },
            { label: 'Night', fields: [
                { key: 'vehDistNightMway', label: 'M/Way', default: '50 m' },
                { key: 'vehDistNightARoads', label: 'A Roads', default: '50 m' },
            ] },
        ],
    },
    { no: 9, label: 'Halts', key: 'halts' },
    { no: 10, label: 'Lights', key: 'lts', default: 'Dipped' },
    { no: 11, label: 'Traffic', key: 'tfc', default: 'Varying' },
    { no: 12, label: 'Medical', key: 'med' },
    { no: 13, label: 'Recovery', key: 'rec' },
    {
        no: 14, label: 'Convoy Flags', groups: [
            { fields: [
                { key: 'convoyFlagFront', label: 'Front Vehicle', default: 'Blue Flag' },
                { key: 'convoyFlagRear', label: 'Rear Vehicle', default: 'Green Flag' },
                { key: 'convoyFlagBreakdown', label: 'Breakdown', default: 'Yellow Flag' },
            ] },
        ],
    },
    {
        no: 15, label: 'Contact Telephone', groups: [
            { fields: [
                { key: 'contactTelSqnOps', label: 'Sqn Ops' },
                { key: 'contactTelTpComd', label: 'TP Comd' },
            ] },
        ],
    },
    { no: 16, label: 'Critical Points', key: 'criticalPts', multiline: true },
];

// Flat list of every instruction value: { key, label, default, ... }.
export const INSTRUCTION_FIELDS = INSTRUCTION_ITEMS.flatMap(item => (item.groups
    ? item.groups.flatMap(g => g.fields.map(f => ({ ...f, item: item.no })))
    : [{ ...item, item: item.no }]));

export const ROUTE_COLUMNS = [
    { key: 'ser', letter: 'a', label: 'Ser' },
    { key: 'from', letter: 'b', label: 'From' },
    { key: 'to', letter: 'c', label: 'To' },
    { key: 'route', letter: 'd', label: 'Route' },
    { key: 'dir', letter: 'e', label: 'Dir' },
    { key: 'distance', letter: 'f', label: 'Distance' },
    { key: 'totalDistance', letter: 'g', label: 'Total Distance' },
    { key: 'totalTime', letter: 'h', label: 'Total Time' },
];

export const OSM_CAVEAT =
    'Restriction data from OpenStreetMap is incomplete and advisory only. Verify heights, weights and access locally before moving.';

export function emptyInstructions() {
    return Object.fromEntries(INSTRUCTION_FIELDS.map(f => [f.key, '']));
}

export function defaultInstructions() {
    return Object.fromEntries(INSTRUCTION_FIELDS.map(f => [f.key, f.default || '']));
}

const isoToUkDate = v => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('/') : v);

// Map schemaVersion 1 instruction keys onto the version 2 items. Values are moved, never invented:
// a v1 "Dist between vehs" figure covered all roads, so it fills both M/Way and A Roads for that period;
// free-text convoy flags go to Front Vehicle (Rear/Breakdown left blank); Contact tel goes to Sqn Ops.
export function migrateInstructionsV1(old = {}) {
    const { date, timePastSp, distBetweenVehsDay, distBetweenVehsNight, convoyFlags, contactTel, ...rest } = old;
    const out = { ...rest };
    if (date !== undefined || timePastSp !== undefined) {
        out.timeDateSp = [timePastSp, isoToUkDate(date || '')].filter(Boolean).join(' ');
    }
    if (distBetweenVehsDay !== undefined) out.vehDistDayMway = out.vehDistDayARoads = distBetweenVehsDay;
    if (distBetweenVehsNight !== undefined) out.vehDistNightMway = out.vehDistNightARoads = distBetweenVehsNight;
    if (convoyFlags !== undefined) Object.assign(out, { convoyFlagFront: convoyFlags, convoyFlagRear: '', convoyFlagBreakdown: '' });
    if (contactTel !== undefined) out.contactTelSqnOps = contactTel;
    return out;
}

export function defaultSettings() {
    return {
        engine: 'valhalla',
        engineUrls: {
            valhalla: 'https://valhalla1.openstreetmap.de',
            ors: 'https://api.openrouteservice.org',
            osrm: 'https://router.project-osrm.org',
        },
        serialMode: 'waypoint', // 'waypoint' | 'auto'
        locationFormat: 'both', // 'latlon' | 'grid' | 'both'
        units: 'km', // 'km' | 'mi'
        timeSource: 'speed', // 'speed' (item 7) | 'router'
        restrictionBufferMetres: 30,
        overpassUrl: '', // optional preferred/self-hosted Overpass endpoint, tried before the public mirrors
    };
}

export function defaultVehicle() {
    // Metric units; tonnes for weights. Empty values are not sent to routers.
    return { heightM: '', widthM: '', lengthM: '', weightT: '', axleLoadT: '', hazmat: false };
}

export function newRouteCard() {
    return {
        schemaVersion: SCHEMA_VERSION,
        title: 'Route Card',
        instructions: defaultInstructions(),
        vehicle: defaultVehicle(),
        settings: defaultSettings(),
        waypoints: [], // { lat, lon, name }
        serials: [], // see card/serials.js
        restrictions: [], // see restrictions/overpass.js
        attribution: '© OpenStreetMap contributors',
        caveat: OSM_CAVEAT,
    };
}

export function validateRouteCard(card) {
    const errors = [];
    if (!card || typeof card !== 'object') return ['Not an object'];
    if (card.schemaVersion !== SCHEMA_VERSION && card.schemaVersion !== 1) errors.push(`Unsupported schemaVersion ${card.schemaVersion}`);
    if (!card.instructions || typeof card.instructions !== 'object') errors.push('Missing instructions');
    if (!Array.isArray(card.serials)) errors.push('serials must be an array');
    if (card.waypoints !== undefined && !Array.isArray(card.waypoints)) errors.push('waypoints must be an array');
    return errors;
}

// Fill in keys missing from an imported card so older/partial files still load.
// v1 cards are migrated; defaults only fill items the file does not mention at all.
export function normaliseRouteCard(card) {
    const base = newRouteCard();
    const settings = card.settings || {};
    const instructions = card.schemaVersion === 1 ? migrateInstructionsV1(card.instructions) : card.instructions || {};
    return {
        ...base,
        ...card,
        schemaVersion: SCHEMA_VERSION,
        instructions: { ...base.instructions, ...instructions },
        vehicle: { ...base.vehicle, ...(card.vehicle || {}) },
        settings: { ...base.settings, ...settings, engineUrls: { ...base.settings.engineUrls, ...(settings.engineUrls || {}) } },
        waypoints: card.waypoints || [],
        restrictions: card.restrictions || [],
    };
}
