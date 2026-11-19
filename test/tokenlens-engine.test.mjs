import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_MODEL_CATALOG,
  estimateTokens,
  pruneEmptyValues,
  encodeCompactTabular,
  decodeCompactTabular,
  trimMarkdownAndWhitespace,
  optimizePayloadForLlm,
  calculateModelCosts,
} from '../docs/core/tokenlens-engine.mjs';

test('Multi-script token estimator accurately differentiates ASCII prose vs CJK density', () => {
  const empty = estimateTokens('');
  assert.equal(empty.tokens, 0);
  assert.equal(empty.scriptProfile, 'empty');

  const asciiText = 'The quarterly revenue summary shows steady growth across all enterprise accounts in North America and Europe.';
  const jpText = '四半期売上サマリーは北米および欧州の全エンタープライズ顧客における着実な成長を示しています。';

  const asciiEst = estimateTokens(asciiText);
  const jpEst = estimateTokens(jpText);

  assert.equal(asciiEst.scriptProfile, 'ascii-dominant');
  assert.equal(jpEst.scriptProfile, 'cjk-dominant');

  // English averages ~3.5-5.5 chars/token; Japanese CJK averages ~0.65-1.1 chars/token
  assert.ok(asciiEst.charsPerToken >= 3.2, `Expected ASCII charsPerToken >= 3.2, got ${asciiEst.charsPerToken}`);
  assert.ok(jpEst.charsPerToken <= 1.2, `Expected CJK charsPerToken <= 1.2, got ${jpEst.charsPerToken}`);

  // Token density (tokens per char) for Japanese must be at least 3x higher than ASCII
  const asciiDensity = asciiEst.tokens / asciiEst.chars;
  const jpDensity = jpEst.tokens / jpEst.chars;
  assert.ok(jpDensity / asciiDensity >= 3.0, `Expected CJK density >= 3x ASCII, got ${(jpDensity / asciiDensity).toFixed(2)}x`);
  assert.ok(jpEst.breakdown.cjkKanji > 0 && jpEst.breakdown.jpKana > 0);
});

test('Compact Tabular encoder/decoder preserves 100% lossless round-trip on tricky edge cases', () => {
  const trickyRows = [
    {
      id: 101,
      code: '00123', // numeric-looking string must remain string!
      name: 'Acme | Labs \\ Tokyo',
      flagStr: 'true', // boolean-looking string must remain string!
      flagBool: true,
      tilde: '~', // null sentinel string must remain string!
      nil: null,
      empty: '',
      padded: ' keep spaces ',
      multiline: 'line1\nline2',
      tags: ['saas', 'b2b'],
    },
    {
      id: 102,
      code: '00456',
      name: '株式会社さくら "公式"',
      flagStr: 'false',
      flagBool: false,
      tilde: '@json:fake',
      nil: null,
      empty: 'non-empty',
      padded: 'plain',
      multiline: 'single',
      extraOptional: { nested: [1, 2, 3], ok: true },
    },
  ];

  const encoded = encodeCompactTabular(trickyRows);
  assert.ok(encoded.startsWith('@schema[2]('));
  const decoded = decodeCompactTabular(encoded);
  assert.deepEqual(decoded, trickyRows);

  // Wrapper object containing metadata + uniform array
  const wrapped = {
    request_id: 'req_9981',
    total: 2,
    items: trickyRows,
  };
  const wrappedEncoded = encodeCompactTabular(wrapped);
  assert.ok(wrappedEncoded.startsWith('@object\n'));
  const wrappedDecoded = decodeCompactTabular(wrappedEncoded);
  assert.deepEqual(wrappedDecoded, wrapped);
});

test('JSON-to-Compact Tabular optimizer achieves >= 35% genuine token reduction on realistic API arrays', () => {
  const apiPayload = Array.from({ length: 12 }, (_, i) => ({
    order_id: `ORD-2026-${String(1001 + i)}`,
    customer_name: `Enterprise Client ${i + 1}`,
    plan_tier: i % 3 === 0 ? 'enterprise' : 'pro',
    region: i % 2 === 0 ? 'ap-northeast-1' : 'us-east-1',
    monthly_recurring_usd: 299 + i * 100,
    seats_allocated: 10 + i * 5,
    auto_renew: i % 4 !== 0,
    invoice_status: i % 5 === 0 ? 'pending' : 'paid',
  }));

  const prettyJson = JSON.stringify(apiPayload, null, 2);
  const compactJson = JSON.stringify(apiPayload);

  const resFromPretty = optimizePayloadForLlm(prettyJson, {
    mode: 'compact-tabular',
    inputPer1M: 3.0,
    callsPerDay: 2_000,
    daysPerMonth: 30,
    usdJpyRate: 155,
  });

  assert.equal(resFromPretty.strategyUsed, 'compact-tabular');
  assert.equal(resFromPretty.roundTripVerified, true);
  assert.ok(
    resFromPretty.tokensSavedPct >= 50,
    `Expected >= 50% savings vs pretty JSON, got ${resFromPretty.tokensSavedPct}%`,
  );
  assert.ok(resFromPretty.monthlySavings.usd > 0);
  assert.equal(
    resFromPretty.monthlySavings.jpy,
    Math.round(resFromPretty.monthlySavings.usd * 155),
  );

  // Even against ALREADY-MINIFIED JSON, Compact Tabular must save >= 35% tokens by eliminating repeated keys/quotes
  const resFromMinified = optimizePayloadForLlm(compactJson, { mode: 'compact-tabular' });
  assert.equal(resFromMinified.roundTripVerified, true);
  assert.ok(
    resFromMinified.tokensSavedPct >= 35,
    `Expected >= 35% savings vs already-minified JSON, got ${resFromMinified.tokensSavedPct}%`,
  );
});

test('Minified JSON + stripEmpty prunes null/empty fields cleanly', () => {
  const raw = JSON.stringify({
    id: 1,
    name: 'Test',
    notes: '',
    deleted_at: null,
    tags: [],
    meta: {},
    nested: { keep: true, drop: null },
  }, null, 2);

  const pruned = pruneEmptyValues(JSON.parse(raw));
  assert.deepEqual(pruned, { id: 1, name: 'Test', nested: { keep: true } });

  const opt = optimizePayloadForLlm(raw, { mode: 'minify-json', stripEmpty: true });
  assert.equal(opt.strategyUsed, 'minify-json');
  assert.equal(opt.optimizedText, '{"id":1,"name":"Test","nested":{"keep":true}}');
  assert.equal(opt.roundTripVerified, true);
  assert.ok(opt.tokensSaved > 0);
});

test('Markdown trimmer collapses redundant whitespace & comments while preserving fenced code blocks', () => {
  const md = [
    '# System Prompt   ',
    '<!-- internal draft comment -->',
    '',
    '',
    '',
    'Follow   these    instructions carefully.   ',
    '--------',
    '```python',
    'def keep_indent():',
    '    x = 1   ',
    '    return x',
    '```',
    '',
    '',
  ].join('\n');

  const trimmed = trimMarkdownAndWhitespace(md);
  assert.ok(!trimmed.includes('internal draft comment'));
  assert.ok(!trimmed.includes('--------'));
  assert.ok(!trimmed.includes('\n\n\n'));
  assert.ok(trimmed.includes('Follow these instructions carefully.'));
  assert.ok(trimmed.includes('    x = 1\n    return x'), 'Fenced code block indentation must remain intact');
});

test('Multi-model cost matrix computes exact USD and JPY monthly/daily/cached costs', () => {
  const customModels = [
    {
      id: 'test-frontier',
      name: 'Test Frontier',
      provider: 'Test',
      tier: 'Frontier',
      inputPer1M: 4.00,
      cachedInputPer1M: 0.40,
      outputPer1M: 16.00,
    },
  ];

  // 10,000 input tokens (50% cached) + 1,000 output tokens, 1,000 calls/day, 30 days, FX 150
  // Per call: (5,000 * 4.00 + 5,000 * 0.40 + 1,000 * 16.00) / 1,000,000
  //         = (20,000 + 2,000 + 16,000) / 1,000,000 = $0.038/call
  // Daily: $38.00, Monthly: $1,140.00, JPY: ¥171,000
  const matrix = calculateModelCosts({
    inputTokens: 10_000,
    optimizedInputTokens: 5_000,
    outputTokens: 1_000,
    cachedInputRatio: 0.50,
    callsPerDay: 1_000,
    daysPerMonth: 30,
    usdJpyRate: 150,
    models: customModels,
  });

  const row = matrix.rows[0];
  assert.ok(Math.abs(row.costPerCallUsd - 0.038) < 1e-9);
  assert.ok(Math.abs(row.dailyCostUsd - 38.0) < 1e-9);
  assert.ok(Math.abs(row.monthlyCostUsd - 1140.0) < 1e-9);
  assert.equal(row.monthlyCostJpy, 171_000);

  // Optimized input = 5,000 tokens (50% cached) saves exactly half of input cost:
  // Input cost was $22/day * 30 = $660/mo -> half saved = $330/mo = ¥49,500
  assert.ok(Math.abs(row.monthlySavingsUsd - 330.0) < 1e-9);
  assert.equal(row.monthlySavingsJpy, 49_500);

  // Default catalog sanity check
  const defaultMatrix = calculateModelCosts({ inputTokens: 2_000, outputTokens: 500 });
  assert.equal(defaultMatrix.rows.length, DEFAULT_MODEL_CATALOG.length);
  assert.ok(defaultMatrix.rows.every((r) => Number.isFinite(r.monthlyCostUsd) && r.monthlyCostUsd >= 0));
});
