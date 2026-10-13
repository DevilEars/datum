import { diagramMarkdown } from "../diagram/markdown";
import { blankDiagram, cloneDiagram, exportXml } from "../diagram/ops";
import { SHAPE_CATALOGUE } from "../diagram/styles";
import type { Diagram } from "../diagram/types";
import {
  PROMPTS,
  SERVER_INSTRUCTIONS,
  TOOLS,
  callDiagramTool,
  promptMessages,
  sketchGuide,
  templateDiagram,
  TEMPLATES,
} from "./dispatch";

const SUPPORTED = new Set(["2025-03-26", "2025-06-18", "2025-11-25"]);
const SERVER_PROTOCOL = "2025-11-25";
const DOC_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const READONLY = new Set(["list_shapes", "list_templates", "get_diagram", "validate", "describe", "export_xml"]);

type Session = { id: string; docId: string; protocol: string; created: number };

type Bucket = {
  sessions: Map<string, Session>;
  docs: Map<string, Diagram>;
};

const globalRef = globalThis as typeof globalThis & { __datum?: Bucket };

function bucket(): Bucket {
  globalRef.__datum ??= { sessions: new Map(), docs: new Map() };
  return globalRef.__datum;
}

function docIdOk(id: string | undefined | null): string | null {
  if (!id) return null;
  return DOC_RE.test(id) ? id : null;
}

function getDoc(id: string): Diagram {
  const docs = bucket().docs;
  const found = docs.get(id);
  if (found) return found;
  const created = blankDiagram(id === "live" ? "Untitled" : id);
  docs.set(id, created);
  return created;
}

function remember(docId: string, diagram: Diagram) {
  const docs = bucket().docs;
  docs.set(docId, diagram);
  if (docs.size > 80) {
    const oldest = docs.keys().next().value;
    if (oldest && oldest !== docId) docs.delete(oldest);
  }
}

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, DELETE, OPTIONS, GET",
  "access-control-allow-headers": "content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id",
  "access-control-expose-headers": "mcp-session-id",
  "cache-control": "no-store",
};

function json(body: unknown, status: number, extra?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS, ...extra },
  });
}

function accepted(extra?: Record<string, string>) {
  return new Response(null, { status: 202, headers: { ...CORS, ...extra } });
}

function rpcError(status: number, code: number, message: string, id: unknown = null, extra?: Record<string, string>) {
  return json({ jsonrpc: "2.0", id, error: { code, message } }, status, extra);
}

function originBlocked(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = (request.headers.get("host") ?? "").split(":")[0];
  const local = host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";
  if (!local) return false;
  try {
    const name = new URL(origin).hostname;
    return name !== host && name !== "localhost" && name !== "127.0.0.1";
  } catch {
    return true;
  }
}

function newSession(docId: string, protocol: string): Session {
  const sessions = bucket().sessions;
  const session: Session = { id: crypto.randomUUID(), docId, protocol, created: Date.now() };
  sessions.set(session.id, session);
  if (sessions.size > 100) {
    const oldest = [...sessions.values()].sort((a, b) => a.created - b.created)[0];
    if (oldest) sessions.delete(oldest.id);
  }
  return session;
}

async function readResource(uri: string): Promise<{ mimeType: string; text: string } | null> {
  if (uri === "datum://shapes") {
    const text = SHAPE_CATALOGUE.map((s) => `${s.kind} — ${s.name}: ${s.use}`).join("\n");
    return { mimeType: "text/plain", text };
  }
  if (uri === "datum://guide/sketch") return { mimeType: "text/plain", text: sketchGuide() };
  if (uri === "datum://templates") {
    return { mimeType: "application/json", text: JSON.stringify(TEMPLATES, null, 2) };
  }
  const templ = /^datum:\/\/templates\/([A-Za-z0-9_-]+)$/.exec(uri);
  if (templ) {
    const diagram = templateDiagram(templ[1]);
    if (!diagram) return null;
    return { mimeType: "text/markdown", text: diagramMarkdown(diagram) };
  }
  const spec = /^datum:\/\/documents\/([A-Za-z0-9][A-Za-z0-9_-]{0,63})\/(spec|xml)$/.exec(uri);
  if (spec) {
    const diagram = bucket().docs.get(spec[1]);
    if (!diagram) return null;
    if (spec[2] === "xml") return { mimeType: "application/xml", text: exportXml(diagram) };
    return { mimeType: "text/markdown", text: diagramMarkdown(diagram) };
  }
  return null;
}

async function handleMessage(message: unknown, session: Session | null, request: Request): Promise<Response> {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return rpcError(400, -32600, "Invalid Request");
  }
  const msg = message as { jsonrpc?: string; id?: unknown; method?: string; params?: unknown };
  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return rpcError(400, -32600, "Invalid Request", msg.id ?? null);

  const isNote = msg.id === undefined;
  const method = msg.method;
  const headerVersion = request.headers.get("mcp-protocol-version");
  if (headerVersion && !SUPPORTED.has(headerVersion) && method !== "initialize") {
    return rpcError(400, -32600, `Unsupported MCP-Protocol-Version ${headerVersion}`);
  }

  if (method === "initialize") {
    const params = (msg.params ?? {}) as { protocolVersion?: string; documentId?: string };
    const requested = SUPPORTED.has(params.protocolVersion ?? "") ? (params.protocolVersion as string) : SERVER_PROTOCOL;
    const fromQuery = docIdOk(new URL(request.url).searchParams.get("document"));
    const fromParams = docIdOk(params.documentId);
    const docId = fromParams || fromQuery || `s${crypto.randomUUID().slice(0, 8)}`;
    getDoc(docId);
    const created = newSession(docId, requested);
    return json(
      {
        jsonrpc: "2.0",
        id: msg.id ?? null,
        result: {
          protocolVersion: requested,
          capabilities: {
            tools: { listChanged: false },
            resources: { listChanged: false },
            prompts: { listChanged: false },
          },
          serverInfo: { name: "datum-drawio", version: "1.0.0", title: "Datum Draw.io" },
          instructions: SERVER_INSTRUCTIONS,
        },
      },
      200,
      { "mcp-session-id": created.id },
    );
  }

  if (isNote || method.startsWith("notifications/")) return accepted(session ? { "mcp-session-id": session.id } : undefined);

  if (!session && method !== "tools/list" && method !== "prompts/list") {
    return rpcError(400, -32000, "Missing MCP-Session-Id. Send initialize first.");
  }

  const extra = session ? { "mcp-session-id": session.id } : undefined;

  if (method === "ping" || method === "logging/setLevel") {
    return json({ jsonrpc: "2.0", id: msg.id, result: {} }, 200, extra);
  }

  if (method === "tools/list") {
    return json({ jsonrpc: "2.0", id: msg.id, result: { tools: TOOLS } }, 200, extra);
  }

  if (method === "prompts/list") {
    return json({ jsonrpc: "2.0", id: msg.id, result: { prompts: PROMPTS } }, 200, extra);
  }

  if (method === "prompts/get") {
    const params = (msg.params ?? {}) as { name?: string; arguments?: Record<string, string> };
    const messages = promptMessages(params.name ?? "", params.arguments ?? {});
    if (!messages) return rpcError(200, -32602, `Unknown prompt ${params.name}`, msg.id, extra);
    // JSON-RPC errors use HTTP 200 for MCP tool-level; unknown prompt is a protocol error.
    const prompt = PROMPTS.find((p) => p.name === params.name);
    return json(
      { jsonrpc: "2.0", id: msg.id, result: { description: prompt?.description ?? "", messages } },
      200,
      extra,
    );
  }

  if (method === "resources/list") {
    const docs = [...bucket().docs.keys()];
    const resources = [
      { uri: "datum://shapes", name: "Shape catalogue", mimeType: "text/plain" },
      { uri: "datum://guide/sketch", name: "Sketch grammar", mimeType: "text/plain" },
      { uri: "datum://templates", name: "Templates", mimeType: "application/json" },
      ...TEMPLATES.map((t) => ({
        uri: `datum://templates/${t.id}`,
        name: t.name,
        mimeType: "text/markdown",
      })),
      ...docs.flatMap((id) => [
        { uri: `datum://documents/${id}/spec`, name: `${id} specification`, mimeType: "text/markdown" },
        { uri: `datum://documents/${id}/xml`, name: `${id} draw.io XML`, mimeType: "application/xml" },
      ]),
    ];
    return json({ jsonrpc: "2.0", id: msg.id, result: { resources } }, 200, extra);
  }

  if (method === "resources/read") {
    const uri = ((msg.params ?? {}) as { uri?: string }).uri ?? "";
    const found = await readResource(uri);
    if (!found) return rpcError(200, -32002, `Resource not found: ${uri}`, msg.id, extra);
    return json(
      { jsonrpc: "2.0", id: msg.id, result: { contents: [{ uri, mimeType: found.mimeType, text: found.text }] } },
      200,
      extra,
    );
  }

  if (method === "tools/call") {
    if (!session) return rpcError(400, -32000, "Missing MCP-Session-Id.", msg.id);
    const params = (msg.params ?? {}) as { name?: string; arguments?: unknown };
    const name = params.name ?? "";
    if (!TOOLS.some((t) => t.name === name)) {
      return json(
        {
          jsonrpc: "2.0",
          id: msg.id,
          result: { content: [{ type: "text", text: `Unknown tool ${name}.` }], isError: true },
        },
        200,
        extra,
      );
    }
    if (name === "attach_document") {
      const id = docIdOk((params.arguments as { id?: string } | undefined)?.id);
      if (!id) {
        return json(
          {
            jsonrpc: "2.0",
            id: msg.id,
            result: {
              content: [{ type: "text", text: "Document id must match /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/." }],
              isError: true,
            },
          },
          200,
          extra,
        );
      }
      session.docId = id;
      const diagram = cloneDiagram(getDoc(id));
      const elements = diagram.pages.reduce((n, p) => n + p.nodes.length, 0);
      return json(
        {
          jsonrpc: "2.0",
          id: msg.id,
          result: {
            content: [
              {
                type: "text",
                text: `Attached to document ${id}. ${diagram.pages.length} pages, ${elements} elements. Title: ${diagram.title}.`,
              },
            ],
            structuredContent: { documentId: id, diagram },
          },
        },
        200,
        extra,
      );
    }

    const current = cloneDiagram(getDoc(session.docId));
    const outcome = await callDiagramTool(name, params.arguments ?? {}, current);
    if (outcome.diagram && !outcome.isError && !READONLY.has(name)) {
      if (name !== "put_diagram") outcome.diagram = { ...outcome.diagram, updatedAt: new Date().toISOString() };
      outcome.structured.diagram = outcome.diagram;
      remember(session.docId, cloneDiagram(outcome.diagram));
    }
    const text = outcome.isError ? outcome.text : `Document ${session.docId}. ${outcome.text}`;
    return json(
      {
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          content: [{ type: "text", text }],
          structuredContent: { documentId: session.docId, ...outcome.structured },
          isError: Boolean(outcome.isError),
        },
      },
      200,
      extra,
    );
  }

  return rpcError(200, -32601, `Method not found: ${method}`, msg.id, extra);
}

export async function handleMcp(request: Request): Promise<Response> {
  if (originBlocked(request)) return rpcError(403, -32000, "Origin rejected");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method === "GET") {
    return json({ jsonrpc: "2.0", error: { code: -32000, message: "SSE is not used. POST JSON-RPC to this URL." } }, 405, {
      allow: "POST, DELETE, OPTIONS",
    });
  }

  const sessions = bucket().sessions;
  const sid = request.headers.get("mcp-session-id");

  if (request.method === "DELETE") {
    if (!sid || !sessions.has(sid)) return rpcError(404, -32001, "Session not found");
    sessions.delete(sid);
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method !== "POST") return rpcError(405, -32000, "Method not allowed", null, { allow: "POST, DELETE, OPTIONS" });

  const raw = await request.text();
  if (raw.length > 1_000_000) return rpcError(400, -32600, "Body too large");
  let message: unknown;
  try {
    message = JSON.parse(raw);
  } catch {
    return rpcError(400, -32700, "Parse error");
  }
  if (Array.isArray(message)) return rpcError(400, -32600, "JSON-RPC batches are not supported");

  const method = (message as { method?: string }).method;
  let session: Session | null = null;
  if (sid) {
    session = sessions.get(sid) ?? null;
    if (!session && method !== "initialize") return rpcError(404, -32001, "Session not found");
  }
  try {
    return await handleMessage(message, session, request);
  } catch (error) {
    console.error("[datum] mcp error", error);
    return rpcError(500, -32603, "Internal error");
  }
}
