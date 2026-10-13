# Datum

Draw.io studio for architecture and technical-specification figures. The open plate and an MCP client share one document, `live`.

## Run

```bash
npm install
npm run dev
```

The app serves the plate and a Streamable HTTP MCP endpoint at `/mcp?document=live`.

## Draw

- Place shapes, connect them, reflow, and switch a page to a sequence.
- **Spec** copies a markdown figure key.
- **.drawio** downloads uncompressed diagrams.net XML.
- **Edit** opens the same file in diagrams.net.

## MCP

Point Claude, Cursor, VS Code, or any Streamable HTTP client at `/mcp?document=live`.

The agent should call `attach_document` with id `live`, draw with `import_sketch` (or `add_nodes` / `add_edges`), then `validate`, `describe`, and `export_xml`.

Keep the plate open while the agent draws. That document is in memory for the life of the server process, and the browser keeps a local copy.

This tree includes the app shell it was built in (preview bridge, unused auth and database wiring). Datum itself lives in `src/lib/diagram`, `src/lib/mcp`, and `src/components/studio`.
