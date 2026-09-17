import PropTypes from 'prop-types';
import { formatMoneyExact, formatPct } from '../lib/format.js';

export function WhatIfView({ whatIfAnalysis, change, setChange, originalValue }) {
    if (!whatIfAnalysis) return <p className="text-gray-400">No data for this portfolio slice.</p>;
    const projected = (originalValue || 0) + (whatIfAnalysis.totalImpact || 0);
    return (
        <div className="space-y-6">
            <div className="rounded-2xl border border-gray-700 bg-gray-900 p-4">
                <label className="text-sm text-gray-300">
                    Underlying price change: <span className="font-medium text-white">{change}%</span>
                </label>
                <input
                    type="range"
                    min="-50"
                    max="50"
                    step="1"
                    value={change}
                    onChange={(event) => setChange(Number(event.target.value))}
                    className="mt-3 w-full"
                />
                <div className="mt-3 grid gap-3 sm:grid-cols-3 text-sm">
                    <div>Original: {formatMoneyExact(originalValue)}</div>
                    <div>Impact: {formatMoneyExact(whatIfAnalysis.totalImpact)}</div>
                    <div>Projected: {formatMoneyExact(projected)}</div>
                </div>
                <p className="mt-2 text-xs text-gray-500">Cash is unchanged in this shock ({formatMoneyExact(whatIfAnalysis.cash)}).</p>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-gray-700 bg-gray-900 p-4">
                <table className="min-w-full text-left text-sm">
                    <thead className="text-gray-400">
                        <tr>
                            <th className="py-2 pr-4">Underlying</th>
                            <th className="py-2 pr-4 text-right">Stock impact</th>
                            <th className="py-2 pr-4 text-right">Options impact</th>
                            <th className="py-2 text-right">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        {whatIfAnalysis.results.map((row) => (
                            <tr key={row.underlying} className="border-t border-gray-800 text-gray-200">
                                <td className="py-2 pr-4">{row.underlying}</td>
                                <td className="py-2 pr-4 text-right">{formatMoneyExact(row.stock?.impact || 0)}</td>
                                <td className="py-2 pr-4 text-right">{formatMoneyExact(row.options.reduce((sum, option) => sum + (option.impact || 0), 0))}</td>
                                <td className="py-2 text-right">{formatMoneyExact(row.subTotalImpact)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

WhatIfView.propTypes = {
    whatIfAnalysis: PropTypes.object,
    change: PropTypes.number.isRequired,
    setChange: PropTypes.func.isRequired,
    originalValue: PropTypes.number,
};

export function OptionsAnalysisView({ analysis, stockTechnicals }) {
    if (!analysis) return <p className="text-gray-400">No data for this portfolio slice.</p>;
    if (!analysis.options?.length) {
        return <p className="text-gray-400">No options in the selected slice. SUPER and JSE are stocks + cash only.</p>;
    }
    return (
        <div className="overflow-x-auto rounded-2xl border border-gray-700 bg-gray-900 p-4">
            <table className="min-w-full text-left text-sm">
                <thead className="text-gray-400">
                    <tr>
                        <th className="py-2 pr-3">Symbol</th>
                        <th className="py-2 pr-3">Type</th>
                        <th className="py-2 pr-3">Expiry</th>
                        <th className="py-2 pr-3 text-right">Strike</th>
                        <th className="py-2 pr-3 text-right">Qty</th>
                        <th className="py-2 pr-3 text-right">Ann. premium</th>
                        <th className="py-2 pr-3 text-right">Ann. to strike</th>
                        <th className="py-2 pr-3 text-right">Ann. breakeven</th>
                        <th className="py-2 text-right">Vol (indicative)</th>
                    </tr>
                </thead>
                <tbody>
                    {analysis.options.map((option) => (
                        <tr key={`${option.symbol}-${option.expiry}-${option.strike}`} className="border-t border-gray-800 text-gray-200">
                            <td className="py-2 pr-3">{option.symbol}</td>
                            <td className="py-2 pr-3">{option.type}</td>
                            <td className="py-2 pr-3">{option.expiry}</td>
                            <td className="py-2 pr-3 text-right">{option.strike}</td>
                            <td className="py-2 pr-3 text-right">{option.quantity}</td>
                            <td className="py-2 pr-3 text-right">{option.annualizedPremium != null ? formatPct(option.annualizedPremium) : '—'}</td>
                            <td className="py-2 pr-3 text-right">{option.annualizedToStrike != null ? formatPct(option.annualizedToStrike) : '—'}</td>
                            <td className="py-2 pr-3 text-right">{option.annualizedBreakeven != null ? formatPct(option.annualizedBreakeven) : '—'}</td>
                            <td className="py-2 text-right">{stockTechnicals?.[option.underlying]?.volatility ?? '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

OptionsAnalysisView.propTypes = {
    analysis: PropTypes.object,
    stockTechnicals: PropTypes.object,
};
