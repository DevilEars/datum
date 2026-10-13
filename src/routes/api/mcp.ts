import { createFileRoute } from "@tanstack/react-router";
import { handleMcp } from "@/lib/mcp/session.server";

const handle = ({ request }: { request: Request }) => handleMcp(request);

export const Route = createFileRoute("/api/mcp")({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
      DELETE: handle,
      OPTIONS: handle,
    },
  },
});
