import { ID_RE } from "./types";

export function slug(s: string): string {
  const base = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const id = base && /[a-z]/.test(base[0] ?? "") ? base : `n-${base || "node"}`;
  return id.slice(0, 72);
}

export function uniqueId(base: string, used: Set<string>): string {
  const root = ID_RE.test(base) ? base : slug(base);
  let id = root;
  let i = 2;
  while (used.has(id)) id = `${root}-${i++}`.slice(0, 79);
  used.add(id);
  return id;
}

export function isId(value: string): boolean {
  return ID_RE.test(value);
}
