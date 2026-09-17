import PropTypes from 'prop-types';
import { formatDateKey } from '../lib/format.js';
import { FileUploadControl } from './AuthAndUpload.jsx';

export function Header({
    user,
    onSignOut,
    savedReports,
    selectedDate,
    onDateChange,
    onNewUpload,
    onLoadSample,
}) {
    return (
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <h1 className="text-2xl font-semibold text-white">Portalyser</h1>
                <p className="text-sm text-gray-400">Multi-portfolio IBKR / SUPER / JSE analysis</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
                {savedReports?.length > 0 && (
                    <select
                        value={selectedDate}
                        onChange={(event) => onDateChange(event.target.value)}
                        className="rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-100"
                    >
                        {savedReports.map((date) => (
                            <option key={date} value={date}>
                                {formatDateKey(date)}
                            </option>
                        ))}
                    </select>
                )}
                <FileUploadControl onFileSelected={onNewUpload} label="Upload Flex XML" />
                {onLoadSample && (
                    <button type="button" onClick={onLoadSample} className="text-sm text-sky-300 hover:text-sky-200">
                        Sample XML
                    </button>
                )}
                <button type="button" onClick={onSignOut} className="text-sm text-gray-400 hover:text-white">
                    Sign out{user?.email ? ` (${user.email})` : ''}
                </button>
            </div>
        </header>
    );
}

Header.propTypes = {
    user: PropTypes.object,
    onSignOut: PropTypes.func,
    savedReports: PropTypes.array,
    selectedDate: PropTypes.string,
    onDateChange: PropTypes.func,
    onNewUpload: PropTypes.func,
    onLoadSample: PropTypes.func,
};

export function PortfolioSelector({ options, selectedId, onChange }) {
    return (
        <div className="mt-4 rounded-xl border border-gray-700 bg-gray-900/70 px-4 py-3">
            <label className="block text-xs font-medium uppercase tracking-wide text-gray-400">
                Portfolio
            </label>
            <select
                value={selectedId}
                onChange={(event) => onChange(event.target.value)}
                className="mt-1 w-full max-w-md rounded-lg border border-gray-600 bg-gray-950 px-3 py-2 text-gray-100"
            >
                {options.map((option) => (
                    <option key={option.id} value={option.id}>
                        {option.label}{option.empty ? ' (no holdings yet)' : ''}
                    </option>
                ))}
            </select>
            <p className="mt-2 text-xs text-gray-500">
                Dashboard, What-If, and Options Analysis use this slice only. The NAV tab always shows IBKR, SUPER, and JSE as separate books.
            </p>
        </div>
    );
}

PortfolioSelector.propTypes = {
    options: PropTypes.array.isRequired,
    selectedId: PropTypes.string.isRequired,
    onChange: PropTypes.func.isRequired,
};
