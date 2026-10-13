import type { Diagram, DiagramPage } from "./types";

export type Issue = { level: "error" | "warning"; message: string; cellId?: string };

function overlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.min(a.w * a.h, b.w * b.h);
}

export function validatePage(page: DiagramPage): Issue[] {
  const issues: Issue[] = [];
  const ids = new Set<string>();
  for (const n of page.nodes) {
    if (ids.has(n.id)) issues.push({ level: "error", message: `Duplicate id ${n.id}.`, cellId: n.id });
    ids.add(n.id);
    if (!n.label.trim()) issues.push({ level: "error", message: `Element ${n.id} has no label.`, cellId: n.id });
    if (n.parentId && !page.nodes.some((p) => p.id === n.parentId)) {
      issues.push({ level: "error", message: `${n.id} names a missing parent ${n.parentId}.`, cellId: n.id });
    }
  }
  const outgoing = new Map<string, number>();
  for (const e of page.edges) {
    if (ids.has(e.id)) issues.push({ level: "error", message: `Duplicate id ${e.id}.`, cellId: e.id });
    ids.add(e.id);
    if (!page.nodes.some((n) => n.id === e.from)) {
      issues.push({ level: "error", message: `Relationship ${e.id} starts at missing ${e.from}.`, cellId: e.id });
    }
    if (!page.nodes.some((n) => n.id === e.to)) {
      issues.push({ level: "error", message: `Relationship ${e.id} ends at missing ${e.to}.`, cellId: e.id });
    }
    if (!e.label?.trim()) {
      issues.push({ level: "warning", message: `Relationship ${e.from} → ${e.to} has no label.`, cellId: e.id });
    }
    outgoing.set(e.from, (outgoing.get(e.from) ?? 0) + 1);
    if (page.layout === "sequence" && e.order == null) {
      issues.push({ level: "warning", message: `Message ${e.from} → ${e.to} has no order.`, cellId: e.id });
    }
  }
  if (page.layout === "graph") {
    for (const n of page.nodes) {
      if (n.kind === "decision" && (outgoing.get(n.id) ?? 0) < 2) {
        issues.push({
          level: "warning",
          message: `Decision ${n.label} has fewer than two outcomes.`,
          cellId: n.id,
        });
      }
    }
    const solids = page.nodes.filter((n) => n.kind !== "boundary" && n.kind !== "note");
    for (let i = 0; i < solids.length; i++) {
      for (let j = i + 1; j < solids.length; j++) {
        const a = solids[i];
        const b = solids[j];
        if (a.parentId !== b.parentId) continue;
        if (overlap(a, b) > 0.35) {
          issues.push({
            level: "warning",
            message: `${a.label} overlaps ${b.label}. Reflow or move one of them.`,
            cellId: a.id,
          });
        }
      }
    }
  }
  return issues;
}

export function validateDiagram(diagram: Diagram): Issue[] {
  return diagram.pages.flatMap((page) =>
    validatePage(page).map((issue) => ({
      ...issue,
      message: `${page.name}: ${issue.message}`,
    })),
  );
}
