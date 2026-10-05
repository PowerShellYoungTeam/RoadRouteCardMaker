import React from 'react';
import { INSTRUCTION_ITEMS, ROUTE_COLUMNS } from '../model/routeCard';

// Printable card layout: INSTRUCTIONS in two columns (1-8 left, 9-16 right) then ROUTE DETAILS.
export default function RouteCardPrint({ card, serials }) {
    const value = key => card.instructions[key] || '';
    const row = (key, label, className = 'instr') => (
        <div key={key} className={className}>
            <span className="instr-label">{label}</span>
            {key && <span className="instr-value">{value(key)}</span>}
        </div>
    );
    const item = it => (it.groups ? (
        <React.Fragment key={it.no}>
            {row(null, `${it.no}. ${it.label}`)}
            {it.groups.map((g, gi) => (
                <React.Fragment key={gi}>
                    {g.label && row(null, `${g.label}:`, 'instr sub')}
                    {g.fields.map(f => row(f.key, f.label, `instr ${g.label ? 'sub2' : 'sub'}`))}
                </React.Fragment>
            ))}
        </React.Fragment>
    ) : row(it.key, `${it.no}. ${it.label}`));
    return (
        <div className="route-card print-card">
            <h2>{card.title || 'Route Card'}</h2>
            <h4>INSTRUCTIONS</h4>
            <div className="instr-cols">
                <div>{INSTRUCTION_ITEMS.filter(it => it.no <= 8).map(item)}</div>
                <div>{INSTRUCTION_ITEMS.filter(it => it.no > 8).map(item)}</div>
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
