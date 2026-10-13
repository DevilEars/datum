import { relayoutPage } from "./layout";
import { DEFAULT_SIZE } from "./styles";
import {
  STAMP,
  type Diagram,
  type DiagramEdge,
  type DiagramNode,
  type DiagramPage,
  type EdgeStyle,
  type ShapeKind,
} from "./types";

export type TemplateInfo = { id: string; name: string; summary: string };

export const TEMPLATES: TemplateInfo[] = [
  { id: "northline", name: "Northline checkout", summary: "A four-page specification pack: context, containers, sequence, deployment." },
  { id: "system-context", name: "System context", summary: "C4 level 1 scaffold: a person, one system, one external." },
  { id: "containers", name: "Containers", summary: "One system boundary with an API, a database, and a queue." },
  { id: "sequence", name: "Sequence", summary: "Three participants and three ordered messages." },
  { id: "deployment", name: "Deployment", summary: "Browser, application cluster, and a database." },
  { id: "blank", name: "Blank plate", summary: "An empty page." },
];

function node(
  id: string,
  kind: ShapeKind,
  label: string,
  subtitle: string | undefined,
  x: number,
  y: number,
  parentId?: string,
  w?: number,
  h?: number,
): DiagramNode {
  const size = DEFAULT_SIZE[kind];
  return { id, kind, label, subtitle, parentId, x, y, w: w ?? size.w, h: h ?? size.h };
}

function edge(id: string, from: string, to: string, label: string, style: EdgeStyle = "orthogonal", order?: number): DiagramEdge {
  return { id, from, to, label, style, order };
}

function scaffold(title: string, id: string, page: DiagramPage): Diagram {
  return { id, title, updatedAt: STAMP, pages: [relayoutPage(page)] };
}

function loose(
  id: string,
  kind: ShapeKind,
  label: string,
  subtitle?: string,
  parentId?: string,
): DiagramNode {
  const size = DEFAULT_SIZE[kind];
  return { id, kind, label, subtitle, parentId, x: 0, y: 0, w: size.w, h: size.h };
}

export function northlineDiagram(): Diagram {
  const context: DiagramPage = {
    id: "context",
    name: "Context",
    layout: "graph",
    nodes: [
      node("customer", "person", "Customer", "Places the order", 48, 150),
      node("finance", "person", "Finance", "Reconciles payouts", 48, 360),
      node("northline", "process", "Northline", "Software system", 340, 230, undefined, 230, 100),
      node("processor", "external", "Card processor", "External system", 700, 120, undefined, 200, 72),
      node("mail", "external", "Mail gateway", "External system", 700, 390, undefined, 200, 72),
      node("scope", "note", "Scope", "Checkout and settlement only. Catalogue is out of scope.", 340, 400, undefined, 230, 96),
    ],
    edges: [
      edge("e-customer-northline", "customer", "northline", "Places an order"),
      edge("e-finance-northline", "finance", "northline", "Reconciles payouts"),
      edge("e-northline-processor", "northline", "processor", "Authorises payment"),
      edge("e-northline-mail", "northline", "mail", "Sends the receipt"),
    ],
  };

  const containers: DiagramPage = {
    id: "containers",
    name: "Containers",
    layout: "graph",
    nodes: [
      node("platform", "boundary", "Northline", undefined, 180, 36, undefined, 760, 500),
      node("customer", "person", "Customer", undefined, 28, 180),
      node("web", "process", "Web app", "Browser", 220, 100, "platform", 170, 68),
      node("api", "process", "API", "HTTP", 450, 188, "platform", 176, 68),
      node("worker", "process", "Worker", "Async", 450, 340, "platform", 176, 68),
      node("orders", "datastore", "Orders", "Postgres", 690, 160, "platform", 170, 90),
      node("bus", "queue", "Bus", "Redis", 690, 348, "platform", 176, 60),
      node("processor", "external", "Card processor", "External", 990, 160, undefined, 190, 72),
      node("mail", "external", "Mail gateway", "External", 990, 348, undefined, 190, 72),
    ],
    edges: [
      edge("e-customer-web", "customer", "web", "Uses"),
      edge("e-web-api", "web", "api", "JSON / HTTPS"),
      edge("e-api-orders", "api", "orders", "Reads and writes"),
      edge("e-api-bus", "api", "bus", "Publishes PaymentRequested"),
      edge("e-worker-bus", "worker", "bus", "Consumes"),
      edge("e-worker-orders", "worker", "orders", "Records the result"),
      edge("e-worker-processor", "worker", "processor", "Authorises"),
      edge("e-worker-mail", "worker", "mail", "Sends the receipt"),
    ],
  };

  const sequence: DiagramPage = {
    id: "place-order",
    name: "Place order",
    layout: "sequence",
    nodes: [
      node("customer", "person", "Customer", undefined, 36, 16),
      node("web", "process", "Web app", undefined, 210, 36, undefined, 150, 64),
      node("api", "process", "API", undefined, 400, 36, undefined, 140, 64),
      node("bus", "queue", "Bus", undefined, 580, 40, undefined, 150, 60),
      node("worker", "process", "Worker", undefined, 770, 36, undefined, 150, 64),
      node("processor", "external", "Card processor", undefined, 960, 36, undefined, 180, 68),
    ],
    edges: [
      edge("m1", "customer", "web", "Submit checkout", "straight", 1),
      edge("m2", "web", "api", "POST /orders", "straight", 2),
      edge("m3", "api", "bus", "Publish PaymentRequested", "straight", 3),
      edge("m4", "api", "web", "202 Accepted", "straight", 4),
      edge("m5", "worker", "bus", "Consume", "straight", 5),
      edge("m6", "worker", "processor", "Authorise", "straight", 6),
      edge("m7", "processor", "worker", "Approved", "straight", 7),
      edge("m8", "worker", "bus", "Publish PaymentCaptured", "straight", 8),
    ],
  };

  const deployment: DiagramPage = {
    id: "deployment",
    name: "Deployment",
    layout: "graph",
    nodes: [
      node("shopper", "boundary", "Shopper", undefined, 36, 40, undefined, 210, 180),
      node("browser", "process", "Browser", undefined, 70, 100, "shopper", 144, 64),
      node("edge", "boundary", "Edge", undefined, 280, 40, undefined, 210, 180),
      node("cdn", "hexagon", "CDN", undefined, 314, 100, "edge", 144, 64),
      node("cluster", "boundary", "Application cluster", undefined, 530, 40, undefined, 280, 330),
      node("api", "component", "API", "2 replicas", 570, 108, "cluster", 200, 68),
      node("worker", "component", "Worker", "2 replicas", 570, 230, "cluster", 200, 68),
      node("data", "boundary", "Data services", undefined, 850, 40, undefined, 270, 330),
      node("postgres", "datastore", "Postgres", "Primary", 890, 108, "data", 180, 88),
      node("redis", "queue", "Redis", undefined, 896, 236, "data", 170, 60),
      node("processor", "external", "Card processor", "External", 570, 420, undefined, 200, 72),
    ],
    edges: [
      edge("d1", "browser", "cdn", "HTTPS"),
      edge("d2", "cdn", "api", "HTTPS"),
      edge("d3", "api", "postgres", "SQL"),
      edge("d4", "api", "redis", "Cache and publish"),
      edge("d5", "worker", "redis", "Consume"),
      edge("d6", "worker", "postgres", "Write"),
      edge("d7", "worker", "processor", "Authorise"),
    ],
  };

  return {
    id: "northline",
    title: "Northline checkout",
    updatedAt: STAMP,
    pages: [context, containers, sequence, deployment],
  };
}

function systemContext(): Diagram {
  const page: DiagramPage = {
    id: "context",
    name: "Context",
    layout: "graph",
    nodes: [
      loose("customer", "person", "Customer", "Person"),
      loose("system", "process", "Software system", "System under design"),
      loose("external", "external", "External system", "Third party"),
    ],
    edges: [
      edge("e1", "customer", "system", "Uses"),
      edge("e2", "system", "external", "Depends on"),
    ],
  };
  return scaffold("System context", "system-context", page);
}

function containers(): Diagram {
  const page: DiagramPage = {
    id: "containers",
    name: "Containers",
    layout: "graph",
    nodes: [
      loose("system", "boundary", "Software system"),
      loose("customer", "person", "Customer"),
      loose("api", "process", "API", "Container", "system"),
      loose("db", "datastore", "Database", "Container", "system"),
      loose("bus", "queue", "Queue", "Container", "system"),
      loose("external", "external", "External system"),
    ],
    edges: [
      edge("e1", "customer", "api", "Uses"),
      edge("e2", "api", "db", "Reads and writes"),
      edge("e3", "api", "bus", "Publishes"),
      edge("e4", "api", "external", "Calls"),
    ],
  };
  return scaffold("Containers", "containers", page);
}

function sequence(): Diagram {
  const page: DiagramPage = {
    id: "sequence",
    name: "Sequence",
    layout: "sequence",
    nodes: [
      loose("customer", "person", "Customer"),
      loose("api", "process", "API"),
      loose("db", "datastore", "Database"),
    ],
    edges: [
      edge("m1", "customer", "api", "Request", "straight", 1),
      edge("m2", "api", "db", "Write", "straight", 2),
      edge("m3", "api", "customer", "Response", "straight", 3),
    ],
  };
  return scaffold("Sequence", "sequence", page);
}

function deployment(): Diagram {
  const page: DiagramPage = {
    id: "deployment",
    name: "Deployment",
    layout: "graph",
    nodes: [
      loose("client", "boundary", "Client"),
      loose("browser", "process", "Browser", undefined, "client"),
      loose("cluster", "boundary", "Cluster"),
      loose("api", "component", "API", "Replicas", "cluster"),
      loose("data", "boundary", "Data"),
      loose("db", "datastore", "Database", undefined, "data"),
    ],
    edges: [
      edge("e1", "browser", "api", "HTTPS"),
      edge("e2", "api", "db", "SQL"),
    ],
  };
  return scaffold("Deployment", "deployment", page);
}

export function templateDiagram(id: string): Diagram | null {
  switch (id) {
    case "northline":
      return northlineDiagram();
    case "system-context":
      return systemContext();
    case "containers":
      return containers();
    case "sequence":
      return sequence();
    case "deployment":
      return deployment();
    case "blank":
      return {
        id: "blank",
        title: "Untitled",
        updatedAt: STAMP,
        pages: [{ id: "page-1", name: "Page 1", layout: "graph", nodes: [], edges: [] }],
      };
    default:
      return null;
  }
}
