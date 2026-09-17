import PropTypes from 'prop-types';

export function AuthScreen({ onGoogleSignIn, onAnonymousSignIn, isLoading }) {
    return (
        <div className="min-h-screen flex items-center justify-center p-6">
            <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-8 shadow-xl">
                <h1 className="text-2xl font-semibold text-white">Portalyser</h1>
                <p className="mt-2 text-gray-400">
                    Sign in to load dated IBKR Flex reports and multi-portfolio NAV views.
                </p>
                <div className="mt-6 space-y-3">
                    <button
                        type="button"
                        onClick={onGoogleSignIn}
                        disabled={isLoading}
                        className="w-full rounded-lg bg-sky-500 px-4 py-2.5 font-medium text-white hover:bg-sky-400 disabled:opacity-50"
                    >
                        Continue with Google
                    </button>
                    <button
                        type="button"
                        onClick={onAnonymousSignIn}
                        disabled={isLoading}
                        className="w-full rounded-lg border border-gray-600 px-4 py-2.5 font-medium text-gray-200 hover:bg-gray-800 disabled:opacity-50"
                    >
                        Continue anonymously
                    </button>
                </div>
            </div>
        </div>
    );
}

AuthScreen.propTypes = {
    onGoogleSignIn: PropTypes.func.isRequired,
    onAnonymousSignIn: PropTypes.func.isRequired,
    isLoading: PropTypes.bool,
};

export function FileUploadControl({ onFileSelected, accept = '.xml,text/xml', label = 'Upload IBKR Flex XML' }) {
    return (
        <label className="inline-flex cursor-pointer items-center rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-400">
            {label}
            <input
                type="file"
                accept={accept}
                className="hidden"
                onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const text = await file.text();
                    onFileSelected(text, file.name);
                    event.target.value = '';
                }}
            />
        </label>
    );
}

FileUploadControl.propTypes = {
    onFileSelected: PropTypes.func.isRequired,
    accept: PropTypes.string,
    label: PropTypes.string,
};

export function FileUploadScreen({ onFileSelected, text, user, onSignOut, onLoadSample }) {
    return (
        <div className="min-h-screen container mx-auto p-6">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-semibold text-white">Portalyser</h1>
                <button type="button" onClick={onSignOut} className="text-sm text-gray-400 hover:text-white">
                    Sign out {user?.email ? `(${user.email})` : ''}
                </button>
            </div>
            <div className="mt-24 mx-auto max-w-xl rounded-2xl border border-gray-700 bg-gray-900 p-8 text-center">
                <h2 className="text-2xl font-semibold text-white">Load an IBKR Flex report</h2>
                <p className="mt-2 text-gray-400">{text}</p>
                <div className="mt-6 flex flex-col items-center gap-3">
                    <FileUploadControl onFileSelected={onFileSelected} />
                    {onLoadSample && (
                        <button
                            type="button"
                            onClick={onLoadSample}
                            className="text-sm text-sky-300 hover:text-sky-200"
                        >
                            Use bundled multi-account sample XML
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

FileUploadScreen.propTypes = {
    onFileSelected: PropTypes.func.isRequired,
    text: PropTypes.string,
    user: PropTypes.object,
    onSignOut: PropTypes.func,
    onLoadSample: PropTypes.func,
};
