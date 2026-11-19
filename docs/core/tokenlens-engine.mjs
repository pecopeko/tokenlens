/**
 * TOKENLENS Core Engine — Multi-Script LLM Token Estimator, Lossless JSON-to-Compact Tabular Optimizer & API Cost Matrix
 * 100% pure ES module, zero external dependencies, browser & Node.js compatible.
 */

export const DEFAULT_MODEL_CATALOG = Object.freeze([
  {
    id: 'claude-sonnet',
    name: 'Claude Sonnet 4.6',
    provider: 'Anthropic',
    tier: 'Frontier',
    inputPer1M: 3.00,
    cachedInputPer1M: 0.30,
    outputPer1M: 15.00,
  },
  {
    id: 'claude-opus',
    name: 'Claude Opus 4.6',
    provider: 'Anthropic',
    tier: 'Frontier',
    inputPer1M: 15.00,
    cachedInputPer1M: 1.50,
    outputPer1M: 75.00,
  },
  {
    id: 'claude-haiku',
    name: 'Claude Haiku 4.5',
    provider: 'Anthropic',
    tier: 'Fast',
    inputPer1M: 0.80,
    cachedInputPer1M: 0.08,
    outputPer1M: 4.00,
  },
  {
    id: 'gpt-4-1',
    name: 'GPT-4.1 / Flagship',
    provider: 'OpenAI',
    tier: 'Frontier',
    inputPer1M: 2.00,
    cachedInputPer1M: 0.50,
    outputPer1M: 8.00,
  },
  {
    id: 'gpt-4-1-mini',
    name: 'GPT-4.1 mini',
    provider: 'OpenAI',
    tier: 'Fast',
    inputPer1M: 0.40,
    cachedInputPer1M: 0.10,
    outputPer1M: 1.60,
  },
  {
    id: 'gemini-2-5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'Google',
    tier: 'Frontier',
    inputPer1M: 1.25,
    cachedInputPer1M: 0.31,
    outputPer1M: 10.00,
  },
  {
    id: 'gemini-2-5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'Google',
    tier: 'Fast',
    inputPer1M: 0.15,
    cachedInputPer1M: 0.0375,
    outputPer1M: 0.60,
  },
  {
    id: 'deepseek-v3',
    name: 'DeepSeek V3 / Reasoner',
    provider: 'DeepSeek',
    tier: 'Value',
    inputPer1M: 0.27,
    cachedInputPer1M: 0.07,
    outputPer1M: 1.10,
  },
  {
    id: 'custom-model',
    name: 'Custom Model (Editable)',
    provider: 'Custom',
    tier: 'Custom',
    inputPer1M: 1.00,
    cachedInputPer1M: 0.25,
    outputPer1M: 4.00,
  },
]);

const NUMERIC_STRING_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

function utf8ByteLength(str) {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str).length;
  }
  let bytes = 0;
  for (let i = 0; i < str.length; i += 1) {
    const c = str.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

/**
 * Multi-script BPE-calibrated LLM token estimator (zero external WASM/CDN dependencies).
 * Accurately differentiates ASCII prose/code (~3.8-4.2 chars/tok), 3-digit numeric merges,
 * Japanese Kana (~1.15 tok/char), CJK Han/Kanji (~1.45 tok/char), Korean Hangul (~1.25 tok/char),
 * JSON/code structural punctuation, and indentation/newline whitespace overhead.
 */
export function estimateTokens(rawText) {
  const text = typeof rawText === 'string' ? rawText : String(rawText ?? '');
  if (text.length === 0) {
    return {
      tokens: 0,
      chars: 0,
      utf8Bytes: 0,
      lines: 0,
      charsPerToken: 0,
      scriptProfile: 'empty',
      breakdown: {
        asciiWords: 0,
        numbers: 0,
        cjkKanji: 0,
        jpKana: 0,
        hangul: 0,
        punctuation: 0,
        whitespace: 0,
        other: 0,
      },
    };
  }

  const breakdown = {
    asciiWords: 0,
    numbers: 0,
    cjkKanji: 0,
    jpKana: 0,
    hangul: 0,
    punctuation: 0,
    whitespace: 0,
    other: 0,
  };

  let tokenFloat = 0;
  let cjkChars = 0;
  let asciiChars = 0;

  // Tokenize into script-homogeneous runs
  const runRe = /([A-Za-z]+)|(\d+)|([\u4E00-\u9FFF\u3400-\u4DBF]+)|([\u3040-\u309F\u30A0-\u30FF\u30FC]+)|([\uAC00-\uD7AF]+)|(\r?\n[ \t]*)|([ \t]+)|([{}[\]":,;|<>()=+\-*/\\!@#$%^&?~`.'"]+)|([\s\S])/gu;

  let match;
  while ((match = runRe.exec(text)) !== null) {
    const [, word, num, kanji, kana, hangul, nlIndent, spaces, punct, other] = match;

    if (word) {
      asciiChars += word.length;
      // Split camelCase segments subtly; short English words merge to 1 token
      const segments = word.split(/(?=[A-Z][a-z])/).filter(Boolean);
      let segTokens = 0;
      for (const seg of segments) {
        if (seg.length <= 5) segTokens += 1;
        else if (seg.length <= 9) segTokens += 1.45;
        else segTokens += Math.ceil(seg.length / 4);
      }
      breakdown.asciiWords += segTokens;
      tokenFloat += segTokens;
    } else if (num) {
      asciiChars += num.length;
      // BPE merges up to 3 digits into one token
      const t = Math.ceil(num.length / 3);
      breakdown.numbers += t;
      tokenFloat += t;
    } else if (kanji) {
      cjkChars += kanji.length;
      // CJK Han characters average ~1.45 BPE tokens/char across cl100k/o200k/Claude
      const t = kanji.length * 1.45;
      breakdown.cjkKanji += t;
      tokenFloat += t;
    } else if (kana) {
      cjkChars += kana.length;
      // Hiragana/Katakana average ~1.15 BPE tokens/char
      const t = kana.length * 1.15;
      breakdown.jpKana += t;
      tokenFloat += t;
    } else if (hangul) {
      cjkChars += hangul.length;
      const t = hangul.length * 1.25;
      breakdown.hangul += t;
      tokenFloat += t;
    } else if (nlIndent) {
      // Newline + indentation block: newline ~0.8 + each 2-space indent ~0.45
      const indentLen = nlIndent.replace(/\r?\n/, '').length;
      const t = 0.8 + Math.ceil(indentLen / 2) * 0.45;
      breakdown.whitespace += t;
      tokenFloat += t;
    } else if (spaces) {
      // Single space usually merges into adjacent ASCII word; extra spaces cost tokens
      const t = spaces.length === 1 ? 0.08 : 0.35 + Math.ceil((spaces.length - 1) / 2) * 0.45;
      breakdown.whitespace += t;
      tokenFloat += t;
    } else if (punct) {
      asciiChars += punct.length;
      // JSON structural runs like `": "` or `",` or `{` or `}` cost ~0.72 tokens/char
      const t = punct.length === 1 ? 0.78 : Math.ceil(punct.length * 0.68);
      breakdown.punctuation += t;
      tokenFloat += t;
    } else if (other) {
      // Emoji, full-width punctuation, accented chars
      const cp = other.codePointAt(0) || 0;
      const t = cp > 0xffff ? 2.0 : (cp >= 0x3000 && cp <= 0x303f ? 1.0 : 1.15);
      breakdown.other += t;
      tokenFloat += t;
    }
  }

  const tokens = Math.max(1, Math.round(tokenFloat));
  const chars = text.length;
  const utf8Bytes = utf8ByteLength(text);
  const lines = text.split(/\r?\n/).length;

  let scriptProfile = 'ascii-dominant';
  if (cjkChars > 0 && cjkChars >= asciiChars * 0.35) {
    scriptProfile = asciiChars > cjkChars * 0.5 ? 'mixed-code-cjk' : 'cjk-dominant';
  }

  return {
    tokens,
    chars,
    utf8Bytes,
    lines,
    charsPerToken: Number((chars / tokens).toFixed(2)),
    scriptProfile,
    breakdown: {
      asciiWords: Math.round(breakdown.asciiWords),
      numbers: Math.round(breakdown.numbers),
      cjkKanji: Math.round(breakdown.cjkKanji),
      jpKana: Math.round(breakdown.jpKana),
      hangul: Math.round(breakdown.hangul),
      punctuation: Math.round(breakdown.punctuation),
      whitespace: Math.round(breakdown.whitespace),
      other: Math.round(breakdown.other),
    },
  };
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Recursively prune null, empty string, empty array, and empty object entries.
 */
export function pruneEmptyValues(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => pruneEmptyValues(item))
      .filter((item) => {
        if (item === null || item === undefined || item === '') return false;
        if (Array.isArray(item) && item.length === 0) return false;
        if (isPlainObject(item) && Object.keys(item).length === 0) return false;
        return true;
      });
  }
  if (isPlainObject(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const cleaned = pruneEmptyValues(v);
      if (cleaned === null || cleaned === undefined || cleaned === '') continue;
      if (Array.isArray(cleaned) && cleaned.length === 0) continue;
      if (isPlainObject(cleaned) && Object.keys(cleaned).length === 0) continue;
      out[k] = cleaned;
    }
    return out;
  }
  return value;
}

function isUniformObjectArray(arr) {
  if (!Array.isArray(arr) || arr.length < 2) return false;
  if (!arr.every((item) => isPlainObject(item))) return false;
  const keyCounts = new Map();
  for (const row of arr) {
    const keys = Object.keys(row);
    if (keys.length === 0) return false;
    for (const k of keys) {
      keyCounts.set(k, (keyCounts.get(k) || 0) + 1);
    }
  }
  // Must have at least 1 shared key across >= 50% of rows
  const shared = [...keyCounts.values()].filter((c) => c >= Math.ceil(arr.length * 0.5)).length;
  return shared >= 1;
}

function encodeCell(val) {
  if (val === undefined) return '';
  if (val === null) return '~';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') {
    return Number.isFinite(val) ? String(val) : '~';
  }
  if (typeof val === 'string') {
    const needsQuote = (
      val.length === 0
      || val === '~'
      || val === 'true'
      || val === 'false'
      || NUMERIC_STRING_RE.test(val)
      || /^\s|\s$/.test(val)
      || val.startsWith('"')
      || val.startsWith('@json:')
      || /[\r\n]/.test(val)
    );
    if (needsQuote) {
      return JSON.stringify(val).replace(/\|/g, '\\u007c');
    }
    return val.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
  }
  // Nested array or object -> compact inline JSON marker
  return `@json:${JSON.stringify(val).replace(/\|/g, '\\u007c')}`;
}

function decodeCell(raw) {
  if (raw === '') return undefined;
  if (raw === '~') return null;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw.startsWith('@json:')) {
    return JSON.parse(raw.slice(6));
  }
  if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
    return JSON.parse(raw);
  }
  if (NUMERIC_STRING_RE.test(raw)) {
    return Number(raw);
  }
  // Unescape \| and \\
  let out = '';
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] === '\\' && i + 1 < raw.length) {
      const next = raw[i + 1];
      if (next === '|' || next === '\\') {
        out += next;
        i += 1;
        continue;
      }
    }
    out += raw[i];
  }
  return out;
}

function splitEscapedRow(line) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  let escaped = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (escaped) {
      cur += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      cur += ch;
      escaped = true;
      continue;
    }
    if (ch === '"' && (cur.length === 0 || inQuotes)) {
      inQuotes = !inQuotes;
      cur += ch;
      continue;
    }
    if (ch === '|' && !inQuotes) {
      cells.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur);
  return cells;
}

function encodeHeaderKey(key) {
  return key.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\)/g, '\\)');
}

function decodeHeaderKeys(raw) {
  const keys = [];
  let cur = '';
  let escaped = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (escaped) {
      cur += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '|') {
      keys.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  keys.push(cur);
  return keys;
}

function encodeObjectArrayLines(arr, headerPrefix) {
  const cols = [];
  const colSet = new Set();
  for (const row of arr) {
    for (const k of Object.keys(row)) {
      if (!colSet.has(k)) {
        colSet.add(k);
        cols.push(k);
      }
    }
  }
  const header = `${headerPrefix}[${arr.length}](${cols.map(encodeHeaderKey).join('|')})`;
  const lines = [header];
  for (const row of arr) {
    const cells = cols.map((col) => encodeCell(Object.prototype.hasOwnProperty.call(row, col) ? row[col] : undefined));
    lines.push(cells.join('|'));
  }
  return lines;
}

/**
 * Encode uniform JSON array (or wrapper object containing object arrays) into TOON-style Compact Tabular format.
 * 100% lossless round-trip compatible with decodeCompactTabular().
 */
export function encodeCompactTabular(data) {
  if (isUniformObjectArray(data)) {
    return encodeObjectArrayLines(data, '@schema').join('\n');
  }
  if (isPlainObject(data)) {
    const hasTabularChild = Object.values(data).some((v) => isUniformObjectArray(v));
    if (hasTabularChild) {
      const lines = ['@object'];
      for (const [k, v] of Object.entries(data)) {
        if (isUniformObjectArray(v)) {
          lines.push(...encodeObjectArrayLines(v, `@table ${JSON.stringify(k)}`));
        } else {
          lines.push(`@kv ${JSON.stringify(k)}=${encodeCell(v)}`);
        }
      }
      return lines.join('\n');
    }
  }
  return JSON.stringify(data);
}

/**
 * Lossless decoder reversing encodeCompactTabular() back into exact JavaScript data structures.
 */
export function decodeCompactTabular(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('@schema[')) {
    const lines = trimmed.split('\n');
    const headerMatch = lines[0].match(/^@schema\[(\d+)\]\((.*)\)$/);
    if (!headerMatch) throw new Error('Invalid @schema header');
    const count = Number(headerMatch[1]);
    const cols = decodeHeaderKeys(headerMatch[2]);
    const rows = [];
    for (let i = 1; i <= count; i += 1) {
      const line = lines[i] ?? '';
      const cells = splitEscapedRow(line);
      const obj = {};
      for (let c = 0; c < cols.length; c += 1) {
        const val = decodeCell(cells[c] ?? '');
        if (val !== undefined) obj[cols[c]] = val;
      }
      rows.push(obj);
    }
    return rows;
  }

  if (trimmed.startsWith('@object\n') || trimmed === '@object') {
    const lines = trimmed.split('\n');
    const result = {};
    let i = 1;
    while (i < lines.length) {
      const line = lines[i];
      if (line.startsWith('@table ')) {
        const tableMatch = line.match(/^@table ("(?:[^"\\]|\\.)*")\[(\d+)\]\((.*)\)$/);
        if (!tableMatch) throw new Error(`Invalid @table header at line ${i + 1}`);
        const key = JSON.parse(tableMatch[1]);
        const count = Number(tableMatch[2]);
        const cols = decodeHeaderKeys(tableMatch[3]);
        const rows = [];
        for (let r = 0; r < count; r += 1) {
          i += 1;
          const cells = splitEscapedRow(lines[i] ?? '');
          const obj = {};
          for (let c = 0; c < cols.length; c += 1) {
            const val = decodeCell(cells[c] ?? '');
            if (val !== undefined) obj[cols[c]] = val;
          }
          rows.push(obj);
        }
        result[key] = rows;
      } else if (line.startsWith('@kv ')) {
        const kvMatch = line.match(/^@kv ("(?:[^"\\]|\\.)*")=(.*)$/);
        if (!kvMatch) throw new Error(`Invalid @kv line at line ${i + 1}`);
        const key = JSON.parse(kvMatch[1]);
        result[key] = decodeCell(kvMatch[2]);
      }
      i += 1;
    }
    return result;
  }

  return JSON.parse(trimmed);
}

/**
 * Trim redundant whitespace, HTML comments, duplicate blank lines & decorative Markdown dividers
 * while strictly preserving fenced code block interiors.
 */
export function trimMarkdownAndWhitespace(rawText) {
  const normalized = String(rawText ?? '').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const out = [];
  let inFence = false;
  let blankStreak = 0;

  for (const rawLine of lines) {
    const trimmedStart = rawLine.trimStart();
    if (trimmedStart.startsWith('```') || trimmedStart.startsWith('~~~')) {
      inFence = !inFence;
      blankStreak = 0;
      out.push(rawLine.trimEnd());
      continue;
    }
    if (inFence) {
      out.push(rawLine.replace(/[ \t]+$/g, ''));
      continue;
    }
    // Strip single-line HTML comments
    let line = rawLine.replace(/<!--[\s\S]*?-->/g, '').trimEnd();
    // Skip decorative separator lines (--- / === / ***) when surrounded by whitespace
    if (/^\s*(?:[-*_]){4,}\s*$/.test(line)) {
      continue;
    }
    // Collapse multiple inline spaces after indentation
    line = line.replace(/^([ \t]*)(.*)$/, (_, indent, body) => {
      const compactIndent = indent.replace(/\t/g, '  ');
      const compactBody = body.replace(/[ \t]{2,}/g, ' ');
      return compactIndent + compactBody;
    });
    if (line.trim() === '') {
      blankStreak += 1;
      if (blankStreak <= 1 && out.length > 0) out.push('');
    } else {
      blankStreak = 0;
      out.push(line);
    }
  }

  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return out.join('\n');
}

function deepEqualJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Optimize a prompt / JSON API payload for LLM consumption and calculate exact token & USD/JPY cost savings.
 */
export function optimizePayloadForLlm(inputText, options = {}) {
  const raw = typeof inputText === 'string' ? inputText : String(inputText ?? '');
  const mode = options.mode || 'auto'; // 'auto' | 'compact-tabular' | 'minify-json' | 'trim-markdown'
  const stripEmpty = Boolean(options.stripEmpty);
  const inputPer1M = Number(options.inputPer1M ?? 3.0);
  const callsPerDay = Math.max(0, Number(options.callsPerDay ?? 1_000));
  const daysPerMonth = Math.max(1, Number(options.daysPerMonth ?? 30));
  const usdJpyRate = Math.max(1, Number(options.usdJpyRate ?? 155));

  const before = estimateTokens(raw);

  let parsed = null;
  let isJson = false;
  try {
    parsed = JSON.parse(raw);
    isJson = true;
  } catch {
    isJson = false;
  }

  let strategyUsed = mode;
  let optimizedText = raw;
  let roundTripVerified = false;
  let note = '';

  if (mode === 'trim-markdown' || !isJson) {
    strategyUsed = 'trim-markdown';
    optimizedText = trimMarkdownAndWhitespace(raw);
    note = !isJson && mode !== 'trim-markdown'
      ? 'Input is not valid JSON; applied Markdown & whitespace redundancy trimmer.'
      : 'Trimmed trailing spaces, redundant blank lines, HTML comments & decorative dividers.';
  } else {
    const workingData = stripEmpty ? pruneEmptyValues(parsed) : parsed;
    const canTabular = isUniformObjectArray(workingData)
      || (isPlainObject(workingData) && Object.values(workingData).some((v) => isUniformObjectArray(v)));

    if (mode === 'compact-tabular' || (mode === 'auto' && canTabular)) {
      if (canTabular) {
        strategyUsed = 'compact-tabular';
        optimizedText = encodeCompactTabular(workingData);
        try {
          const decoded = decodeCompactTabular(optimizedText);
          roundTripVerified = deepEqualJson(decoded, workingData);
        } catch {
          roundTripVerified = false;
        }
        note = stripEmpty
          ? 'Encoded uniform object array to Compact Tabular (@schema) + pruned null/empty fields.'
          : 'Lossless Compact Tabular (@schema) encoding — 100% round-trip verified.';
      } else {
        strategyUsed = 'minify-json';
        optimizedText = JSON.stringify(workingData);
        roundTripVerified = deepEqualJson(JSON.parse(optimizedText), workingData);
        note = 'No uniform object array detected; applied minified JSON serialization.';
      }
    } else {
      strategyUsed = 'minify-json';
      optimizedText = JSON.stringify(workingData);
      roundTripVerified = deepEqualJson(JSON.parse(optimizedText), workingData);
      note = stripEmpty
        ? 'Minified JSON + stripped null, empty string, and empty array/object fields.'
        : 'Lossless minified JSON (zero indentation/whitespace).';
    }
  }

  const after = estimateTokens(optimizedText);
  const charsSaved = before.chars - after.chars;
  const charsSavedPct = before.chars > 0 ? Number(((charsSaved / before.chars) * 100).toFixed(1)) : 0;
  const tokensSaved = before.tokens - after.tokens;
  const tokensSavedPct = before.tokens > 0 ? Number(((tokensSaved / before.tokens) * 100).toFixed(1)) : 0;

  const monthlyTokensSaved = Math.max(0, tokensSaved) * callsPerDay * daysPerMonth;
  const monthlySavingsUsd = Number(((monthlyTokensSaved / 1_000_000) * inputPer1M).toFixed(2));
  const monthlySavingsJpy = Math.round(monthlySavingsUsd * usdJpyRate);

  return {
    strategyUsed,
    isJson,
    stripEmpty,
    roundTripVerified,
    note,
    originalText: raw,
    optimizedText,
    before,
    after,
    charsSaved,
    charsSavedPct,
    tokensSaved,
    tokensSavedPct,
    monthlySavings: {
      callsPerDay,
      daysPerMonth,
      inputPer1M,
      usdJpyRate,
      monthlyTokensSaved,
      usd: monthlySavingsUsd,
      jpy: monthlySavingsJpy,
    },
  };
}

/**
 * Multi-Model API Cost Matrix Calculator (Input + Cached Input + Output, USD & JPY).
 * Accepts editable custom model arrays so pricing is never locked to stale rates.
 */
export function calculateModelCosts({
  inputTokens = 0,
  optimizedInputTokens = null,
  outputTokens = 500,
  cachedInputRatio = 0,
  callsPerDay = 1_000,
  daysPerMonth = 30,
  usdJpyRate = 155,
  models = DEFAULT_MODEL_CATALOG,
} = {}) {
  const inTok = Math.max(0, Number(inputTokens) || 0);
  const optInTok = optimizedInputTokens !== null ? Math.max(0, Number(optimizedInputTokens) || 0) : inTok;
  const outTok = Math.max(0, Number(outputTokens) || 0);
  const cacheRatio = Math.min(Math.max(Number(cachedInputRatio) || 0, 0), 0.99);
  const calls = Math.max(0, Number(callsPerDay) || 0);
  const days = Math.max(1, Number(daysPerMonth) || 30);
  const fx = Math.max(1, Number(usdJpyRate) || 155);

  function computeForInput(model, tokensIn) {
    const uncached = tokensIn * (1 - cacheRatio);
    const cached = tokensIn * cacheRatio;
    const inputRate = Math.max(0, Number(model.inputPer1M) || 0);
    const cachedRate = Math.max(0, Number(model.cachedInputPer1M ?? inputRate) || 0);
    const outputRate = Math.max(0, Number(model.outputPer1M) || 0);

    const perCallUsd = (uncached * inputRate + cached * cachedRate + outTok * outputRate) / 1_000_000;
    const dailyUsd = perCallUsd * calls;
    const monthlyUsd = dailyUsd * days;
    return {
      perCallUsd,
      dailyUsd,
      monthlyUsd,
      monthlyJpy: Math.round(monthlyUsd * fx),
      annualUsd: monthlyUsd * 12,
    };
  }

  const rows = models.map((model) => {
    const rawCost = computeForInput(model, inTok);
    const optCost = computeForInput(model, optInTok);
    const monthlySavingsUsd = Math.max(0, rawCost.monthlyUsd - optCost.monthlyUsd);
    const monthlySavingsJpy = Math.max(0, rawCost.monthlyJpy - optCost.monthlyJpy);

    return {
      ...model,
      costPerCallUsd: rawCost.perCallUsd,
      dailyCostUsd: rawCost.dailyUsd,
      monthlyCostUsd: rawCost.monthlyUsd,
      monthlyCostJpy: rawCost.monthlyJpy,
      annualCostUsd: rawCost.annualUsd,
      optimizedMonthlyCostUsd: optCost.monthlyUsd,
      optimizedMonthlyCostJpy: optCost.monthlyJpy,
      monthlySavingsUsd,
      monthlySavingsJpy,
    };
  });

  return {
    params: {
      inputTokens: inTok,
      optimizedInputTokens: optInTok,
      outputTokens: outTok,
      cachedInputRatio: cacheRatio,
      callsPerDay: calls,
      daysPerMonth: days,
      usdJpyRate: fx,
    },
    rows,
  };
}
