import React from 'react';
import { INSTRUCTION_ITEMS } from '../model/routeCard';

export default function InstructionsForm({ instructions, onChange }) {
    const set = (key, value) => onChange({ ...instructions, [key]: value });
    const input = (f, label) => (
        <label key={f.key} className={f.multiline ? 'wide' : ''}>
            {label}
            {f.multiline ? (
                <textarea rows={5} value={instructions[f.key] || ''} onChange={e => set(f.key, e.target.value)} />
            ) : (
                <input type="text" value={instructions[f.key] || ''} placeholder={f.placeholder || f.default || ''} onChange={e => set(f.key, e.target.value)} />
            )}
        </label>
    );
    return (
        <div className="panel">
            <h3>Instructions</h3>
            <div className="instructions-form">
                {INSTRUCTION_ITEMS.map(item => (item.groups ? (
                    <fieldset key={item.no} className="instr-group">
                        <legend>{item.no}. {item.label}</legend>
                        {item.groups.map((g, gi) => (
                            <div key={gi} className="instr-subgroup">
                                {g.label && <div className="instr-subhead">{g.label}</div>}
                                {g.fields.map(f => input(f, f.label))}
                            </div>
                        ))}
                    </fieldset>
                ) : input(item, `${item.no}. ${item.label}`)))}
            </div>
        </div>
    );
}
