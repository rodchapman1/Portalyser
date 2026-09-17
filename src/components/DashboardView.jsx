import PropTypes from 'prop-types';
import { formatMoney, formatMoneyExact, formatPct } from '../lib/format.js';
import { AllocationChart } from './NavSummaryView.jsx';

function PositionsTable({ title, rows }) {
    if (!rows?.length) {
        return (
            <div className="rounded-2xl border border-gray-700 bg-gray-900 p-4">
                <h3 className="font-medium text-white">{title}</h3>
                <p className="mt-2 text-sm text-gray-500">None in this slice.</p>
            </div>
        );
    }
    return (
        <div className="overflow-x-auto rounded-2xl border border-gray-700 bg-gray-900 p-4">
            <h3 className="mb-3 font-medium text-white">{title}</h3>
            <table className="min-w-full text-left text-sm">
                <thead className="text-gray-400">
                    <tr>
                        <th className="py-2 pr-4">Symbol</th>
                        <th className="py-2 pr-4">Description</th>
                        <th className="py-2 pr-4 text-right">Qty</th>
                        <th className="py-2 pr-4 text-right">Mark</th>
                        <th className="py-2 text-right">Value</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={`${row.accountId || ''}-${row.symbol}-${row.expiry || ''}`} className="border-t border-gray-800 text-gray-200">
                            <td className="py-2 pr-4 font-medium">{row.symbol}</td>
                            <td className="py-2 pr-4 text-gray-400">{row.description}</td>
                            <td className="py-2 pr-4 text-right">{row.quantity}</td>
                            <td className="py-2 pr-4 text-right">{Number(row.markPrice).toFixed?.(2) ?? row.markPrice}</td>
                            <td className="py-2 text-right">{formatMoneyExact(row.positionValueAUD)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

PositionsTable.propTypes = {
    title: PropTypes.string.isRequired,
    rows: PropTypes.array,
};

export function DashboardView({ analysis, sliceLabel }) {
    if (!analysis) return <p className="text-gray-400">No data for this portfolio slice.</p>;
    return (
        <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-gray-700 bg-gray-900 p-4">
                    <div className="text-xs uppercase text-gray-500">Slice</div>
                    <div className="text-lg text-white">{sliceLabel || analysis.label}</div>
                </div>
                <div className="rounded-2xl border border-gray-700 bg-gray-900 p-4">
                    <div className="text-xs uppercase text-gray-500">Total value</div>
                    <div className="text-lg text-white">{formatMoney(analysis.totalPortfolioValue)}</div>
                </div>
                <div className="rounded-2xl border border-gray-700 bg-gray-900 p-4">
                    <div className="text-xs uppercase text-gray-500">Cash</div>
                    <div className="text-lg text-white">{formatMoney(analysis.cashAUD)}</div>
                </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
                <AllocationChart title="Long allocation" data={analysis.longAllocation} />
                <AllocationChart title="Short allocation" data={analysis.shortAllocation} />
            </div>
            <PositionsTable title="Stocks" rows={analysis.stocks} />
            <PositionsTable title="Options" rows={analysis.options} />
            <div className="rounded-2xl border border-gray-700 bg-gray-900 p-4">
                <h3 className="mb-3 font-medium text-white">Cash balances</h3>
                <ul className="space-y-1 text-sm text-gray-200">
                    {(analysis.cashBalances || []).map((cash) => (
                        <li key={`${cash.accountId || ''}-${cash.currency}`} className="flex justify-between">
                            <span>{cash.currency}{cash.accountId ? ` · ${cash.accountId}` : ''}</span>
                            <span>{formatMoneyExact(cash.valueAUD)} ({formatPct(analysis.totalPortfolioValue ? (cash.valueAUD / analysis.totalPortfolioValue) * 100 : 0)})</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

DashboardView.propTypes = {
    analysis: PropTypes.object,
    sliceLabel: PropTypes.string,
};
