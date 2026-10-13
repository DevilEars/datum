import type { DiagramEdge, DiagramNode, ShapeKind } from "./types";
import { safeStyle } from "./text";

export const DEFAULT_SIZE: Record<ShapeKind, { w: number; h: number }> = {
  person: { w: 110, h: 120 },
  actor: { w: 90, h: 110 },
  process: { w: 168, h: 68 },
  container: { w: 200, h: 120 },
  component: { w: 180, h: 72 },
  external: { w: 188, h: 72 },
  datastore: { w: 156, h: 88 },
  queue: { w: 168, h: 60 },
  decision: { w: 148, h: 84 },
  boundary: { w: 320, h: 220 },
  note: { w: 180, h: 96 },
  cloud: { w: 168, h: 96 },
  document: { w: 150, h: 88 },
  hexagon: { w: 160, h: 68 },
};

export const SHAPE_CATALOGUE: { kind: ShapeKind; name: string; use: string }[] = [
  { kind: "person", name: "Person", use: "A human, role, or team outside the software." },
  { kind: "actor", name: "Actor", use: "A UML actor when the person is a system role." },
  { kind: "process", name: "Process", use: "A system, service, or step. The default box." },
  { kind: "container", name: "Container", use: "A deployable unit. Becomes a swimlane when it has children." },
  { kind: "component", name: "Component", use: "A module inside a container." },
  { kind: "external", name: "External", use: "A system you do not own: PSP, SaaS, partner." },
  { kind: "datastore", name: "Datastore", use: "A database, file store, or ledger." },
  { kind: "queue", name: "Queue", use: "A bus, topic, or job queue." },
  { kind: "decision", name: "Decision", use: "A branch. Give it two or more outgoing labels." },
  { kind: "boundary", name: "Boundary", use: "A system, cluster, trust zone, or page frame." },
  { kind: "note", name: "Note", use: "Scope, assumption, or revision note. Not a runtime element." },
  { kind: "cloud", name: "Cloud", use: "An unspecified network or the public internet." },
  { kind: "document", name: "Document", use: "A report, contract, file, or specification." },
  { kind: "hexagon", name: "Hexagon", use: "A gateway, balancer, or policy point." },
];

const FONT = "fontFamily=Helvetica;fontSize=13;fontColor=#1A1814;whiteSpace=wrap;html=1;";

export function nodeStyle(node: DiagramNode, hasChildren: boolean): string {
  if (node.rawStyle) return safeStyle(node.rawStyle);
  const k = `datumKind=${node.kind};`;
  switch (node.kind) {
    case "person":
    case "actor":
      return `${k}shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;fillColor=#E6EEF5;strokeColor=#1E4D78;${FONT}`;
    case "datastore":
      return `${k}shape=cylinder3;boundedLbl=1;backgroundOutline=1;size=12;fillColor=#F4F0E6;strokeColor=#1A1814;${FONT}`;
    case "queue":
      return `${k}shape=parallelogram;perimeter=parallelogramPerimeter;fixedSize=1;fillColor=#E6EEF5;strokeColor=#1E4D78;${FONT}`;
    case "decision":
      return `${k}rhombus;fillColor=#FBF8F2;strokeColor=#1E4D78;${FONT}`;
    case "boundary":
      return `${k}rounded=1;dashed=1;dashPattern=8 4;fillColor=none;strokeColor=#1E4D78;fontColor=#1E4D78;align=left;spacingLeft=8;verticalAlign=top;fontStyle=1;${FONT}`;
    case "container":
      return hasChildren
        ? `${k}shape=swimlane;startSize=32;fillColor=#FBF8F2;strokeColor=#1E4D78;swimlaneFillColor=#F4F0E6;fontStyle=1;${FONT}`
        : `${k}rounded=1;fillColor=#E6EEF5;strokeColor=#1E4D78;strokeWidth=1.5;${FONT}`;
    case "component":
      return `${k}shape=component;fillColor=#FBF8F2;strokeColor=#1E4D78;${FONT}`;
    case "external":
      return `${k}rounded=1;dashed=1;dashPattern=6 4;fillColor=#FBF8F2;strokeColor=#1A1814;${FONT}`;
    case "note":
      return `${k}shape=note;fillColor=#F4F0E6;strokeColor=#6F675C;align=left;spacingLeft=8;${FONT}`;
    case "cloud":
      return `${k}ellipse;shape=cloud;fillColor=#FBF8F2;strokeColor=#6F675C;${FONT}`;
    case "document":
      return `${k}shape=document;fillColor=#FBF8F2;strokeColor=#1A1814;${FONT}`;
    case "hexagon":
      return `${k}shape=hexagon;perimeter=hexagonPerimeter2;fillColor=#E6EEF5;strokeColor=#1E4D78;${FONT}`;
    default:
      return `${k}rounded=1;fillColor=#FBF8F2;strokeColor=#1E4D78;${FONT}`;
  }
}

export function edgeStyle(edge: DiagramEdge): string {
  const dashed = edge.style === "dashed" ? "dashed=1;dashPattern=6 4;" : "";
  const route = edge.style === "straight" ? "" : "edgeStyle=orthogonalEdgeStyle;rounded=0;";
  const order = edge.order != null ? `datumOrder=${edge.order};` : "";
  return `datumStyle=${edge.style};${order}${route}${dashed}endArrow=block;endFill=1;html=1;fontFamily=Helvetica;fontSize=12;fontColor=#1A1814;`;
}
