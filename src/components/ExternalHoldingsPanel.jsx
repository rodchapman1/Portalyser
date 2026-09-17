import PropTypes from 'prop-types';
import { SUPER_JSE_SHEET } from '../lib/superJse.js';

export function ExternalHoldingsPanel({ holdings, onTextImport, error }) {
    return (
        <details className="mt-3 rounded-xl border border-gray-700 bg-gray-900/50 px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-gray-200">
                SUPER / JSE holdings (Google Sheet export, CSV, or JSON)
            </summary>
            <p className="mt-2 text-sm text-gray-400">
                Hermes sheet{' '}
                <a className="text-sky-300 hover:underline" href={SUPER_JSE_SHEET.url} target="_blank" rel="noreferrer">
                    {SUPER_JSE_SHEET.title}
                </a>
                {' '}is not loaded live (no OAuth/service account). Paste a CSV/JSON export, upload a file, or edit{' '}
                <code className="text-gray-300">public/super-jse-holdings.json</code>. Tabs in the sheet:{' '}
                {SUPER_JSE_SHEET.tabs.join(', ')}.
            </p>
            <p className="mt-1 text-xs text-gray-500">
                CSV columns: portfolio, symbol, description, quantity, markPrice, currency, positionValueAUD, cash.
                Use portfolio=SUPER or JSE. A CASH symbol row or cash column sets book cash.
            </p>
            <div className="mt-3 flex flex-col gap-3 lg:flex-row">
                <textarea
                    className="min-h-28 flex-1 rounded-lg border border-gray-700 bg-gray-950 p-2 text-xs text-gray-200"
                    placeholder={'portfolio,symbol,quantity,markPrice,currency,positionValueAUD,cash\nSUPER,VAS,100,95.5,AUD,9550,12500\nJSE,NPN,10,3200,ZAR,4500,2000'}
                    onBlur={(event) => {
                        if (event.target.value.trim()) onTextImport(event.target.value);
                    }}
                />
                <div className="flex flex-col gap-2">
                    <label className="inline-flex cursor-pointer items-center rounded-lg border border-gray-600 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800">
                        Upload CSV/JSON
                        <input
                            type="file"
                            accept=".csv,.json,text/csv,application/json"
                            className="hidden"
                            onChange={async (event) => {
                                const file = event.target.files?.[0];
                                if (!file) return;
                                onTextImport(await file.text());
                                event.target.value = '';
                            }}
                        />
                    </label>
                    <p className="text-xs text-gray-500">
                        Loaded source: {holdings?.source || 'none'}
                        {holdings?.asOf ? ` · as of ${holdings.asOf}` : ''}
                    </p>
                    {error && <p className="text-xs text-red-300">{error}</p>}
                </div>
            </div>
        </details>
    );
}

ExternalHoldingsPanel.propTypes = {
    holdings: PropTypes.object,
    onTextImport: PropTypes.func.isRequired,
    error: PropTypes.string,
};
