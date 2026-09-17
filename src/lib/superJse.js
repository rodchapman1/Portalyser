export const SUPER_JSE_SHEET = {
    spreadsheetId: '1jyuhOSwGVbbKni22YuK_gNspVKyS-RMYBge05gJkb_g',
    title: 'Hermes',
    url: 'https://docs.google.com/spreadsheets/d/1jyuhOSwGVbbKni22YuK_gNspVKyS-RMYBge05gJkb_g',
    tabs: ['Portfolio', 'latest_stocks', 'db_frontend'],
    notes: 'Live Sheets API is not wired. Use public/super-jse-holdings.json, paste CSV, or upload an export until OAuth/service-account access is added. Do not put credentials in the repo.',
};

export const HOLDINGS_TEMPLATE = {
    asOf: null,
    baseCurrency: 'AUD',
    source: 'template',
    portfolios: {
        SUPER: { cashAUD: 0, positions: [] },
        JSE: { cashAUD: 0, positions: [] },
    },
};

const PORTFOLIO_ALIASES = {
    super: 'SUPER',
    smsf: 'SUPER',
    pension: 'SUPER',
    jse: 'JSE',
    johannesburg: 'JSE',
    sa: 'JSE',
};

function headerKey(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}

function normalizePortfolioName(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const mapped = PORTFOLIO_ALIASES[raw.toLowerCase()];
    if (mapped) return mapped;
    const upper = raw.toUpperCase();
    if (upper === 'SUPER' || upper === 'JSE') return upper;
    return null;
}

function parseCsvLine(line) {
    const cells = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            cells.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    cells.push(current);
    return cells.map((cell) => cell.trim());
}

function emptyHoldings(source = 'empty') {
    return {
        asOf: null,
        baseCurrency: 'AUD',
        source,
        portfolios: {
            SUPER: { cashAUD: 0, positions: [] },
            JSE: { cashAUD: 0, positions: [] },
        },
    };
}

function toPosition(row, portfolioId) {
    const symbol = row.symbol || row.ticker || row.code;
    const quantity = Number(row.quantity ?? row.qty ?? row.units ?? row.shares ?? 0);
    const markPrice = Number(row.markPrice ?? row.price ?? row.last ?? row.close ?? 0);
    const currency = row.currency || row.ccy || 'AUD';
    const explicitValue = Number(row.positionValueAUD ?? row.valueaud ?? row.valueAUD ?? row.marketvalue ?? row.value ?? NaN);
    const positionValueAUD = Number.isFinite(explicitValue) ? explicitValue : quantity * markPrice;
    if (!symbol || String(symbol).toUpperCase() === 'CASH') return null;
    if (!Number.isFinite(quantity) && !Number.isFinite(positionValueAUD)) return null;
    return {
        accountId: portfolioId,
        symbol: String(symbol).toUpperCase(),
        description: row.description || row.name || row.security || String(symbol).toUpperCase(),
        assetCategory: 'STK',
        quantity: Number.isFinite(quantity) ? quantity : 0,
        markPrice: Number.isFinite(markPrice) ? markPrice : 0,
        positionValueAUD: Number.isFinite(positionValueAUD) ? positionValueAUD : 0,
        currency,
        fxRateToBase: currency === 'AUD' ? 1 : Number(row.fxRateToBase || 1),
        underlying: null,
        expiry: null,
        strike: null,
        type: '',
        multiplier: 1,
        annualizedToStrike: null,
        annualizedPremium: null,
        annualizedBreakeven: null,
        sourceBook: portfolioId,
    };
}

function cashFromRow(row) {
    const cash = Number(row.cash ?? row.cashaud ?? row.cashAUD ?? row.cashbalance ?? NaN);
    return Number.isFinite(cash) ? cash : null;
}

export function normalizeExternalHoldings(raw, source = 'json') {
    const holdings = emptyHoldings(source);
    if (!raw || typeof raw !== 'object') return holdings;
    holdings.asOf = raw.asOf || raw.as_of || raw.date || null;
    holdings.baseCurrency = raw.baseCurrency || raw.currency || 'AUD';
    const incoming = raw.portfolios || raw;
    ['SUPER', 'JSE'].forEach((id) => {
        const book = incoming[id] || incoming[id.toLowerCase()];
        if (!book) return;
        const positions = Array.isArray(book.positions)
            ? book.positions.map((row) => toPosition(row, id)).filter(Boolean)
            : [];
        holdings.portfolios[id] = {
            cashAUD: Number(book.cashAUD ?? book.cash ?? 0) || 0,
            positions,
        };
    });
    return holdings;
}

export function parseSuperJseCsv(text, source = 'csv') {
    const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) return emptyHoldings(source);
    const headers = parseCsvLine(lines[0]).map(headerKey);
    const index = Object.fromEntries(headers.map((header, i) => [header, i]));
    const get = (cells, names) => {
        for (const name of names) {
            if (index[name] !== undefined && cells[index[name]] !== undefined && cells[index[name]] !== '') {
                return cells[index[name]];
            }
        }
        return '';
    };

    const holdings = emptyHoldings(source);
    lines.slice(1).forEach((line) => {
        const cells = parseCsvLine(line);
        const portfolioId = normalizePortfolioName(get(cells, ['portfolio', 'book', 'account', 'sleeve', 'source']));
        if (!portfolioId) return;
        const row = {
            symbol: get(cells, ['symbol', 'ticker', 'code']),
            description: get(cells, ['description', 'name', 'security']),
            quantity: get(cells, ['quantity', 'qty', 'units', 'shares']),
            markPrice: get(cells, ['markprice', 'price', 'last', 'close']),
            currency: get(cells, ['currency', 'ccy']),
            positionValueAUD: get(cells, ['positionvalueaud', 'valueaud', 'marketvalue', 'value']),
            cash: get(cells, ['cash', 'cashaud', 'cashbalance']),
            fxRateToBase: get(cells, ['fxratetobase', 'fx']),
        };
        const cash = cashFromRow(row);
        if (cash !== null) holdings.portfolios[portfolioId].cashAUD = cash;
        if (String(row.symbol).toUpperCase() === 'CASH') {
            const amount = Number(row.positionValueAUD || row.quantity || row.markPrice || 0);
            if (Number.isFinite(amount)) holdings.portfolios[portfolioId].cashAUD = amount;
            return;
        }
        const position = toPosition(row, portfolioId);
        if (position) holdings.portfolios[portfolioId].positions.push(position);
    });
    return holdings;
}

export function parseSuperJseInput(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return emptyHoldings('empty');
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        return normalizeExternalHoldings(JSON.parse(trimmed), 'json-paste');
    }
    return parseSuperJseCsv(trimmed, 'csv-paste');
}

export function holdingsToSlice(holdings, portfolioId, baseCurrency = 'AUD') {
    const book = holdings?.portfolios?.[portfolioId] || { cashAUD: 0, positions: [] };
    const cashAUD = Number(book.cashAUD || 0);
    return {
        id: portfolioId,
        label: portfolioId,
        kind: portfolioId.toLowerCase(),
        positions: book.positions || [],
        cashAUD,
        cashBalances: cashAUD !== 0 || (book.positions || []).length === 0
            ? [{ currency: baseCurrency, amount: cashAUD, valueAUD: cashAUD, fxRateToBase: 1, accountId: portfolioId }]
            : [{ currency: baseCurrency, amount: cashAUD, valueAUD: cashAUD, fxRateToBase: 1, accountId: portfolioId }],
        baseCurrency,
        rates: { [baseCurrency]: 1 },
    };
}

export { emptyHoldings };
