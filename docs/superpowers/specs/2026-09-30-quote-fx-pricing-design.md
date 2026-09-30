# Quote FX Pricing Design

## Purpose and scope

Add an optional, Quote-only USD conversion aid. It lets a user retain each Quote item's RMB source price and an explicit `1 USD = X CNY` rate while persisting the calculated final USD commercial price. The accepted Quote XLSX remains an eight-column template and exports only the final saved `unit_price`.

## Data contract

The migration adds only Quote-scoped commercial pricing fields:

| Table | Column | Contract |
| --- | --- | --- |
| `romiku_quotes` | `fx_enabled boolean not null default false` | Enables calculation only when Quote currency is USD. |
| `romiku_quotes` | `usd_cny_rate numeric(18,6) null check (usd_cny_rate > 0)` | CNY per 1 USD. |
| `romiku_quote_items` | `source_cny_unit_price numeric(18,4) null check (source_cny_unit_price >= 0)` | Current Quote row's RMB source price. |

The existing `romiku_quote_items.unit_price numeric(18,4)` remains the final formal USD unit price. The calculation is `rawUsdPrice = sourceCnyUnitPrice / usdCnyRate`; it is rounded exactly once to four decimal places when assigning `unit_price`. Rate and RMB source inputs must not use integer parsing or binary-float rounding for their persisted values.

Historical Quotes retain the default disabled mode and null new fields. FX disablement or a CNY currency selection preserves the saved rate and RMB source prices. It does not restore or overwrite final USD prices.

## UI and persistence

The Quote commercial area shows the FX checkbox only for USD Quotes. Enabling it shows a required positive USD rate input. While enabled, the product table exposes editable `人民币单价`, read-only calculated `单价(USD)`, and CBM. The legacy editable USD `单价` returns when FX is disabled. CNY Quotes hide the controls and do not calculate.

The existing Quote edit session owns all header and item changes until Save. A valid rate change recalculates only rows with a non-null RMB source price. A RMB source price change recalculates that row. Both the source price and final USD price are written on Save. The rate supports up to six decimal places, RMB source prices up to four, and final USD prices exactly four in storage.

## Snapshot, conversion, and export boundaries

The new values are semantic columns, not product, packing, Terms, or notes JSON. The Quote-to-PI and Quote-to-Order conversion keeps its existing explicit item copy list: it copies only final `unit_price`; neither target receives FX metadata or source CNY values. Later Quote FX edits cannot alter created PI or Order rows.

`normalizeQuoteExportModel()` and `renderQuoteXlsx()` remain structurally unchanged: Unit Price reads saved `item.unit_price`, while the template retains its existing eight columns and currency format. Order and PI XLSX renderers and templates are not changed.

## Verification

Tests prove direct USD pricing while FX is off; `67.70 / 6.77 = 10.0000`, `5.00 / 6.77 = 0.7386`, and `18.00 / 6.77 = 2.6588`; a rate change reprices multiple source-CNY rows; disabling retains the final USD price; saved/reopened Quote values persist; XLSX receives final USD price only; conversion uses final price only; and the accepted CBM decimals remain stable. pgTAP covers the three new column defaults and checks. All work, migration application, and deployment stay Preview-only; Production and Sanity are excluded.
