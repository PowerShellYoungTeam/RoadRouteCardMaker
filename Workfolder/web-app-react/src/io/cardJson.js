import { normaliseRouteCard, validateRouteCard } from '../model/routeCard';

export function serialiseCard(card) {
    return JSON.stringify({ ...card, exportedAt: new Date().toISOString() }, null, 2);
}

export function parseCard(text) {
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        throw new Error(`Invalid JSON: ${e.message}`);
    }
    const errors = validateRouteCard(data);
    if (errors.length) throw new Error(`Not a valid route card: ${errors.join('; ')}`);
    return normaliseRouteCard(data);
}

export function downloadCard(card) {
    const blob = new Blob([serialiseCard(card)], { type: 'application/json' });
    const a = document.createElement('a');
    const safe = (card.instructions.movFrom && card.instructions.movTo
        ? `${card.instructions.movFrom}-to-${card.instructions.movTo}`
        : 'route-card').replace(/[^\w-]+/g, '_');
    a.href = URL.createObjectURL(blob);
    a.download = `${safe}.routecard.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function readCardFile(file) {
    return parseCard(await file.text());
}
