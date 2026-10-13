export type RpcResult = {
  status: number;
  sessionId: string | null;
  json: {
    result?: {
      isError?: boolean;
      content?: { type: string; text?: string }[];
      structuredContent?: { diagram?: unknown; documentId?: string; [key: string]: unknown };
    };
    error?: { message?: string };
  } | null;
  raw: string;
  ms: number;
};

let rpc = 1;

export async function mcpRequest(sessionId: string | null, method: string, params?: unknown): Promise<RpcResult> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": "2025-11-25",
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const started = performance.now();
  const res = await fetch("/mcp?document=live", {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: rpc++, method, params: params ?? {} }),
  });
  const raw = await res.text();
  let json: RpcResult["json"] = null;
  if (raw) {
    try {
      json = JSON.parse(raw) as RpcResult["json"];
    } catch {
      json = null;
    }
  }
  return {
    status: res.status,
    sessionId: res.headers.get("mcp-session-id"),
    json,
    raw,
    ms: Math.round(performance.now() - started),
  };
}
