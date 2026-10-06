import React from 'react';
import { ROUTE_COLUMNS } from '../model/routeCard';

const EDITABLE = ['from', 'to', 'route', 'dir'];

const CHECKPOINT = { from: 'fromCp', to: 'toCp' };

export default function RouteDetailsEditor({ serials, onEdit, onCheckpoint, onMerge, onSplit, onRemove, onAdd, onResetRow }) {
    return (
        <div className="panel">
            <h3>Route details (editable)</h3>
            <p className="hint">
                From/To accept an OS grid reference with its square letters (e.g. ST 668 664) or a decimal "lat, lon".
                Checkpoint names are optional, used only for GPX export, and are not printed on the card.
            </p>
            <table className="route-table editor">
                <thead>
                    <tr>
                        {ROUTE_COLUMNS.map(c => <th key={c.key}>{c.label}</th>)}
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {serials.map((s, i) => {
                        const manual = typeof s.distanceM !== 'number';
                        return (
                            <tr key={i}>
                                {ROUTE_COLUMNS.map(c => (
                                    <td key={c.key}>
                                        {EDITABLE.includes(c.key) || (manual && c.key === 'distance') ? (
                                            <textarea
                                                rows={c.key === 'route' ? 2 : 1}
                                                className={s.overrides?.[c.key] ? 'edited' : ''}
                                                value={s[c.key] || ''}
                                                placeholder={c.key === 'distance' ? 'e.g. 12.5' : ''}
                                                onChange={e => onEdit(i, c.key, e.target.value)}
                                            />
                                        ) : (
                                            s[c.key]
                                        )}
                                        {CHECKPOINT[c.key] && (
                                            <input
                                                type="text"
                                                className="checkpoint"
                                                aria-label={`Leg ${i + 1} ${c.key} checkpoint name`}
                                                placeholder="Checkpoint name (optional)"
                                                value={s[CHECKPOINT[c.key]] || ''}
                                                onChange={e => onCheckpoint(i, CHECKPOINT[c.key], e.target.value)}
                                            />
                                        )}
                                    </td>
                                ))}
                                <td className="row-actions">
                                    <button type="button" title="Merge with next serial" disabled={i === serials.length - 1} onClick={() => onMerge(i)}>⤓ merge</button>
                                    <button type="button" title="Split serial in two" disabled={!s.steps || s.steps.length < 2} onClick={() => onSplit(i)}>✂ split</button>
                                    {Object.keys(s.overrides || {}).length > 0 && !manual && (
                                        <button type="button" title="Discard manual edits" onClick={() => onResetRow(i)}>↺</button>
                                    )}
                                    <button type="button" title="Delete" onClick={() => onRemove(i)}>✕</button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            <button type="button" onClick={onAdd}>Add manual serial</button>
        </div>
    );
}
