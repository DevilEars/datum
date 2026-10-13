import { uniqueId, slug, isId } from "./ids";
import { DEFAULT_SIZE } from "./styles";
import { relayoutPage } from "./layout";
import {
  DiagramError,
  SHAPE_KINDS,
  STAMP,
  type Diagram,
  type DiagramEdge,
  type DiagramNode,
  type DiagramPage,
  type EdgeStyle,
  type PageLayout,
  type ShapeKind,
} from "./types";

const ALIASES: Record<string, ShapeKind> = {
  person: "person",
  user: "person",
  actor: "actor",
  process: "process",
  service: "process",
  system: "process",
  box: "process",
  container: "container",
  component: "component",
  external: "external",
  datastore: "datastore",
  database: "datastore",
  db: "datastore",
  queue: "queue",
  bus: "queue",
  topic: "queue",
  decision: "decision",
  diamond: "decision",
  boundary: "boundary",
  group: "boundary",
  frame: "boundary",
  note: "note",
  cloud: "cloud",
  document: "document",
  hexagon: "hexagon",
  hex: "hexagon",
};

export const SKETCH_GUIDE = `One element or relationship per line. Blank lines and # comments are ignored.

title Payments review
page Context
layout graph

person customer | Customer
process checkout | Checkout | Software system
external processor | Card processor | External system
datastore journal | Journal | Payments
boundary zone | Trust zone
process api | API | parent=zone

customer -> checkout | Places an order
checkout -> processor | Authorises payment
checkout -> journal | Records the result

page Place order
layout sequence
person customer | Customer
process api | API
customer -> api | Submit order | order=1

Kinds: ${SHAPE_KINDS.join(", ")}.
Aliases: user, system, service, db, database, bus, topic, frame, group, diamond.
Meta (a later |-segment of key=value pairs): parent, x, y, w, h, style, order.
Layouts: graph (default) or sequence.
Arrow labels accept ":" or "|".`;

export const SKETCH_EXAMPLE = `title Review — checkout
page Context
layout graph

person customer | Customer
process checkout | Checkout | Software system
external processor | Card processor | External system
datastore journal | Journal | Payments

customer -> checkout | Places an order
checkout -> processor | Authorises payment
checkout -> journal | Records the result
`;

function parseMeta(segment: string): Record<string, string> | null {
  const bits = segment.trim().split(/\s+/);
  if (!bits.length || !bits.every((b) => /^[a-zA-Z]+=[^\s]+$/.test(b))) return null;
  const out: Record<string, string> = {};
  for (const b of bits) {
    const i = b.indexOf("=");
    out[b.slice(0, i).toLowerCase()] = b.slice(i + 1);
  }
  return out;
}

function classify(parts: string[]): { texts: string[]; meta: Record<string, string> } {
  const texts: string[] = [];
  const meta: Record<string, string> = {};
  for (const part of parts) {
    const m = parseMeta(part);
    if (m) Object.assign(meta, m);
    else texts.push(part.trim());
  }
  return { texts, meta };
}

export function parseSketch(source: string, fallbackTitle = "Untitled"): Diagram {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let title = fallbackTitle;
  const pages: DiagramPage[] = [];
  let page: DiagramPage | null = null;
  const ensure = () => {
    if (!page) {
      page = { id: "page-1", name: "Page 1", layout: "graph", nodes: [], edges: [] };
      pages.push(page);
    }
    return page;
  };

  lines.forEach((raw, index) => {
    const lineNo = index + 1;
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    if (/^title\s+/i.test(line)) {
      title = line.replace(/^title\s+/i, "").trim() || title;
      return;
    }
    if (/^page\s+/i.test(line)) {
      const name = line.replace(/^page\s+/i, "").trim() || `Page ${pages.length + 1}`;
      const used = new Set(pages.map((p) => p.id));
      page = {
        id: uniqueId(slug(name), used),
        name,
        layout: "graph",
        nodes: [],
        edges: [],
      };
      pages.push(page);
      return;
    }
    if (/^layout\s+/i.test(line)) {
      const value = line.replace(/^layout\s+/i, "").trim().toLowerCase();
      const layout: PageLayout = value === "sequence" ? "sequence" : "graph";
      if (value !== "sequence" && value !== "graph") {
        throw new DiagramError(`Line ${lineNo}: layout must be graph or sequence.`);
      }
      ensure().layout = layout;
      return;
    }
    const arrow = line.split(/\s*(?:->|→)\s*/);
    if (arrow.length === 2 && isId(arrow[0].trim())) {
      const left = arrow[0].trim();
      const current = ensure();
      const rightParts = arrow[1].split("|").map((s) => s.trim()).filter(Boolean);
      let parts = rightParts;
      if (parts[0]?.includes(":") && !parts[0].includes("=")) {
        const idx = parts[0].indexOf(":");
        const head = parts[0].slice(0, idx).trim();
        const tail = parts[0].slice(idx + 1).trim();
        parts = [head, tail, ...parts.slice(1)].filter(Boolean);
      }
      const { texts, meta } = classify(parts);
      const to = texts[0]?.trim() ?? "";
      if (!isId(to)) throw new DiagramError(`Line ${lineNo}: target "${to}" is not an id.`);
      const style = (meta.style as EdgeStyle) || (current.layout === "sequence" ? "straight" : "orthogonal");
      if (!["orthogonal", "straight", "dashed"].includes(style)) {
        throw new DiagramError(`Line ${lineNo}: style must be orthogonal, straight, or dashed.`);
      }
      const used = new Set([...current.nodes.map((n) => n.id), ...current.edges.map((e) => e.id)]);
      const edge: DiagramEdge = {
        id: uniqueId(`e-${left}-${to}`, used),
        from: left,
        to,
        label: texts[1]?.trim() || undefined,
        style,
      };
      if (meta.order && Number.isFinite(Number(meta.order))) edge.order = Number(meta.order);
      current.edges.push(edge);
      return;
    }

    const segments = line.split("|").map((s) => s.trim());
    const head = segments[0] ?? "";
    const bits = head.split(/\s+/);
    const kind = ALIASES[bits[0]?.toLowerCase() ?? ""];
    if (!kind) throw new DiagramError(`Line ${lineNo}: unknown kind "${bits[0] ?? ""}".`);
    const rest = bits.slice(1).join(" ").trim();
    const { texts, meta } = classify(segments.slice(1));
    let id = "";
    let label = texts[0] ?? "";
    let subtitle = texts[1];
    if (rest && isId(rest) && label) id = rest;
    else if (rest && isId(rest) && !label) {
      id = rest;
      label = rest;
    } else {
      label = [rest, label].filter(Boolean).join(" ").trim();
      id = slug(label || kind);
    }
    if (!label) label = id;
    const current = ensure();
    const used = new Set(current.nodes.map((n) => n.id));
    id = used.has(id) ? uniqueId(id, used) : (used.add(id), id);
    const size = DEFAULT_SIZE[kind];
    const node: DiagramNode = {
      id,
      kind,
      label,
      subtitle,
      x: meta.x != null ? Number(meta.x) : 0,
      y: meta.y != null ? Number(meta.y) : 0,
      w: meta.w != null ? Number(meta.w) : size.w,
      h: meta.h != null ? Number(meta.h) : size.h,
    };
    if (meta.parent) node.parentId = meta.parent;
    current.nodes.push(node);
  });

  if (!pages.length) throw new DiagramError("Sketch has no elements.");
  for (const p of pages) {
    const ids = new Set(p.nodes.map((n) => n.id));
    for (const n of p.nodes) {
      if (n.parentId && !ids.has(n.parentId)) {
        throw new DiagramError(`Unknown parent "${n.parentId}" on ${n.id}.`);
      }
    }
    for (const e of p.edges) {
      if (!ids.has(e.from) || !ids.has(e.to)) {
        throw new DiagramError(`Relationship ${e.from} -> ${e.to} names a missing element.`);
      }
    }
    const explicit = p.nodes.length > 0 && p.nodes.every((n) => n.x !== 0 || n.y !== 0);
    const laid = explicit ? p : relayoutPage(p);
    p.nodes = laid.nodes;
    p.edges = laid.edges;
  }
  return { id: slug(title), title, pages, updatedAt: STAMP };
}
