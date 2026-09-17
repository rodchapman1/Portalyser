# SUPER / JSE holdings

Rod’s Hermes Google Sheet (stock qty and cash for SUPER and JSE):

https://docs.google.com/spreadsheets/d/1jyuhOSwGVbbKni22YuK_gNspVKyS-RMYBge05gJkb_g

Observed / expected tabs: `Portfolio`, `latest_stocks`, `db_frontend`.

Live Google Sheets API is **not** wired (no OAuth client or service-account secret in the repo). Until that is added, load SUPER/JSE via:

1. Edit `public/super-jse-holdings.json`
2. Paste CSV or JSON in the **SUPER / JSE holdings** panel
3. Upload a CSV/JSON export of the sheet

Holdings are stored in `localStorage` and, when signed in, in Firestore at `artifacts/{appId}/users/{uid}/externalHoldings/current`.

## JSON shape

```json
{
  "asOf": "2026-09-17",
  "baseCurrency": "AUD",
  "source": "sheet-export",
  "portfolios": {
    "SUPER": {
      "cashAUD": 12500,
      "positions": [
        {
          "symbol": "VAS",
          "description": "Vanguard Australian Shares",
          "quantity": 100,
          "markPrice": 95.5,
          "currency": "AUD",
          "positionValueAUD": 9550
        }
      ]
    },
    "JSE": {
      "cashAUD": 2000,
      "positions": [
        {
          "symbol": "NPN",
          "description": "Naspers",
          "quantity": 10,
          "markPrice": 3200,
          "currency": "ZAR",
          "positionValueAUD": 4500
        }
      ]
    }
  }
}
```

`positionValueAUD` should already be in AUD. If omitted, qty × markPrice is used (only correct when the price is already AUD).

## CSV columns

Header aliases are accepted (case-insensitive):

| Column | Aliases | Required |
| --- | --- | --- |
| portfolio | book, account, sleeve, source | yes (`SUPER` or `JSE`) |
| symbol | ticker, code | yes (`CASH` sets cash only) |
| description | name, security | no |
| quantity | qty, units, shares | yes for stocks |
| markPrice | price, last, close | no |
| currency | ccy | no (default AUD) |
| positionValueAUD | valueAUD, marketValue, value | no |
| cash | cashAUD, cashBalance | no; last non-empty value per book wins |

Example:

```csv
portfolio,symbol,description,quantity,markPrice,currency,positionValueAUD,cash
SUPER,VAS,Vanguard Australian Shares,100,95.5,AUD,9550,12500
SUPER,CASH,Cash,1,12500,AUD,12500,
JSE,NPN,Naspers,10,3200,ZAR,4500,2000
```

## NAV rules

- **SUPER / JSE:** Stocks + Cash only. No options, dividend accruals, or interest accruals.
- Values come from the file above, never from mocked risk numbers.

## Later: live sheet

Add a Firebase Cloud Function or browser OAuth flow that reads the spreadsheet with a service account / user OAuth token. Keep credentials out of git. The adaptor in `src/lib/superJse.js` (`SUPER_JSE_SHEET` + `parseSuperJseInput`) is the extension point.
