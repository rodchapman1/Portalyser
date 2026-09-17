import { parseNumber } from './numbers.js';

function daysUntil(expiry, reportDate) {
    if (!expiry) return null;
    const expiryText = String(expiry);
    const reportText = reportDate ? String(reportDate).split(';')[0] : '';
    const expiryIso = /^\d{8}$/.test(expiryText)
        ? `${expiryText.slice(0, 4)}-${expiryText.slice(4, 6)}-${expiryText.slice(6, 8)}`
        : expiryText;
    const reportIso = /^\d{8}$/.test(reportText)
        ? `${reportText.slice(0, 4)}-${reportText.slice(4, 6)}-${reportText.slice(6, 8)}`
        : reportText;
    const expiryDate = new Date(expiryIso);
    const fromDate = reportIso ? new Date(reportIso) : new Date();
    if (Number.isNaN(expiryDate.getTime()) || Number.isNaN(fromDate.getTime())) return null;
    return Math.max(1, Math.round((expiryDate - fromDate) / 86400000));
}

export function calculateAnnualizedReturn(option, stocks, reportDate) {
    if (!option || option.assetCategory !== 'OPT') return null;
    const underlying = stocks.find((stock) => stock.symbol === option.underlying);
    const underlyingPrice = parseNumber(underlying?.markPrice, NaN);
    const optionPrice = parseNumber(option.markPrice, NaN);
    const multiplier = parseNumber(option.multiplier, 100);
    const quantity = Math.abs(parseNumber(option.quantity, 0));
    const strike = parseNumber(option.strike, NaN);
    const days = daysUntil(option.expiry, reportDate);
    if (!Number.isFinite(underlyingPrice) || underlyingPrice <= 0) return null;
    if (!Number.isFinite(optionPrice) || !Number.isFinite(strike) || !days) return null;

    const years = days / 365;
    const notional = underlyingPrice * multiplier * (quantity || 1);
    const premium = Math.abs(optionPrice) * multiplier * (quantity || 1);
    const premiumPct = notional === 0 ? 0 : premium / notional;
    const annualizedPremium = years > 0 ? (premiumPct / years) * 100 : 0;

    let intrinsicPct = 0;
    if (option.type === 'Call') {
        intrinsicPct = (strike - underlyingPrice) / underlyingPrice;
    } else if (option.type === 'Put') {
        intrinsicPct = (underlyingPrice - strike) / underlyingPrice;
    }
    const annualizedToStrike = years > 0 ? ((intrinsicPct + premiumPct) / years) * 100 : 0;

    const breakeven = option.type === 'Put'
        ? strike - Math.abs(optionPrice)
        : strike + Math.abs(optionPrice);
    const breakevenPct = (breakeven - underlyingPrice) / underlyingPrice;
    const annualizedBreakeven = years > 0 ? ((breakevenPct + premiumPct) / years) * 100 : 0;

    return {
        toStrike: Number.isFinite(annualizedToStrike) ? annualizedToStrike : null,
        premium: Number.isFinite(annualizedPremium) ? annualizedPremium : null,
        toBreakeven: Number.isFinite(annualizedBreakeven) ? annualizedBreakeven : null,
    };
}

export function applyOptionMetrics(positions, reportDate) {
    const stocks = positions.filter((position) => position.assetCategory === 'STK');
    const extraUnderlyings = [];
    const owned = new Set(stocks.map((stock) => stock.symbol));
    positions.filter((position) => position.assetCategory === 'OPT').forEach((option) => {
        if (option.underlying && !owned.has(option.underlying)) {
            extraUnderlyings.push({
                symbol: option.underlying,
                description: `${option.underlying} (Underlying)`,
                markPrice: null,
                currency: option.currency,
                fxRateToBase: option.fxRateToBase,
                assetCategory: 'STK',
                quantity: 0,
            });
            owned.add(option.underlying);
        }
    });
    const allStocks = [...stocks, ...extraUnderlyings];
    return positions.map((position) => {
        if (position.assetCategory !== 'OPT') return position;
        const calculated = calculateAnnualizedReturn(position, allStocks, reportDate);
        if (!calculated) return position;
        return {
            ...position,
            annualizedToStrike: calculated.toStrike,
            annualizedPremium: calculated.premium,
            annualizedBreakeven: calculated.toBreakeven,
        };
    });
}

export function createAllocation(positions, cashItems) {
    const items = [];
    (positions || []).forEach((position) => {
        const value = Math.abs(parseNumber(position.positionValueAUD, 0));
        if (value > 0) {
            items.push({
                name: position.symbol || position.description || 'Position',
                value,
            });
        }
    });
    (cashItems || []).forEach((cash) => {
        const value = Math.abs(parseNumber(cash.valueAUD, 0));
        if (value > 0) {
            items.push({
                name: `Cash ${cash.currency || ''}`.trim(),
                value,
            });
        }
    });
    return items;
}

export function buildAnalysis(slice) {
    if (!slice || !Array.isArray(slice.positions)) return null;

    const positions = slice.positions;
    const cashAUD = parseNumber(slice.cashAUD, 0);
    const baseCurrency = slice.baseCurrency || 'AUD';
    let displayCashBalances = Array.isArray(slice.cashBalances) ? slice.cashBalances : [];
    if (displayCashBalances.length === 0 && cashAUD !== 0) {
        displayCashBalances = [{
            currency: baseCurrency,
            amount: cashAUD,
            valueAUD: cashAUD,
            fxRateToBase: 1,
        }];
    }

    const stocks = positions.filter((position) => position.assetCategory === 'STK');
    const options = positions.filter((position) => position.assetCategory === 'OPT');
    const longPositions = positions.filter((position) => parseNumber(position.quantity, 0) > 0);
    const shortPositions = positions.filter((position) => parseNumber(position.quantity, 0) < 0);
    const longValue = longPositions.reduce((sum, position) => sum + parseNumber(position.positionValueAUD, 0), 0);
    const shortValue = shortPositions.reduce((sum, position) => sum + Math.abs(parseNumber(position.positionValueAUD, 0)), 0);
    const positiveCashItems = displayCashBalances.filter((cash) => parseNumber(cash.valueAUD, 0) > 0);
    const negativeCashItems = displayCashBalances.filter((cash) => parseNumber(cash.valueAUD, 0) < 0);
    const positiveCashValue = positiveCashItems.reduce((sum, cash) => sum + parseNumber(cash.valueAUD, 0), 0);
    const negativeCashValue = negativeCashItems.reduce((sum, cash) => sum + parseNumber(cash.valueAUD, 0), 0);

    return {
        stocks,
        options,
        cashBalances: displayCashBalances,
        cashAUD,
        baseCurrency,
        totalPortfolioValue: longValue - shortValue + cashAUD,
        longValue: longValue + positiveCashValue,
        shortValue: shortValue + Math.abs(negativeCashValue),
        longAllocation: createAllocation(longPositions, positiveCashItems),
        shortAllocation: createAllocation(shortPositions, negativeCashItems),
        label: slice.label || 'All',
        kind: slice.kind || 'all',
    };
}

export function buildWhatIfAnalysis(analysis, allStocks, whatIfChange) {
    if (!analysis) return null;
    const groupedByUnderlying = {};

    allStocks.forEach((stock) => {
        if (!groupedByUnderlying[stock.symbol]) {
            groupedByUnderlying[stock.symbol] = { stock: null, options: [] };
        }
        groupedByUnderlying[stock.symbol].stock = { ...stock };
    });

    analysis.options.forEach((option) => {
        const key = option.underlying || option.symbol;
        if (!groupedByUnderlying[key]) {
            groupedByUnderlying[key] = { stock: null, options: [] };
        }
        groupedByUnderlying[key].options.push({ ...option });
    });

    let totalImpact = 0;
    const results = Object.entries(groupedByUnderlying).map(([symbol, group]) => {
        let stockImpact = 0;
        if (group.stock) {
            const currentMarkPrice = parseNumber(group.stock.markPrice, NaN);
            if (parseNumber(group.stock.quantity, 0) === 0) {
                group.stock.newPrice = group.stock.markPrice;
                group.stock.newValue = 0;
                group.stock.impact = 0;
            } else if (Number.isFinite(currentMarkPrice) && currentMarkPrice !== 0) {
                const newStockPrice = currentMarkPrice * (1 + whatIfChange / 100);
                const newStockValue = (parseNumber(group.stock.positionValueAUD, 0) / currentMarkPrice) * newStockPrice;
                stockImpact = newStockValue - parseNumber(group.stock.positionValueAUD, 0);
                group.stock.newPrice = newStockPrice;
                group.stock.newValue = newStockValue;
                group.stock.impact = stockImpact;
            } else {
                group.stock.newPrice = group.stock.markPrice;
                group.stock.newValue = group.stock.positionValueAUD;
                group.stock.impact = 0;
            }
        }

        let optionsImpact = 0;
        group.options.forEach((option) => {
            const underlyingStock = allStocks.find((stock) => stock.symbol === option.underlying);
            const underlyingMarkPrice = parseNumber(underlyingStock?.markPrice, NaN);
            if (!Number.isFinite(underlyingMarkPrice) || underlyingMarkPrice === 0) {
                option.newValue = option.positionValueAUD;
                option.impact = 0;
                return;
            }
            const newUnderlyingPrice = underlyingMarkPrice * (1 + whatIfChange / 100);
            let intrinsicValuePerShare = 0;
            if (option.type === 'Call' && newUnderlyingPrice > option.strike) {
                intrinsicValuePerShare = newUnderlyingPrice - option.strike;
            } else if (option.type === 'Put' && newUnderlyingPrice < option.strike) {
                intrinsicValuePerShare = option.strike - newUnderlyingPrice;
            }
            const newOptionValueAUD = intrinsicValuePerShare > 0
                ? intrinsicValuePerShare * parseNumber(option.multiplier, 1) * parseNumber(option.quantity, 0) * parseNumber(option.fxRateToBase, 1)
                : 0;
            option.newValue = newOptionValueAUD;
            option.impact = newOptionValueAUD - parseNumber(option.positionValueAUD, 0);
            optionsImpact += option.impact;
        });

        const subTotalImpact = stockImpact + optionsImpact;
        totalImpact += subTotalImpact;
        return {
            underlying: symbol,
            stock: group.stock,
            options: group.options,
            subTotalImpact,
        };
    });

    return { results, totalImpact, cash: analysis.cashAUD };
}

export function buildAllStocksList(positions, extraStockData = []) {
    const stocksFromReport = (positions || []).filter((position) => position.assetCategory === 'STK');
    const combinedStocks = [...stocksFromReport];
    const symbols = new Set(stocksFromReport.map((stock) => stock.symbol));
    extraStockData.forEach((extra) => {
        if (!symbols.has(extra.symbol)) {
            combinedStocks.push(extra);
            symbols.add(extra.symbol);
        }
    });
    (positions || []).filter((position) => position.assetCategory === 'OPT').forEach((option) => {
        if (option.underlying && !symbols.has(option.underlying)) {
            combinedStocks.push({
                symbol: option.underlying,
                description: `${option.underlying} (Underlying)`,
                markPrice: extraStockData.find((item) => item.symbol === option.underlying)?.markPrice ?? null,
                currency: option.currency,
                fxRateToBase: option.fxRateToBase,
                assetCategory: 'STK',
                quantity: 0,
                isExtra: true,
            });
            symbols.add(option.underlying);
        }
    });
    return combinedStocks;
}
