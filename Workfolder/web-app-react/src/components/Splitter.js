import React, { useRef } from 'react';

// Drag handle that reports a new size. `axis="x"` resizes a width (dragging left grows the panel
// on the right when `invert` is set); `axis="y"` resizes a height. Double-click resets.
export default function Splitter({ axis = 'x', value, min, max, invert = false, onChange, onReset, title }) {
    const start = useRef(null);

    const onPointerDown = e => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { pos: axis === 'x' ? e.clientX : e.clientY, value };
        document.body.classList.add(axis === 'x' ? 'resizing-x' : 'resizing-y');
    };
    const onPointerMove = e => {
        if (!start.current) return;
        const delta = (axis === 'x' ? e.clientX : e.clientY) - start.current.pos;
        onChange(Math.round(Math.min(max, Math.max(min, start.current.value + (invert ? -delta : delta)))));
    };
    const onPointerUp = e => {
        if (!start.current) return;
        start.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
        document.body.classList.remove('resizing-x', 'resizing-y');
    };
    const onKeyDown = e => {
        const step = e.shiftKey ? 50 : 10;
        const keys = axis === 'x' ? { ArrowLeft: -step, ArrowRight: step } : { ArrowUp: -step, ArrowDown: step };
        if (keys[e.key] == null) return;
        e.preventDefault();
        onChange(Math.min(max, Math.max(min, value + (invert ? -keys[e.key] : keys[e.key]))));
    };

    return (
        <div
            className={`splitter splitter-${axis}`}
            role="separator"
            aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
            aria-valuenow={value}
            aria-valuemin={min}
            aria-valuemax={max}
            tabIndex={0}
            title={title || 'Drag to resize, double-click to reset'}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={onReset}
            onKeyDown={onKeyDown}
        />
    );
}
