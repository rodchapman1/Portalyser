export function parseNumber(value, fallback = 0) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : fallback;
    }
    if (value === null || value === undefined || value === '') return fallback;
    const parsed = parseFloat(String(value).replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function optionalNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    const parsed = parseFloat(String(value).replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
}

export function roundMoney(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value * 100) / 100;
}

export function almostEqual(a, b, epsilon = 0.02) {
    return Math.abs(a - b) <= epsilon;
}

export function sanitizeForFirestore(value) {
    if (value === undefined || typeof value === 'function') return null;
    if (typeof value === 'number' && !Number.isFinite(value)) return null;
    if (Array.isArray(value)) return value.map((item) => sanitizeForFirestore(item));
    if (value && typeof value === 'object') {
        const out = {};
        for (const [key, nested] of Object.entries(value)) {
            if (nested === undefined) continue;
            out[key] = sanitizeForFirestore(nested);
        }
        return out;
    }
    return value;
}
