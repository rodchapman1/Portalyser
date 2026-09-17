import { buildNavComponents } from './ibkrFlex.js';
import { holdingsToSlice } from './superJse.js';
import { parseNumber, roundMoney } from './numbers.js';

export const ALL_ID = 'all';
export const IBKR_COMBINED_ID = 'ibkr';

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function cloneBook(book) {
    return {
        ...book,
        positions: asArray(book.positions).map((position) => ({ ...position })),
        cashBalances: asArray(book.cashBalances).map((cash) => ({ ...cash })),
        navComponents: book.navComponents ? { ...book.navComponents } : null,
    };
}

export function normalizeReport(report) {
    if (!report) return null;
    const positions = asArray(report.positions);
    const cashBalances = asArray(report.cashBalances);
    const cashAUD = parseNumber(report.cashAUD, 0);
    const baseCurrency = report.baseCurrency || 'AUD';
    const rates = report.rates || { [baseCurrency]: 1 };

    let portfolios = {};
    if (report.portfolios && typeof report.portfolios === 'object' && Object.keys(report.portfolios).length > 0) {
        Object.entries(report.portfolios).forEach(([id, book]) => {
            portfolios[id] = {
                id: book.id || id,
                label: book.label || (id === 'IBKR' ? 'IBKR' : `IBKR ${id}`),
                kind: book.kind || 'ibkr',
                accountId: book.accountId || id,
                accountAlias: book.accountAlias || null,
                positions: asArray(book.positions),
                cashAUD: parseNumber(book.cashAUD, 0),
                cashBalances: asArray(book.cashBalances),
                navComponents: book.navComponents || buildNavComponents({
                    positions: asArray(book.positions),
                    cashAUD: parseNumber(book.cashAUD, 0),
                    includeOptions: true,
                }),
            };
        });
    } else {
        const accountIds = [...new Set(positions.map((position) => position.accountId).filter(Boolean))];
        if (accountIds.length > 1) {
            accountIds.forEach((accountId) => {
                const accountPositions = positions.filter((position) => position.accountId === accountId);
                const accountCash = cashBalances.filter((cash) => cash.accountId === accountId);
                const accountCashAUD = accountCash.length
                    ? accountCash.reduce((sum, cash) => sum + parseNumber(cash.valueAUD, 0), 0)
                    : cashAUD;
                portfolios[accountId] = {
                    id: accountId,
                    label: `IBKR ${accountId}`,
                    kind: 'ibkr',
                    accountId,
                    positions: accountPositions,
                    cashAUD: accountCashAUD,
                    cashBalances: accountCash.length ? accountCash : cashBalances,
                    navComponents: buildNavComponents({
                        positions: accountPositions,
                        cashAUD: accountCashAUD,
                        includeOptions: true,
                    }),
                };
            });
        } else {
            const id = accountIds[0] || 'IBKR';
            portfolios[id] = {
                id,
                label: id === 'IBKR' ? 'IBKR' : `IBKR ${id}`,
                kind: 'ibkr',
                accountId: id,
                positions,
                cashAUD,
                cashBalances,
                navComponents: report.navComponents || buildNavComponents({
                    positions,
                    cashAUD,
                    includeOptions: true,
                }),
            };
        }
    }

    const combinedNav = report.navComponents || buildNavComponents({
        positions,
        cashAUD,
        includeOptions: true,
    });

    return {
        schemaVersion: report.schemaVersion || (report.portfolios ? 2 : 1),
        source: report.source || 'ibkr-flex',
        reportDate: report.reportDate || '',
        baseCurrency,
        rates,
        positions,
        cashAUD,
        cashBalances,
        navComponents: combinedNav,
        portfolios,
        ibkrAccountIds: Object.keys(portfolios),
        legacy: !report.portfolios,
    };
}

function mergeSlices(slices, label, kind, id) {
    const positions = slices.flatMap((slice) => asArray(slice.positions));
    const cashBalances = slices.flatMap((slice) => asArray(slice.cashBalances));
    const cashAUD = roundMoney(slices.reduce((sum, slice) => sum + parseNumber(slice.cashAUD, 0), 0));
    const includeOptions = slices.some((slice) => slice.kind === 'ibkr' || slice.kind === 'all');
    return {
        id,
        label,
        kind,
        positions,
        cashAUD,
        cashBalances,
        baseCurrency: slices[0]?.baseCurrency || 'AUD',
        rates: slices[0]?.rates || { AUD: 1 },
        navComponents: buildNavComponents({ positions, cashAUD, includeOptions }),
    };
}

export function selectorOptions(report, externalHoldings) {
    const options = [{ id: ALL_ID, label: 'All', group: 'combined' }];
    const ibkrBooks = Object.values(report?.portfolios || {});
    if (ibkrBooks.length === 1 && (ibkrBooks[0].id === 'IBKR' || report?.legacy)) {
        options.push({ id: `ibkr:${ibkrBooks[0].id}`, label: ibkrBooks[0].label || 'IBKR', group: 'ibkr' });
    } else {
        ibkrBooks
            .sort((a, b) => String(a.label).localeCompare(String(b.label)))
            .forEach((book) => {
                options.push({ id: `ibkr:${book.id}`, label: book.label, group: 'ibkr' });
            });
    }
    options.push({
        id: 'SUPER',
        label: 'SUPER',
        group: 'external',
        empty: !externalHoldings?.portfolios?.SUPER
            || ((externalHoldings.portfolios.SUPER.positions || []).length === 0
                && !Number(externalHoldings.portfolios.SUPER.cashAUD)),
    });
    options.push({
        id: 'JSE',
        label: 'JSE',
        group: 'external',
        empty: !externalHoldings?.portfolios?.JSE
            || ((externalHoldings.portfolios.JSE.positions || []).length === 0
                && !Number(externalHoldings.portfolios.JSE.cashAUD)),
    });
    return options;
}

export function selectSlice(report, externalHoldings, selectedId = ALL_ID) {
    const normalized = normalizeReport(report);
    if (!normalized) return null;
    const superSlice = holdingsToSlice(externalHoldings, 'SUPER', normalized.baseCurrency);
    const jseSlice = holdingsToSlice(externalHoldings, 'JSE', normalized.baseCurrency);
    superSlice.navComponents = buildNavComponents({
        positions: superSlice.positions,
        cashAUD: superSlice.cashAUD,
        includeOptions: false,
    });
    jseSlice.navComponents = buildNavComponents({
        positions: jseSlice.positions,
        cashAUD: jseSlice.cashAUD,
        includeOptions: false,
    });

    const ibkrSlices = Object.values(normalized.portfolios).map((book) => ({
        ...cloneBook(book),
        baseCurrency: normalized.baseCurrency,
        rates: normalized.rates,
    }));
    const ibkrCombined = mergeSlices(ibkrSlices, 'IBKR', 'ibkr', IBKR_COMBINED_ID);
    ibkrCombined.navComponents = normalized.navComponents || ibkrCombined.navComponents;

    if (selectedId === ALL_ID) {
        return mergeSlices(
            [...ibkrSlices, superSlice, jseSlice],
            'All',
            'all',
            ALL_ID,
        );
    }
    if (selectedId === 'SUPER') return superSlice;
    if (selectedId === 'JSE') return jseSlice;
    if (selectedId === IBKR_COMBINED_ID) return ibkrCombined;
    if (String(selectedId).startsWith('ibkr:')) {
        const accountId = selectedId.slice(5);
        return ibkrSlices.find((book) => book.id === accountId || book.accountId === accountId) || ibkrCombined;
    }
    return ibkrSlices.find((book) => book.id === selectedId) || mergeSlices([...ibkrSlices, superSlice, jseSlice], 'All', 'all', ALL_ID);
}

export function navBooks(report, externalHoldings) {
    const all = selectSlice(report, externalHoldings, ALL_ID);
    const ibkr = selectSlice(report, externalHoldings, IBKR_COMBINED_ID);
    const superBook = selectSlice(report, externalHoldings, 'SUPER');
    const jse = selectSlice(report, externalHoldings, 'JSE');
    return {
        IBKR: ibkr,
        SUPER: superBook,
        JSE: jse,
        All: all,
    };
}
