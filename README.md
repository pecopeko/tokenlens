# TOKENLENS — LLM Token & API Cost Calculator + JSON-to-Compact Context Optimizer

A **100% browser-local (zero CDN, zero API calls)** EN/JP bilingual developer utility for estimating multi-script LLM token usage, compressing JSON/RAG payloads losslessly before API calls, and modeling monthly USD/JPY API spend across editable model pricing tiers.

## Key Capabilities

1. **Multi-Script BPE-Calibrated Token Estimator (`estimateTokens`)**:
   - Differentiates ASCII prose/code (~4 chars/token), 3-digit numeric merges, Japanese Hiragana/Katakana (~1.15 tok/char), CJK Han/Kanji (~1.45 tok/char), Korean Hangul (~1.25 tok/char), JSON/code punctuation overhead, and indentation whitespace without external WASM downloads.
2. **Lossless JSON-to-Compact Tabular Context Optimizer (`optimizePayloadForLlm`)**:
   - **Compact Tabular (`@schema` / `@table`)**: Converts uniform JSON arrays (and wrapper objects containing arrays) into TOON-style pipe-delimited rows with strict escaping so `decodeCompactTabular(encodeCompactTabular(data))` is **100% round-trip lossless**.
   - **Measured Reduction** (12-record 8-column API order array):
     - Pretty JSON → Compact Tabular: **`1,300` → `393` tokens (`-69.8%` tokens, `-68.5%` chars, round-trip verified)**
     - Already-Minified JSON → Compact Tabular: **`1,135` → `393` tokens (`-65.4%` tokens, `-60.2%` chars, round-trip verified)**
   - **Minified JSON + Optional Empty Pruning**: Strips whitespace and optionally drops `null`, `""`, `[]`, `{}`.
   - **Markdown & Prompt Whitespace Trimmer**: Removes HTML comments, decorative dividers, and redundant blank lines while preserving fenced code blocks.
3. **Editable Multi-Model API Cost Matrix (`calculateModelCosts`)**:
   - Compares input, cached-input, and output costs across Frontier & Fast tiers in **USD & JPY**, with inline editable `$/1M` cells and an SVG before-vs-after monthly spend chart.
4. **Live EN / 日本語 UI Toggle**.

## Files

- `docs/core/tokenlens-engine.mjs` — Pure ES module engine (zero dependencies)
- `docs/index.html` / `docs/app.mjs` / `docs/styles.css` — Static GitHub Pages web app
- `test/tokenlens-engine.test.mjs` — `node:test` verification suite

## Local Verification

```bash
node --test tracks/track2_micro_saas/tokenlens/test/tokenlens-engine.test.mjs
```

Preview locally:

```bash
python3 -m http.server 8082 -d tracks/track2_micro_saas/tokenlens/docs
```

## Companion Developer Tools

- [KUROGATE v1.1](https://pecopeko.github.io/kurogate/) — Local reversible PII & API-key masking extension before ChatGPT / Claude / Gemini
- [mcp-public-intel](https://github.com/pecopeko/mcp-public-intel) — Zero-API-key MCP public intelligence server
- [Apify PPE Actors](https://github.com/pecopeko/apify-ppe-actors) — Pay-per-event public data extractors (Shopify, Podcast RSS, Substack, SEC EDGAR)
