import React from 'react';
import { INSTRUCTION_FIELDS } from '../model/routeCard';

export default function InstructionsForm({ instructions, onChange }) {
    return (
        <div className="panel">
            <h3>Instructions</h3>
            <div className="instructions-form">
                {INSTRUCTION_FIELDS.map(f => (
                    <label key={f.key} className={f.multiline ? 'wide' : ''}>
                        {f.no}. {f.label}
                        {f.multiline ? (
                            <textarea rows={5} value={instructions[f.key]} onChange={e => onChange({ ...instructions, [f.key]: e.target.value })} />
                        ) : (
                            <input
                                type={f.key === 'date' ? 'date' : 'text'}
                                value={instructions[f.key]}
                                placeholder={f.key === 'averageSpeed' ? 'e.g. 40 (used for Total Time)' : ''}
                                onChange={e => onChange({ ...instructions, [f.key]: e.target.value })}
                            />
                        )}
                    </label>
                ))}
            </div>
        </div>
    );
}
