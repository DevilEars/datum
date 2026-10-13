import { z } from "zod";
import { diagramMarkdown } from "../diagram/markdown";
import {
  addEdges,
  addNodes,
  addPage,
  blankDiagram,
  exportXml,
  importSketchDiagram,
  importXmlDiagram,
  relayout,
  removeCells,
  renamePage,
  replaceDiagram,
  setPageLayout,
  setTitle,
  updateCells,
  type CellPatch,
  type EdgeInput,
  type NodeInput,
} from "../diagram/ops";
import { SKETCH_GUIDE } from "../diagram/sketch";
import { SHAPE_CATALOGUE } from "../diagram/styles";
import { TEMPLATES, templateDiagram } from "../diagram/templates";
import { DiagramError, SHAPE_KINDS, type Diagram, type PageLayout, type ShapeKind } from "../diagram/types";
import { validateDiagram } from "../diagram/validate";

const kindSchema = z.enum(SHAPE_KINDS as unknown as [ShapeKind, ...ShapeKind[]]);
const styleSchema = z.enum(["orthogonal", "straight", "dashed"]);
const layoutSchema = z.enum(["graph", "sequence"]);

const nodeInput = z.object({
  id: z.string().min(1).max(80).optional(),
  kind: kindSchema,
  label: z.string().min(1).max(400),
  subtitle: z.string().max(400).optional(),
  parentId: z.string().max(80).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  w: z.number().positive().max(8000).optional(),
  h: z.number().positive().max(8000).optional(),
});

const edgeInput = z.object({
  id: z.string().max(80).optional(),
  from: z.string().min(1).max(80),
  to: z.string().min(1).max(80),
  label: z.string().max(400).optional(),
  style: styleSchema.optional(),
  order: z.number().int().min(1).max(500).optional(),
});

const pageInput = z.object({
  name: z.string().min(1).max(80),
  layout: layoutSchema.optional(),
  nodes: z.array(nodeInput).max(250).default([]),
  edges: z.array(edgeInput).max(500).optional(),
});

const patchInput = z.object({
  id: z.string().min(1).max(80),
  label: z.string().max(400).optional(),
  subtitle: z.string().max(400).optional(),
  kind: kindSchema.optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  w: z.number().positive().max(8000).optional(),
  h: z.number().positive().max(8000).optional(),
  parentId: z.string().max(80).nullable().optional(),
  style: styleSchema.optional(),
  order: z.number().int().min(1).max(500).optional(),
  from: z.string().max(80).optional(),
  to: z.string().max(80).optional(),
});

const storedNode = nodeInput.extend({
  id: z.string().min(1).max(80),
  x: z.number(),
  y: z.number(),
  w: z.number().positive().max(8000),
  h: z.number().positive().max(8000),
  rawStyle: z.string().max(2000).optional(),
});

const storedEdge = z.object({
  id: z.string().min(1).max(80),
  from: z.string().min(1).max(80),
  to: z.string().min(1).max(80),
  label: z.string().max(400).optional(),
  style: styleSchema,
  order: z.number().int().min(0).max(999).optional(),
});

const storedPage = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(80),
  layout: layoutSchema,
  nodes: z.array(storedNode).max(250),
  edges: z.array(storedEdge).max(500),
});

const storedDiagram = z.object({
  id: z.string().max(80).optional(),
  title: z.string().min(1).max(160),
  updatedAt: z.string().max(40).optional(),
  pages: z.array(storedPage).min(1).max(12),
});

export const SERVER_INSTRUCTIONS = `Datum is a Draw.io MCP for architecture and technical-specification figures.
Call attach_document with id "live" to draw on the plate a person has open. Any other id is a private document.
Build diagrams with import_sketch or add_nodes / add_edges — do not hand-write mxGraph XML unless import_xml is genuinely needed.
Use boundary nodes for systems, clusters, and trust zones, and set parentId on the elements inside them.
Label every relationship with a phrase a specification can quote.
For a sequence, set layout to "sequence" and number messages with order starting at 1.
Call validate, then describe. Put the describe markdown in the specification as the figure key.
Call export_xml for uncompressed .drawio XML that opens in diagrams.net.
The sketch grammar is the datum://guide/sketch resource.`;

type ToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

const KIND_ENUM = [...SHAPE_KINDS];

const nodeSchemaJson = {
  type: "object",
  properties: {
    id: { type: "string", description: "Stable id, used in the specification. Lowercase recommended." },
    kind: { type: "string", enum: KIND_ENUM },
    label: { type: "string" },
    subtitle: { type: "string" },
    parentId: { type: "string", description: "Id of a boundary or container this element sits inside." },
    x: { type: "number" },
    y: { type: "number" },
    w: { type: "number" },
    h: { type: "number" },
  },
  required: ["kind", "label"],
};

const edgeSchemaJson = {
  type: "object",
  properties: {
    id: { type: "string" },
    from: { type: "string" },
    to: { type: "string" },
    label: { type: "string" },
    style: { type: "string", enum: ["orthogonal", "straight", "dashed"] },
    order: { type: "integer", description: "Sequence message number, starting at 1." },
  },
  required: ["from", "to"],
};

export const TOOLS: ToolDef[] = [
  {
    name: "attach_document",
    description: "Bind this session to a document. Use id \"live\" for the plate open in Datum.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Document id. Letters, numbers, hyphen, underscore." } },
      required: ["id"],
    },
  },
  {
    name: "list_shapes",
    description: "List shape kinds and when to use each in an architecture or specification figure.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_templates",
    description: "List starter templates (context, containers, sequence, deployment, a worked example, blank).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "create_diagram",
    description: "Replace the document with a template or with pages of nodes and edges. Omit coordinates to auto-layout.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        templateId: { type: "string", description: TEMPLATES.map((t) => t.id).join(" | ") },
        pages: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              layout: { type: "string", enum: ["graph", "sequence"] },
              nodes: { type: "array", items: nodeSchemaJson },
              edges: { type: "array", items: edgeSchemaJson },
            },
            required: ["name"],
          },
        },
      },
    },
  },
  {
    name: "import_sketch",
    description: "Replace or append pages from the Datum sketch DSL. Best first cut from a spec section.",
    inputSchema: {
      type: "object",
      properties: {
        sketch: { type: "string" },
        title: { type: "string" },
        mode: { type: "string", enum: ["replace", "append"] },
      },
      required: ["sketch"],
    },
  },
  {
    name: "import_xml",
    description: "Replace the document from uncompressed or diagrams.net-compressed mxfile XML.",
    inputSchema: {
      type: "object",
      properties: { xml: { type: "string" }, title: { type: "string" } },
      required: ["xml"],
    },
  },
  {
    name: "put_diagram",
    description: "Replace the document with a full diagram model. Prefer add_nodes for incremental edits.",
    inputSchema: { type: "object", properties: { diagram: { type: "object" }, title: { type: "string" } }, required: ["diagram"] },
  },
  {
    name: "get_diagram",
    description: "Read the diagram model and a markdown specification section.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "add_nodes",
    description: "Add elements to a page. Page is a page id or name; omitted means the first page.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "string" },
        nodes: { type: "array", items: nodeSchemaJson },
        relayout: { type: "boolean" },
      },
      required: ["nodes"],
    },
  },
  {
    name: "add_edges",
    description: "Add labelled relationships between existing elements.",
    inputSchema: {
      type: "object",
      properties: { page: { type: "string" }, edges: { type: "array", items: edgeSchemaJson } },
      required: ["edges"],
    },
  },
  {
    name: "update_cells",
    description: "Change labels, kinds, positions, parents, or relationship endpoints.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "string" },
        updates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              subtitle: { type: "string" },
              kind: { type: "string", enum: KIND_ENUM },
              x: { type: "number" },
              y: { type: "number" },
              w: { type: "number" },
              h: { type: "number" },
              parentId: { type: ["string", "null"] },
              style: { type: "string", enum: ["orthogonal", "straight", "dashed"] },
              order: { type: "integer" },
              from: { type: "string" },
              to: { type: "string" },
            },
            required: ["id"],
          },
        },
      },
      required: ["updates"],
    },
  },
  {
    name: "remove_cells",
    description: "Remove elements or relationships by id. Children of a removed boundary are kept and unparented.",
    inputSchema: {
      type: "object",
      properties: { page: { type: "string" }, ids: { type: "array", items: { type: "string" } } },
      required: ["ids"],
    },
  },
  {
    name: "relayout",
    description: "Reflow a page. direction horizontal reads left to right; vertical reads top to bottom. Sequence pages ignore direction.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "string" },
        direction: { type: "string", enum: ["horizontal", "vertical"] },
        layout: { type: "string", enum: ["graph", "sequence"] },
      },
    },
  },
  {
    name: "add_page",
    description: "Add an empty page.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" }, layout: { type: "string", enum: ["graph", "sequence"] } },
      required: ["name"],
    },
  },
  {
    name: "rename_page",
    description: "Rename a page.",
    inputSchema: {
      type: "object",
      properties: { page: { type: "string" }, name: { type: "string" } },
      required: ["page", "name"],
    },
  },
  {
    name: "set_title",
    description: "Set the diagram title used in the specification heading and the .drawio file.",
    inputSchema: { type: "object", properties: { title: { type: "string" } }, required: ["title"] },
  },
  {
    name: "validate",
    description: "Check dangling relationships, unlabeled lines, decisions with one outcome, and overlaps.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "describe",
    description: "Return markdown for the specification: element table, relationships, and review notes.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "export_xml",
    description: "Return uncompressed draw.io mxfile XML.",
    inputSchema: { type: "object", properties: {} },
  },
];

export const PROMPTS = [
  {
    name: "draft_architecture_diagram",
    description: "Turn a specification section into a Datum diagram on the live plate.",
    arguments: [
      { name: "section", description: "The specification text to draw.", required: true },
      {
        name: "level",
        description: "context, container, component, sequence, deployment, data, or custom.",
        required: true,
      },
    ],
  },
  {
    name: "review_against_spec",
    description: "Compare the open diagram with a specification section without redrawing it.",
    arguments: [{ name: "section", description: "The specification text to review against.", required: true }],
  },
];

export function promptMessages(name: string, args: Record<string, string>): { role: "user"; content: { type: "text"; text: string } }[] | null {
  if (name === "draft_architecture_diagram") {
    const section = args.section?.trim() || "(no section provided)";
    const level = args.level?.trim() || "custom";
    return [
      {
        role: "user",
        content: {
          type: "text",
          text: `Draw a technical-specification figure with the Datum Draw.io MCP.\n\nLevel: ${level}\n\nSpec section:\n${section}\n\nSteps:\n1. attach_document id "live" unless the user asked for a scratch document.\n2. Use import_sketch for the first cut. Kinds: ${SHAPE_KINDS.join(", ")}.\n3. Put a boundary around elements that share a system, cluster, or trust zone. Set parent on the children.\n4. Label every relationship with a quotable phrase, not "calls" or "uses" unless that is truly the spec wording.\n5. context = people and external systems around one software system. container = one system boundary and the deployables inside it. component = modules inside a container. sequence = participants, layout sequence, ordered messages, one scenario per page. deployment = runtime boundaries. data = stores, queues, and who writes them.\n6. relayout if you did not set positions.\n7. validate and fix errors.\n8. describe, and use that markdown as the figure key in the specification. Do not invent elements that are not on the diagram.\n9. export_xml only if a .drawio file is needed.`,
        },
      },
    ];
  }
  if (name === "review_against_spec") {
    const section = args.section?.trim() || "(no section provided)";
    return [
      {
        role: "user",
        content: {
          type: "text",
          text: `Review the open Datum diagram against this specification section. Call describe and validate. Report missing elements, extra elements, unlabeled relationships, decisions with one outcome, and trust boundaries that should exist. Do not redraw unless asked.\n\nSpec section:\n${section}`,
        },
      },
    ];
  }
  return null;
}

export type ToolOutcome = {
  diagram?: Diagram;
  text: string;
  structured: Record<string, unknown>;
  isError?: boolean;
};

function fail(message: string): ToolOutcome {
  return { text: message, structured: { error: message }, isError: true };
}

function ok(diagram: Diagram, text: string, extra: Record<string, unknown> = {}): ToolOutcome {
  return { diagram, text, structured: { diagram, ...extra } };
}

function summary(diagram: Diagram): string {
  const elements = diagram.pages.reduce((n, p) => n + p.nodes.length, 0);
  const links = diagram.pages.reduce((n, p) => n + p.edges.length, 0);
  return `${diagram.title}: ${diagram.pages.length} page${diagram.pages.length === 1 ? "" : "s"}, ${elements} elements, ${links} relationships.`;
}

function parse<T>(schema: z.ZodType<T>, args: unknown, label: string): T {
  const parsed = schema.safeParse(args ?? {});
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".") || label}: ${i.message}`).join("; ");
    throw new DiagramError(msg);
  }
  return parsed.data;
}

function pagesFromInput(
  pages: { name: string; layout?: PageLayout; nodes?: NodeInput[]; edges?: EdgeInput[] }[],
  title: string,
): Diagram {
  let diagram = blankDiagram(title);
  diagram = { ...diagram, pages: [] };
  if (!pages.length) return blankDiagram(title);
  for (const page of pages) {
    diagram = addPage(diagram, page.name, page.layout ?? "graph");
  }
  if (diagram.pages.length > pages.length) diagram = { ...diagram, pages: diagram.pages.slice(-pages.length) };
  for (let i = 0; i < pages.length; i++) {
    const source = pages[i];
    const target = diagram.pages[i];
    if (source.layout) diagram = setPageLayout(diagram, target.id, source.layout, false);
    if (source.nodes?.length) diagram = addNodes(diagram, target.id, source.nodes, false);
    if (source.edges?.length) diagram = addEdges(diagram, target.id, source.edges);
    const needsLayout = (source.nodes ?? []).some((n) => n.x == null || n.y == null);
    if (needsLayout) diagram = relayout(diagram, target.id);
  }
  return diagram;
}

export async function callDiagramTool(name: string, args: unknown, diagram: Diagram): Promise<ToolOutcome> {
  try {
    switch (name) {
      case "list_shapes": {
        const text = SHAPE_CATALOGUE.map((s) => `- ${s.kind} (${s.name}): ${s.use}`).join("\n");
        return { text, structured: { shapes: SHAPE_CATALOGUE } };
      }
      case "list_templates": {
        const text = TEMPLATES.map((t) => `- ${t.id}: ${t.name} — ${t.summary}`).join("\n");
        return { text, structured: { templates: TEMPLATES } };
      }
      case "create_diagram": {
        const input = parse(
          z.object({
            title: z.string().max(160).optional(),
            templateId: z.string().max(80).optional(),
            pages: z.array(pageInput).max(12).optional(),
          }),
          args,
          "create_diagram",
        );
        let next: Diagram;
        if (input.templateId) {
          const templ = templateDiagram(input.templateId);
          if (!templ) throw new DiagramError(`Unknown template "${input.templateId}".`);
          next = input.title ? setTitle(templ, input.title) : { ...templ };
        } else if (input.pages?.length) {
          next = pagesFromInput(input.pages, input.title || diagram.title);
        } else {
          throw new DiagramError("Provide templateId or pages.");
        }
        if (input.title && input.templateId) next = { ...next, title: input.title };
        return ok(next, `${summary(next)}\n\n${diagramMarkdown(next)}`);
      }
      case "import_sketch": {
        const input = parse(
          z.object({
            sketch: z.string().min(1).max(40_000),
            title: z.string().max(160).optional(),
            mode: z.enum(["replace", "append"]).optional(),
          }),
          args,
          "import_sketch",
        );
        const next = importSketchDiagram(input.sketch, input.title, input.mode ?? "replace", diagram);
        return ok(next, `${summary(next)}\n\n${diagramMarkdown(next)}`);
      }
      case "import_xml": {
        const input = parse(
          z.object({ xml: z.string().min(1).max(400_000), title: z.string().max(160).optional() }),
          args,
          "import_xml",
        );
        const next = await importXmlDiagram(input.xml, input.title);
        return ok(next, summary(next), { xml: exportXml(next) });
      }
      case "put_diagram": {
        const input = parse(z.object({ diagram: storedDiagram, title: z.string().max(160).optional() }), args, "put_diagram");
        const next = replaceDiagram(
          {
            id: input.diagram.id || diagram.id,
            title: input.title || input.diagram.title,
            updatedAt: input.diagram.updatedAt || new Date().toISOString(),
            pages: input.diagram.pages,
          },
          input.title,
        );
        if (input.diagram.updatedAt) next.updatedAt = input.diagram.updatedAt;
        return ok(next, summary(next));
      }
      case "get_diagram":
        return ok(diagram, `${summary(diagram)}\n\n${diagramMarkdown(diagram)}`);
      case "add_nodes": {
        const input = parse(
          z.object({ page: z.string().max(80).optional(), nodes: z.array(nodeInput).min(1).max(80), relayout: z.boolean().optional() }),
          args,
          "add_nodes",
        );
        const next = addNodes(diagram, input.page, input.nodes, input.relayout ?? false);
        return ok(next, `Added ${input.nodes.length} element(s).\n${summary(next)}`);
      }
      case "add_edges": {
        const input = parse(
          z.object({ page: z.string().max(80).optional(), edges: z.array(edgeInput).min(1).max(80) }),
          args,
          "add_edges",
        );
        const next = addEdges(diagram, input.page, input.edges);
        return ok(next, `Added ${input.edges.length} relationship(s).\n${summary(next)}`);
      }
      case "update_cells": {
        const input = parse(
          z.object({ page: z.string().max(80).optional(), updates: z.array(patchInput).min(1).max(80) }),
          args,
          "update_cells",
        );
        const result = updateCells(diagram, input.page, input.updates as CellPatch[]);
        const note = result.missing.length ? ` Unknown ids: ${result.missing.join(", ")}.` : "";
        if (result.missing.length === input.updates.length) return fail(`None of those ids are on the page.${note}`);
        return ok(result.diagram, `Updated ${input.updates.length - result.missing.length} cell(s).${note}`);
      }
      case "remove_cells": {
        const input = parse(
          z.object({ page: z.string().max(80).optional(), ids: z.array(z.string().min(1).max(80)).min(1).max(80) }),
          args,
          "remove_cells",
        );
        const next = removeCells(diagram, input.page, input.ids);
        return ok(next, `Removed ${input.ids.length} id(s).\n${summary(next)}`);
      }
      case "relayout": {
        const input = parse(
          z.object({
            page: z.string().max(80).optional(),
            direction: z.enum(["horizontal", "vertical"]).optional(),
            layout: layoutSchema.optional(),
          }),
          args,
          "relayout",
        );
        let next = diagram;
        if (input.layout) next = setPageLayout(next, input.page, input.layout, true);
        else next = relayout(next, input.page, input.direction ?? "horizontal");
        return ok(next, `Reflowed.\n${summary(next)}`);
      }
      case "add_page": {
        const input = parse(z.object({ name: z.string().min(1).max(80), layout: layoutSchema.optional() }), args, "add_page");
        const next = addPage(diagram, input.name, input.layout ?? "graph");
        return ok(next, `Added page ${input.name}.`);
      }
      case "rename_page": {
        const input = parse(z.object({ page: z.string().min(1).max(80), name: z.string().min(1).max(80) }), args, "rename_page");
        const next = renamePage(diagram, input.page, input.name);
        return ok(next, `Renamed page to ${input.name}.`);
      }
      case "set_title": {
        const input = parse(z.object({ title: z.string().min(1).max(160) }), args, "set_title");
        const next = setTitle(diagram, input.title);
        return ok(next, `Title set to ${next.title}.`);
      }
      case "validate": {
        const issues = validateDiagram(diagram);
        const text = issues.length
          ? issues.map((i) => `- ${i.level}: ${i.message}`).join("\n")
          : "No issues.";
        return ok(diagram, text, { issues });
      }
      case "describe":
        return ok(diagram, diagramMarkdown(diagram));
      case "export_xml": {
        const xml = exportXml(diagram);
        return ok(diagram, xml, { xml });
      }
      default:
        return fail(`Unknown tool ${name}.`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tool failed.";
    return fail(message);
  }
}

export function sketchGuide(): string {
  return SKETCH_GUIDE;
}

export { templateDiagram, TEMPLATES };
