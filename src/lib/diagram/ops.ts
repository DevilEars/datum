import { uniqueId, isId, slug } from "./ids";
import { relayoutPage } from "./layout";
import { DEFAULT_SIZE } from "./styles";
import { parseSketch } from "./sketch";
import { fromDrawioXml, toDrawioXml } from "./xml";
import {
  DiagramError,
  STAMP,
  type Diagram,
  type DiagramEdge,
  type DiagramNode,
  type DiagramPage,
  type EdgeStyle,
  type PageLayout,
  type ShapeKind,
} from "./types";

export function touch(diagram: Diagram, updatedAt = new Date().toISOString()): Diagram {
  return { ...diagram, updatedAt };
}

export function blankDiagram(title = "Untitled"): Diagram {
  return {
    id: "untitled",
    title,
    updatedAt: STAMP,
    pages: [{ id: "page-1", name: "Page 1", layout: "graph", nodes: [], edges: [] }],
  };
}

export function cloneDiagram(diagram: Diagram): Diagram {
  return structuredClone(diagram);
}

function pageOrThrow(diagram: Diagram, page?: string): DiagramPage {
  if (!page) {
    const first = diagram.pages[0];
    if (!first) throw new DiagramError("Diagram has no pages.");
    return first;
  }
  const hit = diagram.pages.find((p) => p.id === page || p.name.toLowerCase() === page.toLowerCase());
  if (!hit) {
    const names = diagram.pages.map((p) => p.name).join(", ");
    throw new DiagramError(`No page "${page}". Pages: ${names}.`);
  }
  return hit;
}

function mapPage(diagram: Diagram, pageId: string, fn: (page: DiagramPage) => DiagramPage): Diagram {
  return touch({
    ...diagram,
    pages: diagram.pages.map((p) => (p.id === pageId ? fn(p) : p)),
  });
}

export type NodeInput = {
  id?: string;
  kind: ShapeKind;
  label: string;
  subtitle?: string;
  parentId?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
};

export type EdgeInput = {
  id?: string;
  from: string;
  to: string;
  label?: string;
  style?: EdgeStyle;
  order?: number;
};

export function addNodes(diagram: Diagram, pageRef: string | undefined, inputs: NodeInput[], reflow = false): Diagram {
  const page = pageOrThrow(diagram, pageRef);
  const used = new Set([...page.nodes.map((n) => n.id), ...page.edges.map((e) => e.id)]);
  const created: DiagramNode[] = inputs.map((input, index) => {
    const size = DEFAULT_SIZE[input.kind];
    const id = uniqueId(input.id && isId(input.id) ? input.id : slug(input.label || input.kind), used);
    const w = input.w ?? size.w;
    const h = input.h ?? size.h;
    let maxX = 48;
    for (const n of page.nodes) maxX = Math.max(maxX, n.x + n.w + 36);
    return {
      id,
      kind: input.kind,
      label: input.label.trim() || id,
      subtitle: input.subtitle?.trim() || undefined,
      parentId: input.parentId,
      x: input.x ?? maxX,
      y: input.y ?? 48 + index * (h + 20),
      w,
      h,
    };
  });
  let next = mapPage(diagram, page.id, (p) => ({ ...p, nodes: [...p.nodes, ...created] }));
  const fresh = pageOrThrow(next, page.id);
  for (const n of created) {
    if (n.parentId && !fresh.nodes.some((c) => c.id === n.parentId)) {
      throw new DiagramError(`Parent "${n.parentId}" does not exist on ${page.name}.`);
    }
  }
  if (fresh.nodes.length > 250) throw new DiagramError("A page can hold 250 elements.");
  if (reflow) next = mapPage(next, page.id, (p) => relayoutPage(p));
  return next;
}

export function addEdges(diagram: Diagram, pageRef: string | undefined, inputs: EdgeInput[]): Diagram {
  const page = pageOrThrow(diagram, pageRef);
  const ids = new Set(page.nodes.map((n) => n.id));
  const used = new Set([...ids, ...page.edges.map((e) => e.id)]);
  const created: DiagramEdge[] = inputs.map((input) => {
    if (!ids.has(input.from) || !ids.has(input.to)) {
      throw new DiagramError(`Cannot relate ${input.from} → ${input.to}: an endpoint is missing on ${page.name}.`);
    }
    return {
      id: uniqueId(input.id && isId(input.id) ? input.id : `e-${input.from}-${input.to}`, used),
      from: input.from,
      to: input.to,
      label: input.label?.trim() || undefined,
      style: input.style ?? (page.layout === "sequence" ? "straight" : "orthogonal"),
      order: input.order,
    };
  });
  if (page.edges.length + created.length > 500) throw new DiagramError("A page can hold 500 relationships.");
  return mapPage(diagram, page.id, (p) => ({ ...p, edges: [...p.edges, ...created] }));
}

export type CellPatch = {
  id: string;
  label?: string;
  subtitle?: string;
  kind?: ShapeKind;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  parentId?: string | null;
  style?: EdgeStyle;
  order?: number;
  from?: string;
  to?: string;
};

export function updateCells(diagram: Diagram, pageRef: string | undefined, patches: CellPatch[]): { diagram: Diagram; missing: string[] } {
  const page = pageOrThrow(diagram, pageRef);
  const missing: string[] = [];
  const next = mapPage(diagram, page.id, (p) => {
    let nodes = p.nodes.map((n) => ({ ...n }));
    let edges = p.edges.map((e) => ({ ...e }));
    for (const patch of patches) {
      const node = nodes.find((n) => n.id === patch.id);
      const edge = edges.find((e) => e.id === patch.id);
      if (!node && !edge) {
        missing.push(patch.id);
        continue;
      }
      if (node) {
        if (patch.label != null) node.label = patch.label;
        if (patch.subtitle != null) node.subtitle = patch.subtitle || undefined;
        if (patch.kind) {
          node.kind = patch.kind;
          node.rawStyle = undefined;
        }
        if (patch.x != null) node.x = patch.x;
        if (patch.y != null) node.y = patch.y;
        if (patch.w != null) node.w = patch.w;
        if (patch.h != null) node.h = patch.h;
        if (patch.parentId === null) node.parentId = undefined;
        else if (patch.parentId) node.parentId = patch.parentId;
      }
      if (edge) {
        if (patch.label != null) edge.label = patch.label || undefined;
        if (patch.style) edge.style = patch.style;
        if (patch.order != null) edge.order = patch.order;
        if (patch.from) edge.from = patch.from;
        if (patch.to) edge.to = patch.to;
      }
    }
    const ids = new Set(nodes.map((n) => n.id));
    for (const n of nodes) {
      if (n.parentId && !ids.has(n.parentId)) throw new DiagramError(`Parent "${n.parentId}" does not exist.`);
    }
    for (const e of edges) {
      if (!ids.has(e.from) || !ids.has(e.to)) throw new DiagramError(`Relationship ${e.id} has a missing endpoint.`);
    }
    return { ...p, nodes, edges };
  });
  return { diagram: next, missing };
}

export function removeCells(diagram: Diagram, pageRef: string | undefined, ids: string[]): Diagram {
  const page = pageOrThrow(diagram, pageRef);
  const drop = new Set(ids);
  return mapPage(diagram, page.id, (p) => ({
    ...p,
    nodes: p.nodes
      .filter((n) => !drop.has(n.id))
      .map((n) => (n.parentId && drop.has(n.parentId) ? { ...n, parentId: undefined } : n)),
    edges: p.edges.filter((e) => !drop.has(e.id) && !drop.has(e.from) && !drop.has(e.to)),
  }));
}

export function moveSubtree(diagram: Diagram, pageId: string, rootId: string, dx: number, dy: number): Diagram {
  return mapPage(diagram, pageId, (p) => {
    const move = new Set<string>([rootId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const n of p.nodes) {
        if (n.parentId && move.has(n.parentId) && !move.has(n.id)) {
          move.add(n.id);
          grew = true;
        }
      }
    }
    return {
      ...p,
      nodes: p.nodes.map((n) => (move.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n)),
    };
  });
}

export function relayout(diagram: Diagram, pageRef?: string, direction: "horizontal" | "vertical" = "horizontal"): Diagram {
  const page = pageOrThrow(diagram, pageRef);
  return mapPage(diagram, page.id, (p) => relayoutPage(p, direction));
}

export function setPageLayout(diagram: Diagram, pageRef: string | undefined, layout: PageLayout, reflow = true): Diagram {
  const page = pageOrThrow(diagram, pageRef);
  return mapPage(diagram, page.id, (p) => {
    const next = { ...p, layout };
    return reflow ? relayoutPage(next) : next;
  });
}

export function addPage(diagram: Diagram, name: string, layout: PageLayout = "graph"): Diagram {
  if (diagram.pages.length >= 12) throw new DiagramError("A diagram can hold 12 pages.");
  const used = new Set(diagram.pages.map((p) => p.id));
  const page: DiagramPage = {
    id: uniqueId(slug(name || "page"), used),
    name: name.trim() || "Page",
    layout,
    nodes: [],
    edges: [],
  };
  return touch({ ...diagram, pages: [...diagram.pages, page] });
}

export function renamePage(diagram: Diagram, pageRef: string, name: string): Diagram {
  const page = pageOrThrow(diagram, pageRef);
  return mapPage(diagram, page.id, (p) => ({ ...p, name: name.trim() || p.name }));
}

export function removePage(diagram: Diagram, pageRef: string): Diagram {
  if (diagram.pages.length <= 1) throw new DiagramError("Keep at least one page.");
  const page = pageOrThrow(diagram, pageRef);
  return touch({ ...diagram, pages: diagram.pages.filter((p) => p.id !== page.id) });
}

export function setTitle(diagram: Diagram, title: string): Diagram {
  return touch({ ...diagram, title: title.trim() || diagram.title });
}

export function replaceDiagram(diagram: Diagram, title?: string): Diagram {
  return touch({
    ...diagram,
    id: diagram.id || slug(diagram.title),
    title: title?.trim() || diagram.title,
  });
}

export function importSketchDiagram(sketch: string, title?: string, mode: "replace" | "append" = "replace", base?: Diagram): Diagram {
  const created = parseSketch(sketch, title || base?.title || "Untitled");
  if (title) created.title = title;
  if (mode === "append" && base) {
    const used = new Set(base.pages.map((p) => p.id));
    const pages = created.pages.map((p) => ({ ...p, id: uniqueId(p.id, used) }));
    return touch({ ...base, title: title || base.title, pages: [...base.pages, ...pages] });
  }
  return touch(created);
}

export async function importXmlDiagram(xml: string, title?: string): Promise<Diagram> {
  const diagram = await fromDrawioXml(xml, title || "Imported diagram");
  if (title) diagram.title = title;
  return touch(diagram);
}

export function exportXml(diagram: Diagram): string {
  return toDrawioXml(diagram);
}

export function placeAt(diagram: Diagram, pageId: string, positions: Record<string, { x: number; y: number }>): Diagram {
  return {
    ...diagram,
    pages: diagram.pages.map((p) =>
      p.id !== pageId
        ? p
        : {
            ...p,
            nodes: p.nodes.map((n) => (positions[n.id] ? { ...n, x: positions[n.id].x, y: positions[n.id].y } : n)),
          },
    ),
  };
}
