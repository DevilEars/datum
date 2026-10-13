import { useEffect, useRef, useState } from "react";
import { mcpRequest, type RpcResult } from "@/lib/mcp/client";
import { useStudio } from "@/lib/diagram/store";
import { northlineDiagram } from "@/lib/diagram/templates";
import type { Diagram } from "@/lib/diagram/types";

export type TranscriptEntry = {
  id: number;
  method: string;
  ms: number;
  ok: boolean;
  request: unknown;
  response: unknown;
};

function isDiagram(value: unknown): value is Diagram {
  if (!value || typeof value !== "object") return false;
  const diagram = value as Diagram;
  return typeof diagram.title === "string" && typeof diagram.updatedAt === "string" && Array.isArray(diagram.pages);
}

function loadLocal(docId: string): Diagram | null {
  try {
    const raw = localStorage.getItem(`datum.diagram.v1.${docId}`);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isDiagram(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

let entryId = 1;

export function usePlateSync(follow: boolean) {
  const [status, setStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const [docId, setDocId] = useState("live");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const sessionRef = useRef<string | null>(null);
  const docRef = useRef("live");

  const log = (method: string, res: RpcResult, request: unknown) => {
    setTranscript((prev) =>
      [
        {
          id: entryId++,
          method,
          ms: res.ms,
          ok: res.status < 400 && !res.json?.result?.isError && !res.json?.error,
          request,
          response: res.json ?? res.raw,
        },
        ...prev,
      ].slice(0, 24),
    );
  };

  const push = async (diagram: Diagram) => {
    const sid = sessionRef.current;
    if (!sid) return false;
    const res = await mcpRequest(sid, "tools/call", { name: "put_diagram", arguments: { diagram } });
    return res.status < 400 && !res.json?.result?.isError;
  };

  useEffect(() => {
    let cancel = false;
    (async () => {
      const saved = loadLocal("live");
      try {
        const init = await mcpRequest(null, "initialize", {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "datum-plate", version: "1.0.0" },
          documentId: "live",
        });
        if (cancel) return;
        log("initialize", init, { documentId: "live" });
        const sid = init.sessionId;
        if (!sid || init.status >= 400) {
          setStatus("offline");
          return;
        }
        sessionRef.current = sid;
        setSessionId(sid);
        const got = await mcpRequest(sid, "tools/call", { name: "get_diagram", arguments: {} });
        if (cancel) return;
        const remote = got.json?.result?.structuredContent?.diagram;
        const remoteCount = isDiagram(remote) ? remote.pages.reduce((n, p) => n + p.nodes.length, 0) : 0;
        if (isDiagram(remote) && remoteCount > 0 && (!saved || remote.updatedAt >= saved.updatedAt)) {
          useStudio.getState().replaceRemote(remote);
        } else if (saved && saved.pages.some((p) => p.nodes.length)) {
          useStudio.getState().replaceRemote(saved);
          await push(saved);
        } else {
          const seed = { ...northlineDiagram(), updatedAt: new Date().toISOString() };
          useStudio.getState().replaceRemote(seed);
          await push(seed);
        }
        if (!cancel) setStatus("live");
      } catch {
        if (!cancel) setStatus("offline");
      }
    })();
    return () => {
      cancel = true;
    };
    // Handshake once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status !== "live") return;
    const save = () => {
      try {
        localStorage.setItem(`datum.diagram.v1.${docRef.current}`, JSON.stringify(useStudio.getState().diagram));
      } catch {
        /* private mode */
      }
    };
    save();
    return useStudio.subscribe(save);
  }, [status, docId]);

  useEffect(() => {
    if (status !== "live" || !follow) return;
    const timer = window.setInterval(async () => {
      if (document.hidden) return;
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      if (useStudio.getState().gesturing) return;
      const sid = sessionRef.current;
      if (!sid) return;
      try {
        const res = await mcpRequest(sid, "tools/call", { name: "get_diagram", arguments: {} });
        const remote = res.json?.result?.structuredContent?.diagram;
        if (!isDiagram(remote)) return;
        const local = useStudio.getState().diagram;
        if (remote.updatedAt > local.updatedAt) useStudio.getState().replaceRemote(remote);
      } catch {
        /* keep editing locally */
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [status, follow]);

  async function runTool(name: string, args: Record<string, unknown>) {
    const sid = sessionRef.current;
    if (!sid) {
      setTranscript((prev) =>
        [{ id: entryId++, method: name, ms: 0, ok: false, request: args, response: { error: "MCP session is offline." } }, ...prev].slice(0, 24),
      );
      return null;
    }
    await push(useStudio.getState().diagram);
    const res = await mcpRequest(sid, "tools/call", { name, arguments: args });
    log(name, res, args);
    const next = res.json?.result?.structuredContent?.diagram;
    if (typeof res.json?.result?.structuredContent?.documentId === "string") {
      const id = res.json.result.structuredContent.documentId;
      docRef.current = id;
      setDocId(id);
    }
    if (isDiagram(next)) useStudio.getState().replaceRemote(next);
    return res;
  }

  async function attach(id: string) {
    const saved = loadLocal(id);
    await push(useStudio.getState().diagram);
    const res = await runTool("attach_document", { id });
    const next = res?.json?.result?.structuredContent?.diagram;
    const empty = !isDiagram(next) || next.pages.every((p) => p.nodes.length === 0);
    if (empty && saved && saved.pages.some((p) => p.nodes.length)) {
      useStudio.getState().replaceRemote(saved);
      await push(saved);
    }
    docRef.current = id;
    setDocId(id);
  }

  return { status, docId, sessionId, transcript, push, runTool, attach, clear: () => setTranscript([]) };
}
