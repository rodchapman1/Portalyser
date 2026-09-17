import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseIBKRFlexXml } from '../ibkrFlex.js';
import { ALL_ID, navBooks, normalizeReport, selectSlice, selectorOptions } from '../portfolios.js';
import { parseSuperJseCsv, parseSuperJseInput } from '../superJse.js';
import { buildAnalysis } from '../analysis.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const multiXml = readFileSync(join(root, 'public/samples/ibkr-flex-multi-account.xml'), 'utf8');
const computedXml = readFileSync(join(root, 'public/samples/ibkr-flex-computed-nav.xml'), 'utf8');

describe('IBKR Flex multi-account parse', () => {
    const report = parseIBKRFlexXml(multiXml);

    it('groups positions and cash by accountId and skips LOT rows', () => {
        expect(Object.keys(report.portfolios).sort()).toEqual(['U1111111', 'U2222222']);
        expect(report.portfolios.U1111111.positions.map((row) => row.symbol)).toEqual([
            'AAPL',
            'AAPL  250117C00200000',
        ]);
        expect(report.portfolios.U2222222.positions).toHaveLength(1);
        expect(report.portfolios.U1111111.cashAUD).toBe(2000);
        expect(report.portfolios.U2222222.cashAUD).toBe(200);
        expect(report.positions).toHaveLength(3);
    });

    it('uses the latest EquitySummaryInBase row for IBKR NAV parts', () => {
        const nav = report.portfolios.U1111111.navComponents;
        expect(nav.stocks).toMatchObject({ value: 3000, source: 'flex-equity-summary', available: true });
        expect(nav.options).toMatchObject({ value: -750, source: 'flex-equity-summary' });
        expect(nav.cash).toMatchObject({ value: 2000, source: 'flex-equity-summary' });
        expect(nav.divAccrued).toMatchObject({ value: 50, source: 'flex-equity-summary' });
        expect(nav.interestAccrued).toMatchObject({ value: 10, source: 'flex-equity-summary' });
        expect(nav.nav).toBe(4310);
        expect(nav.stocks.value + nav.options.value + nav.cash.value + nav.divAccrued.value + nav.interestAccrued.value).toBe(4310);
    });

    it('keeps a combined IBKR view that sums both accounts', () => {
        expect(report.navComponents.nav).toBe(5310);
        expect(report.cashAUD).toBe(2200);
    });
});

describe('IBKR Flex computed NAV fallback', () => {
    const report = parseIBKRFlexXml(computedXml);

    it('computes stocks, options, and cash from positions and CashReport', () => {
        const nav = report.navComponents;
        expect(nav.stocks).toMatchObject({ value: 4000, source: 'computed-positions' });
        expect(nav.options).toMatchObject({ value: 1200, source: 'computed-positions' });
        expect(nav.cash).toMatchObject({ value: 200, source: 'computed-cash-report' });
        expect(nav.divAccrued).toMatchObject({ value: 0, available: false, source: 'unavailable' });
        expect(nav.interestAccrued).toMatchObject({ value: 0, available: false, source: 'unavailable' });
        expect(nav.nav).toBe(5400);
    });
});

describe('legacy report compatibility', () => {
    const legacy = normalizeReport({
        positions: [
            { symbol: 'CBA', assetCategory: 'STK', quantity: 10, positionValueAUD: 1000, markPrice: 100, currency: 'AUD' },
        ],
        cashAUD: 250,
        cashBalances: [{ currency: 'AUD', amount: 250, valueAUD: 250, fxRateToBase: 1 }],
        baseCurrency: 'AUD',
        reportDate: '20240101',
        rates: { AUD: 1 },
    });

    it('opens old reports as a single IBKR book', () => {
        expect(legacy.legacy).toBe(true);
        expect(legacy.ibkrAccountIds).toEqual(['IBKR']);
        const options = selectorOptions(legacy, null);
        expect(options.map((option) => option.id)).toEqual(['all', 'ibkr:IBKR', 'SUPER', 'JSE']);
        expect(options.find((option) => option.id === 'ibkr:IBKR').label).toBe('IBKR');
        const slice = selectSlice(legacy, null, 'ibkr:IBKR');
        expect(slice.positions).toHaveLength(1);
        expect(slice.cashAUD).toBe(250);
    });
});

describe('SUPER/JSE adaptor and selector slices', () => {
    const report = parseIBKRFlexXml(multiXml);
    const csv = `portfolio,symbol,description,quantity,markPrice,currency,positionValueAUD,cash
SUPER,VAS,Vanguard Australian Shares,100,95.5,AUD,9550,12500
JSE,NPN,Naspers,10,3200,ZAR,4500,2000`;
    const holdings = parseSuperJseCsv(csv);

    it('parses sheet-style CSV into SUPER and JSE books', () => {
        expect(holdings.portfolios.SUPER.cashAUD).toBe(12500);
        expect(holdings.portfolios.SUPER.positions[0].symbol).toBe('VAS');
        expect(holdings.portfolios.JSE.positions[0].positionValueAUD).toBe(4500);
    });

    it('filters dashboard analysis to the selected slice only', () => {
        const trading = buildAnalysis(selectSlice(report, holdings, 'ibkr:U1111111'));
        expect(trading.stocks.map((row) => row.symbol)).toEqual(['AAPL']);
        expect(trading.options).toHaveLength(1);
        const superBook = buildAnalysis(selectSlice(report, holdings, 'SUPER'));
        expect(superBook.stocks.map((row) => row.symbol)).toEqual(['VAS']);
        expect(superBook.options).toHaveLength(0);
        expect(superBook.cashAUD).toBe(12500);
        const all = buildAnalysis(selectSlice(report, holdings, ALL_ID));
        expect(all.stocks.map((row) => row.symbol).sort()).toEqual(['AAPL', 'BHP', 'VAS', 'NPN'].sort());
    });

    it('builds IBKR/SUPER/JSE NAV books with the specified parts', () => {
        const books = navBooks(report, holdings);
        expect(books.IBKR.navComponents.nav).toBe(5310);
        expect(books.SUPER.navComponents.stocks.value).toBe(9550);
        expect(books.SUPER.navComponents.cash.value).toBe(12500);
        expect(books.SUPER.navComponents.nav).toBe(22050);
        expect(books.SUPER.navComponents.options).toBeUndefined();
        expect(books.JSE.navComponents.nav).toBe(6500);
    });

    it('accepts JSON paste', () => {
        const parsed = parseSuperJseInput(JSON.stringify({
            portfolios: { SUPER: { cashAUD: 1, positions: [{ symbol: 'IOO', quantity: 2, markPrice: 10, positionValueAUD: 20 }] } },
        }));
        expect(parsed.portfolios.SUPER.positions[0].symbol).toBe('IOO');
        expect(parsed.portfolios.JSE.positions).toEqual([]);
    });
});
