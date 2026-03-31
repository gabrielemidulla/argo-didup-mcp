const LOG_NS = "[telegram-bot]";

function logTs(): string {
  return new Date().toISOString();
}

/** Avoid logging tokens, API keys, or signed URL query strings; use redactSignedUrl for tool URLs. */
function log(...args: unknown[]) {
  console.log(logTs(), LOG_NS, ...args);
}

function warn(...args: unknown[]) {
  console.warn(logTs(), LOG_NS, ...args);
}

function error(...args: unknown[]) {
  console.error(logTs(), LOG_NS, ...args);
}

function previewText(s: string, max = 240): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}… (${t.length} caratteri)`;
}

function redactSignedUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return "<url-non-valido>";
  }
}

function safeJsonPreview(value: unknown, max = 600): string {
  try {
    const s = JSON.stringify(value);
    return s.length <= max ? s : `${s.slice(0, max)}… (${s.length} byte JSON)`;
  } catch {
    return String(value);
  }
}

export default {
  log,
  warn,
  error,
  previewText,
  redactSignedUrl,
  safeJsonPreview,
};
