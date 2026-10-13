import { create } from "zustand";
import { northlineDiagram } from "./templates";
import type { Diagram, ShapeKind } from "./types";

export type PlateTool = "select" | "connect";

type State = {
  diagram: Diagram;
  pageId: string;
  selectedId: string | null;
  past: Diagram[];
  future: Diagram[];
  tool: PlateTool;
  connectFrom: string | null;
  placing: ShapeKind | null;
  gesturing: boolean;
  setPage: (id: string) => void;
  select: (id: string | null) => void;
  setTool: (tool: PlateTool) => void;
  setPlacing: (kind: ShapeKind | null) => void;
  setConnectFrom: (id: string | null) => void;
  beginGesture: () => void;
  endGesture: () => void;
  patchLive: (diagram: Diagram) => void;
  commit: (diagram: Diagram) => void;
  replaceRemote: (diagram: Diagram) => void;
  undo: () => void;
  redo: () => void;
};

function selectionOn(diagram: Diagram, pageId: string, selectedId: string | null) {
  const page = diagram.pages.find((p) => p.id === pageId) ?? diagram.pages[0];
  const keep =
    !!page &&
    (page.nodes.some((n) => n.id === selectedId) || page.edges.some((e) => e.id === selectedId));
  return { pageId: page?.id ?? pageId, selectedId: keep ? selectedId : null };
}

export const useStudio = create<State>((set, get) => ({
  diagram: northlineDiagram(),
  pageId: "context",
  selectedId: null,
  past: [],
  future: [],
  tool: "select",
  connectFrom: null,
  placing: null,
  gesturing: false,
  setPage: (id) => set({ pageId: id, selectedId: null, connectFrom: null }),
  select: (id) => set({ selectedId: id }),
  setTool: (tool) => set({ tool, placing: null, connectFrom: null }),
  setPlacing: (kind) => set({ placing: kind, tool: "select", connectFrom: null }),
  setConnectFrom: (id) => set({ connectFrom: id }),
  beginGesture: () => {
    const s = get();
    if (s.gesturing) return;
    set({ gesturing: true, past: [...s.past, s.diagram].slice(-40), future: [] });
  },
  endGesture: () => set({ gesturing: false }),
  patchLive: (diagram) => set({ diagram }),
  commit: (diagram) => {
    const s = get();
    const sel = selectionOn(diagram, s.pageId, s.selectedId);
    set({
      diagram,
      past: [...s.past, s.diagram].slice(-40),
      future: [],
      pageId: sel.pageId,
      selectedId: sel.selectedId,
      gesturing: false,
    });
  },
  replaceRemote: (diagram) => {
    const s = get();
    const sel = selectionOn(diagram, s.pageId, s.selectedId);
    set({ diagram, pageId: sel.pageId, selectedId: sel.selectedId, connectFrom: null, gesturing: false });
  },
  undo: () => {
    const s = get();
    const prev = s.past[s.past.length - 1];
    if (!prev) return;
    const sel = selectionOn(prev, s.pageId, s.selectedId);
    set({
      diagram: prev,
      past: s.past.slice(0, -1),
      future: [s.diagram, ...s.future].slice(0, 40),
      pageId: sel.pageId,
      selectedId: sel.selectedId,
    });
  },
  redo: () => {
    const s = get();
    const next = s.future[0];
    if (!next) return;
    const sel = selectionOn(next, s.pageId, s.selectedId);
    set({
      diagram: next,
      future: s.future.slice(1),
      past: [...s.past, s.diagram].slice(-40),
      pageId: sel.pageId,
      selectedId: sel.selectedId,
    });
  },
}));
