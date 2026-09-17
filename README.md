# Portalyser

React + Vite + Firebase app for IBKR Flex portfolio analysis, with multi-book views for **IBKR** (one or more Flex accounts), **SUPER**, and **JSE**.

## Features

- Parse IBKR Flex XML and group positions / cash by `accountId`
- Dated Firestore reports (existing single-book reports still open as **All / IBKR**)
- Portfolio selector: All | each IBKR account | SUPER | JSE
- NAV tab: graphical breakdown that sums to NAV
  - IBKR: Stocks + Options + Cash + Div accrued + Interest accrued (Flex fields, or 0 if missing)
  - SUPER / JSE: Stocks + Cash from sheet export / JSON (not mocked)

## SUPER / JSE

The Hermes Google Sheet is documented in [docs/SUPER_JSE.md](docs/SUPER_JSE.md). Live Sheets API is not wired. Use `public/super-jse-holdings.json` or paste/upload CSV in the app.

## Development

```bash
npm install
npm test
npm run dev
```

Sign in (Google or anonymous), then upload an IBKR Flex XML or click **Use bundled multi-account sample XML**.

## Testing notes (multi-portfolio)

1. **Flex multi-account** — Upload `public/samples/ibkr-flex-multi-account.xml`. Selector should list All, `IBKR U1111111 (Trading)`, `IBKR U2222222 (LongTerm)`, SUPER, JSE. Trading has AAPL stock + option; LongTerm has BHP only. LOT rows are ignored.
2. **Selector** — Dashboard / What-If / Options Analysis follow the dropdown. SUPER/JSE show stocks+cash only (no options). All combines IBKR + SUPER + JSE.
3. **NAV chart** — NAV tab shows three cards. Sample IBKR NAV is **5,310 AUD** (U1111111 4,310 + U2222222 1,000) from Flex `EquitySummaryByReportDateInBase`. Missing Flex accrual fields stay **0** with an “unavailable” label (`ibkr-flex-computed-nav.xml`).
4. **Legacy reports** — A Firestore doc with only `{ positions, cashAUD, cashBalances }` still loads as All / IBKR.
5. **SUPER/JSE** — Paste the CSV example in [docs/SUPER_JSE.md](docs/SUPER_JSE.md) and confirm SUPER NAV = stocks + cash.

Firebase auth and dated report documents are unchanged in path: `artifacts/{appId}/users/{uid}/reports/{yyyymmdd}`. New reports also store `portfolios` and `navComponents`.
