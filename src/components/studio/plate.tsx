import { useEffect, useRef, useState } from "react";
import type { DiagramEdge, DiagramNode, DiagramPage, ShapeKind } from "@/lib/diagram/types";
import type { PlateTool } from "@/lib/diagram/store";

type View = { x: number; y: number; k: number };

function wrap(text: string, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length > max && cur) {
      lines.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 4);
}

function shapeClass(kind: ShapeKind): string {
  switch (kind) {
    case "datastore":
    case "note":
    case "document":
      return "plate-shape paper ink";
    case "external":
      return "plate-shape ink plate-dashed";
    case "boundary":
      return "plate-shape none plate-dashed";
    case "person":
    case "queue":
    case "hexagon":
    case "container":
      return "plate-shape soft";
    default:
      return "plate-shape";
  }
}

function NodeGlyph({ node }: { node: DiagramNode }) {
  const { w, h, kind } = node;
  const cls = shapeClass(kind);
  if (kind === "person" || kind === "actor") {
    const cx = w / 2;
    if (kind === "actor") {
      return (
        <g>
          <circle cx={cx} cy={18} r={10} className="plate-shape none ink" />
          <path d={`M ${cx} 30 V 58 M ${cx - 16} 42 H ${cx + 16} M ${cx} 58 L ${cx - 14} 78 M ${cx} 58 L ${cx + 14} 78`} className="plate-line" />
        </g>
      );
    }
    return (
      <g>
        <circle cx={cx} cy={22} r={14} className="plate-shape soft" />
        <rect x={cx - 20} y={40} width={40} height={28} rx={14} className="plate-shape soft" />
      </g>
    );
  }
  if (kind === "decision") {
    return <path d={`M ${w / 2} 0 L ${w} ${h / 2} L ${w / 2} ${h} L 0 ${h / 2} Z`} className={cls} />;
  }
  if (kind === "datastore") {
    const ry = 9;
    return (
      <g>
        <path d={`M 0 ${ry} V ${h - ry} A ${w / 2} ${ry} 0 0 0 ${w} ${h - ry} V ${ry}`} className={cls} />
        <ellipse cx={w / 2} cy={ry} rx={w / 2 - 0.75} ry={ry} className={cls} />
      </g>
    );
  }
  if (kind === "queue") {
    return <path d={`M 18 0 H ${w} L ${w - 18} ${h} H 0 Z`} className={cls} />;
  }
  if (kind === "hexagon") {
    const inset = Math.min(28, w * 0.16);
    return <path d={`M ${inset} 0 H ${w - inset} L ${w} ${h / 2} L ${w - inset} ${h} H ${inset} L 0 ${h / 2} Z`} className={cls} />;
  }
  if (kind === "cloud") {
    return (
      <g>
        <rect x={10} y={28} width={w - 20} height={h - 44} rx={16} className={cls} />
        <circle cx={w * 0.32} cy={36} r={22} className={cls} />
        <circle cx={w * 0.55} cy={28} r={26} className={cls} />
        <circle cx={w * 0.74} cy={38} r={18} className={cls} />
      </g>
    );
  }
  if (kind === "document") {
    return (
      <path
        d={`M 0 0 H ${w} V ${h - 14} Q ${w * 0.75} ${h + 6} ${w * 0.5} ${h - 12} Q ${w * 0.25} ${h - 30} 0 ${h - 14} Z`}
        className={cls}
      />
    );
  }
  if (kind === "note") {
    return (
      <g>
        <path d={`M 0 0 H ${w - 16} L ${w} 16 V ${h} H 0 Z`} className={cls} />
        <path d={`M ${w - 16} 0 V 16 H ${w}`} className="plate-line" />
      </g>
    );
  }
  if (kind === "component") {
    return (
      <g>
        <rect x={8} y={0} width={w - 8} height={h} rx={6} className={cls} />
        <rect x={0} y={12} width={16} height={10} className={cls} />
        <rect x={0} y={30} width={16} height={10} className={cls} />
      </g>
    );
  }
  if (kind === "boundary") {
    return <rect width={w} height={h} rx={8} className={cls} />;
  }
  const radius = kind === "external" ? 8 : 8;
  return (
    <g>
      <rect width={w} height={h} rx={radius} className={cls} />
      {kind === "external" ? <rect x={4} y={4} width={w - 8} height={h - 8} rx={6} className="plate-shape none ink" /> : null}
    </g>
  );
}

function NodeText({ node }: { node: DiagramNode }) {
  if (node.kind === "boundary") {
    return (
      <text x={12} y={22} className="plate-label plate-strong">
        {node.label}
      </text>
    );
  }
  const below = node.kind === "person" || node.kind === "actor";
  const max = Math.max(8, Math.floor(((below ? 120 : node.w) - 16) / 7));
  const lines = wrap(node.label, max);
  const sub = node.subtitle ? wrap(node.subtitle, max + 2) : [];
  if (below) {
    const y = node.kind === "actor" ? 96 : 86;
    return (
      <text x={node.w / 2} y={y} textAnchor="middle" className="plate-label">
        {lines.map((line, i) => (
          <tspan key={line + i} x={node.w / 2} dy={i === 0 ? 0 : 15}>
            {line}
          </tspan>
        ))}
      </text>
    );
  }
  const topPad = node.kind === "datastore" ? 14 : 0;
  const block = lines.length * 16 + sub.length * 13;
  let y = Math.max(18, (node.h - block) / 2 + 12 + topPad / 2);
  return (
    <text x={node.w / 2} y={y} textAnchor="middle">
      {lines.map((line, i) => (
        <tspan key={`l${i}`} x={node.w / 2} dy={i === 0 ? 0 : 16} className="plate-label">
          {line}
        </tspan>
      ))}
      {sub.map((line, i) => (
        <tspan key={`s${i}`} x={node.w / 2} dy={i === 0 ? 15 : 13} className="plate-sub">
          {line}
        </tspan>
      ))}
    </text>
  );
}

function ports(a: DiagramNode, b: DiagramNode) {
  const acx = a.x + a.w / 2;
  const acy = a.y + a.h / 2;
  const bcx = b.x + b.w / 2;
  const bcy = b.y + b.h / 2;
  const dx = bcx - acx;
  const dy = bcy - acy;
  const side = (n: DiagramNode, sx: number, sy: number) => {
    if (Math.abs(sx) >= Math.abs(sy)) {
      return sx > 0 ? { x: n.x + n.w, y: n.y + n.h / 2 } : { x: n.x, y: n.y + n.h / 2 };
    }
    return sy > 0 ? { x: n.x + n.w / 2, y: n.y + n.h } : { x: n.x + n.w / 2, y: n.y };
  };
  return [side(a, dx, dy), side(b, -dx, -dy)] as const;
}

function ortho(a: { x: number; y: number }, b: { x: number; y: number }) {
  if (Math.abs(a.y - b.y) < 2 || Math.abs(a.x - b.x) < 2) {
    return { d: `M ${a.x} ${a.y} L ${b.x} ${b.y}`, label: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  }
  const midX = (a.x + b.x) / 2;
  return {
    d: `M ${a.x} ${a.y} L ${midX} ${a.y} L ${midX} ${b.y} L ${b.x} ${b.y}`,
    label: { x: midX, y: (a.y + b.y) / 2 },
  };
}

function subtreeIds(page: DiagramPage, id: string) {
  const ids = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of page.nodes) {
      if (n.parentId && ids.has(n.parentId) && !ids.has(n.id)) {
        ids.add(n.id);
        grew = true;
      }
    }
  }
  return ids;
}

const rank = (n: DiagramNode) => (n.kind === "boundary" ? 0 : n.kind === "container" ? 1 : n.kind === "note" ? 3 : 2);

export function Plate({
  page,
  selectedId,
  tool,
  connectFrom,
  placing,
  onSelect,
  onPlace,
  onMove,
  onMoveEnd,
  onConnect,
}: {
  page: DiagramPage;
  selectedId: string | null;
  tool: PlateTool;
  connectFrom: string | null;
  placing: ShapeKind | null;
  onSelect: (id: string | null) => void;
  onPlace: (kind: ShapeKind, x: number, y: number) => void;
  onMove: (positions: Record<string, { x: number; y: number }>) => void;
  onMoveEnd: () => void;
  onConnect: (from: string, to: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 32, y: 32, k: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const pageRef = useRef(page);
  pageRef.current = page;

  const fit = () => {
    const el = wrapRef.current;
    if (!el || el.clientWidth < 40) return;
    const nodes = pageRef.current.nodes;
    if (!nodes.length) {
      setView({ x: 32, y: 32, k: 1 });
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.w);
      maxY = Math.max(maxY, n.y + n.h);
    }
    if (pageRef.current.layout === "sequence") {
      const steps = Math.max(1, ...pageRef.current.edges.map((e) => e.order ?? 1));
      maxY = Math.max(maxY, 170 + steps * 56);
    }
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const bw = Math.max(80, maxX - minX);
    const bh = Math.max(80, maxY - minY);
    const k = Math.min((cw - 48) / bw, (ch - 48) / bh, 1.35);
    setView({
      k: Math.max(0.25, k),
      x: (cw - bw * k) / 2 - minX * k,
      y: (ch - bh * k) / 2 - minY * k,
    });
  };

  useEffect(() => {
    const frame = requestAnimationFrame(() => fit());
    return () => cancelAnimationFrame(frame);
  }, [page.id]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = event.clientX - rect.left;
      const cy = event.clientY - rect.top;
      const v = viewRef.current;
      const factor = event.deltaY < 0 ? 1.08 : 0.92;
      const k = Math.min(2.4, Math.max(0.25, v.k * factor));
      const wx = (cx - v.x) / v.k;
      const wy = (cy - v.y) / v.k;
      setView({ k, x: cx - wx * k, y: cy - wy * k });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const world = (clientX: number, clientY: number) => {
    const el = wrapRef.current;
    const v = viewRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return { x: (clientX - rect.left - v.x) / v.k, y: (clientY - rect.top - v.y) / v.k };
  };

  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    origin: Record<string, { x: number; y: number }>;
    moved: boolean;
  } | null>(null);
  const pan = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  const nodes = [...page.nodes].sort((a, b) => rank(a) - rank(b));
  const byId = new Map(page.nodes.map((n) => [n.id, n]));

  return (
    <div ref={wrapRef} className="plate-wrap">
      <svg
        className="plate-svg"
        role="application"
        aria-label={`${page.name} diagram`}
        data-placing={placing ? "true" : "false"}
      >
        <defs>
          <pattern id="datum-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.9" className="fill-line" />
          </pattern>
          <marker id="datum-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 1.2 L 9 5 L 0 8.8 Z" className="fill-blueprint" />
          </marker>
        </defs>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <rect
            data-plate="bg"
            x={-5000}
            y={-5000}
            width={10000}
            height={10000}
            fill="url(#datum-grid)"
            onPointerDown={(event) => {
              const point = world(event.clientX, event.clientY);
              if (placing) {
                onPlace(placing, point.x, point.y);
                return;
              }
              onSelect(null);
              pan.current = { x: event.clientX, y: event.clientY, vx: viewRef.current.x, vy: viewRef.current.y };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const current = pan.current;
              if (!current) return;
              setView({
                ...viewRef.current,
                x: current.vx + (event.clientX - current.x),
                y: current.vy + (event.clientY - current.y),
              });
            }}
            onPointerUp={() => {
              pan.current = null;
            }}
          />
          {page.layout === "sequence"
            ? nodes.map((n) => {
                const x = n.x + n.w / 2;
                const steps = Math.max(1, ...page.edges.map((e) => e.order ?? 1));
                const y2 = 156 + (steps - 1) * 56 + 36;
                return (
                  <line key={`life-${n.id}`} x1={x} y1={n.y + n.h} x2={x} y2={y2} className="plate-life" />
                );
              })
            : null}
          {page.layout === "sequence"
            ? [...page.edges]
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                .map((edge) => {
                  const from = byId.get(edge.from);
                  const to = byId.get(edge.to);
                  if (!from || !to) return null;
                  const y = 156 + ((edge.order ?? 1) - 1) * 56;
                  const x1 = from.x + from.w / 2;
                  const x2 = to.x + to.w / 2;
                  const self = edge.from === edge.to;
                  const d = self
                    ? `M ${x1} ${y} H ${x1 + 28} V ${y + 22} H ${x1}`
                    : `M ${x1} ${y} L ${x2} ${y}`;
                  const label = `${edge.order ?? ""} ${edge.label ?? ""}`.trim();
                  const mx = self ? x1 + 16 : (x1 + x2) / 2;
                  const selected = selectedId === edge.id;
                  return (
                    <g key={edge.id} onPointerDown={(event) => { event.stopPropagation(); onSelect(edge.id); }}>
                      <path d={d} className="plate-hit" />
                      <path d={d} className={selected ? "plate-edge is-selected" : "plate-edge"} markerEnd="url(#datum-arrow)" />
                      {label ? (
                        <text x={mx} y={y - 8} textAnchor="middle" className="plate-edge-label">
                          {label}
                        </text>
                      ) : null}
                    </g>
                  );
                })
            : page.edges.map((edge) => (
                <GraphEdge key={edge.id} edge={edge} from={byId.get(edge.from)} to={byId.get(edge.to)} selected={selectedId === edge.id} onSelect={onSelect} />
              ))}
          {nodes.map((node) => {
            const selected = selectedId === node.id || connectFrom === node.id;
            return (
              <g
                key={node.id}
                transform={`translate(${node.x} ${node.y})`}
                className="plate-node"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  if (placing) return;
                  if (tool === "connect") {
                    if (!connectFrom) onSelect(node.id);
                    else if (connectFrom !== node.id) onConnect(connectFrom, node.id);
                    else onSelect(node.id);
                    return;
                  }
                  onSelect(node.id);
                  const start = world(event.clientX, event.clientY);
                  const ids = subtreeIds(page, node.id);
                  const origin: Record<string, { x: number; y: number }> = {};
                  for (const n of page.nodes) if (ids.has(n.id)) origin[n.id] = { x: n.x, y: n.y };
                  drag.current = { id: node.id, x: start.x, y: start.y, origin, moved: false };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  const current = drag.current;
                  if (!current || current.id !== node.id) return;
                  const point = world(event.clientX, event.clientY);
                  const dx = point.x - current.x;
                  const dy = point.y - current.y;
                  if (!current.moved && Math.hypot(dx, dy) < 3) return;
                  current.moved = true;
                  const positions: Record<string, { x: number; y: number }> = {};
                  for (const [id, origin] of Object.entries(current.origin)) {
                    positions[id] = { x: Math.round((origin.x + dx) / 8) * 8, y: Math.round((origin.y + dy) / 8) * 8 };
                  }
                  onMove(positions);
                }}
                onPointerUp={() => {
                  const current = drag.current;
                  drag.current = null;
                  if (current?.moved) onMoveEnd();
                }}
              >
                <NodeGlyph node={node} />
                <NodeText node={node} />
                {selected ? <rect x={-4} y={-4} width={node.w + 8} height={node.h + 8} rx={10} className="plate-select" /> : null}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="plate-zoom">
        <button type="button" className="zoom-btn" onClick={() => fit()} aria-label="Fit diagram">
          Fit
        </button>
        <button
          type="button"
          className="zoom-btn"
          aria-label="Zoom out"
          onClick={() => setView((v) => ({ ...v, k: Math.max(0.25, v.k / 1.15) }))}
        >
          −
        </button>
        <button
          type="button"
          className="zoom-btn"
          aria-label="Zoom in"
          onClick={() => setView((v) => ({ ...v, k: Math.min(2.4, v.k * 1.15) }))}
        >
          +
        </button>
      </div>
    </div>
  );
}

function GraphEdge({
  edge,
  from,
  to,
  selected,
  onSelect,
}: {
  edge: DiagramEdge;
  from?: DiagramNode;
  to?: DiagramNode;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  if (!from || !to) return null;
  const [a, b] = ports(from, to);
  const routed = edge.style === "straight" || edge.from === edge.to
    ? {
        d: edge.from === edge.to ? `M ${from.x + from.w} ${from.y + 24} h 24 v 20 h -24` : `M ${a.x} ${a.y} L ${b.x} ${b.y}`,
        label: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      }
    : ortho(a, b);
  const dashed = edge.style === "dashed" ? " plate-dashed" : "";
  return (
    <g onPointerDown={(event) => { event.stopPropagation(); onSelect(edge.id); }}>
      <path d={routed.d} className="plate-hit" />
      <path d={routed.d} className={(selected ? "plate-edge is-selected" : "plate-edge") + dashed} markerEnd="url(#datum-arrow)" />
      {edge.label ? (
        <text x={routed.label.x} y={routed.label.y - 6} textAnchor="middle" className="plate-edge-label">
          {edge.label}
        </text>
      ) : null}
    </g>
  );
}
