import React from 'react';
import { INSTRUCTION_ITEMS } from '../model/routeCard';

export default function InstructionsForm({ instructions, derived = {}, onChange }) {
    const set = (key, value) => onChange({ ...instructions, [key]: value });
    const input = (f, label) => {
        const auto = f.auto && !String(instructions[f.key] || '').trim();
        return (
            <label key={f.key} className={f.multiline ? 'wide' : ''}>
                {label}
                {f.auto && <small className="instr-hint">{auto ? `auto: ${f.auto}` : 'typed (clear to follow route table)'}</small>}
                {f.multiline ? (
                    <textarea rows={5} value={instructions[f.key] || ''} onChange={e => set(f.key, e.target.value)} />
                ) : (
                    <input
                        type="text"
                        className={auto && derived[f.key] ? 'auto-value' : ''}
                        value={instructions[f.key] || ''}
                        placeholder={(f.auto && derived[f.key]) || f.placeholder || f.default || ''}
                        onChange={e => set(f.key, e.target.value)}
                    />
                )}
            </label>
        );
    };
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
