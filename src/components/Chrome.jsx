import PropTypes from 'prop-types';

export function LoadingSpinner({ text = 'Loading...' }) {
    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="text-center">
                <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-gray-600 border-t-sky-400" />
                <p className="mt-4 text-gray-400">{text}</p>
            </div>
        </div>
    );
}

LoadingSpinner.propTypes = { text: PropTypes.string };

export function ErrorMessage({ message }) {
    if (!message) return null;
    return (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-3 text-red-200">
            {message}
        </div>
    );
}

ErrorMessage.propTypes = { message: PropTypes.string };

export function TabButton({ text, id, activeTab, setActiveTab }) {
    const active = activeTab === id;
    return (
        <button
            type="button"
            onClick={() => setActiveTab(id)}
            className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium ${
                active
                    ? 'border-sky-400 text-sky-300'
                    : 'border-transparent text-gray-400 hover:border-gray-600 hover:text-gray-200'
            }`}
        >
            {text}
        </button>
    );
}

TabButton.propTypes = {
    text: PropTypes.string.isRequired,
    id: PropTypes.string.isRequired,
    activeTab: PropTypes.string.isRequired,
    setActiveTab: PropTypes.func.isRequired,
};
