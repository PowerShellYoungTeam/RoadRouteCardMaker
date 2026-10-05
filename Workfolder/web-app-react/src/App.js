import React, { useMemo, useRef, useState } from 'react';
import './App.css';
import MapPanel from './components/MapPanel';
import WaypointList from './components/WaypointList';
import SettingsPanel from './components/SettingsPanel';
import InstructionsForm from './components/InstructionsForm';
import RouteDetailsEditor from './components/RouteDetailsEditor';
import RouteCardPrint from './components/RouteCardPrint';
import { newRouteCard } from './model/routeCard';
import { getRoute } from './routing/routers';
import { reverseGeocode } from './routing/geocode';
import { addBlankSerial, buildSerials, editSerial, mergeWithNext, recompute, removeSerial, splitSerial } from './card/serials';
import { criticalPointsText, fetchRestrictions, OVERPASS_URLS } from './restrictions/overpass';
import { downloadCard, readCardFile } from './io/cardJson';

const ORS_KEY_STORAGE = 'routecard.orsApiKey';
const OSM_BLOCK_START = '--- OSM restrictions (verify locally) ---';

// Replace the auto-generated block in Critical pts, keeping anything the user typed above it.
function mergeCriticalPts(existing, generated) {
    const userPart = (existing || '').split(OSM_BLOCK_START)[0].trimEnd();
    if (!generated) return userPart;
    return `${userPart ? `${userPart}\n` : ''}${OSM_BLOCK_START}\n${generated}`;
}

const waypointsKey = wps => wps.map(w => `${w.lat.toFixed(6)},${w.lon.toFixed(6)}`).join(';');

export default function App() {
    const [card, setCard] = useState(newRouteCard);
    const [route, setRoute] = useState(null);
    const [apiKey, setApiKeyState] = useState(() => localStorage.getItem(ORS_KEY_STORAGE) || '');
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const fileInput = useRef(null);

    const update = patch => setCard(c => ({ ...c, ...patch }));
    const setApiKey = k => { setApiKeyState(k); localStorage.setItem(ORS_KEY_STORAGE, k); };

    const serials = useMemo(
        () => recompute(card.serials, card.settings, card.instructions),
        [card.serials, card.settings, card.instructions]
    );
    const routeStale = route && route.key !== waypointsKey(card.waypoints);

    const addWaypoint = async wp => {
        setCard(c => ({ ...c, waypoints: [...c.waypoints, { name: '', ...wp }] }));
        if (!wp.name) {
            const name = await reverseGeocode(wp.lat, wp.lon).catch(() => '');
            const same = w => w.lat === wp.lat && w.lon === wp.lon && !w.name;
            if (name) setCard(c => ({ ...c, waypoints: c.waypoints.map(w => (same(w) ? { ...w, name } : w)) }));
        }
    };
    const moveWaypoint = (i, pos) => setCard(c => ({ ...c, waypoints: c.waypoints.map((w, k) => (k === i ? { ...w, ...pos } : w)) }));

    const planRoute = async () => {
        setError(''); setInfo(''); setBusy('Routing…');
        try {
            const r = await getRoute(card.settings.engine, card.waypoints, card.vehicle, card.settings, apiKey);
            r.key = waypointsKey(card.waypoints);
            setRoute(r);
            const first = card.waypoints[0];
            const last = card.waypoints[card.waypoints.length - 1];
            setCard(c => ({
                ...c,
                serials: buildSerials(r, c.waypoints, c.settings),
                restrictions: [],
                instructions: {
                    ...c.instructions,
                    movFrom: c.instructions.movFrom || first.name || '',
                    movTo: c.instructions.movTo || last.name || '',
                },
            }));
            if (!r.truckAware) setInfo('Routed with a car profile - truck restrictions were NOT considered.');
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy('');
        }
    };

    const rebuildSerials = settings => {
        setCard(c => ({ ...c, settings, serials: route && settings.serialMode !== c.settings.serialMode ? buildSerials(route, c.waypoints, settings) : c.serials }));
    };

    const checkRestrictions = async () => {
        if (!route) return;
        setError(''); setInfo(''); setBusy('Querying OSM for restrictions…');
        try {
            const restrictions = await fetchRestrictions(route.geometry, card.vehicle, {
                bufferM: card.settings.restrictionBufferMetres,
                urls: [card.settings.overpassUrl, ...OVERPASS_URLS],
            });
            const conflicts = restrictions.filter(r => r.conflict).length;
            const onRoute = restrictions.filter(r => r.onRoute).length;
            setCard(c => ({
                ...c,
                restrictions,
                instructions: { ...c.instructions, criticalPts: mergeCriticalPts(c.instructions.criticalPts, criticalPointsText(restrictions)) },
            }));
            setInfo(`${restrictions.length} restriction(s) found: ${onRoute} on route, ${conflicts} conflicting with the vehicle profile.`);
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy('');
        }
    };

    const importFile = async e => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        try {
            setCard(await readCardFile(file));
            setRoute(null);
            setInfo(`Loaded ${file.name}`);
        } catch (err) {
            setError(err.message);
        }
    };

    const setSerials = fn => setCard(c => ({ ...c, serials: fn(c.serials) }));

    return (
        <div className="App">
            <header className="no-print">
                <h1>Road Movement Route Card Maker</h1>
                <div className="toolbar">
                    <button type="button" onClick={planRoute} disabled={!!busy || card.waypoints.length < 2}>Plan route</button>
                    <button type="button" onClick={checkRestrictions} disabled={!!busy || !route || routeStale}>Check HGV restrictions</button>
                    <button type="button" onClick={() => window.print()}>Print / PDF</button>
                    <button type="button" onClick={() => downloadCard({ ...card, serials })}>Export JSON</button>
                    <button type="button" onClick={() => fileInput.current.click()}>Import JSON</button>
                    <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={importFile} />
                    <button type="button" onClick={() => { setCard(newRouteCard()); setRoute(null); }}>New card</button>
                </div>
                {busy && <div className="status">{busy}</div>}
                {error && <div className="error">{error}</div>}
                {info && <div className="info">{info}</div>}
                {routeStale && <div className="warning">Waypoints changed since the route was planned - click "Plan route" again.</div>}
            </header>

            <main className="layout no-print">
                <section className="map-col">
                    <MapPanel
                        waypoints={card.waypoints}
                        geometry={route?.geometry}
                        restrictions={card.restrictions}
                        onAddWaypoint={addWaypoint}
                        onMoveWaypoint={moveWaypoint}
                    />
                    {card.restrictions.length > 0 && (
                        <div className="panel">
                            <h3>Restrictions near route</h3>
                            <p className="hint"><span className="dot red" /> conflicts with vehicle <span className="dot orange" /> on route <span className="dot grey" /> nearby / crossing</p>
                            <ul className="restrictions">
                                {card.restrictions.map(r => (
                                    <li key={r.id} className={r.conflict ? 'conflict' : r.onRoute ? 'onroute' : 'near'}>
                                        <a href={r.osmUrl} target="_blank" rel="noreferrer">{r.description}</a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </section>
                <aside className="side-col">
                    <WaypointList
                        waypoints={card.waypoints}
                        locationFormat={card.settings.locationFormat}
                        onChange={waypoints => update({ waypoints })}
                        onAdd={addWaypoint}
                    />
                    <SettingsPanel
                        settings={card.settings}
                        vehicle={card.vehicle}
                        apiKey={apiKey}
                        onSettings={rebuildSerials}
                        onVehicle={vehicle => update({ vehicle })}
                        onApiKey={setApiKey}
                    />
                </aside>
            </main>

            <div className="no-print">
                <InstructionsForm instructions={card.instructions} onChange={instructions => update({ instructions })} />
                <RouteDetailsEditor
                    serials={serials}
                    onEdit={(i, k, v) => setSerials(s => editSerial(s, i, k, v))}
                    onMerge={i => setSerials(s => mergeWithNext(s, i))}
                    onSplit={i => setSerials(s => splitSerial(s, i))}
                    onRemove={i => setSerials(s => removeSerial(s, i))}
                    onAdd={() => setSerials(addBlankSerial)}
                    onResetRow={i => setSerials(s => s.map((x, k) => (k === i ? { ...x, overrides: {} } : x)))}
                />
                <h3 className="preview-title">Print preview</h3>
            </div>
            <RouteCardPrint card={card} serials={serials} />
        </div>
    );
}
