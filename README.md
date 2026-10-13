# Datum

Draw.io MCP studio for architecture and technical-specification figures.

**Public demo:** [devilears.github.io/datum](https://devilears.github.io/datum/)

The demo is the drawing plate: templates, sketch, spec, `.drawio` export, and the MCP tool panel. Tools run in the browser on that site. GitHub Pages cannot host the Streamable HTTP endpoint.

## Run

```bash
npm install
npm run dev
```

Open the app and use the plate. The MCP endpoint is `/mcp?document=live`.

An agent should call `attach_document` with `{ "id": "live" }`, then `import_sketch` (or `create_diagram`), then `validate`, `describe`, and `export_xml`.

The drawing engine lives in `src/lib/diagram`, the MCP server in `src/lib/mcp`, and the studio in `src/components/studio`.

## GitHub Pages

Pushes to `main` publish the static demo with GitHub Actions. The HTTP MCP server is not part of that build.
