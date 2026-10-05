import React, { useMemo, useState } from 'react';
import { buildGpxRoute, defaultRouteName, downloadGpx, gpxFilename, toGpx } from '../export/gpx';

// Local-only GPX route export for ATAK. Personal card fields (date, contact tel, etc.) are never exported.
export default function GpxExportPanel({ card, serials, onClose }) {
    const [name, setName] = useState(() => defaultRouteName(card));
    const [desc, setDesc] = useState('');
    const [includeDescriptions, setIncludeDescriptions] = useState(false);

    const result = useMemo(() => buildGpxRoute(serials, { includeDescriptions }), [serials, includeDescriptions]);
    const blocked = result.errors.length > 0;
    const filename = gpxFilename(name);

    const exportGpx = () => downloadGpx(toGpx(result.points, { name, desc }), filename);

    return (
        <div className="panel gpx-panel">
            <h3>Export GPX for ATAK</h3>
            <p className="hint">
                Generated entirely in this browser - nothing is sent to any server. Only the route name, the optional
                descriptions below and checkpoint names are written; driver, vehicle, date and contact details are not.
                Use fictional or non-sensitive data for demonstrations.
            </p>
            <label>Route name <input type="text" value={name} onChange={e => setName(e.target.value)} /></label>
            <label>Route description (optional) <input type="text" value={desc} onChange={e => setDesc(e.target.value)} /></label>
            <label className="check">
                <input type="checkbox" checked={includeDescriptions} onChange={e => setIncludeDescriptions(e.target.checked)} />
                Add each serial's Route (d) text as a point description
            </label>
            <p className="hint">ATAK's importer does not use GPX descriptions as navigation cues; they are informational only.</p>

            {blocked && (
                <div className="error">
                    <strong>Export blocked - fix the following:</strong>
                    <ul>{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                </div>
            )}
            {result.warnings.length > 0 && (
                <div className="warning">
                    <ul>{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                </div>
            )}
            {!blocked && (
                <p className="hint">
                    {result.points.length} route points, {result.points.filter(p => p.name).length} named checkpoint(s).
                    File: <code>{filename}</code>
                </p>
            )}
            <div className="toolbar">
                <button type="button" disabled={blocked} onClick={exportGpx}>Download .gpx</button>
                <button type="button" onClick={onClose}>Close</button>
            </div>
        </div>
    );
}
