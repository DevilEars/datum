export const SHAPE_KINDS = [
  "person",
  "actor",
  "process",
  "container",
  "component",
  "external",
  "datastore",
  "queue",
  "decision",
  "boundary",
  "note",
  "cloud",
  "document",
  "hexagon",
] as const;

export type ShapeKind = (typeof SHAPE_KINDS)[number];

export type EdgeStyle = "orthogonal" | "straight" | "dashed";

export type PageLayout = "graph" | "sequence";

export type DiagramNode = {
  id: string;
  kind: ShapeKind;
  label: string;
  subtitle?: string;
  parentId?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Original draw.io style when the shape was imported and is not one of ours. */
  rawStyle?: string;
};

export type DiagramEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
  style: EdgeStyle;
  /** Sequence pages: 1-based message order. */
  order?: number;
};

export type DiagramPage = {
  id: string;
  name: string;
  layout: PageLayout;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
};

export type Diagram = {
  id: string;
  title: string;
  pages: DiagramPage[];
  updatedAt: string;
};

export class DiagramError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiagramError";
  }
}

export const ID_RE = /^[A-Za-z][A-Za-z0-9_-]{0,78}$/;

export const LIVE_DOCUMENT = "live";

export const STAMP = "2026-10-13T00:00:00.000Z";
