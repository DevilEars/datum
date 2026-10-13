import { DEFAULT_SIZE } from "./styles";
import { edgeStyle, nodeStyle } from "./styles";
import { cellValue, safeStyle, splitLabel, unescapeXml } from "./text";
import {
  SHAPE_KINDS,
  type Diagram,
  type DiagramEdge,
  type DiagramNode,
  type DiagramPage,
  type EdgeStyle,
  type PageLayout,
  type ShapeKind,
  STAMP,
} from "./types";

function num(n: number): string {
  return String(Math.round(n * 10) / 10);
}

function attrsOf(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([:\w.-]+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) out[m[1]] = unescapeXml(m[2]);
  return out;
}

function isKind(value: string): value is ShapeKind {
  return (SHAPE_KINDS as readonly string[]).includes(value);
}

function kindFromStyle(style: string): { kind: ShapeKind; raw?: string } {
  const tagged = /datumKind=([a-z]+)/.exec(style);
  if (tagged && isKind(tagged[1])) return { kind: tagged[1] };
  const s = style.toLowerCase();
  if (s.includes("umlactor") || s.includes("shape=actor") || s.includes("mxgraph.basic.person"))
    return { kind: "person" };
  if (s.includes("cylinder")) return { kind: "datastore" };
  if (s.includes("rhombus") || s.includes("diamond")) return { kind: "decision" };
  if (s.includes("shape=cloud")) return { kind: "cloud" };
  if (s.includes("shape=note")) return { kind: "note" };
  if (s.includes("shape=document") || s.includes("shape=card")) return { kind: "document" };
  if (s.includes("parallelogram") || s.includes("shape=delay")) return { kind: "queue" };
  if (s.includes("hexagon")) return { kind: "hexagon" };
  if (s.includes("swimlane") || s.includes("shape=container")) return { kind: "container" };
  if (s.includes("shape=component")) return { kind: "component" };
  if (s.includes("dashed=1") && (s.includes("fillcolor=none") || s.includes("fillcolor=transparent")))
    return { kind: "boundary" };
  if (s.includes("dashed=1")) return { kind: "external" };
  return { kind: "process", raw: style };
}

function edgeFromStyle(style: string): { style: EdgeStyle; order?: number } {
  const orderMatch = /datumOrder=(\d+)/.exec(style);
  const order = orderMatch ? Number(orderMatch[1]) : undefined;
  const tagged = /datumStyle=(orthogonal|straight|dashed)/.exec(style);
  if (tagged) return { style: tagged[1] as EdgeStyle, order };
  if (/dashed=1/.test(style)) return { style: "dashed", order };
  if (/edgeStyle=orthogonalEdgeStyle/.test(style)) return { style: "orthogonal", order };
  return { style: "straight", order };
}

export function toDrawioXml(diagram: Diagram): string {
  const pages = diagram.pages
    .map((page) => {
      const byId = new Map(page.nodes.map((n) => [n.id, n]));
      const childCount = new Map<string, number>();
      for (const n of page.nodes) {
        if (n.parentId) childCount.set(n.parentId, (childCount.get(n.parentId) ?? 0) + 1);
      }
      const cells = page.nodes
        .map((node) => {
          const parent = node.parentId ? byId.get(node.parentId) : undefined;
          const x = parent ? node.x - parent.x : node.x;
          const y = parent ? node.y - parent.y : node.y;
          const parentAttr = parent ? node.parentId : "1";
          return `        <mxCell id="${node.id}" value="${cellValue(node)}" style="${safeStyle(nodeStyle(node, (childCount.get(node.id) ?? 0) > 0))}" vertex="1" parent="${parentAttr}">
          <mxGeometry x="${num(x)}" y="${num(y)}" width="${num(node.w)}" height="${num(node.h)}" as="geometry" />
        </mxCell>`;
        })
        .join("\n");
      const edges = page.edges
        .map((edge) => {
          const value = edge.label ? ` value="${cellValue({ label: edge.label })}"` : "";
          return `        <mxCell id="${edge.id}"${value} style="${safeStyle(edgeStyle(edge))}" edge="1" parent="1" source="${edge.from}" target="${edge.to}">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>`;
        })
        .join("\n");
      const meta = `        <mxCell id="datum-meta" parent="1" vertex="1" visible="0" value="${page.layout}" style="datumMeta=1;datumLayout=${page.layout};">
          <mxGeometry x="0" y="0" width="1" height="1" as="geometry" />
        </mxCell>`;
      let maxX = 850;
      let maxY = 640;
      for (const n of page.nodes) {
        maxX = Math.max(maxX, n.x + n.w + 80);
        maxY = Math.max(maxY, n.y + n.h + 80);
      }
      if (page.layout === "sequence") {
        const steps = Math.max(1, ...page.edges.map((e) => e.order ?? 1));
        maxY = Math.max(maxY, 180 + steps * 58);
      }
      return `  <diagram id="${page.id}" name="${cellValue({ label: page.name })}">
    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${Math.ceil(maxX)}" pageHeight="${Math.ceil(maxY)}" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
${meta}
${cells}
${edges}
      </root>
    </mxGraphModel>
  </diagram>`;
    })
    .join("\n");
  return `<mxfile host="app.diagrams.net" agent="Datum" version="24.0.0">\n${pages}\n</mxfile>\n`;
}

async function inflateDrawio(data: string): Promise<string> {
  const cleaned = data.trim().replace(/\s/g, "");
  const bin = atob(cleaned);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const text = new TextDecoder().decode(await new Response(stream).arrayBuffer());
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

async function expandDiagrams(xml: string): Promise<string> {
  const re = /<diagram\b([^>]*)>([\s\S]*?)<\/diagram>/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    out += xml.slice(last, m.index);
    let inner = m[2].trim();
    if (inner && !inner.startsWith("<")) {
      try {
        inner = (await inflateDrawio(inner)).trim();
      } catch {
        inner = m[2];
      }
    }
    out += `<diagram${m[1]}>${inner}</diagram>`;
    last = m.index + m[0].length;
  }
  out += xml.slice(last);
  return out;
}

function parsePage(id: string, name: string, model: string, index: number): DiagramPage {
  const cellRe = /<mxCell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/mxCell>)/g;
  const raw: {
    attrs: Record<string, string>;
    geo: Record<string, string>;
  }[] = [];
  let m: RegExpExecArray | null;
  while ((m = cellRe.exec(model))) {
    const attrs = attrsOf(m[1]);
    const geoSrc = m[2] ?? "";
    const geoTag = /<mxGeometry\b([^>]*?)\/?>/.exec(geoSrc);
    raw.push({ attrs, geo: geoTag ? attrsOf(geoTag[1]) : {} });
  }
  let layout: PageLayout = "graph";
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  for (const cell of raw) {
    const idAttr = cell.attrs.id;
    if (!idAttr || idAttr === "0" || idAttr === "1" || idAttr === "datum-meta") {
      if (idAttr === "datum-meta") {
        const lay = /datumLayout=(sequence|graph)/.exec(cell.attrs.style ?? "");
        if (lay) layout = lay[1] as PageLayout;
        else if (cell.attrs.value === "sequence") layout = "sequence";
      }
      continue;
    }
    if (cell.attrs.visible === "0") continue;
    const style = cell.attrs.style ?? "";
    const x = Number(cell.geo.x ?? 0) || 0;
    const y = Number(cell.geo.y ?? 0) || 0;
    const w = Number(cell.geo.width ?? 0) || 0;
    const h = Number(cell.geo.height ?? 0) || 0;
    if (cell.attrs.edge === "1") {
      const from = cell.attrs.source;
      const to = cell.attrs.target;
      if (!from || !to) continue;
      const parsed = edgeFromStyle(style);
      const label = cell.attrs.value ? splitLabel(cell.attrs.value).label : undefined;
      edges.push({
        id: idAttr,
        from,
        to,
        label: label || undefined,
        style: parsed.style,
        order: parsed.order,
      });
      continue;
    }
    if (cell.attrs.vertex !== "1") continue;
    const detected = kindFromStyle(style);
    const size = DEFAULT_SIZE[detected.kind];
    const text = splitLabel(cell.attrs.value ?? "");
    const parent = cell.attrs.parent;
    nodes.push({
      id: idAttr,
      kind: detected.kind,
      label: text.label,
      subtitle: text.subtitle,
      parentId: parent && parent !== "0" && parent !== "1" ? parent : undefined,
      x,
      y,
      w: w || size.w,
      h: h || size.h,
      rawStyle: detected.raw,
    });
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const abs = new Map<string, { x: number; y: number }>();
  const visit = (id: string, depth: number): { x: number; y: number } => {
    const cached = abs.get(id);
    if (cached) return cached;
    const n = byId.get(id);
    if (!n || depth > 12) return { x: 0, y: 0 };
    if (!n.parentId || !byId.has(n.parentId)) {
      const pos = { x: n.x, y: n.y };
      abs.set(id, pos);
      return pos;
    }
    const p = visit(n.parentId, depth + 1);
    const pos = { x: n.x + p.x, y: n.y + p.y };
    abs.set(id, pos);
    return pos;
  };
  for (const n of nodes) {
    const pos = visit(n.id, 0);
    n.x = pos.x;
    n.y = pos.y;
    if (n.parentId && !byId.has(n.parentId)) n.parentId = undefined;
  }
  return {
    id: id || `page-${index + 1}`,
    name: name || `Page ${index + 1}`,
    layout,
    nodes,
    edges,
  };
}

export async function fromDrawioXml(input: string, title = "Imported diagram"): Promise<Diagram> {
  let xml = input.trim();
  if (!xml) throw new Error("XML is empty.");
  if (xml.includes("<mxGraphModel") && !xml.includes("<diagram")) {
    xml = `<mxfile><diagram id="page-1" name="Page-1">${xml}</diagram></mxfile>`;
  }
  xml = await expandDiagrams(xml);
  const pages: DiagramPage[] = [];
  const re = /<diagram\b([^>]*)>([\s\S]*?)<\/diagram>/g;
  let m: RegExpExecArray | null;
  let index = 0;
  while ((m = re.exec(xml))) {
    const a = attrsOf(m[1]);
    const name = a.name ? splitLabel(a.name).label : `Page ${index + 1}`;
    pages.push(parsePage(a.id || `page-${index + 1}`, name, m[2], index));
    index += 1;
  }
  if (!pages.length) throw new Error("No diagram pages found. Paste uncompressed draw.io XML.");
  return {
    id: "imported",
    title,
    pages,
    updatedAt: STAMP,
  };
}
