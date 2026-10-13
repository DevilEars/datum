import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Cloud,
  Copy,
  Database,
  Diamond,
  Download,
  FileText,
  Hexagon,
  MousePointer2,
  Network,
  Pencil,
  Plus,
  Redo2,
  Server,
  Spline,
  SquareDashed,
  StickyNote,
  Trash2,
  Undo2,
  UserRound,
  Waypoints,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DrawioDialog } from "@/components/studio/drawio-dialog";
import { Inspector } from "@/components/studio/inspector";
import { Plate } from "@/components/studio/plate";
import { usePlateSync } from "@/components/studio/use-plate-sync";
import { diagramMarkdown } from "@/lib/diagram/markdown";
import {
  addEdges,
  addNodes,
  addPage,
  importXmlDiagram,
  placeAt,
  relayout,
  removeCells,
  removePage,
  setPageLayout,
  touch,
} from "@/lib/diagram/ops";
import { SKETCH_EXAMPLE, parseSketch } from "@/lib/diagram/sketch";
import { SHAPE_CATALOGUE } from "@/lib/diagram/styles";
import { useStudio } from "@/lib/diagram/store";
import { TEMPLATES, templateDiagram } from "@/lib/diagram/templates";
import type { ShapeKind } from "@/lib/diagram/types";
import { toDrawioXml } from "@/lib/diagram/xml";

const ICONS: Record<ShapeKind, LucideIcon> = {
  person: UserRound,
  actor: UserRound,
  process: SquareDashed,
  container: Box,
  component: Server,
  external: Network,
  datastore: Database,
  queue: Waypoints,
  decision: Diamond,
  boundary: SquareDashed,
  note: StickyNote,
  cloud: Cloud,
  document: FileText,
  hexagon: Hexagon,
};

type Sheet = "plate" | "shapes" | "spec" | "mcp";
type Segment = "library" | "sketch" | "mcp";

function slugFile(title: string) {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "diagram"
  );
}

function download(name: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function Studio() {
  const diagram = useStudio((s) => s.diagram);
  const pageId = useStudio((s) => s.pageId);
  const selectedId = useStudio((s) => s.selectedId);
  const tool = useStudio((s) => s.tool);
  const connectFrom = useStudio((s) => s.connectFrom);
  const placing = useStudio((s) => s.placing);
  const [sheet, setSheet] = useState<Sheet>("plate");
  const [segment, setSegment] = useState<Segment>("library");
  const [follow, setFollow] = useState(true);
  const [sketch, setSketch] = useState(SKETCH_EXAMPLE);
  const [sketchError, setSketchError] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [xmlError, setXmlError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  const [toolName, setToolName] = useState("describe");
  const [toolArgs, setToolArgs] = useState("{}");
  const [docDraft, setDocDraft] = useState("live");
  const [title, setTitle] = useState(diagram.title);
  const sync = usePlateSync(follow);
  const pushTimer = useRef(0);
  const saveTimer = useRef(0);

  const page = diagram.pages.find((p) => p.id === pageId) ?? diagram.pages[0];
  const selected = useMemo(() => {
    if (!page || !selectedId) return null;
    return page.nodes.find((n) => n.id === selectedId) ?? page.edges.find((e) => e.id === selectedId) ?? null;
  }, [page, selectedId]);

  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => setDocDraft(sync.docId), [sync.docId]);
  useEffect(() => setTitle(diagram.title), [diagram.title]);
  useEffect(() => {
    if (sheet === "shapes") setSegment("library");
    if (sheet === "mcp") setSegment("mcp");
  }, [sheet]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) useStudio.getState().redo();
        else useStudio.getState().undo();
        return;
      }
      if (typing) return;
      if (event.key === "Escape") {
        useStudio.getState().setPlacing(null);
        useStudio.getState().setConnectFrom(null);
        useStudio.getState().setTool("select");
      }
      if ((event.key === "Delete" || event.key === "Backspace") && useStudio.getState().selectedId) {
        event.preventDefault();
        const state = useStudio.getState();
        const current = state.diagram.pages.find((p) => p.id === state.pageId);
        if (!current || !state.selectedId) return;
        const next = touch(removeCells(state.diagram, current.id, [state.selectedId]));
        state.commit(next);
        void sync.push(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sync]);

  if (!page) return null;

  function schedulePush(next = useStudio.getState().diagram) {
    window.clearTimeout(pushTimer.current);
    pushTimer.current = window.setTimeout(() => {
      void sync.push(next);
    }, 350);
  }

  function apply(next: ReturnType<typeof touch>) {
    useStudio.getState().commit(next);
    schedulePush(next);
  }

  function exportDrawio() {
    download(`${slugFile(diagram.title)}.drawio`, toDrawioXml(diagram), "application/xml");
  }

  async function copySpec() {
    try {
      await navigator.clipboard.writeText(diagramMarkdown(diagram));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  function applyTemplate(id: string) {
    if (armed !== id) {
      setArmed(id);
      return;
    }
    const next = templateDiagram(id);
    if (!next) return;
    setArmed(null);
    apply(touch(next));
  }

  function applySketch() {
    try {
      const next = parseSketch(sketch, diagram.title);
      setSketchError(null);
      apply(touch({ ...next, title: next.title || diagram.title }));
      setSheet("plate");
    } catch (error) {
      setSketchError(error instanceof Error ? error.message : "Could not read that sketch.");
    }
  }

  async function runArgs() {
    try {
      const parsed = JSON.parse(toolArgs) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setSketchError("Arguments must be a JSON object.");
        return;
      }
      setSketchError(null);
      await sync.runTool(toolName, parsed as Record<string, unknown>);
    } catch {
      setSketchError("Arguments are not valid JSON.");
    }
  }

  const pagesDemo = import.meta.env.VITE_DATUM_STATIC === "1";
  const endpoint = pagesDemo ? "" : `${origin}/mcp?document=${sync.docId}`;

  return (
    <div className="studio" data-sheet={sheet}>
      <header className="studio-header">
        <div className="mark">
          <Mark />
          <div>
            <div className="word">Datum</div>
            <div className="tag">Draw.io MCP</div>
          </div>
        </div>
        <input
          className="title-input"
          aria-label="Diagram title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => {
            const state = useStudio.getState();
            if (state.diagram.title === title) return;
            apply(touch({ ...state.diagram, title }));
          }}
        />
        <span className="chip" title="Document id shared with MCP clients">
          <i className="status-dot" data-on={sync.status} /> {sync.docId}
        </span>
        <div className="desktop-actions">
          <Button variant="quiet" size="sm" onClick={() => useStudio.getState().undo()} aria-label="Undo">
            <Undo2 size={16} />
          </Button>
          <Button variant="quiet" size="sm" onClick={() => useStudio.getState().redo()} aria-label="Redo">
            <Redo2 size={16} />
          </Button>
          <Button variant="line" size="sm" onClick={() => void copySpec()}>
            <Copy size={16} /> {copied ? "Copied" : "Spec"}
          </Button>
          <Button variant="line" size="sm" onClick={() => setEditorOpen(true)}>
            <Pencil size={16} /> Edit
          </Button>
          <Button variant="primary" size="sm" onClick={exportDrawio}>
            <Download size={16} /> .drawio
          </Button>
        </div>
        <details className="more">
          <summary>More</summary>
          <div className="more-menu">
            <Button variant="quiet" size="sm" onClick={() => useStudio.getState().undo()}>
              Undo
            </Button>
            <Button variant="quiet" size="sm" onClick={() => useStudio.getState().redo()}>
              Redo
            </Button>
            <Button variant="quiet" size="sm" onClick={() => void copySpec()}>
              {copied ? "Copied spec" : "Copy spec"}
            </Button>
            <Button variant="quiet" size="sm" onClick={() => setEditorOpen(true)}>
              Edit in diagrams.net
            </Button>
            <Button variant="primary" size="sm" onClick={exportDrawio}>
              Download .drawio
            </Button>
          </div>
        </details>
      </header>
      <div className="studio-body">
        <aside className="pane pane-left">
          <div className="seg">
            {(["library", "sketch", "mcp"] as const).map((item) => (
              <button key={item} type="button" data-on={segment === item} onClick={() => setSegment(item)}>
                {item === "library" ? "Library" : item === "sketch" ? "Sketch" : "MCP"}
              </button>
            ))}
          </div>
          {segment === "library" ? (
            <div className="pane-scroll">
              <section className="stack">
                <h2 className="pane-kicker">Templates</h2>
                {TEMPLATES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="template-btn"
                    data-on={armed === item.id}
                    onClick={() => applyTemplate(item.id)}
                  >
                    <FileText size={16} />
                    <strong>{armed === item.id ? `Replace with ${item.name}?` : item.name}</strong>
                    <span>{item.summary}</span>
                  </button>
                ))}
              </section>
              <section className="stack">
                <h2 className="pane-kicker">Shapes</h2>
                <p className="muted">Choose a shape, then tap the plate.</p>
                {SHAPE_CATALOGUE.map((shape) => {
                  const Icon = ICONS[shape.kind];
                  return (
                    <button
                      key={shape.kind}
                      type="button"
                      className="shape-btn"
                      data-on={placing === shape.kind}
                      onClick={() => useStudio.getState().setPlacing(placing === shape.kind ? null : shape.kind)}
                    >
                      <Icon size={16} />
                      <strong>{shape.name}</strong>
                      <span>{shape.use}</span>
                    </button>
                  );
                })}
              </section>
            </div>
          ) : null}
          {segment === "sketch" ? (
            <div className="pane-scroll">
              <section className="stack">
                <h2 className="pane-kicker">Sketch</h2>
                <p className="muted">A compact drawing language. Agents send the same text to import_sketch.</p>
                <textarea className="sketch" aria-label="Diagram sketch" value={sketch} onChange={(e) => setSketch(e.target.value)} />
                {sketchError ? <p className="muted">{sketchError}</p> : null}
                <Button variant="primary" onClick={applySketch}>
                  Replace plate
                </Button>
              </section>
            </div>
          ) : null}
          {segment === "mcp" ? (
            <div className="pane-scroll">
              <section className="stack">
                <h2 className="pane-kicker">Endpoint</h2>
                {pagesDemo ? (
                  <p className="muted">
                    Public demo. Tools run in this browser, so Run and Stamp note update the plate. GitHub Pages does not
                    host the HTTP endpoint — run Datum and point an agent at <code className="spec">/mcp?document=live</code>.
                  </p>
                ) : (
                  <p className="muted">
                    Streamable HTTP. After you publish, point Claude, Cursor, VS Code, or any MCP client at this URL. Tell the
                    agent to call attach_document with the document id on the plate.
                  </p>
                )}
                <p className="muted">
                  <i className="status-dot" data-on={sync.status} />{" "}
                  {sync.status === "live" ? "Session live" : sync.status === "connecting" ? "Connecting" : "Editing locally"}
                </p>
                {pagesDemo ? null : <code className="spec">{endpoint || "/mcp?document=live"}</code>}
                {pagesDemo ? null : (
                  <Button variant="line" size="sm" onClick={() => void navigator.clipboard.writeText(endpoint).catch(() => undefined)}>
                    Copy endpoint
                  </Button>
                )}
                {sync.sessionId ? <p className="muted">Session {sync.sessionId.slice(0, 8)}</p> : null}
                <label className="field">
                  <span>Document</span>
                  <input value={docDraft} aria-label="Document id" onChange={(e) => setDocDraft(e.target.value)} />
                </label>
                <Button variant="line" onClick={() => void sync.attach(docDraft.trim() || "live")}>
                  Attach
                </Button>
                <label className="check">
                  <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
                  Follow agents
                </label>
              </section>
              <section className="stack">
                <h2 className="pane-kicker">Call</h2>
                <label className="field">
                  <span>Tool</span>
                  <select aria-label="MCP tool" value={toolName} onChange={(e) => setToolName(e.target.value)}>
                    {[
                      "list_shapes",
                      "list_templates",
                      "describe",
                      "validate",
                      "export_xml",
                      "add_nodes",
                      "add_edges",
                      "relayout",
                      "import_sketch",
                      "create_diagram",
                    ].map((name) => (
                      <option key={name}>{name}</option>
                    ))}
                  </select>
                </label>
                <textarea className="args" aria-label="Tool arguments" value={toolArgs} onChange={(e) => setToolArgs(e.target.value)} />
                {sketchError ? <p className="muted">{sketchError}</p> : null}
                <div className="row-between">
                  <Button variant="primary" onClick={() => void runArgs()}>
                    Run
                  </Button>
                  <Button
                    variant="quiet"
                    size="sm"
                    onClick={() =>
                      void sync.runTool("add_nodes", {
                        page: page.name,
                        nodes: [{ kind: "note", label: "Rev A", subtitle: "Checked against the spec" }],
                      })
                    }
                  >
                    Stamp note
                  </Button>
                </div>
              </section>
              <section className="stack">
                <div className="row-between">
                  <h2 className="pane-kicker">Transcript</h2>
                  <Button variant="quiet" size="sm" onClick={sync.clear}>
                    Clear
                  </Button>
                </div>
                <div className="transcript">
                  {sync.transcript.length === 0 ? <p className="muted">Calls land here, including initialize.</p> : null}
                  {sync.transcript.map((entry) => (
                    <article key={entry.id}>
                      <header>
                        <strong className={entry.ok ? "ok" : "bad"}>{entry.method}</strong>
                        <span className="muted">{entry.ms} ms</span>
                      </header>
                      <pre>{JSON.stringify(entry.response, null, 2)?.slice(0, 1400)}</pre>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          ) : null}
        </aside>
        <section className="plate-column pane-plate">
          <div className="plate-tools">
            <button type="button" className="zoom-btn" data-on={tool === "select" && !placing} aria-label="Select" onClick={() => useStudio.getState().setTool("select")}>
              <MousePointer2 size={16} />
            </button>
            <button type="button" className="zoom-btn" data-on={tool === "connect"} aria-label="Connect" onClick={() => useStudio.getState().setTool("connect")}>
              <Spline size={16} />
            </button>
            <button type="button" className="zoom-btn" aria-label="Reflow left to right" onClick={() => apply(touch(relayout(diagram, page.id, "horizontal")))}>
              Reflow
            </button>
            <button type="button" className="zoom-btn" aria-label="Reflow as sequence" onClick={() => apply(touch(setPageLayout(diagram, page.id, "sequence", true)))}>
              Sequence
            </button>
            <button
              type="button"
              className="zoom-btn"
              aria-label="Delete selection"
              disabled={!selectedId}
              onClick={() => selectedId && apply(touch(removeCells(diagram, page.id, [selectedId])))}
            >
              <Trash2 size={16} />
            </button>
            {placing ? <span className="muted">Placing {placing}. Esc cancels.</span> : null}
            {tool === "connect" ? <span className="muted">{connectFrom ? "Choose the target." : "Choose the source."}</span> : null}
            {xmlError ? <span className="muted">{xmlError}</span> : null}
          </div>
          <Plate
            page={page}
            selectedId={selectedId}
            tool={tool}
            connectFrom={connectFrom}
            placing={placing}
            onSelect={(id) => {
              if (tool === "connect" && id && page.nodes.some((n) => n.id === id)) {
                if (!connectFrom) useStudio.getState().setConnectFrom(id);
                useStudio.getState().select(id);
                return;
              }
              useStudio.getState().select(id);
            }}
            onPlace={(kind, x, y) => {
              const meta = SHAPE_CATALOGUE.find((s) => s.kind === kind);
              const next = addNodes(diagram, page.id, [
                { kind, label: meta?.name ?? kind, x: Math.round(x / 8) * 8, y: Math.round(y / 8) * 8 },
              ]);
              const created = next.pages.find((p) => p.id === page.id)?.nodes.at(-1);
              apply(next);
              if (created) useStudio.getState().select(created.id);
            }}
            onConnect={(from, to) => {
              const before = new Set(page.edges.map((e) => e.id));
              const next = addEdges(diagram, page.id, [{ from, to, label: "Relates" }]);
              const created = next.pages.find((p) => p.id === page.id)?.edges.find((e) => !before.has(e.id));
              apply(next);
              useStudio.getState().setConnectFrom(null);
              if (created) useStudio.getState().select(created.id);
            }}
            onMove={(positions) => {
              const state = useStudio.getState();
              if (!state.gesturing) state.beginGesture();
              state.patchLive(placeAt(useStudio.getState().diagram, state.pageId, positions));
            }}
            onMoveEnd={() => {
              const state = useStudio.getState();
              const next = touch(state.diagram);
              state.endGesture();
              state.patchLive(next);
              void sync.push(next);
            }}
          />
          <div className="page-bar">
            {diagram.pages.map((item) => (
              <button key={item.id} type="button" className="page-tab" data-on={item.id === page.id} onClick={() => useStudio.getState().setPage(item.id)}>
                {item.name}
              </button>
            ))}
            <button
              type="button"
              className="zoom-btn"
              aria-label="Add page"
              onClick={() => {
                const next = addPage(diagram, `Page ${diagram.pages.length + 1}`);
                const id = next.pages[next.pages.length - 1]?.id;
                apply(next);
                if (id) useStudio.getState().setPage(id);
              }}
            >
              <Plus size={16} />
            </button>
            {diagram.pages.length > 1 ? (
              <button type="button" className="zoom-btn" aria-label="Remove page" onClick={() => apply(removePage(diagram, page.id))}>
                <Trash2 size={16} />
              </button>
            ) : null}
          </div>
        </section>
        <aside className="pane pane-right">
          <Inspector diagram={diagram} page={page} selected={selected} onDiagram={(next) => apply(touch(next))} onCopySpec={() => void copySpec()} />
        </aside>
      </div>
      <nav className="studio-nav" aria-label="Sections">
        {(
          [
            ["plate", "Plate"],
            ["shapes", "Shapes"],
            ["spec", "Spec"],
            ["mcp", "MCP"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className="nav-btn" data-on={sheet === id} onClick={() => setSheet(id)}>
            {label}
          </button>
        ))}
      </nav>
      <DrawioDialog
        open={editorOpen}
        xml={toDrawioXml(diagram)}
        onOpenChange={setEditorOpen}
        onSave={(xml) => {
          window.clearTimeout(saveTimer.current);
          saveTimer.current = window.setTimeout(() => {
            void importXmlDiagram(xml, useStudio.getState().diagram.title)
              .then((next) => {
                setXmlError(null);
                apply(touch(next));
              })
              .catch((error: unknown) => {
                setXmlError(error instanceof Error ? error.message : "Could not read the editor XML.");
              });
          }, 500);
        }}
      />
    </div>
  );
}

function Mark() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" className="fill-ink" />
      <rect x="2.5" y="2.5" width="27" height="27" rx="5" className="fill-paper" />
      <path d="M8 22.5H24" fill="none" className="stroke-blueprint" strokeWidth="2.25" strokeLinecap="round" />
      <path d="M8 22.5 16 9.5 24 22.5" fill="none" className="stroke-blueprint" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8" cy="22.5" r="2.7" className="fill-ink" />
      <circle cx="24" cy="22.5" r="2.7" className="fill-ink" />
      <circle cx="16" cy="9.5" r="2.7" className="fill-blueprint" />
    </svg>
  );
}
