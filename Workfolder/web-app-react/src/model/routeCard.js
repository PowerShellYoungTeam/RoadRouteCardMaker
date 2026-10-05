export const SCHEMA_VERSION = 1;

// Order and labels match the printed INSTRUCTIONS block (items 1-17).
export const INSTRUCTION_FIELDS = [
    { key: 'movFrom', no: '1', label: 'Mov from' },
    { key: 'movTo', no: '2', label: 'Mov to' },
    { key: 'date', no: '3', label: 'Date' },
    { key: 'timePastSp', no: '4', label: 'Time past SP' },
    { key: 'sp', no: '5', label: 'SP' },
    { key: 'relPt', no: '6', label: 'Rel Pt' },
    { key: 'averageSpeed', no: '7', label: 'Average speed' },
    { key: 'timeBetweenPackets', no: '8', label: 'Time between packets' },
    { key: 'distBetweenVehsDay', no: '9a', label: 'Dist between vehs - By day' },
    { key: 'distBetweenVehsNight', no: '9b', label: 'Dist between vehs - By night' },
    { key: 'halts', no: '10', label: 'Halts' },
    { key: 'lts', no: '11', label: 'Lts' },
    { key: 'tfc', no: '12', label: 'Tfc' },
    { key: 'med', no: '13', label: 'Med' },
    { key: 'rec', no: '14', label: 'Rec' },
    { key: 'convoyFlags', no: '15', label: 'Convoy flags' },
    { key: 'contactTel', no: '16', label: 'Contact tel' },
    { key: 'criticalPts', no: '17', label: 'Critical pts', multiline: true },
];

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
        instructions: emptyInstructions(),
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
    if (card.schemaVersion !== SCHEMA_VERSION) errors.push(`Unsupported schemaVersion ${card.schemaVersion}`);
    if (!card.instructions || typeof card.instructions !== 'object') errors.push('Missing instructions');
    if (!Array.isArray(card.serials)) errors.push('serials must be an array');
    if (card.waypoints !== undefined && !Array.isArray(card.waypoints)) errors.push('waypoints must be an array');
    return errors;
}

// Fill in keys missing from an imported card so older/partial files still load.
export function normaliseRouteCard(card) {
    const base = newRouteCard();
    const settings = card.settings || {};
    return {
        ...base,
        ...card,
        instructions: { ...base.instructions, ...(card.instructions || {}) },
        vehicle: { ...base.vehicle, ...(card.vehicle || {}) },
        settings: { ...base.settings, ...settings, engineUrls: { ...base.settings.engineUrls, ...(settings.engineUrls || {}) } },
        waypoints: card.waypoints || [],
        restrictions: card.restrictions || [],
    };
}
