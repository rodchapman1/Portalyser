function App() {
    const [user, setUser] = useState(null);
    const [savedReports, setSavedReports] = useState([]);
    const [selectedDate, setSelectedDate] = useState('');
    const [portfolioData, setPortfolioData] = useState(null);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(true); 
    const [activeTab, setActiveTab] = useState('dashboard');
    const [whatIfChange, setWhatIfChange] = useState(10);
    const [extraStockData, setExtraStockData] = useState([]); 
    const [stockTechnicals, setStockTechnicals] = useState({});
    const [isAuthReady, setIsAuthReady] = useState(false); 

    // --- Firebase Auth and Data Fetching ---
    useEffect(() => {
        if (!auth) {
            setError("Firebase Auth instance not found. This indicates a problem during initial Firebase setup.");
            setIsLoading(false);
            setIsAuthReady(true);
            return;
        }
        
        console.log("Firebase Auth instance:", auth); 
        const unsubscribe = window.firebase.auth.onAuthStateChanged(auth, async (currentUser) => { 
            if (currentUser) {
                setUser(currentUser);
                console.log("Firebase user authenticated:", currentUser.uid);
                setIsLoading(false); 
                setIsAuthReady(true); 
            } else {
                // If no current user, attempt to sign in with custom token IF available
                if (typeof __initial_auth_token !== 'undefined' && window.firebase.auth.signInWithCustomToken) {
                    try {
                        await window.firebase.auth.signInWithCustomToken(auth, __initial_auth_token);
                        console.log("Attempted custom token sign-in, waiting for onAuthStateChanged callback.");
                    } catch (e) {
                        console.warn("Custom token sign-in failed. Error:", e.code, e.message); 
                        setIsLoading(false); 
                        setIsAuthReady(true);
                        setError("Custom authentication failed. Please sign in with Google or continue anonymously."); 
                    }
                } else {
                    setIsLoading(false);
                    setIsAuthReady(true);
                    console.log("No custom token available, showing AuthScreen.");
                }
            }
        });

        return () => unsubscribe(); 
    }, [auth]); 

    useEffect(() => {
        if (user && isAuthReady && db) {
           console.log(`fetchSavedReports: Starting for user ${user.uid}...`); 
           fetchSavedReports(user.uid);
        } else if (isAuthReady && !user && savedReports.length === 0) { 
            setIsLoading(false);
        }
    }, [user, isAuthReady, db, savedReports.length]); 

    const fetchSavedReports = async (userId) => {
        if (!db) {
            setError("Firestore not available to fetch reports. Cannot load saved reports.");
            setIsLoading(false);
            return;
        }
        setIsLoading(true); 
        setError(null);
        try {
            console.log(`Attempting to get reports collection for user: ${userId}.`); 
            const reportsCol = window.firebase.firestore.collection(db, `artifacts/${appId}/users/${userId}/reports`);
            const reportSnapshot = await window.firebase.firestore.getDocs(reportsCol);
            console.log("Reports snapshot received.", reportSnapshot.docs.length, "reports."); 
            const reports = reportSnapshot.docs.map(doc => doc.id).sort((a,b) => b.localeCompare(a)); 
            setSavedReports(reports);
            if (reports.length > 0) {
                setSelectedDate(reports[0]); 
                console.log("Selected latest report:", reports[0]); 
            } else {
                setPortfolioData(null); 
                console.log("No saved reports found for this user."); 
            }
        } catch (e) {
            console.error("Error fetching reports:", e);
            setError(`Could not fetch saved reports from the database. This might be due to incorrect Firestore Security Rules or network issues. Details: ${e.message}`); 
            setIsLoading(false);
        } finally {
            setIsLoading(false); 
            console.log("fetchSavedReports: Finished."); 
        }
    };
    
    useEffect(() => {
        if (user && selectedDate && db) { 
            console.log("loadReportData: Starting for date:", selectedDate); 
            loadReportData(user.uid, selectedDate);
        }
    }, [selectedDate, user, db]); 

    const loadReportData = async (userId, date) => {
        if (!db) {
            setError("Firestore not available to load report data.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setPortfolioData(null); 
        try {
            console.log(`Attempting to get specific report document: ${date} for user ${userId}.`); 
            const reportRef = window.firebase.firestore.doc(db, `artifacts/${appId}/users/${userId}/reports/${date}`);
            const reportSnap = await window.firebase.firestore.getDoc(reportRef);
            
            if (reportSnap.exists()) {
                const data = reportSnap.data();
                setPortfolioData(data);
                console.log("Report data loaded successfully for:", date); 
            } else {
               setError(`No data found for date: ${date}. This might indicate a problem with the saved data or Firestore Security Rules.`); 
               setPortfolioData(null);
               console.warn("No data found for document:", date); 
            }
        } catch (e) {
            console.error("Error loading report data:", e);
            setError(`Failed to load data for ${date}. This might be due to incorrect Firestore Security Rules. Details: ${e.message}`); 
        } finally {
            setIsLoading(false);
            console.log("loadReportData: Finished for date:", date); 
        }
    };
    
    const parseAndSaveIBKRXml = async (xmlText) => {
        if (!user || !db) { 
            setError("Cannot save data: user is not authenticated or database is not available.");
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            console.log("parseAndSaveIBKRXml: Starting XML parsing."); 
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, "text/xml");
            if (xmlDoc.getElementsByTagName("parsererror").length > 0) throw new Error("Invalid XML file.");

            const flexStatement = xmlDoc.querySelector('FlexStatement');
            const baseCurrency = flexStatement ? flexStatement.getAttribute('currency') : 'AUD';
            const reportDate = flexStatement ? flexStatement.getAttribute('toDate').split(';')[0] : new Date().toISOString().split('T')[0].replace(/-/g, ''); 
            
            const rates = { [baseCurrency]: 1.0 };
            xmlDoc.querySelectorAll('ConversionRate').forEach(rate => {
                rates[rate.getAttribute('fromCurrency')] = parseFloat(rate.getAttribute('rate'));
            });
            
            // --- Process positions and calculate option metrics before saving ---
            const positionElements = xmlDoc.getElementsByTagName('OpenPosition');
            let positions = Array.from(positionElements).map(pos => {
                const assetCategory = pos.getAttribute('assetCategory');
                const qtyStr = pos.getAttribute('position') || pos.getAttribute('quantity') || '0';
                const quantity = parseFloat(qtyStr);
                const currency = pos.getAttribute('currency');
                const conversionRate = rates[currency] || 1.0;
                const valueInOrigCurrency = parseFloat(pos.getAttribute('positionValue'));
                const valueInBase = valueInOrigCurrency * conversionRate;
                
                return {
                    symbol: pos.getAttribute('symbol'),
                    description: pos.getAttribute('description'),
                    assetCategory,
                    quantity,
                    markPrice: parseFloat(pos.getAttribute('markPrice') || 0),
                    positionValueAUD: valueInBase,
                    currency,
                    fxRateToBase: conversionRate,
                    underlying: pos.getAttribute('underlyingSymbol'),
                    expiry: pos.getAttribute('expiry'),
                    strike: parseFloat(pos.getAttribute('strike')),
                    type: pos.getAttribute('putCall') === 'P' ? 'Put' : (pos.getAttribute('putCall') === 'C' ? 'Call' : ''),
                    multiplier: parseFloat(pos.getAttribute('multiplier') || '1'),
                    annualizedToStrike: null,
                    annualizedPremium: null,
                    annualizedBreakeven: null
                };
            });

            const stocks = positions.filter(p => p.assetCategory === 'STK');
            const options = positions.filter(p => p.assetCategory === 'OPT');

            const allStocksForCalc = [...stocks];
            const ownedStockSymbols = new Set(stocks.map(s => s.symbol));
            
            options.forEach(opt => {
                if (opt.underlying && !ownedStockSymbols.has(opt.underlying)) {
                    const simulatedPriceMap = {
                        "AAPL": { price: 196.58, currency: "USD" }, "TSLA": { price: 321.99, currency: "USD" },
                        "MSFT": { price: 420.00, currency: "USD" }, "GOOG": { price: 175.00, currency: "USD" },
                        "AMZN": { price: 180.00, currency: "USD" }, "NVDA": { price: 130.00, currency: "USD" },
                        "SMCI": { price: 800.00, currency: "USD" }, "AMD": { price: 160.00, currency: "USD" },
                        "ASML": { price: 850.00, currency: "EUR" }, "RY": { price: 135.00, currency: "CAD" },
                        "BMO": { price: 120.00, currency: "CAD" },
                    };
                    
                    const simulatedPriceData = simulatedPriceMap[opt.underlying] || { price: 100, currency: "USD" }; 
                    const underlyingRate = rates[simulatedPriceData.currency] || 1.0;
                    allStocksForCalc.push({
                        symbol: opt.underlying, description: `${opt.underlying} (Simulated Underlying)`,
                        markPrice: simulatedPriceData.price, currency: simulatedPriceData.currency,
                        fxRateToBase: underlyingRate, assetCategory: 'STK'
                    });
                    ownedStockSymbols.add(opt.underlying);
                }
            });


            for (let i = 0; i < positions.length; i++) {
                if (positions[i].assetCategory === 'OPT') {
                    const calculatedReturns = calculateAnnualizedReturn(positions[i], allStocksForCalc);
                    if (calculatedReturns) {
                        positions[i] = {
                            ...positions[i],
                            annualizedToStrike: calculatedReturns.toStrike,
                            annualizedPremium: calculatedReturns.premium,
                            annualizedBreakeven: calculatedReturns.toBreakeven
                        };
                    }
                }
            }
            
            const cashReportElement = xmlDoc.querySelector('CashReport');
            const cashBalanceElements = cashReportElement ? cashReportElement.querySelectorAll('CashReportCurrency') : [];
            
            let cashBalances = Array.from(cashBalanceElements).map(cb => {
                    const currency = cb.getAttribute('currency');
                    const amountStr = cb.getAttribute('endingCash') || cb.getAttribute('total') || cb.getAttribute('endingBalance') || cb.getAttribute('amount') || cb.getAttribute('value') || '0';
                    const amount = parseFloat(amountStr);
                    const conversionRate = rates[currency] || 1.0;
                    return {
                        currency,
                        amount,
                        valueAUD: amount * conversionRate,
                        fxRateToBase: conversionRate,
                    };
            }).filter(cb => cb.currency !== 'BASE_SUMMARY' && cb.currency !== 'TWD');
            
            let totalCashAUD;

            if (cashBalances.length > 0) {
                const hasEUR = cashBalances.some(cb => cb.currency === 'EUR');
                if (!hasEUR && rates['EUR']) {
                    cashBalances.push({ currency: 'EUR', amount: 0, valueAUD: 0, fxRateToBase: rates['EUR'] });
                }
                totalCashAUD = cashBalances.reduce((sum, cb) => sum + cb.valueAUD, 0);
            } else {
                let netAssetValue = 0;
                const navQueries = ['EquitySummaryInBase[accountId][baseCurrency="'+baseCurrency+'"]', 'ChangeInNAV[currency="'+baseCurrency+'"]', 'NetAssetValueInBase', 'ChangeInNAV'];
                let navElement = null;
                for (const query of navQueries) {
                    navElement = xmlDoc.querySelector(query);
                    if (navElement) break;
                }
                if(navElement) {
                    netAssetValue = parseFloat(navElement.getAttribute('total') || navElement.getAttribute('netAssetValue') || navElement.getAttribute('endingValue') || 0);
                }
                const totalPositionValueAUD = positions.filter(p => p.assetCategory !== 'CASH').reduce((sum, pos) => sum + pos.positionValueAUD, 0); 
                totalCashAUD = netAssetValue - totalPositionValueAUD;
                cashBalances = [{
                    currency: baseCurrency,
                    amount: totalCashAUD / (rates[baseCurrency] || 1.0),
                    valueAUD: totalCashAUD,
                    fxRateToBase: rates[baseCurrency] || 1.0,
                }];
            }

            const dataToSave = { positions, cashAUD: totalCashAUD, cashBalances, baseCurrency, reportDate, rates };

            console.log("Saving data to Firestore for date:", reportDate); 
            const reportRef = window.firebase.firestore.doc(db, `artifacts/${appId}/users/${user.uid}/reports/${reportDate}`);
            await window.firebase.firestore.setDoc(reportRef, dataToSave);
            console.log("Data saved to Firestore successfully."); 

            await fetchSavedReports(user.uid);
            setSelectedDate(reportDate);
            console.log("Parse and save complete. Selected new date."); 

        } catch (e) {
            console.error("XML Processing or Firestore Save Error:", e);
            setError(`Error processing XML or saving to database: ${e.message}. This might be due to invalid XML format or insufficient Firestore Security Rules for 'write'.`); 
        } finally {
            setIsLoading(false);
            console.log("parseAndSaveIBKRXml: Finished."); 
        }
    };

    const fullAllStocksList = useMemo(() => {
        if (!portfolioData || !Array.isArray(portfolioData.positions)) return [];

        const stocksFromReport = portfolioData.positions.filter(p => p.assetCategory === 'STK');
        const combinedStocks = [...stocksFromReport];
        const combinedStockSymbols = new Set(stocksFromReport.map(s => s.symbol));

        extraStockData.forEach(extra => {
            if (!combinedStockSymbols.has(extra.symbol)) {
                combinedStocks.push(extra);
                combinedStockSymbols.add(extra.symbol);
            }
        });

        portfolioData.positions.filter(p => p.assetCategory === 'OPT').forEach(option => {
            if (option.underlying && !combinedStockSymbols.has(option.underlying)) {
                const simPrice = { price: 100, currency: "USD" }; 
                const simRate = portfolioData.rates && portfolioData.rates[simPrice.currency] ? portfolioData.rates[simPrice.currency] : 1.0;
                combinedStocks.push({
                    symbol: option.underlying, description: `${option.underlying} (Fallback Underlying)`,
                    markPrice: simPrice.price, currency: simPrice.currency,
                    fxRateToBase: simRate, assetCategory: 'STK'
                });
                combinedStockSymbols.add(option.underlying);
            }
        });

        return combinedStocks;
    }, [portfolioData, extraStockData]); 


    const analysis = useMemo(() => {
        if (!portfolioData || !Array.isArray(portfolioData.positions)) return null;
        
        let { positions, cashAUD, cashBalances, baseCurrency } = portfolioData;
        const validCashAUD = typeof cashAUD === 'number' ? cashAUD : 0;
        
        let displayCashBalances = cashBalances && cashBalances.length > 0 ? cashBalances : [];
        if (displayCashBalances.length === 0 && validCashAUD !== 0) {
            displayCashBalances = [{
                currency: baseCurrency || 'AUD',
                amount: validCashAUD,
                valueAUD: validCashAUD,
                fxRateToBase: 1.0,
            }];
        }

        const stocks = positions.filter(p => p.assetCategory === 'STK');
        const options = positions.filter(p => p.assetCategory === 'OPT'); 
        const longPositions = positions.filter(p => p.quantity > 0);
        const shortPositions = positions.filter(p => p.quantity < 0);
        
        const longValue = longPositions.reduce((sum, p) => sum + p.positionValueAUD, 0);
        const shortValue = shortPositions.reduce((sum, p) => sum + Math.abs(p.positionValueAUD), 0);
        const totalPortfolioValue = longValue - shortValue + validCashAUD;

        const positiveCashItems = displayCashBalances.filter(c => c.valueAUD > 0);
        const negativeCashItems = displayCashBalances.filter(c => c.valueAUD < 0);
        
        const positiveCashValue = positiveCashItems.reduce((sum, c) => sum + c.valueAUD, 0);
        const negativeCashValue = negativeCashItems.reduce((sum, c) => sum + c.valueAUD, 0);

        const totalLongValueWithCash = longValue + positiveCashValue;
        const totalShortValueWithCash = shortValue + Math.abs(negativeCashValue);

        return { 
            stocks, options, cashBalances: displayCashBalances,
            cashAUD: validCashAUD, 
            totalPortfolioValue, 
            longValue: totalLongValueWithCash, 
            shortValue: totalShortValueWithCash, 
            longAllocation: createAllocation(longPositions, positiveCashItems), 
            shortAllocation: createAllocation(shortPositions, negativeCashItems) 
        };
    }, [portfolioData]); 

    useEffect(() => {
        if (!analysis || !portfolioData || !portfolioData.rates) return;
        
        const allStockSymbols = [...new Set([...analysis.stocks.map(s => s.symbol), ...analysis.options.map(o => o.underlying).filter(Boolean)])];

        const fetchedTechnicals = {};
        allStockSymbols.forEach(symbol => {
            let vol = (Math.random() * 50 + 20).toFixed(1);
            if (symbol === 'AAPL') vol = 23.8;
            else if (symbol === 'TSLA') vol = 65.6;
            else if (symbol === 'ASML') vol = 25.0;

            fetchedTechnicals[symbol] = {
                volatility: vol,
                ma55: Math.random() * 5 + 185, 
                ma252: Math.random() * 10 + 175, 
                rsi: Math.random() * 40 + 30, 
            };
        });
        setStockTechnicals(fetchedTechnicals);
        
        const ownedStockSymbols = new Set(analysis.stocks.map(s => s.symbol));
        const missingUnderlyings = allStockSymbols.filter(u => !ownedStockSymbols.has(u));

        if (missingUnderlyings.length === 0) {
            setExtraStockData([]);
            return;
        }
        
        const fetchedPrices = {
            "AAPL": { price: 196.58, currency: "USD" }, "TSLA": { price: 321.99, currency: "USD" },
            "MSFT": { price: 420.00, currency: "USD" }, "GOOG": { price: 175.00, currency: "USD" },
            "AMZN": { price: 180.00, currency: "USD" }, "NVDA": { price: 130.00, currency: "USD" },
            "SMCI": { price: 800.00, currency: "USD" }, "AMD": { price: 160.00, currency: "USD" },
            "ASML": { price: 850.00, currency: "EUR" }, "RY": { price: 135.00, currency: "CAD" },
            "BMO": { price: 120.00, currency: "CAD" },
        };

        const newExtraData = missingUnderlyings.map(symbol => {
            const priceData = fetchedPrices[symbol];
            return {
                symbol: symbol, description: `${symbol} (Underlying)`,
                quantity: 0, markPrice: priceData ? priceData.price : 'N/A',
                currency: priceData ? priceData.currency : '', assetCategory: 'STK',
                isExtra: true
            };
        });
        setExtraStockData(newExtraData);
    
    }, [analysis, portfolioData]); 

    const whatIfAnalysis = useMemo(() => {
        if (!analysis) return null;

        const allStocks = fullAllStocksList; 
        const allOptions = analysis.options;

        const groupedByUnderlying = {};

        allStocks.forEach(stock => {
            if (!groupedByUnderlying[stock.symbol]) { 
                groupedByUnderlying[stock.symbol] = { stock: null, options: [] };
            }
            groupedByUnderlying[stock.symbol].stock = stock;
        });

        allOptions.forEach(option => {
            if (!groupedByUnderlying[option.underlying]) {
                groupedByUnderlying[option.underlying] = { stock: null, options: [] };
            }
            groupedByUnderlying[option.underlying].options.push(option);
        });

        let totalImpact = 0;
        
        const results = Object.entries(groupedByUnderlying).map(([symbol, group]) => {
            let stockImpact = 0;
            let newStockValue = 0;
            let newStockPrice; 

            if (group.stock) {
                const currentMarkPriceNum = typeof group.stock.markPrice === 'number' ? group.stock.markPrice : parseFloat(group.stock.markPrice);

                if (group.stock.quantity === 0) {
                    newStockPrice = group.stock.markPrice; 
                    newStockValue = 0; 
                    stockImpact = 0;
                } else if (Number.isFinite(currentMarkPriceNum) && currentMarkPriceNum !== 0) {
                    newStockPrice = currentMarkPriceNum * (1 + whatIfChange / 100);
                    newStockValue = (group.stock.positionValueAUD / currentMarkPriceNum) * newStockPrice; 
                    stockImpact = newStockValue - group.stock.positionValueAUD;
                } else {
                    console.error(`What-If: Unexpected invalid markPrice for owned stock ${group.stock.symbol}. Cannot calculate impact.`);
                    newStockPrice = group.stock.markPrice; 
                    newStockValue = group.stock.positionValueAUD; 
                    stockImpact = 0;
                }
                
                group.stock.newPrice = newStockPrice; 
                group.stock.newValue = newStockValue;
                group.stock.impact = stockImpact;
            }

            let optionsImpact = 0;

            group.options.forEach(opt => {
                const underlyingStock = allStocks.find(s => s.symbol === opt.underlying);
                const underlyingMarkPriceNum = underlyingStock && typeof underlyingStock.markPrice === 'number' ? underlyingStock.markPrice : NaN;

                if (!Number.isFinite(underlyingMarkPriceNum) || underlyingMarkPriceNum === 0) {
                    opt.newValue = opt.positionValueAUD; 
                    opt.impact = 0;
                    console.warn(`What-If: Could not determine valid markPrice for option underlying ${opt.underlying}. Option impact may be inaccurate.`);
                    return;
                }
                
                const newUnderlyingPrice = underlyingMarkPriceNum * (1 + whatIfChange / 100);
                let newOptionValueAUD = 0;
                let intrinsicValuePerShare = 0;

                if (opt.type === 'Call' && newUnderlyingPrice > opt.strike) {
                    intrinsicValuePerShare = newUnderlyingPrice - opt.strike;
                } else if (opt.type === 'Put' && newUnderlyingPrice < opt.strike) {
                    intrinsicValuePerShare = opt.strike - newUnderlyingPrice;
                }
                
                if (intrinsicValuePerShare > 0) {
                    newOptionValueAUD = intrinsicValuePerShare * opt.multiplier * opt.quantity * opt.fxRateToBase;
                }

                opt.newValue = newOptionValueAUD !== null && newOptionValueAUD !== undefined ? newOptionValueAUD : opt.positionValueAUD; 
                opt.impact = opt.newValue - opt.positionValueAUD;
                optionsImpact += opt.impact;
            });

            const subTotalImpact = stockImpact + optionsImpact;
            totalImpact += subTotalImpact;
            
            return {
                underlying: symbol,
                stock: group.stock,
                options: group.options,
                subTotalImpact
            };
        });

        return { results, totalImpact, cash: analysis.cashAUD };
    }, [analysis, fullAllStocksList, whatIfChange]);


    // Render logic based on loading, errors, and data availability
    if (isLoading) {
        return <LoadingSpinner text="Authenticating..." />;
    }
    
    if (!user) {
        return (
            <AuthScreen 
                onGoogleSignIn={async () => {
                    setIsLoading(true); 
                    try {
                        const provider = new window.firebase.auth.GoogleAuthProvider();
                        await window.firebase.auth.signInWithRedirect(auth, provider);
                    } catch (authError) {
                        setError(`Google Sign-In failed: ${authError.message}`);
                        setIsLoading(false);
                    }
                }}
                onAnonymousSignIn={async () => {
                    setIsLoading(true); 
                    try {
                        await window.firebase.auth.signInAnonymously(auth);
                    } catch (authError) {
                        setError(`Anonymous Sign-In failed: ${authError.message}`);
                    } finally {
                        setIsLoading(false);
                    }
                }}
                isLoading={isLoading}
            />
        );
    }

    if (savedReports.length === 0) { 
        return (
            <FileUploadScreen 
                onFileSelected={parseAndSaveIBKRXml} 
                text="Upload your first portfolio report to begin."
                user={user}
                onSignOut={() => window.firebase.auth.signOut(auth)}
            />
        );
    }
    
    if (!portfolioData) {
        return (
            <div>
                <Header 
                    user={user} 
                    onSignOut={() => window.firebase.auth.signOut(auth)} 
                    savedReports={savedReports} 
                    selectedDate={selectedDate} 
                    onDateChange={setSelectedDate} 
                    onNewUpload={parseAndSaveIBKRXml} 
                />
                <LoadingSpinner text="Loading report data..."/>
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
                onSignOut={() => window.firebase.auth.signOut(auth)}
            />
            
            <div className="border-b border-gray-700 my-6">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    <TabButton text="Dashboard" id="dashboard" activeTab={activeTab} setActiveTab={setActiveTab} />
                    <TabButton text="What-If Analysis" id="what-if" activeTab={activeTab} setActiveTab={setActiveTab} />
                    <TabButton text="Options Analysis" id="options-analysis" activeTab={activeTab} setActiveTab={setActiveTab} />
                </nav>
            </div>
            <div>
                {activeTab === 'dashboard' && <DashboardView analysis={analysis} />}
                {activeTab === 'what-if' && <WhatIfView whatIfAnalysis={whatIfAnalysis} change={whatIfChange} setChange={setWhatIfChange} originalValue={analysis.totalPortfolioValue} />}
                {activeTab === 'options-analysis' && <OptionsAnalysisView analysis={analysis} allStocks={fullAllStocksList} />} 
            </div>
        </div>
    );
}