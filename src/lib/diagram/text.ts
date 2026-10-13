import type { DiagramNode } from "./types";

const AMP = "\u0026amp;";
const LT = "\u0026lt;";
const GT = "\u0026gt;";
const QUOT = "\u0026quot;";
const APOS = "\u0026apos;";

export function esc(s: string): string {
  return s
    .replace(/&/g, AMP)
    .replace(/</g, LT)
    .replace(/>/g, GT)
    .replace(/"/g, QUOT);
}

export function unescapeXml(s: string): string {
  return s
    .replace(/&#xa;/gi, "\n")
    .replace(/&#10;/g, "\n")
    .replaceAll(QUOT, '"')
    .replaceAll(APOS, "'")
    .replaceAll(LT, "<")
    .replaceAll(GT, ">")
    .replaceAll(AMP, "&");
}

export function htmlToPlain(s: string): string {
  return unescapeXml(s)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replaceAll("\u0026nbsp;", " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function cellValue(node: Pick<DiagramNode, "label" | "subtitle">): string {
  const label = esc(node.label).replace(/\n/g, "<br>");
  if (!node.subtitle) return label;
  const sub = esc(node.subtitle).replace(/\n/g, "<br>");
  return `${label}<br><font style="font-size:11px" color="#6F675C">${sub}</font>`;
}

export function splitLabel(value: string): { label: string; subtitle?: string } {
  const raw = unescapeXml(value);
  const parts = raw.split(/<br\s*\/?>/i);
  const label = htmlToPlain(parts[0] ?? "").trim();
  const rest = parts.slice(1).join("\n");
  const subtitle = htmlToPlain(rest).trim();
  return subtitle ? { label: label || " ", subtitle } : { label: label || " " };
}

export function safeStyle(style: string): string {
  return style.replace(/["<>&\n\r]/g, "");
}
