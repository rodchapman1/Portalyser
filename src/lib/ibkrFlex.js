import { applyOptionMetrics } from './analysis.js';
import { almostEqual, optionalNumber, parseNumber, roundMoney } from './numbers.js';

const SKIP_CASH_CURRENCIES = new Set(['BASE_SUMMARY', 'TWD']);
const SKIP_LEVELS = new Set(['LOT', 'LOTS']);
const EMPTY_ACCOUNT = new Set(['', 'ALL', 'All', 'N/A', 'NA']);

function attr(el, name) {
    if (!el || !el.getAttribute) return null;
    const value = el.getAttribute(name);
    if (value === null || value === undefined || value === '') return null;
    return value;
}

function firstAttr(el, names) {
    for (const name of names) {
        const value = attr(el, name);
        if (value !== null) return value;
    }
    return null;
}

function hasAttr(el, name) {
    return Boolean(el && el.hasAttribute && el.hasAttribute(name));
}

function numAttr(el, names, fallback = null) {
    const list = Array.isArray(names) ? names : [names];
    for (const name of list) {
        if (!hasAttr(el, name)) continue;
        const parsed = optionalNumber(el.getAttribute(name));
        if (parsed !== null) return parsed;
    }
    return fallback;
}

function closestStatement(el) {
    let node = el;
    while (node && node.tagName !== 'FlexStatement') {
        node = node.parentElement;
    }
    return node;
}

function resolveAccountId(el, fallback = 'IBKR') {
    const direct = firstAttr(el, ['accountId', 'clientAccountID', 'acctId']);
    if (direct && !EMPTY_ACCOUNT.has(direct)) return direct;
    const statement = closestStatement(el);
    const fromStatement = firstAttr(statement, ['accountId', 'clientAccountID']);
    if (fromStatement && !EMPTY_ACCOUNT.has(fromStatement)) return fromStatement;
    return fallback;
}

function resolveAlias(el) {
    return firstAttr(el, ['acctAlias', 'accountAlias', 'alias']) || null;
}

function parseRates(xmlDoc, baseCurrency) {
    const rates = { [baseCurrency]: 1 };
    xmlDoc.querySelectorAll('ConversionRate').forEach((rateEl) => {
        const from = attr(rateEl, 'fromCurrency');
        const rate = numAttr(rateEl, ['rate']);
        if (from && rate !== null) rates[from] = rate;
    });
    return rates;
}

function toBase(amount, currency, fxRate, rates, baseCurrency) {
    const value = parseNumber(amount, 0);
    if (currency === baseCurrency || !currency) return value;
    if (Number.isFinite(fxRate) && fxRate !== 0 && fxRate !== 1) return value * fxRate;
    const conversion = rates[currency];
    if (Number.isFinite(conversion)) return value * conversion;
    return value;
}

function isLotRow(el) {
    const level = (attr(el, 'levelOfDetail') || '').toUpperCase();
    return SKIP_LEVELS.has(level);
}

function parsePosition(el, rates, baseCurrency, statementAccountId) {
    if (isLotRow(el)) return null;
    const assetCategory = attr(el, 'assetCategory') || 'STK';
    const currency = attr(el, 'currency') || baseCurrency;
    const fxRateToBase = numAttr(el, ['fxRateToBase']) ?? rates[currency] ?? 1;
    const valueInOrig = numAttr(el, ['positionValue', 'value'], 0);
    const valueInBase = numAttr(el, ['positionValueInBase']) ?? (valueInOrig * fxRateToBase);
    const putCall = attr(el, 'putCall');
    return {
        accountId: resolveAccountId(el, statementAccountId),
        accountAlias: resolveAlias(el),
        symbol: attr(el, 'symbol') || '',
        description: attr(el, 'description') || '',
        assetCategory,
        quantity: numAttr(el, ['position', 'quantity'], 0),
        markPrice: numAttr(el, ['markPrice'], 0),
        positionValueAUD: valueInBase,
        currency,
        fxRateToBase,
        underlying: attr(el, 'underlyingSymbol'),
        expiry: attr(el, 'expiry'),
        strike: numAttr(el, ['strike']),
        type: putCall === 'P' ? 'Put' : (putCall === 'C' ? 'Call' : ''),
        multiplier: numAttr(el, ['multiplier'], 1),
        annualizedToStrike: null,
        annualizedPremium: null,
        annualizedBreakeven: null,
    };
}

function parseCashBalance(el, rates, baseCurrency, statementAccountId) {
    const currency = attr(el, 'currency');
    if (!currency || SKIP_CASH_CURRENCIES.has(currency)) return null;
    const amount = numAttr(el, ['endingCash', 'total', 'endingBalance', 'amount', 'value'], 0);
    const fxRateToBase = numAttr(el, ['fxRateToBase']) ?? rates[currency] ?? 1;
    return {
        accountId: resolveAccountId(el, statementAccountId),
        accountAlias: resolveAlias(el),
        currency,
        amount,
        valueAUD: amount * (currency === baseCurrency ? 1 : fxRateToBase),
        fxRateToBase: currency === baseCurrency ? 1 : fxRateToBase,
    };
}

function parseEquitySummaryRows(xmlDoc) {
    return Array.from(xmlDoc.querySelectorAll('EquitySummaryByReportDateInBase, EquitySummaryInBase > *')).map((el) => ({
        accountId: resolveAccountId(el),
        accountAlias: resolveAlias(el),
        reportDate: attr(el, 'reportDate') || '',
        currency: attr(el, 'currency'),
        cash: hasAttr(el, 'cash') ? numAttr(el, ['cash'], 0) : null,
        stock: hasAttr(el, 'stock') ? numAttr(el, ['stock'], 0) : null,
        options: hasAttr(el, 'options') ? numAttr(el, ['options'], 0) : null,
        dividendAccruals: hasAttr(el, 'dividendAccruals') ? numAttr(el, ['dividendAccruals'], 0) : null,
        interestAccruals: hasAttr(el, 'interestAccruals') ? numAttr(el, ['interestAccruals'], 0) : null,
        total: hasAttr(el, 'total') ? numAttr(el, ['total'], 0) : null,
    }));
}

function latestEquityByAccount(rows) {
    const latest = {};
    rows.forEach((row) => {
        const current = latest[row.accountId];
        if (!current || String(row.reportDate) >= String(current.reportDate)) {
            latest[row.accountId] = row;
        }
    });
    return latest;
}

function parseDividendAccruals(xmlDoc, rates, baseCurrency) {
    const totals = {};
    xmlDoc.querySelectorAll('OpenDividendAccrual').forEach((el) => {
        const accountId = resolveAccountId(el);
        const currency = attr(el, 'currency') || baseCurrency;
        const fx = numAttr(el, ['fxRateToBase']) ?? rates[currency] ?? 1;
        const net = numAttr(el, ['netAmount', 'grossAmount'], 0);
        totals[accountId] = (totals[accountId] || 0) + toBase(net, currency, fx, rates, baseCurrency);
    });
    return totals;
}

function parseInterestAccruals(xmlDoc, rates, baseCurrency) {
    const totals = {};
    xmlDoc.querySelectorAll('InterestAccrualsCurrency').forEach((el) => {
        const currency = attr(el, 'currency');
        if (!currency || SKIP_CASH_CURRENCIES.has(currency)) return;
        const accountId = resolveAccountId(el);
        const fx = numAttr(el, ['fxRateToBase']) ?? rates[currency] ?? 1;
        const ending = numAttr(el, ['endingAccrualBalance', 'interestAccrued'], 0);
        totals[accountId] = (totals[accountId] || 0) + toBase(ending, currency, fx, rates, baseCurrency);
    });
    return totals;
}

function navPart(value, source, available) {
    return {
        value: roundMoney(parseNumber(value, 0)),
        source,
        available: Boolean(available),
    };
}

export function buildNavComponents({
    positions = [],
    cashAUD = 0,
    equity = null,
    dividendAccrued = null,
    interestAccrued = null,
    includeOptions = true,
} = {}) {
    const stocksComputed = positions
        .filter((position) => position.assetCategory === 'STK')
        .reduce((sum, position) => sum + parseNumber(position.positionValueAUD, 0), 0);
    const optionsComputed = positions
        .filter((position) => position.assetCategory === 'OPT')
        .reduce((sum, position) => sum + parseNumber(position.positionValueAUD, 0), 0);

    const stocks = equity?.stock !== null && equity?.stock !== undefined
        ? navPart(equity.stock, 'flex-equity-summary', true)
        : navPart(stocksComputed, 'computed-positions', true);
    const options = includeOptions
        ? (equity?.options !== null && equity?.options !== undefined
            ? navPart(equity.options, 'flex-equity-summary', true)
            : navPart(optionsComputed, 'computed-positions', true))
        : navPart(0, 'not-applicable', false);
    const cash = equity?.cash !== null && equity?.cash !== undefined
        ? navPart(equity.cash, 'flex-equity-summary', true)
        : navPart(cashAUD, 'computed-cash-report', true);

    let divAccrued;
    if (equity?.dividendAccruals !== null && equity?.dividendAccruals !== undefined) {
        divAccrued = navPart(equity.dividendAccruals, 'flex-equity-summary', true);
    } else if (dividendAccrued !== null && dividendAccrued !== undefined) {
        divAccrued = navPart(dividendAccrued, 'flex-open-dividend-accruals', true);
    } else if (includeOptions) {
        divAccrued = navPart(0, 'unavailable', false);
    } else {
        divAccrued = navPart(0, 'not-applicable', false);
    }

    let interestAccruedPart;
    if (equity?.interestAccruals !== null && equity?.interestAccruals !== undefined) {
        interestAccruedPart = navPart(equity.interestAccruals, 'flex-equity-summary', true);
    } else if (interestAccrued !== null && interestAccrued !== undefined) {
        interestAccruedPart = navPart(interestAccrued, 'flex-interest-accruals', true);
    } else if (includeOptions) {
        interestAccruedPart = navPart(0, 'unavailable', false);
    } else {
        interestAccruedPart = navPart(0, 'not-applicable', false);
    }

    const parts = includeOptions
        ? { stocks, options, cash, divAccrued, interestAccrued: interestAccruedPart }
        : { stocks, cash };

    const partsSum = Object.values(parts).reduce((sum, part) => sum + part.value, 0);
    const nav = equity?.total !== null && equity?.total !== undefined
        ? roundMoney(equity.total)
        : roundMoney(partsSum);
    const remainder = roundMoney(nav - partsSum);
    if (!almostEqual(remainder, 0)) {
        parts.other = navPart(remainder, 'nav-remainder', true);
    }

    return { ...parts, nav };
}

function sumCash(balances) {
    return roundMoney(balances.reduce((sum, item) => sum + parseNumber(item.valueAUD, 0), 0));
}

export function parseIBKRFlexXml(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
        throw new Error('Invalid XML file.');
    }

    const statements = Array.from(xmlDoc.querySelectorAll('FlexStatement'));
    const firstStatement = statements[0] || xmlDoc.querySelector('FlexQueryResponse') || xmlDoc.documentElement;
    const baseCurrency = firstAttr(firstStatement, ['currency']) || 'AUD';
    const reportDate = (firstAttr(firstStatement, ['toDate', 'fromDate']) || new Date().toISOString().slice(0, 10).replace(/-/g, '')).split(';')[0];
    const rates = parseRates(xmlDoc, baseCurrency);

    const positions = Array.from(xmlDoc.getElementsByTagName('OpenPosition'))
        .map((el) => parsePosition(el, rates, baseCurrency, resolveAccountId(closestStatement(el) || el)))
        .filter(Boolean);

    const cashBalances = Array.from(xmlDoc.querySelectorAll('CashReportCurrency'))
        .map((el) => parseCashBalance(el, rates, baseCurrency, resolveAccountId(closestStatement(el) || el)))
        .filter(Boolean);

    const equityByAccount = latestEquityByAccount(parseEquitySummaryRows(xmlDoc));
    const dividendsByAccount = parseDividendAccruals(xmlDoc, rates, baseCurrency);
    const interestByAccount = parseInterestAccruals(xmlDoc, rates, baseCurrency);

    const accountIds = new Set([
        ...positions.map((position) => position.accountId),
        ...cashBalances.map((cash) => cash.accountId),
        ...Object.keys(equityByAccount),
        ...Object.keys(dividendsByAccount),
        ...Object.keys(interestByAccount),
    ]);
    const namedAccounts = [...accountIds].filter((id) => id && id !== 'IBKR');
    if (namedAccounts.length > 0) {
        namedAccounts.forEach((id) => accountIds.add(id));
        if (!positions.some((position) => position.accountId === 'IBKR')
            && !cashBalances.some((cash) => cash.accountId === 'IBKR')) {
            accountIds.delete('IBKR');
        }
    }
    if (accountIds.size === 0) accountIds.add('IBKR');

    const aliasByAccount = {};
    [...positions, ...cashBalances].forEach((row) => {
        if (row.accountId && row.accountAlias) aliasByAccount[row.accountId] = row.accountAlias;
    });
    statements.forEach((statement) => {
        const id = resolveAccountId(statement);
        const alias = resolveAlias(statement);
        if (alias) aliasByAccount[id] = alias;
    });

    const portfolios = {};
    accountIds.forEach((accountId) => {
        const accountPositions = applyOptionMetrics(
            positions.filter((position) => position.accountId === accountId),
            reportDate,
        );
        const accountCash = cashBalances.filter((cash) => cash.accountId === accountId);
        let cashAUD = sumCash(accountCash);
        const equity = equityByAccount[accountId] || null;
        if (accountCash.length === 0 && equity?.cash != null) {
            cashAUD = roundMoney(equity.cash);
        } else if (accountCash.length === 0 && equity?.total != null) {
            const positionValue = accountPositions
                .filter((position) => position.assetCategory !== 'CASH')
                .reduce((sum, position) => sum + parseNumber(position.positionValueAUD, 0), 0);
            cashAUD = roundMoney(equity.total - positionValue);
        }
        const displayCash = accountCash.length > 0
            ? accountCash
            : [{ currency: baseCurrency, amount: cashAUD, valueAUD: cashAUD, fxRateToBase: 1, accountId }];
        const alias = aliasByAccount[accountId];
        const label = accountId === 'IBKR'
            ? 'IBKR'
            : (alias ? `IBKR ${accountId} (${alias})` : `IBKR ${accountId}`);
        portfolios[accountId] = {
            id: accountId,
            label,
            kind: 'ibkr',
            accountId,
            accountAlias: alias || null,
            positions: accountPositions,
            cashAUD,
            cashBalances: displayCash,
            navComponents: buildNavComponents({
                positions: accountPositions,
                cashAUD,
                equity,
                dividendAccrued: Object.prototype.hasOwnProperty.call(dividendsByAccount, accountId)
                    ? dividendsByAccount[accountId]
                    : null,
                interestAccrued: Object.prototype.hasOwnProperty.call(interestByAccount, accountId)
                    ? interestByAccount[accountId]
                    : null,
                includeOptions: true,
            }),
        };
    });

    const combinedPositions = applyOptionMetrics(positions, reportDate);
    const combinedCash = cashBalances.length > 0
        ? cashBalances
        : Object.values(portfolios).flatMap((book) => book.cashBalances);
    const combinedCashAUD = combinedCash.length > 0
        ? sumCash(combinedCash.filter((cash, index, list) => (
            list.findIndex((item) => item.accountId === cash.accountId && item.currency === cash.currency) === index
        )))
        : Object.values(portfolios).reduce((sum, book) => sum + parseNumber(book.cashAUD, 0), 0);

    const combinedEquity = Object.values(equityByAccount).reduce((acc, row) => {
        if (!acc) {
            return { ...row, accountId: 'ALL' };
        }
        return {
            accountId: 'ALL',
            cash: (acc.cash ?? 0) + (row.cash ?? 0),
            stock: (acc.stock ?? 0) + (row.stock ?? 0),
            options: (acc.options ?? 0) + (row.options ?? 0),
            dividendAccruals: (acc.dividendAccruals ?? 0) + (row.dividendAccruals ?? 0),
            interestAccruals: (acc.interestAccruals ?? 0) + (row.interestAccruals ?? 0),
            total: (acc.total ?? 0) + (row.total ?? 0),
        };
    }, null);

    const combinedDiv = Object.keys(dividendsByAccount).length
        ? Object.values(dividendsByAccount).reduce((sum, value) => sum + value, 0)
        : null;
    const combinedInt = Object.keys(interestByAccount).length
        ? Object.values(interestByAccount).reduce((sum, value) => sum + value, 0)
        : null;

    const ibkrIds = Object.keys(portfolios);
    const combinedNav = buildNavComponents({
        positions: combinedPositions,
        cashAUD: combinedCashAUD,
        equity: combinedEquity && (combinedEquity.stock != null || combinedEquity.cash != null)
            ? combinedEquity
            : null,
        dividendAccrued: combinedDiv,
        interestAccrued: combinedInt,
        includeOptions: true,
    });

    return {
        schemaVersion: 2,
        source: 'ibkr-flex',
        reportDate,
        baseCurrency,
        rates,
        positions: combinedPositions,
        cashAUD: combinedCashAUD,
        cashBalances: combinedCash,
        navComponents: combinedNav,
        portfolios,
        ibkrAccountIds: ibkrIds,
    };
}
