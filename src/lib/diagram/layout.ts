import type { DiagramNode, DiagramPage } from "./types";

const GAP_X = 72;
const GAP_Y = 28;

function ancestorIn(id: string, set: Set<string>, byId: Map<string, DiagramNode>): string | null {
  const guard = new Set<string>();
  let cur: string | undefined = id;
  while (cur) {
    if (guard.has(cur)) return null;
    guard.add(cur);
    if (set.has(cur)) return cur;
    cur = byId.get(cur)?.parentId;
  }
  return null;
}

function groupOf(nodes: DiagramNode[], parentId: string | null, byId: Map<string, DiagramNode>) {
  return nodes.filter((n) => {
    const p = n.parentId && byId.has(n.parentId) ? n.parentId : null;
    return p === parentId;
  });
}

function layoutGroup(
  page: DiagramPage,
  nodes: DiagramNode[],
  parentId: string | null,
  byId: Map<string, DiagramNode>,
  direction: "horizontal" | "vertical",
): { w: number; h: number } {
  const group = groupOf(nodes, parentId, byId);
  for (const n of group) {
    if (groupOf(nodes, n.id, byId).length) {
      const size = layoutGroup(page, nodes, n.id, byId, direction);
      n.w = Math.max(n.w, size.w);
      n.h = Math.max(n.h, size.h);
    }
  }
  const pad = parentId ? 22 : 48;
  const title = parentId ? 34 : 0;
  if (!group.length) return { w: pad * 2 + 160, h: title + pad * 2 + 80 };

  const ids = new Set(group.map((n) => n.id));
  const outgoing = new Map<string, string[]>();
  const indeg = new Map<string, number>(group.map((n) => [n.id, 0]));
  for (const e of page.edges) {
    const a = ancestorIn(e.from, ids, byId);
    const b = ancestorIn(e.to, ids, byId);
    if (!a || !b || a === b) continue;
    const list = outgoing.get(a) ?? [];
    if (list.includes(b)) continue;
    list.push(b);
    outgoing.set(a, list);
    indeg.set(b, (indeg.get(b) ?? 0) + 1);
  }
  const rank = new Map<string, number>();
  const q: string[] = [];
  for (const n of group) {
    if ((indeg.get(n.id) ?? 0) === 0) {
      rank.set(n.id, 0);
      q.push(n.id);
    }
  }
  if (!q.length) {
    rank.set(group[0].id, 0);
    q.push(group[0].id);
    indeg.set(group[0].id, 0);
  }
  const seen = new Set<string>();
  while (q.length) {
    const id = q.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const r = rank.get(id) ?? 0;
    for (const nxt of outgoing.get(id) ?? []) {
      rank.set(nxt, Math.max(rank.get(nxt) ?? 0, r + 1));
      indeg.set(nxt, (indeg.get(nxt) ?? 1) - 1);
      if ((indeg.get(nxt) ?? 0) <= 0) q.push(nxt);
    }
  }
  for (const n of group) if (!rank.has(n.id)) rank.set(n.id, 0);

  const columns = new Map<number, DiagramNode[]>();
  for (const n of group) {
    const r = rank.get(n.id) ?? 0;
    const col = columns.get(r) ?? [];
    col.push(n);
    columns.set(r, col);
  }
  const ranks = [...columns.keys()].sort((a, b) => a - b);
  let maxEdge = 0;

  if (direction === "vertical") {
    let y = pad + title;
    for (const r of ranks) {
      const row = columns.get(r)!;
      let x = pad;
      let rowH = 0;
      for (const n of row) {
        n.x = x;
        n.y = y;
        x += n.w + GAP_X;
        rowH = Math.max(rowH, n.h);
      }
      maxEdge = Math.max(maxEdge, x - GAP_X);
      y += rowH + GAP_Y;
    }
    return { w: Math.max(180, maxEdge + pad), h: Math.max(100, y - GAP_Y + pad) };
  }

  let x = pad;
  let bottom = 0;
  for (const r of ranks) {
    const col = columns.get(r)!;
    let y = pad + title;
    let colW = 0;
    for (const n of col) {
      n.x = x;
      n.y = y;
      y += n.h + GAP_Y;
      colW = Math.max(colW, n.w);
    }
    bottom = Math.max(bottom, y - GAP_Y);
    x += colW + GAP_X;
  }
  return { w: Math.max(180, x - GAP_X + pad), h: Math.max(100, bottom + pad) };
}

function absolutize(nodes: DiagramNode[], parentId: string | null, ox: number, oy: number, byId: Map<string, DiagramNode>) {
  for (const n of groupOf(nodes, parentId, byId)) {
    n.x += ox;
    n.y += oy;
    absolutize(nodes, n.id, n.x, n.y, byId);
  }
}

export function relayoutPage(page: DiagramPage, direction: "horizontal" | "vertical" = "horizontal"): DiagramPage {
  const nodes = page.nodes.map((n) => ({ ...n }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  if (page.layout === "sequence") {
    const participants = nodes.filter((n) => n.kind !== "note");
    const notes = nodes.filter((n) => n.kind === "note");
    participants.forEach((n, i) => {
      n.x = 40 + i * 180;
      n.y = n.kind === "person" || n.kind === "actor" ? 20 : 36;
    });
    const steps = Math.max(page.edges.length, 1);
    notes.forEach((n, i) => {
      n.x = 40;
      n.y = 170 + steps * 56 + i * (n.h + 16);
    });
    const edges = page.edges.map((e, i) => ({ ...e, order: e.order ?? i + 1 }));
    return { ...page, nodes, edges };
  }
  layoutGroup(page, nodes, null, byId, direction);
  absolutize(nodes, null, 0, 0, byId);
  return { ...page, nodes };
}
