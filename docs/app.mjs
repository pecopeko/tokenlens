import {
  DEFAULT_MODEL_CATALOG,
  optimizePayloadForLlm,
  calculateModelCosts,
} from './core/tokenlens-engine.mjs';

const I18N = {
  en: {
    brandSub: 'LLM Token Counter · Lossless JSON Compact Optimizer · Editable API Cost Matrix',
    sampleArray: 'Sample: API JSON Array',
    sampleJp: 'Sample: JP/EN RAG Wrapper',
    sampleMd: 'Sample: Prompt Markdown',
    trustPill: '100% Browser-Local · 0 API Calls',
    pageTitle: 'LLM Token & API Cost Calculator + Context Optimizer',
    kpiRawLabel: 'Raw Payload Tokens (Est.)',
    kpiOptLabel: 'Optimized Payload Tokens',
    kpiSavingsLabel: 'Est. Monthly Optimization Savings',
    optTitle: 'Context Payload Optimizer (JSON → Compact Tabular / Minify / Markdown Trim)',
    stripEmptyLabel: 'Prune null / empty fields',
    copyOptBtn: 'Copy Optimized',
    copiedBtn: 'Copied!',
    rawPaneLabel: 'Input Prompt / JSON Payload',
    optPaneLabel: 'Optimized LLM-Ready Output',
    matrixTitle: 'Multi-Model API Cost Matrix (Editable $/1M Rates · USD & JPY)',
    resetPrices: 'Reset Reference Rates',
    paramBaseline: 'Baseline Model',
    paramOutTok: 'Output Tokens / Call',
    paramCache: 'Cached Input (%)',
    paramCalls: 'API Calls / Day',
    paramDays: 'Days / Month',
    paramFx: 'USD / JPY FX',
    thModel: 'Model',
    thTier: 'Tier',
    thInPrice: 'Input ($/1M)',
    thCachePrice: 'Cached ($/1M)',
    thOutPrice: 'Output ($/1M)',
    thPerCall: '$/Call',
    thMoRaw: 'Monthly Raw ($)',
    thMoOpt: 'Optimized ($)',
    thMoJpy: 'Optimized (¥)',
    thSave: 'Monthly Saved',
    footerTitle: 'Need local PII redaction before sending prompts, or clean structured feeds?',
    footerSub: 'Explore our companion zero-backend developer utilities, zero-API-key MCP server, and pay-per-event Apify extractors.',
    footnote: 'Note: Token counts use a deterministic multi-script BPE-calibrated estimator (distinguishing ASCII prose/code, 3-digit numeric merges, Japanese Kana, CJK Han, and JSON punctuation) with zero external WASM downloads. Model $/1M pricing cells are editable reference defaults — click any cell to match your exact provider rate.',
    rtVerified: 'Round-Trip 100% Lossless',
    rtTextTrim: 'Whitespace / Markdown Trimmed',
    chartRaw: 'Monthly Raw ($)',
    chartOpt: 'Monthly Optimized ($)',
  },
  ja: {
    brandSub: 'LLMトークン試算 · 可逆JSON圧縮（TOON表形式） · 編集可能APIコスト比較表',
    sampleArray: 'サンプル: API JSON配列',
    sampleJp: 'サンプル: 日英RAGレスポンス',
    sampleMd: 'サンプル: 長文プロンプトMD',
    trustPill: '完全ブラウザ完結 · 外部通信ゼロ',
    pageTitle: 'LLM トークン数・API月額コスト試算 ＆ コンテキスト圧縮ツール',
    kpiRawLabel: '入力トークン数（圧縮前・推計）',
    kpiOptLabel: '最適化後トークン数',
    kpiSavingsLabel: 'コンテキスト最適化による月額削減額',
    optTitle: 'コンテキスト圧縮ワークベンチ（JSON→コンパクト表形式 / Minify / Markdown整理）',
    stripEmptyLabel: 'null・空文字・空配列を除去',
    copyOptBtn: '最適化テキストをコピー',
    copiedBtn: 'コピーしました',
    rawPaneLabel: '元のプロンプト / JSONペイロード',
    optPaneLabel: 'LLM送信用 最適化済み出力',
    matrixTitle: '主要LLM API 月額コスト比較マトリクス（単価セル直接編集可 · USD/JPY）',
    resetPrices: '参考単価をリセット',
    paramBaseline: '基準モデル',
    paramOutTok: '出力トークン / 回',
    paramCache: 'キャッシュヒット率 (%)',
    paramCalls: '1日あたりAPIコール数',
    paramDays: '月間稼働日数',
    paramFx: '為替レート (円/ドル)',
    thModel: 'モデル',
    thTier: '区分',
    thInPrice: '入力 ($/1M)',
    thCachePrice: 'キャッシュ ($/1M)',
    thOutPrice: '出力 ($/1M)',
    thPerCall: '1回あたり',
    thMoRaw: '月額 圧縮前 ($)',
    thMoOpt: '最適化後 ($)',
    thMoJpy: '最適化後 (円)',
    thSave: '月額削減',
    footerTitle: 'LLM送信前の社外秘・個人情報マスクや、公開データ収集の自動化も',
    footerSub: 'ブラウザ完結の可逆PIIマスキング拡張・APIキー不要MCPサーバー・従量課金Apify Actorを公開しています。',
    footnote: '※トークン数は外部WASMを使わず、ASCII/コード・3桁数字結合・日本語かな・漢字CJK・JSON記号・インデント空白の密度差を区別する決定論的BPE近似アルゴリズムで計算しています。各モデルの$/1M単価は参考初期値のため、表内の入力欄から最新の契約単価へ自由に書き換えて試算できます。',
    rtVerified: '100% 可逆ラウンドトリップ検証済',
    rtTextTrim: '空白・Markdown冗長表現を整理',
    chartRaw: '月額 圧縮前 ($)',
    chartOpt: '月額 最適化後 ($)',
  },
};

const SAMPLES = {
  apiArray: JSON.stringify(
    Array.from({ length: 12 }, (_, i) => ({
      order_id: `ORD-2026-${1001 + i}`,
      customer_name: `Enterprise Client ${i + 1}`,
      plan_tier: i % 3 === 0 ? 'enterprise' : 'pro',
      region: i % 2 === 0 ? 'ap-northeast-1' : 'us-east-1',
      monthly_recurring_usd: 299 + i * 100,
      seats_allocated: 10 + i * 5,
      auto_renew: i % 4 !== 0,
      invoice_status: i % 5 === 0 ? 'pending' : 'paid',
    })),
    null,
    2,
  ),
  jpRag: JSON.stringify(
    {
      query: '2026年10月インボイス経過措置50%の影響と経理対応',
      retrieved_at: '2026-11-19T09:00:00Z',
      total_hits: 6,
      chunks: [
        { doc_id: 'DOC-001', section: '経過措置概要', score: 0.94, lang: 'ja', summary: '2026年10月1日から免税事業者からの課税仕入控除が80%から50%へ縮小される。', deprecated: null },
        { doc_id: 'DOC-002', section: '2割特例終了', score: 0.91, lang: 'ja', summary: '個人事業主の2割特例は2026年分の確定申告をもって終了し、2027年分から簡易または原則課税となる。', deprecated: null },
        { doc_id: 'DOC-003', section: '簡易課税届出', score: 0.88, lang: 'ja', summary: '基準期間売上5,000万円以下なら第5種サービス業はみなし仕入率50%が適用可能。', deprecated: null },
        { doc_id: 'DOC-004', section: '会計ソフト設定', score: 0.85, lang: 'ja', summary: '税区分マスタを「課対仕入10%（控50%）」へ切替え、T番号のMod-9検算を実施する。', deprecated: null },
        { doc_id: 'DOC-005', section: '価格交渉ガイド', score: 0.82, lang: 'ja', summary: '発注側の税負担増加は本体価格の2%から5%へ上昇するため、書面で誠実協議が必要。', deprecated: null },
        { doc_id: 'DOC-006', section: '電帳法保存', score: 0.79, lang: 'ja', summary: '受領した適格請求書PDFは日付・金額・取引先の3要素検索要件を満たして保存する。', deprecated: null },
      ],
    },
    null,
    2,
  ),
  markdown: `# System Instruction — Production Support Triage   
<!-- internal revision: 2026-11-19 draft -->



You are a strict, factual Tier-2 support engineer.    Summarize the incident payload below and return valid JSON only.   

--------

## Rules
1. Never invent customer IDs, invoice amounts, or timestamps.   
2. Flag any 5xx spike lasting over 3 minutes as \`sev2\`.


\`\`\`json
{
  "severity": "sev2",
  "owner_team": "payments",
  "next_action": "Verify webhook retry queue"
}
\`\`\`


`,
};

const $ = (id) => document.getElementById(id);

let currentLang = 'en';
let models = DEFAULT_MODEL_CATALOG.map((m) => ({ ...m }));
let selectedBaselineId = 'claude-sonnet';
let latestOptimization = null;

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtUsd(val, digits = 2) {
  const num = Number(val) || 0;
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function fmtJpy(val) {
  return `¥${Math.round(Number(val) || 0).toLocaleString('ja-JP')}`;
}

function applyLanguage(lang) {
  currentLang = lang === 'ja' ? 'ja' : 'en';
  document.documentElement.lang = currentLang;
  $('langEn').classList.toggle('is-active', currentLang === 'en');
  $('langJa').classList.toggle('is-active', currentLang === 'ja');

  const dict = I18N[currentLang];
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) el.textContent = dict[key];
  });
  renderAll({ rebuildTable: true });
}

function populateBaselineSelect() {
  const sel = $('baselineModel');
  sel.innerHTML = models.map((m) => (
    `<option value="${esc(m.id)}" ${m.id === selectedBaselineId ? 'selected' : ''}>${esc(m.name)} (${esc(m.provider)})</option>`
  )).join('');
}

function renderCostChartSvg(rows) {
  const dict = I18N[currentLang];
  const width = 820;
  const rowH = 30;
  const pad = { top: 24, right: 92, bottom: 16, left: 168 };
  const height = pad.top + rows.length * rowH + pad.bottom;
  const plotW = width - pad.left - pad.right;

  const maxUsd = Math.max(1, ...rows.map((r) => r.monthlyCostUsd));

  let bars = '';
  rows.forEach((r, idx) => {
    const y = pad.top + idx * rowH;
    const rawW = Math.max(2, (r.monthlyCostUsd / maxUsd) * plotW);
    const optW = Math.max(2, (r.optimizedMonthlyCostUsd / maxUsd) * plotW);
    const isBase = r.id === selectedBaselineId;

    bars += `
      <text x="${pad.left - 10}" y="${y + 16}" text-anchor="end" fill="${isBase ? '#2546a8' : '#111827'}" font-size="11.5" font-weight="${isBase ? '700' : '500'}">${esc(r.name)}</text>
      <rect x="${pad.left}" y="${y + 4}" width="${rawW}" height="8" fill="#cbd5e1" rx="2">
        <title>${esc(r.name)} Raw: ${fmtUsd(r.monthlyCostUsd)}/mo</title>
      </rect>
      <rect x="${pad.left}" y="${y + 14}" width="${optW}" height="8" fill="${isBase ? '#2546a8' : '#0e6b47'}" rx="2">
        <title>${esc(r.name)} Optimized: ${fmtUsd(r.optimizedMonthlyCostUsd)}/mo</title>
      </rect>
      <text x="${pad.left + Math.max(rawW, optW) + 8}" y="${y + 16}" text-anchor="start" fill="#4b5563" font-size="11">${fmtUsd(r.optimizedMonthlyCostUsd)} / mo</text>
    `;
  });

  return `
    <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${pad.left}" y="5" width="10" height="8" fill="#cbd5e1" rx="2" />
      <text x="${pad.left + 15}" y="13" fill="#4b5563" font-size="11">${esc(dict.chartRaw)}</text>
      <rect x="${pad.left + 145}" y="5" width="10" height="8" fill="#0e6b47" rx="2" />
      <text x="${pad.left + 160}" y="13" fill="#4b5563" font-size="11">${esc(dict.chartOpt)}</text>
      <line x1="${pad.left}" y1="${pad.top - 2}" x2="${pad.left}" y2="${height - pad.bottom}" stroke="#b6c0ce" stroke-width="1" />
      ${bars}
    </svg>
  `;
}

function buildCostTable(rows) {
  const tbody = $('costTableBody');
  tbody.innerHTML = rows.map((r) => `
    <tr data-model-id="${esc(r.id)}" class="${r.id === selectedBaselineId ? 'is-selected' : ''}">
      <td><strong>${esc(r.name)}</strong><br><span style="font-size:11px;color:#4b5563;">${esc(r.provider)}</span></td>
      <td><span class="badge badge--muted">${esc(r.tier)}</span></td>
      <td class="num"><input class="price-input" type="number" step="0.01" min="0" data-field="inputPer1M" data-id="${esc(r.id)}" value="${r.inputPer1M}" aria-label="${esc(r.name)} input price"></td>
      <td class="num"><input class="price-input" type="number" step="0.01" min="0" data-field="cachedInputPer1M" data-id="${esc(r.id)}" value="${r.cachedInputPer1M}" aria-label="${esc(r.name)} cached input price"></td>
      <td class="num"><input class="price-input" type="number" step="0.01" min="0" data-field="outputPer1M" data-id="${esc(r.id)}" value="${r.outputPer1M}" aria-label="${esc(r.name)} output price"></td>
      <td class="num" data-cell="perCall">${fmtUsd(r.costPerCallUsd, 5)}</td>
      <td class="num" data-cell="moRaw">${fmtUsd(r.monthlyCostUsd)}</td>
      <td class="num" data-cell="moOpt"><strong>${fmtUsd(r.optimizedMonthlyCostUsd)}</strong></td>
      <td class="num" data-cell="moJpy">${fmtJpy(r.optimizedMonthlyCostJpy)}</td>
      <td class="num save-text" data-cell="moSave">-${fmtUsd(r.monthlySavingsUsd)}<br><span style="font-size:10.5px;font-weight:500;">(${fmtJpy(r.monthlySavingsJpy)})</span></td>
    </tr>
  `).join('');
}

function patchCostTableCells(rows) {
  const tbody = $('costTableBody');
  rows.forEach((r) => {
    const tr = tbody.querySelector(`tr[data-model-id="${r.id}"]`);
    if (!tr) return;
    tr.classList.toggle('is-selected', r.id === selectedBaselineId);
    tr.querySelector('[data-cell="perCall"]').textContent = fmtUsd(r.costPerCallUsd, 5);
    tr.querySelector('[data-cell="moRaw"]').textContent = fmtUsd(r.monthlyCostUsd);
    tr.querySelector('[data-cell="moOpt"]').innerHTML = `<strong>${fmtUsd(r.optimizedMonthlyCostUsd)}</strong>`;
    tr.querySelector('[data-cell="moJpy"]').textContent = fmtJpy(r.optimizedMonthlyCostJpy);
    tr.querySelector('[data-cell="moSave"]').innerHTML = `-${fmtUsd(r.monthlySavingsUsd)}<br><span style="font-size:10.5px;font-weight:500;">(${fmtJpy(r.monthlySavingsJpy)})</span>`;
  });
}

function renderAll({ rebuildTable = false } = {}) {
  const dict = I18N[currentLang];
  const rawText = $('rawInput').value;
  const mode = $('optMode').value;
  const stripEmpty = $('stripEmpty').checked;
  const outputTokens = Math.max(0, Number($('outputTokens').value) || 0);
  const cachedInputRatio = Math.min(95, Math.max(0, Number($('cachedRatio').value) || 0)) / 100;
  const callsPerDay = Math.max(1, Number($('callsPerDay').value) || 1);
  const daysPerMonth = Math.max(1, Number($('daysPerMonth').value) || 30);
  const usdJpyRate = Math.max(50, Number($('usdJpyRate').value) || 155);

  const baseline = models.find((m) => m.id === selectedBaselineId) || models[0];

  const opt = optimizePayloadForLlm(rawText, {
    mode,
    stripEmpty,
    inputPer1M: baseline.inputPer1M,
    callsPerDay,
    daysPerMonth,
    usdJpyRate,
  });
  latestOptimization = opt;

  const matrix = calculateModelCosts({
    inputTokens: opt.before.tokens,
    optimizedInputTokens: opt.after.tokens,
    outputTokens,
    cachedInputRatio,
    callsPerDay,
    daysPerMonth,
    usdJpyRate,
    models,
  });

  const baseRow = matrix.rows.find((r) => r.id === baseline.id) || matrix.rows[0];

  // Headline finding
  if (currentLang === 'ja') {
    $('headlineSummary').innerHTML = `
      <strong>${opt.before.tokens.toLocaleString()} → ${opt.after.tokens.toLocaleString()} トークン（-${opt.tokensSavedPct}%削減）</strong>
      — ${esc(baseline.name)} で1日 ${callsPerDay.toLocaleString()} コール運用時、月額 <strong>${fmtUsd(baseRow.monthlySavingsUsd)}（${fmtJpy(baseRow.monthlySavingsJpy)}）</strong> を削減できます。
    `;
  } else {
    $('headlineSummary').innerHTML = `
      <strong>${opt.before.tokens.toLocaleString()} → ${opt.after.tokens.toLocaleString()} tokens (-${opt.tokensSavedPct}%)</strong>
      — Saves <strong>${fmtUsd(baseRow.monthlySavingsUsd)}/mo (${fmtJpy(baseRow.monthlySavingsJpy)})</strong> on ${esc(baseline.name)} at ${callsPerDay.toLocaleString()} calls/day.
    `;
  }

  // KPI Strip
  $('kpiRawTokens').textContent = opt.before.tokens.toLocaleString();
  $('kpiRawMeta').textContent = `${opt.before.chars.toLocaleString()} chars · ${opt.before.utf8Bytes.toLocaleString()} B · ${opt.before.charsPerToken} ch/tok`;

  $('kpiOptTokens').textContent = opt.after.tokens.toLocaleString();
  $('kpiOptMeta').textContent = `-${opt.tokensSaved.toLocaleString()} tok (-${opt.tokensSavedPct}%) · -${opt.charsSavedPct}% chars`;

  $('kpiBaseModelLabel').textContent = currentLang === 'ja'
    ? `月額コスト（${baseline.name}）`
    : `Monthly Cost (${baseline.name})`;
  $('kpiMonthlyRaw').textContent = fmtUsd(baseRow.monthlyCostUsd);
  $('kpiMonthlyOpt').textContent = `${currentLang === 'ja' ? '最適化後' : 'Optimized'}: ${fmtUsd(baseRow.optimizedMonthlyCostUsd)} (${fmtJpy(baseRow.optimizedMonthlyCostJpy)})`;

  $('kpiMonthlySavings').textContent = fmtUsd(baseRow.monthlySavingsUsd);
  $('kpiMonthlySavingsJpy').textContent = `${fmtJpy(baseRow.monthlySavingsJpy)} / mo · ${Math.max(0, opt.monthlySavings.monthlyTokensSaved).toLocaleString()} tok saved`;

  // Optimizer Panes
  $('optOutput').value = opt.optimizedText;
  $('scriptProfileBadge').textContent = opt.before.scriptProfile;
  $('strategyBadge').textContent = opt.strategyUsed;
  $('roundTripBadge').textContent = opt.roundTripVerified ? dict.rtVerified : dict.rtTextTrim;
  $('roundTripBadge').className = opt.roundTripVerified ? 'badge badge--save' : 'badge badge--muted';

  const b = opt.before.breakdown;
  $('scriptBreakdownStrip').innerHTML = [
    ['ASCII', b.asciiWords],
    ['Numbers', b.numbers],
    ['Kanji/CJK', b.cjkKanji],
    ['JP Kana', b.jpKana],
    ['Punct/JSON', b.punctuation],
    ['Whitespace', b.whitespace],
  ].filter(([, v]) => v > 0).map(([k, v]) => `<span class="stat-chip">${esc(k)}: <strong>${v}</strong></span>`).join('');

  $('optNoteStrip').innerHTML = `<span class="stat-chip">${esc(opt.note)}</span>`;

  // Cost Chart & Table
  $('costChart').innerHTML = renderCostChartSvg(matrix.rows);
  if (rebuildTable || $('costTableBody').children.length === 0) {
    buildCostTable(matrix.rows);
  } else {
    patchCostTableCells(matrix.rows);
  }
}

function wireEvents() {
  $('rawInput').addEventListener('input', () => renderAll());
  $('optMode').addEventListener('change', () => renderAll());
  $('stripEmpty').addEventListener('change', () => renderAll());

  $('baselineModel').addEventListener('change', (e) => {
    selectedBaselineId = e.target.value;
    renderAll();
  });

  ['outputTokens', 'cachedRatio', 'callsPerDay', 'daysPerMonth', 'usdJpyRate'].forEach((id) => {
    $(id).addEventListener('input', () => renderAll());
  });

  // Live editable model pricing inputs via event delegation
  $('costTableBody').addEventListener('input', (e) => {
    const target = e.target;
    if (!target.classList.contains('price-input')) return;
    const id = target.getAttribute('data-id');
    const field = target.getAttribute('data-field');
    const m = models.find((item) => item.id === id);
    if (m && field) {
      const val = Number(target.value);
      m[field] = Number.isFinite(val) && val >= 0 ? val : 0;
      renderAll({ rebuildTable: false });
    }
  });

  $('resetPricesBtn').addEventListener('click', () => {
    models = DEFAULT_MODEL_CATALOG.map((m) => ({ ...m }));
    renderAll({ rebuildTable: true });
  });

  document.querySelectorAll('[data-sample]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-sample');
      if (SAMPLES[key]) {
        $('rawInput').value = SAMPLES[key];
        renderAll();
      }
    });
  });

  $('langEn').addEventListener('click', () => applyLanguage('en'));
  $('langJa').addEventListener('click', () => applyLanguage('ja'));

  $('copyOptBtn').addEventListener('click', async () => {
    if (!latestOptimization) return;
    try {
      await navigator.clipboard.writeText(latestOptimization.optimizedText);
      const btn = $('copyOptBtn');
      btn.textContent = I18N[currentLang].copiedBtn;
      setTimeout(() => { btn.textContent = I18N[currentLang].copyOptBtn; }, 1400);
    } catch {
      window.prompt('Copy optimized output:', latestOptimization.optimizedText);
    }
  });
}

populateBaselineSelect();
$('rawInput').value = SAMPLES.apiArray;
wireEvents();
applyLanguage('en');
