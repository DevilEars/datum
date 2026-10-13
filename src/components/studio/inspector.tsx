import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { diagramMarkdown } from "@/lib/diagram/markdown";
import { SHAPE_CATALOGUE } from "@/lib/diagram/styles";
import type { Diagram, DiagramEdge, DiagramNode, DiagramPage } from "@/lib/diagram/types";
import { validatePage } from "@/lib/diagram/validate";

export function Inspector({
  diagram,
  page,
  selected,
  onDiagram,
  onCopySpec,
}: {
  diagram: Diagram;
  page: DiagramPage;
  selected: DiagramNode | DiagramEdge | null;
  onDiagram: (diagram: Diagram) => void;
  onCopySpec: () => void;
}) {
  const issues = validatePage(page);
  const spec = diagramMarkdown(diagram);
  return (
    <div className="pane-scroll">
      <section className="stack">
        <h2 className="pane-kicker">Page</h2>
        <label className="field">
          <span>Name</span>
          <input
            value={page.name}
            aria-label="Page name"
            onChange={(event) =>
              onDiagram({
                ...diagram,
                updatedAt: new Date().toISOString(),
                pages: diagram.pages.map((p) => (p.id === page.id ? { ...p, name: event.target.value } : p)),
              })
            }
          />
        </label>
        <p className="muted">
          {page.nodes.length} elements · {page.edges.length} relationships · {page.layout}
        </p>
      </section>
      {selected && "kind" in selected ? (
        <NodeFields node={selected} diagram={diagram} page={page} onDiagram={onDiagram} />
      ) : null}
      {selected && "from" in selected ? (
        <EdgeFields edge={selected} diagram={diagram} page={page} onDiagram={onDiagram} />
      ) : null}
      <section className="stack">
        <h2 className="pane-kicker">Review</h2>
        {issues.length === 0 ? <p className="muted">Nothing to flag on this page.</p> : null}
        <ul className="issues">
          {issues.map((issue) => (
            <li key={issue.message} className={issue.level}>
              {issue.message.replace(`${page.name}: `, "")}
            </li>
          ))}
        </ul>
      </section>
      <section className="stack">
        <div className="row-between">
          <h2 className="pane-kicker">Specification</h2>
          <Button size="sm" variant="quiet" onClick={onCopySpec}>
            Copy
          </Button>
        </div>
        <pre className="spec">{spec}</pre>
      </section>
    </div>
  );
}

function NodeFields({
  node,
  diagram,
  page,
  onDiagram,
}: {
  node: DiagramNode;
  diagram: Diagram;
  page: DiagramPage;
  onDiagram: (diagram: Diagram) => void;
}) {
  const [label, setLabel] = useState(node.label);
  const [subtitle, setSubtitle] = useState(node.subtitle ?? "");
  useEffect(() => {
    setLabel(node.label);
    setSubtitle(node.subtitle ?? "");
  }, [node.id, node.label, node.subtitle]);

  const commit = (patch: Partial<DiagramNode>) => {
    onDiagram({
      ...diagram,
      updatedAt: new Date().toISOString(),
      pages: diagram.pages.map((p) =>
        p.id !== page.id
          ? p
          : { ...p, nodes: p.nodes.map((n) => (n.id === node.id ? { ...n, ...patch, rawStyle: patch.kind ? undefined : n.rawStyle } : n)) },
      ),
    });
  };

  return (
    <section className="stack">
      <h2 className="pane-kicker">Element {node.id}</h2>
      <label className="field">
        <span>Label</span>
        <input value={label} aria-label="Element label" onChange={(e) => setLabel(e.target.value)} onBlur={() => commit({ label })} />
      </label>
      <label className="field">
        <span>Subtitle</span>
        <input
          value={subtitle}
          aria-label="Element subtitle"
          onChange={(e) => setSubtitle(e.target.value)}
          onBlur={() => commit({ subtitle: subtitle || undefined })}
        />
      </label>
      <label className="field">
        <span>Kind</span>
        <select aria-label="Element kind" value={node.kind} onChange={(e) => commit({ kind: e.target.value as DiagramNode["kind"] })}>
          {SHAPE_CATALOGUE.map((shape) => (
            <option key={shape.kind} value={shape.kind}>
              {shape.name}
            </option>
          ))}
        </select>
      </label>
      <p className="muted">
        {Math.round(node.x)}, {Math.round(node.y)} · {Math.round(node.w)}×{Math.round(node.h)}
      </p>
    </section>
  );
}

function EdgeFields({
  edge,
  diagram,
  page,
  onDiagram,
}: {
  edge: DiagramEdge;
  diagram: Diagram;
  page: DiagramPage;
  onDiagram: (diagram: Diagram) => void;
}) {
  const [label, setLabel] = useState(edge.label ?? "");
  useEffect(() => setLabel(edge.label ?? ""), [edge.id, edge.label]);
  const commit = (patch: Partial<DiagramEdge>) => {
    onDiagram({
      ...diagram,
      updatedAt: new Date().toISOString(),
      pages: diagram.pages.map((p) =>
        p.id !== page.id ? p : { ...p, edges: p.edges.map((e) => (e.id === edge.id ? { ...e, ...patch } : e)) },
      ),
    });
  };
  return (
    <section className="stack">
      <h2 className="pane-kicker">
        {edge.from} → {edge.to}
      </h2>
      <label className="field">
        <span>Label</span>
        <input value={label} aria-label="Relationship label" onChange={(e) => setLabel(e.target.value)} onBlur={() => commit({ label })} />
      </label>
      <label className="field">
        <span>Line</span>
        <select aria-label="Line style" value={edge.style} onChange={(e) => commit({ style: e.target.value as DiagramEdge["style"] })}>
          <option value="orthogonal">Orthogonal</option>
          <option value="straight">Straight</option>
          <option value="dashed">Dashed</option>
        </select>
      </label>
      {page.layout === "sequence" ? (
        <label className="field">
          <span>Order</span>
          <input
            inputMode="numeric"
            aria-label="Message order"
            value={edge.order ?? ""}
            onChange={(e) => commit({ order: Number(e.target.value) || undefined })}
          />
        </label>
      ) : null}
    </section>
  );
}
