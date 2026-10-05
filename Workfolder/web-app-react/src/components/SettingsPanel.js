import React from 'react';
import { ENGINES, hasVehicleProfile } from '../routing/routers';

const VEHICLE_FIELDS = [
    ['heightM', 'Height (m)'],
    ['widthM', 'Width (m)'],
    ['lengthM', 'Length (m)'],
    ['weightT', 'Weight (t)'],
    ['axleLoadT', 'Axle load (t)'],
];

export default function SettingsPanel({ settings, vehicle, apiKey, onSettings, onVehicle, onApiKey }) {
    const set = (k, v) => onSettings({ ...settings, [k]: v });
    const engine = ENGINES[settings.engine];
    return (
        <div className="panel">
            <h3>Routing</h3>
            <label>Engine
                <select value={settings.engine} onChange={e => set('engine', e.target.value)}>
                    {Object.entries(ENGINES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
            </label>
            <label>Server URL
                <input
                    value={settings.engineUrls[settings.engine]}
                    onChange={e => set('engineUrls', { ...settings.engineUrls, [settings.engine]: e.target.value })}
                />
            </label>
            {engine.needsKey && (
                <label>API key (stored in this browser only)
                    <input type="password" value={apiKey} onChange={e => onApiKey(e.target.value)} />
                </label>
            )}
            {!engine.truckAware && hasVehicleProfile(vehicle) && (
                <div className="warning">OSRM has no truck profile: vehicle dimensions are ignored when routing. Use Valhalla or ORS for HGVs.</div>
            )}
            <label>Serials
                <select value={settings.serialMode} onChange={e => set('serialMode', e.target.value)}>
                    <option value="waypoint">One per waypoint leg</option>
                    <option value="auto">Auto (one per main road change)</option>
                </select>
            </label>
            <label>Locations
                <select value={settings.locationFormat} onChange={e => set('locationFormat', e.target.value)}>
                    <option value="both">OS grid + lat/long</option>
                    <option value="grid">OS grid ref</option>
                    <option value="latlon">Lat/long</option>
                </select>
            </label>
            <label>Units
                <select value={settings.units} onChange={e => set('units', e.target.value)}>
                    <option value="km">km</option>
                    <option value="mi">miles</option>
                </select>
            </label>
            <label>Total time from
                <select value={settings.timeSource} onChange={e => set('timeSource', e.target.value)}>
                    <option value="speed">Average speed (item 7)</option>
                    <option value="router">Router estimate</option>
                </select>
            </label>

            <h3>Vehicle (largest in packet)</h3>
            <div className="grid2">
                {VEHICLE_FIELDS.map(([k, label]) => (
                    <label key={k}>{label}
                        <input type="number" step="0.1" min="0" value={vehicle[k]} onChange={e => onVehicle({ ...vehicle, [k]: e.target.value })} />
                    </label>
                ))}
                <label className="check">
                    <input type="checkbox" checked={!!vehicle.hazmat} onChange={e => onVehicle({ ...vehicle, hazmat: e.target.checked })} /> Hazmat
                </label>
            </div>
            <label>Restriction search buffer (m)
                <input type="number" min="5" max="200" value={settings.restrictionBufferMetres} onChange={e => set('restrictionBufferMetres', Number(e.target.value) || 30)} />
            </label>
            <label>Preferred Overpass URL (optional, public mirrors used as fallback)
                <input value={settings.overpassUrl || ''} placeholder="https://your-server/api/interpreter" onChange={e => set('overpassUrl', e.target.value)} />
            </label>
        </div>
    );
}
