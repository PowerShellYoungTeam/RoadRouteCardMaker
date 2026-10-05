import React, { useState } from 'react';
import { searchPlace } from '../routing/geocode';
import { formatLocation } from '../geo/geo';

export default function WaypointList({ waypoints, locationFormat, onChange, onAdd }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [error, setError] = useState('');

    const search = async e => {
        e.preventDefault();
        if (!query.trim()) return;
        setError('');
        try {
            const r = await searchPlace(query);
            setResults(r);
            if (!r.length) setError('No places found');
        } catch (err) {
            setError(err.message);
        }
    };

    const move = (i, d) => {
        const j = i + d;
        if (j < 0 || j >= waypoints.length) return;
        const next = [...waypoints];
        [next[i], next[j]] = [next[j], next[i]];
        onChange(next);
    };

    return (
        <div className="panel">
            <h3>Waypoints</h3>
            <p className="hint">Click the map to add waypoints (drag to adjust), or search for a place.</p>
            <form onSubmit={search} className="row">
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search place (e.g. Tidworth)" />
                <button type="submit">Search</button>
            </form>
            {error && <div className="error">{error}</div>}
            {results.length > 0 && (
                <ul className="results">
                    {results.map((r, i) => (
                        <li key={i}>
                            <button type="button" className="link" onClick={() => { onAdd({ ...r, name: r.name.split(',')[0] }); setResults([]); setQuery(''); }}>
                                + {r.name}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <ol className="waypoints">
                {waypoints.map((w, i) => (
                    <li key={i}>
                        <input
                            value={w.name || ''}
                            placeholder={`Waypoint ${i + 1}`}
                            onChange={e => onChange(waypoints.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))}
                        />
                        <small>{formatLocation({ lat: w.lat, lon: w.lon }, locationFormat)}</small>
                        <span className="btns">
                            <button type="button" title="Up" onClick={() => move(i, -1)}>↑</button>
                            <button type="button" title="Down" onClick={() => move(i, 1)}>↓</button>
                            <button type="button" title="Remove" onClick={() => onChange(waypoints.filter((_, k) => k !== i))}>✕</button>
                        </span>
                    </li>
                ))}
            </ol>
            {waypoints.length > 0 && <button type="button" onClick={() => onChange([])}>Clear waypoints</button>}
        </div>
    );
}
