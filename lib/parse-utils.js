'use strict';

function parseAgentJson(raw) {
  if (!raw || typeof raw !== 'string') return { parseError: true };

  const fm = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fm) {
    try {
      return JSON.parse(fm[1].trim());
    } catch {}
  }

  const findJson = (str, o, c) => {
    const s = str.indexOf(o);
    if (s === -1) return null;
    let d = 0;
    for (let i = s; i < str.length; i++) {
      if (str[i] === o) d++;
      else if (str[i] === c) {
        d--;
        if (d === 0) return str.slice(s, i + 1);
      }
    }
    return null;
  };

  const obj = findJson(raw, '{', '}');
  if (obj) {
    try {
      return JSON.parse(obj);
    } catch {}
  }

  const arr = findJson(raw, '[', ']');
  if (arr) {
    try {
      return JSON.parse(arr);
    } catch {}
  }

  try {
    return JSON.parse(raw.trim());
  } catch {}

  console.warn('[parseAgentJson] failed:', raw.slice(0, 200));
  return { raw, parseError: true };
}

function estimateClaudeCost(responses) {
  const list = Array.isArray(responses) ? responses : [responses];
  const usage = list.reduce(
    (totals, response) => {
      const u = response.usage || {};
      totals.input += u.input_tokens || 0;
      totals.output += u.output_tokens || 0;
      totals.cacheWrite += u.cache_creation_input_tokens || 0;
      totals.cacheRead += u.cache_read_input_tokens || 0;
      return totals;
    },
    { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }
  );

  return {
    ...usage,
    dollars: (
      (usage.input / 1e6) * 1.0 +
      (usage.output / 1e6) * 5.0 +
      (usage.cacheWrite / 1e6) * 1.25 +
      (usage.cacheRead / 1e6) * 0.1
    ).toFixed(4)
  };
}

function isPdfBuffer(buf) {
  return buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
}

function esc(v) {
  return String(v || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function firstText(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return 'Not specified';
}

function severityOf(item) {
  return String(item.severity || item.level || 'MEDIUM').toUpperCase();
}

function riskClass(severity) {
  const sev = String(severity || '').toUpperCase();
  if (sev === 'HIGH' || sev === 'CRITICAL') return 'high';
  if (sev === 'LOW') return 'low';
  return 'medium';
}

function safeReportBaseName(filename) {
  const baseName = (filename || 'legal-document')
    .replace(/\.pdf$/i, '')
    .replace(/[^a-z0-9_\-]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return baseName || 'legal-document';
}

module.exports = {
  parseAgentJson,
  estimateClaudeCost,
  isPdfBuffer,
  esc,
  asArray,
  firstText,
  severityOf,
  riskClass,
  safeReportBaseName,
};
