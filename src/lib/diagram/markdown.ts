import type { Diagram, DiagramPage } from "./types";
import { validateDiagram } from "./validate";

function kindName(kind: string): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

export function pageMarkdown(page: DiagramPage): string {
  const lines: string[] = [`## ${page.name}`, "", `Layout: ${page.layout}`, "", "### Elements", ""];
  lines.push("| Id | Kind | Name | Notes |");
  lines.push("| --- | --- | --- | --- |");
  for (const n of page.nodes) {
    const notes = [n.subtitle, n.parentId ? `in ${n.parentId}` : ""].filter(Boolean).join("; ");
    lines.push(`| ${n.id} | ${kindName(n.kind)} | ${n.label.replace(/\|/g, "/")} | ${notes.replace(/\|/g, "/")} |`);
  }
  lines.push("");
  if (page.layout === "sequence") {
    lines.push("### Messages", "");
    const ordered = [...page.edges].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    ordered.forEach((e, i) => {
      const from = page.nodes.find((n) => n.id === e.from)?.label ?? e.from;
      const to = page.nodes.find((n) => n.id === e.to)?.label ?? e.to;
      lines.push(`${e.order ?? i + 1}. **${from}** → **${to}** — ${e.label || "(unlabeled)"}`);
    });
  } else {
    lines.push("### Relationships", "");
    if (!page.edges.length) lines.push("None.");
    for (const e of page.edges) {
      const from = page.nodes.find((n) => n.id === e.from)?.label ?? e.from;
      const to = page.nodes.find((n) => n.id === e.to)?.label ?? e.to;
      lines.push(`- **${from}** → **${to}** — ${e.label || "(unlabeled)"}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function diagramMarkdown(diagram: Diagram): string {
  const issues = validateDiagram(diagram);
  const head = [`# ${diagram.title}`, ""];
  if (issues.length) {
    head.push("### Review", "");
    for (const issue of issues) head.push(`- ${issue.level === "error" ? "Error" : "Note"}: ${issue.message}`);
    head.push("");
  }
  return head.join("\n") + diagram.pages.map(pageMarkdown).join("\n");
}
