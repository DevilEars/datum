import { handleMcp } from "./protocol";
import type { RpcResult } from "./client";

/**
 * GitHub Pages has no server. The same MCP handler runs in the tab so the
 * plate, tools, and transcript still work on the public demo.
 */
export async function browserMcpRequest(
  sessionId: string | null,
  method: string,
  params?: unknown,
): Promise<RpcResult> {
  const headers = new Headers({
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": "2025-11-25",
  });
  if (sessionId) headers.set("mcp-session-id", sessionId);
  const started = performance.now();
  const res = await handleMcp(
    new Request("https://datum.local/mcp?document=live", {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? {} }),
    }),
  );
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
