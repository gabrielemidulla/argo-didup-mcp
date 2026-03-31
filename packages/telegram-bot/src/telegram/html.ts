import { encode } from "he";
import { compile } from "html-to-text";

const htmlToPlainCompiled = compile({
  wordwrap: false,
  selectors: [
    {
      selector: "a",
      options: {
        linkBrackets: [": ", ""] as [string, string],
      },
    },
  ],
});

export function escapeHtml(s: string): string {
  return encode(s);
}

export function htmlToPlainText(html: string): string {
  const t = htmlToPlainCompiled(html);
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

const PRE_PH = "\uFFF0";
const PRE_END = "\uFFF1";

function maskTelegramPreBlocks(html: string): { masked: string; blocks: string[] } {
  const blocks: string[] = [];
  const masked = html.replace(/<pre[^>]*>[\s\S]*?<\/pre>/gi, (block) => {
    blocks.push(block);
    return `${PRE_PH}PRE_${blocks.length - 1}${PRE_END}`;
  });
  return { masked, blocks };
}

function unmaskTelegramPreBlocks(masked: string, blocks: string[]): string {
  return masked.replace(
    new RegExp(`${PRE_PH}PRE_(\\d+)${PRE_END}`, "g"),
    (_, id: string) => blocks[Number(id)] ?? "",
  );
}

function escapeTelegramHtmlAttrValue(value: string): string {
  return encode(value, { useNamedReferences: false });
}

function escapeTelegramAnchorInnerText(value: string): string {
  return encode(value, { useNamedReferences: false });
}

function isInsideQuotedHrefValue(html: string, pos: number): boolean {
  const before = html.slice(0, pos);
  const dq = before.lastIndexOf('href="');
  if (dq !== -1) {
    const v0 = dq + 6;
    const close = html.indexOf('"', v0);
    if (close === -1 || close > pos) return true;
  }
  const sq = before.lastIndexOf("href='");
  if (sq !== -1) {
    const v0 = sq + 6;
    const close = html.indexOf("'", v0);
    if (close === -1 || close > pos) return true;
  }
  return false;
}

const PORTALE_ARGO_SIGNED_URL_RE =
  /https:\/\/[^\s<>"']*\.portaleargo\.it[^\s<>"']*/gi;

function wrapBarePortaleArgoUrls(fragment: string): string {
  const parts: string[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  PORTALE_ARGO_SIGNED_URL_RE.lastIndex = 0;
  while ((m = PORTALE_ARGO_SIGNED_URL_RE.exec(fragment)) !== null) {
    const url = m[0];
    const start = m.index;
    parts.push(fragment.slice(last, start));
    last = start + url.length;
    if (isInsideQuotedHrefValue(fragment, start)) {
      parts.push(url);
      continue;
    }
    const href = escapeTelegramHtmlAttrValue(url);
    parts.push(`<a href="${href}">📄 Apri allegato</a>`);
  }
  parts.push(fragment.slice(last));
  return parts.join("");
}

function wrapArgoCircolareUrlsInTelegramHtml(html: string): string {
  if (!html.includes(".portaleargo.it")) return html;

  html = html.replace(
    /(\.pdf)\s*:\s*\n+\s*(https:\/\/[^\s<>"']*\.portaleargo\.it[^\s<>"']*)/gi,
    "$1: $2",
  );

  const lines = html.split("\n");
  const out = lines.map((line) => {
    if (!line.includes("<")) {
      const trimmed = line.trim();
      if (trimmed.length > 0) {
        const labeled = /^(.{1,280}?\.pdf)\s*:\s*(https:\/\/[^\s<>"']*\.portaleargo\.it[^\s<>"']*)\s*$/i.exec(
          trimmed,
        );
        if (labeled) {
          const labelPart = labeled[1]!.trim();
          const url = labeled[2]!;
          const display =
            labelPart.replace(/^\s*📄\s*/u, "").trim() || "Allegato";
          const wsLead = line.match(/^(\s*)/)?.[1] ?? "";
          const inner = escapeTelegramAnchorInnerText(display);
          const href = escapeTelegramHtmlAttrValue(url);
          return `${wsLead}📄 <a href="${href}">${inner}</a>`;
        }
      }
    }
    return wrapBarePortaleArgoUrls(line);
  });
  return out.join("\n");
}

const TG_BALANCE_TAG_RE =
  /<\/?(b|strong|i|em|u|ins|s|strike|del|code|pre|a|tg-spoiler)(\s[^>]*)?>/gi;

function rewriteBalancedTelegramHtml(html: string): string {
  const stack: string[] = [];
  const out: string[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(TG_BALANCE_TAG_RE.source, "gi");
  while ((m = re.exec(html)) !== null) {
    out.push(html.slice(last, m.index));
    const full = m[0];
    const name = m[1]!.toLowerCase();
    last = m.index + full.length;
    if (full.startsWith("</")) {
      const idx = stack.lastIndexOf(name);
      if (idx === -1) {
        continue;
      }
      while (stack.length > idx + 1) {
        const inner = stack.pop()!;
        out.push(`</${inner}>`);
      }
      stack.pop();
      out.push(full);
    } else {
      stack.push(name);
      out.push(full);
    }
  }
  out.push(html.slice(last));
  while (stack.length > 0) {
    out.push(`</${stack.pop()}>`);
  }
  return out.join("");
}

function escapeStrayLtTelegram(html: string): string {
  const tagHead =
    /^<\/?(?:b|strong|i|em|u|ins|s|strike|del|code|pre|a|tg-spoiler)(?:\s|>|\/)/i;
  const spanSpoiler =
    /^<span(?:\s[^>]*)?class\s*=\s*["'][^"']*tg-spoiler[^"']*["'][^>]*>/i;
  let out = "";
  let i = 0;
  while (i < html.length) {
    const c = html[i]!;
    if (c !== "<") {
      out += c;
      i++;
      continue;
    }
    const rest = html.slice(i);
    let len = 0;
    if (tagHead.test(rest)) {
      const m = rest.match(/^<\/?(?:b|strong|i|em|u|ins|s|strike|del|code|pre|a|tg-spoiler)(\s[^>]*)?>/i);
      len = m?.[0].length ?? 0;
    } else if (spanSpoiler.test(rest)) {
      const m = rest.match(spanSpoiler);
      len = m?.[0].length ?? 0;
    }
    if (len > 0) {
      out += rest.slice(0, len);
      i += len;
    } else {
      out += "&lt;";
      i++;
    }
  }
  return out;
}

export function sanitizeTelegramOutgoingHtml(html: string): string {
  const { masked, blocks } = maskTelegramPreBlocks(html);
  let s = wrapArgoCircolareUrlsInTelegramHtml(masked);
  s = rewriteBalancedTelegramHtml(s);
  s = escapeStrayLtTelegram(s);
  return unmaskTelegramPreBlocks(s, blocks);
}
