export function formatMoney(value, currency = 'AUD') {
    const amount = Number.isFinite(value) ? value : 0;
    try {
        return new Intl.NumberFormat('en-AU', {
            style: 'currency',
            currency,
            maximumFractionDigits: 0,
        }).format(amount);
    } catch {
        return `${currency} ${amount.toFixed(0)}`;
    }
}

export function formatMoneyExact(value, currency = 'AUD') {
    const amount = Number.isFinite(value) ? value : 0;
    try {
        return new Intl.NumberFormat('en-AU', {
            style: 'currency',
            currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount);
    } catch {
        return `${currency} ${amount.toFixed(2)}`;
    }
}

export function formatPct(value) {
    if (!Number.isFinite(value)) return '—';
    return `${value.toFixed(1)}%`;
}

export function formatDateKey(value) {
    if (!value) return '';
    const text = String(value).split(';')[0];
    if (/^\d{8}$/.test(text)) {
        return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
    }
    return text;
}
