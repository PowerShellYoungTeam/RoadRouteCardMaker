import React from 'react';
import { INSTRUCTION_FIELDS, ROUTE_COLUMNS } from '../model/routeCard';

// Printable card layout: INSTRUCTIONS in two columns (1-9 left, 10-17 right) then ROUTE DETAILS.
export default function RouteCardPrint({ card, serials }) {
    const left = INSTRUCTION_FIELDS.filter(f => parseInt(f.no, 10) <= 9);
    const right = INSTRUCTION_FIELDS.filter(f => parseInt(f.no, 10) >= 10);
    const value = f => {
        const v = card.instructions[f.key] || '';
        return f.key === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('/') : v;
    };
    const line = f => (
        <div key={f.key} className={`instr ${f.no.length > 1 && /[ab]$/.test(f.no) ? 'sub' : ''}`}>
            <span className="instr-label">{/[ab]$/.test(f.no) ? `${f.no.slice(-1)}. ${f.label.split(' - ')[1]}` : `${f.no}. ${f.label}`}</span>
            <span className="instr-value">{value(f)}</span>
        </div>
    );
    return (
        <div className="route-card print-card">
            <h2>{card.title || 'Route Card'}</h2>
            <h4>INSTRUCTIONS</h4>
            <div className="instr-cols">
                <div>
                    {left.filter(f => !/b$/.test(f.no)).map(f =>
                        f.no === '9a' ? (
                            <React.Fragment key="9">
                                <div className="instr"><span className="instr-label">9. Dist between vehs</span></div>
                                {line(f)}
                                {line(INSTRUCTION_FIELDS.find(x => x.no === '9b'))}
                            </React.Fragment>
                        ) : line(f)
                    )}
                </div>
                <div>{right.map(line)}</div>
            </div>
            <h4>ROUTE DETAILS</h4>
            <table className="route-table">
                <thead>
                    <tr>{ROUTE_COLUMNS.map(c => <th key={c.key}>{c.label}</th>)}</tr>
                    <tr className="letters">{ROUTE_COLUMNS.map(c => <th key={c.key}>({c.letter})</th>)}</tr>
                </thead>
                <tbody>
                    {serials.map((s, i) => (
                        <tr key={i}>{ROUTE_COLUMNS.map(c => <td key={c.key}>{s[c.key]}</td>)}</tr>
                    ))}
                    {serials.length === 0 && <tr><td colSpan={ROUTE_COLUMNS.length} className="hint">Plan a route to fill this table.</td></tr>}
                </tbody>
            </table>
            <p className="caveat">{card.caveat}</p>
            <p className="attribution">Map data {card.attribution}</p>
        </div>
    );
}
