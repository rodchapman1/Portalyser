import { useEffect, useMemo, useState } from 'react';
import {
    GoogleAuthProvider,
    onAuthStateChanged,
    signInAnonymously,
    signInWithPopup,
    signOut,
} from 'firebase/auth';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { auth, db, appId } from './firebase/config.js';
import { parseIBKRFlexXml } from './lib/ibkrFlex.js';
import { sanitizeForFirestore } from './lib/numbers.js';
import { ALL_ID, navBooks, normalizeReport, selectSlice, selectorOptions } from './lib/portfolios.js';
import { buildAllStocksList, buildAnalysis, buildWhatIfAnalysis } from './lib/analysis.js';
import { HOLDINGS_TEMPLATE, normalizeExternalHoldings, parseSuperJseInput } from './lib/superJse.js';
import { AuthScreen, FileUploadScreen } from './components/AuthAndUpload.jsx';
import { ErrorMessage, LoadingSpinner, TabButton } from './components/Chrome.jsx';
import { Header, PortfolioSelector } from './components/Header.jsx';
import { ExternalHoldingsPanel } from './components/ExternalHoldingsPanel.jsx';
import { NavSummaryView } from './components/NavSummaryView.jsx';
import { DashboardView } from './components/DashboardView.jsx';
import { OptionsAnalysisView, WhatIfView } from './components/AnalysisViews.jsx';

const HOLDINGS_STORAGE_KEY = 'portalyser.superJseHoldings';
const LOCAL_PREVIEW_USER = { uid: 'local-preview', isAnonymous: true, email: null };

function isLocalUser(currentUser) {
    return currentUser?.uid === LOCAL_PREVIEW_USER.uid;
}

function reportsPath(userId) {
    return `artifacts/${appId}/users/${userId}/reports`;
}

function holdingsDoc(userId) {
    return doc(db, `artifacts/${appId}/users/${userId}/externalHoldings/current`);
}

function App() {
    const [user, setUser] = useState(null);
    const [savedReports, setSavedReports] = useState([]);
    const [selectedDate, setSelectedDate] = useState('');
    const [portfolioData, setPortfolioData] = useState(null);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('nav');
    const [whatIfChange, setWhatIfChange] = useState(10);
    const [extraStockData, setExtraStockData] = useState([]);
    const [stockTechnicals, setStockTechnicals] = useState({});
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [selectedPortfolioId, setSelectedPortfolioId] = useState(ALL_ID);
    const [externalHoldings, setExternalHoldings] = useState(HOLDINGS_TEMPLATE);
    const [holdingsError, setHoldingsError] = useState(null);

    useEffect(() => {
        if (!auth) {
            setError('Firebase Auth instance not found. This indicates a problem during initial Firebase setup.');
            setIsLoading(false);
            setIsAuthReady(true);
            return undefined;
        }
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser((previous) => {
                if (isLocalUser(previous) && !currentUser) return previous;
                return currentUser || null;
            });
            setIsLoading(false);
            setIsAuthReady(true);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        let cancelled = false;
        async function loadBundledHoldings() {
            try {
                const local = window.localStorage.getItem(HOLDINGS_STORAGE_KEY);
                if (local) {
                    if (!cancelled) setExternalHoldings(normalizeExternalHoldings(JSON.parse(local), 'localStorage'));
                    return;
                }
                const response = await fetch('/super-jse-holdings.json');
                if (!response.ok) return;
                const json = await response.json();
                if (!cancelled) setExternalHoldings(normalizeExternalHoldings(json, 'bundled-json'));
            } catch (loadError) {
                console.warn('Could not load SUPER/JSE holdings template', loadError);
            }
        }
        loadBundledHoldings();
        return () => { cancelled = true; };
    }, []);

    const persistExternalHoldings = async (holdings) => {
        window.localStorage.setItem(HOLDINGS_STORAGE_KEY, JSON.stringify(holdings));
        if (user && db && !isLocalUser(user)) {
            await setDoc(holdingsDoc(user.uid), sanitizeForFirestore(holdings));
        }
    };

    const fetchSavedReports = async (userId) => {
        if (!db) {
            setError('Firestore not available to fetch reports. Cannot load saved reports.');
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const reportsCol = collection(db, reportsPath(userId));
            const reportSnapshot = await getDocs(reportsCol);
            const reports = reportSnapshot.docs.map((report) => report.id).sort((a, b) => b.localeCompare(a));
            setSavedReports(reports);
            if (reports.length > 0) {
                setSelectedDate((current) => current && reports.includes(current) ? current : reports[0]);
            } else {
                setPortfolioData(null);
            }
            try {
                const holdingsSnap = await getDoc(holdingsDoc(userId));
                if (holdingsSnap.exists()) {
                    const loaded = normalizeExternalHoldings(holdingsSnap.data(), 'firestore');
                    setExternalHoldings(loaded);
                    window.localStorage.setItem(HOLDINGS_STORAGE_KEY, JSON.stringify(loaded));
                }
            } catch (holdingsLoadError) {
                console.warn('Could not load saved SUPER/JSE holdings', holdingsLoadError);
            }
        } catch (fetchError) {
            console.error('Error fetching reports:', fetchError);
            setError(`Could not fetch saved reports from the database. This might be due to incorrect Firestore Security Rules or network issues. Details: ${fetchError.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (user && !isLocalUser(user) && isAuthReady && db) {
            fetchSavedReports(user.uid);
        } else if (isAuthReady && !user) {
            setIsLoading(false);
        }
    }, [user, isAuthReady]);

    const loadReportData = async (userId, date) => {
        if (!db) {
            setError('Firestore not available to load report data.');
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const reportRef = doc(db, `${reportsPath(userId)}/${date}`);
            const reportSnap = await getDoc(reportRef);
            if (reportSnap.exists()) {
                setPortfolioData(reportSnap.data());
            } else {
                setError(`No data found for date: ${date}.`);
                setPortfolioData(null);
            }
        } catch (loadError) {
            console.error('Error loading report data:', loadError);
            setError(`Failed to load data for ${date}. Details: ${loadError.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (user && !isLocalUser(user) && selectedDate && db) {
            loadReportData(user.uid, selectedDate);
        }
    }, [selectedDate, user]);

    const applyParsedReport = (parsed) => {
        setPortfolioData(parsed);
        setSelectedDate(parsed.reportDate);
        setSelectedPortfolioId(ALL_ID);
        setSavedReports((current) => (
            current.includes(parsed.reportDate) ? current : [parsed.reportDate, ...current]
        ));
    };

    const parseAndSaveIBKRXml = async (xmlText) => {
        setIsLoading(true);
        setError(null);
        try {
            const dataToSave = sanitizeForFirestore(parseIBKRFlexXml(xmlText));
            applyParsedReport(dataToSave);
            if (user && db && !isLocalUser(user)) {
                const reportRef = doc(db, `${reportsPath(user.uid)}/${dataToSave.reportDate}`);
                await setDoc(reportRef, dataToSave);
                await fetchSavedReports(user.uid);
                setSelectedDate(dataToSave.reportDate);
            }
        } catch (parseError) {
            console.error('XML Processing or Firestore Save Error:', parseError);
            setError(`Error processing XML or saving to database: ${parseError.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const startLocalPreview = async () => {
        setIsLoading(true);
        setError(null);
        try {
            setUser(LOCAL_PREVIEW_USER);
            const response = await fetch('/samples/ibkr-flex-multi-account.xml');
            if (!response.ok) throw new Error('Could not load bundled sample XML.');
            applyParsedReport(sanitizeForFirestore(parseIBKRFlexXml(await response.text())));
        } catch (previewError) {
            setUser(null);
            setError(`Local preview failed: ${previewError.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const loadSampleXml = async () => {
        const response = await fetch('/samples/ibkr-flex-multi-account.xml');
        const xmlText = await response.text();
        await parseAndSaveIBKRXml(xmlText);
    };

    const importExternalHoldings = async (text) => {
        try {
            const parsed = parseSuperJseInput(text);
            setExternalHoldings(parsed);
            setHoldingsError(null);
            await persistExternalHoldings(parsed);
        } catch (importError) {
            setHoldingsError(importError.message);
        }
    };

    const report = useMemo(() => normalizeReport(portfolioData), [portfolioData]);
    const options = useMemo(() => selectorOptions(report, externalHoldings), [report, externalHoldings]);

    useEffect(() => {
        if (!options.some((option) => option.id === selectedPortfolioId)) {
            setSelectedPortfolioId(ALL_ID);
        }
    }, [options, selectedPortfolioId]);

    const slice = useMemo(
        () => selectSlice(report, externalHoldings, selectedPortfolioId),
        [report, externalHoldings, selectedPortfolioId],
    );
    const books = useMemo(() => navBooks(report, externalHoldings), [report, externalHoldings]);

    const analysis = useMemo(() => buildAnalysis(slice), [slice]);
    const fullAllStocksList = useMemo(
        () => buildAllStocksList(slice?.positions, extraStockData),
        [slice, extraStockData],
    );
    const whatIf = useMemo(
        () => buildWhatIfAnalysis(analysis, fullAllStocksList, whatIfChange),
        [analysis, fullAllStocksList, whatIfChange],
    );

    useEffect(() => {
        if (!analysis) {
            setExtraStockData([]);
            setStockTechnicals({});
            return;
        }
        const knownVol = { AAPL: 23.8, TSLA: 65.6, ASML: 25.0 };
        const symbols = [...new Set([
            ...analysis.stocks.map((stock) => stock.symbol),
            ...analysis.options.map((option) => option.underlying).filter(Boolean),
        ])];
        const nextTechnicals = {};
        symbols.forEach((symbol) => {
            nextTechnicals[symbol] = { volatility: knownVol[symbol] ?? null };
        });
        setStockTechnicals(nextTechnicals);
        const owned = new Set(analysis.stocks.map((stock) => stock.symbol));
        setExtraStockData(symbols.filter((symbol) => !owned.has(symbol)).map((symbol) => ({
            symbol,
            description: `${symbol} (Underlying)`,
            quantity: 0,
            markPrice: null,
            currency: '',
            assetCategory: 'STK',
            isExtra: true,
        })));
    }, [analysis]);

    const signOutUser = async () => {
        if (isLocalUser(user)) {
            setUser(null);
            setPortfolioData(null);
            setSavedReports([]);
            setSelectedDate('');
            return;
        }
        await signOut(auth);
    };

    if (isLoading && !isAuthReady) {
        return <LoadingSpinner text="Authenticating..." />;
    }

    if (!user) {
        return (
            <AuthScreen
                error={error}
                onGoogleSignIn={async () => {
                    setIsLoading(true);
                    try {
                        const provider = new GoogleAuthProvider();
                        await signInWithPopup(auth, provider);
                    } catch (authError) {
                        setError(`Google Sign-In failed: ${authError.message}`);
                        setIsLoading(false);
                    }
                }}
                onAnonymousSignIn={async () => {
                    setIsLoading(true);
                    try {
                        await signInAnonymously(auth);
                    } catch (authError) {
                        setError(`Anonymous Sign-In failed: ${authError.message}`);
                        setIsLoading(false);
                    }
                }}
                onLocalPreview={startLocalPreview}
                isLoading={isLoading}
            />
        );
    }

    if (savedReports.length === 0 && !portfolioData) {
        return (
            <div>
                {error && <div className="container mx-auto p-4"><ErrorMessage message={error} /></div>}
                <FileUploadScreen
                    onFileSelected={parseAndSaveIBKRXml}
                    text="Upload your first IBKR Flex XML. Multi-account files are split by accountId; SUPER and JSE load from the holdings panel after the first report."
                    user={user}
                    onSignOut={signOutUser}
                    onLoadSample={loadSampleXml}
                />
            </div>
        );
    }

    if (!portfolioData || !report) {
        return (
            <div className="min-h-screen container mx-auto p-4">
                <Header
                    user={user}
                    onSignOut={signOutUser}
                    savedReports={savedReports}
                    selectedDate={selectedDate}
                    onDateChange={setSelectedDate}
                    onNewUpload={parseAndSaveIBKRXml}
                    onLoadSample={loadSampleXml}
                />
                {isLoading ? <LoadingSpinner text="Loading report data..." /> : <ErrorMessage message={error || 'No report loaded.'} />}
            </div>
        );
    }

    return (
        <div className="min-h-screen container mx-auto p-4 sm:p-6 lg:p-8">
            {error && <ErrorMessage message={error} />}
            <Header
                savedReports={savedReports}
                selectedDate={selectedDate}
                onDateChange={setSelectedDate}
                onNewUpload={parseAndSaveIBKRXml}
                user={user}
                onSignOut={signOutUser}
                onLoadSample={loadSampleXml}
            />
            <PortfolioSelector
                options={options}
                selectedId={selectedPortfolioId}
                onChange={setSelectedPortfolioId}
            />
            <ExternalHoldingsPanel
                holdings={externalHoldings}
                onTextImport={importExternalHoldings}
                error={holdingsError}
            />
            <div className="border-b border-gray-700 my-6">
                <nav className="-mb-px flex flex-wrap gap-6" aria-label="Tabs">
                    <TabButton text="NAV" id="nav" activeTab={activeTab} setActiveTab={setActiveTab} />
                    <TabButton text="Dashboard" id="dashboard" activeTab={activeTab} setActiveTab={setActiveTab} />
                    <TabButton text="What-If Analysis" id="what-if" activeTab={activeTab} setActiveTab={setActiveTab} />
                    <TabButton text="Options Analysis" id="options-analysis" activeTab={activeTab} setActiveTab={setActiveTab} />
                </nav>
            </div>
            <div>
                {activeTab === 'nav' && <NavSummaryView books={books} />}
                {activeTab === 'dashboard' && <DashboardView analysis={analysis} sliceLabel={slice?.label} />}
                {activeTab === 'what-if' && (
                    <WhatIfView
                        whatIfAnalysis={whatIf}
                        change={whatIfChange}
                        setChange={setWhatIfChange}
                        originalValue={analysis?.totalPortfolioValue}
                    />
                )}
                {activeTab === 'options-analysis' && (
                    <OptionsAnalysisView analysis={analysis} stockTechnicals={stockTechnicals} />
                )}
            </div>
        </div>
    );
}

export default App;
