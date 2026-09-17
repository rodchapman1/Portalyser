import PropTypes from 'prop-types';
import { Bar, BarChart, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney, formatMoneyExact, formatPct } from '../lib/format.js';

const NAV_COLORS = {
    stocks: '#3b82f6',
    options: '#a855f7',
    cash: '#22c55e',
    divAccrued: '#eab308',
    interestAccrued: '#f97316',
    other: '#6b7280',
};

const NAV_LABELS = {
    stocks: 'Stocks',
    options: 'Options',
    cash: 'Cash',
    divAccrued: 'Div accrued',
    interestAccrued: 'Interest accrued',
    other: 'Other',
};

const SOURCE_LABELS = {
    'flex-equity-summary': 'IBKR Flex EquitySummaryInBase',
    'flex-open-dividend-accruals': 'IBKR Flex OpenDividendAccruals',
    'flex-interest-accruals': 'IBKR Flex InterestAccruals',
    'computed-positions': 'Sum of parsed positions',
    'computed-cash-report': 'Sum of CashReport rows',
    unavailable: 'Not in this Flex file — shown as 0',
    'not-applicable': 'Not used for this book',
    'nav-remainder': 'NAV total minus the displayed parts',
};

function partsFor(navComponents, keys) {
    return keys
        .filter((key) => navComponents?.[key])
        .map((key) => ({
            key,
            name: NAV_LABELS[key],
            value: navComponents[key].value,
            available: navComponents[key].available,
            source: navComponents[key].source,
            color: NAV_COLORS[key],
        }));
}

function NavCard({ title, book, keys, emptyHint }) {
    const nav = book?.navComponents;
    const parts = partsFor(nav, keys);
    const hasHoldings = (book?.positions || []).length > 0 || Number(book?.cashAUD) !== 0 || Number(nav?.nav) !== 0;
    const chartData = parts.filter((part) => Math.abs(part.value) > 0.004);
    const displayChart = chartData.length > 0 ? chartData : parts.map((part) => ({ ...part, value: 0 }));

    return (
        <section className="rounded-2xl border border-gray-700 bg-gray-900 p-5">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-lg font-semibold text-white">{title}</h3>
                    <p className="text-sm text-gray-400">{book?.label || title}</p>
                </div>
                <div className="text-right">
                    <div className="text-xs uppercase tracking-wide text-gray-500">NAV</div>
                    <div className="text-2xl font-semibold text-white">{formatMoney(nav?.nav || 0)}</div>
                </div>
            </div>
            {!hasHoldings && (
                <p className="mt-3 text-sm text-amber-200/90">{emptyHint}</p>
            )}
            <div className="mt-4 h-16">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={[{ name: title, ...Object.fromEntries(parts.map((part) => [part.key, Math.abs(part.value)])) }]} stackOffset="sign">
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" hide />
                        <Tooltip
                            formatter={(value, key) => [formatMoneyExact(value), NAV_LABELS[key] || key]}
                            contentStyle={{ background: '#1f2937', border: '1px solid #374151' }}
                        />
                        {parts.map((part) => (
                            <Bar key={part.key} dataKey={part.key} stackId="nav" fill={part.color} isAnimationActive={false} />
                        ))}
                    </BarChart>
                </ResponsiveContainer>
            </div>
            <ul className="mt-4 space-y-2">
                {parts.map((part) => (
                    <li key={part.key} className="flex items-start justify-between gap-3 text-sm">
                        <div className="flex items-start gap-2">
                            <span className="mt-1 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: part.color }} />
                            <div>
                                <div className="text-gray-100">{part.name}</div>
                                <div className="text-xs text-gray-500">
                                    {part.available ? SOURCE_LABELS[part.source] || part.source : SOURCE_LABELS[part.source] || 'Unavailable — 0'}
                                </div>
                            </div>
                        </div>
                        <div className="text-right text-gray-200">
                            {formatMoneyExact(part.value)}
                            <div className="text-xs text-gray-500">
                                {nav?.nav ? formatPct((part.value / nav.nav) * 100) : '—'}
                            </div>
                        </div>
                    </li>
                ))}
                <li className="flex justify-between border-t border-gray-700 pt-2 text-sm font-medium text-white">
                    <span>Sum to NAV</span>
                    <span>{formatMoneyExact(nav?.nav || 0)}</span>
                </li>
            </ul>
            {displayChart.length === 0 && <p className="sr-only">No chartable NAV parts</p>}
        </section>
    );
}

NavCard.propTypes = {
    title: PropTypes.string.isRequired,
    book: PropTypes.object,
    keys: PropTypes.array.isRequired,
    emptyHint: PropTypes.string,
};

export function NavSummaryView({ books }) {
    return (
        <div className="space-y-6">
            <p className="text-sm text-gray-400">
                Each book is a graphical NAV breakdown. IBKR uses Flex positions plus cash, dividend accruals, and interest accruals when those fields exist in the XML; missing Flex fields are plotted as 0 and labelled. SUPER and JSE are stocks + cash only from the sheet export / JSON template.
            </p>
            <div className="grid gap-5 xl:grid-cols-3">
                <NavCard
                    title="IBKR"
                    book={books.IBKR}
                    keys={['stocks', 'options', 'cash', 'divAccrued', 'interestAccrued', 'other']}
                    emptyHint="Upload a Flex XML to populate IBKR NAV."
                />
                <NavCard
                    title="SUPER"
                    book={books.SUPER}
                    keys={['stocks', 'cash']}
                    emptyHint="Paste or upload SUPER holdings from the Hermes sheet export."
                />
                <NavCard
                    title="JSE"
                    book={books.JSE}
                    keys={['stocks', 'cash']}
                    emptyHint="Paste or upload JSE holdings from the Hermes sheet export."
                />
            </div>
        </div>
    );
}

NavSummaryView.propTypes = { books: PropTypes.object.isRequired };

const PIE_COLORS = ['#38bdf8', '#818cf8', '#34d399', '#fbbf24', '#f472b6', '#fb7185', '#a3e635', '#22d3ee'];

export function AllocationChart({ title, data }) {
    const slices = (data || []).filter((item) => item.value > 0);
    return (
        <div className="rounded-2xl border border-gray-700 bg-gray-900 p-4">
            <h3 className="mb-2 font-medium text-white">{title}</h3>
            {slices.length === 0 ? (
                <p className="text-sm text-gray-500">No allocation in this slice.</p>
            ) : (
                <div className="h-64">
                    <ResponsiveContainer>
                        <PieChart>
                            <Pie data={slices} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                                {slices.map((entry, index) => (
                                    <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value) => formatMoney(value)} contentStyle={{ background: '#1f2937', border: '1px solid #374151' }} />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
}

AllocationChart.propTypes = {
    title: PropTypes.string.isRequired,
    data: PropTypes.array,
};
