// Builds a suggested tour from the folder structure and the architecture results, without any AI.
import type { ArchitectureKind, ArchitectureNode, CityModel, CityNode } from "../types/cityModel";
import { childrenByParent } from "../city/tree";
import { emptyTour, newStation } from "./tour";
import { MAX_TEXT, type Station, type Tour } from "./types";

const MAX_FOLDER_STATIONS = 4;
const MAX_LISTED = 5;
const ARCH_OFF = { apiGates: false, databases: false, externalServices: false, servers: false, dataPaths: false } as const;

function extensionCounts(node: CityNode, children: Map<string, CityNode[]>): Map<string, number> {
  const counts = new Map<string, number>();
  const stack = [node];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current.type === "file" && current.metrics.extension) {
      counts.set(current.metrics.extension, (counts.get(current.metrics.extension) ?? 0) + 1);
    }
    stack.push(...(children.get(current.id) ?? []));
  }
  return counts;
}

export function describeTypes(counts: Map<string, number>, limit = 3): string {
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
  return top.map(([extension, count]) => `${extension} (${count})`).join(", ");
}

function listLabels(items: ArchitectureNode[]): string {
  const labels = items.slice(0, MAX_LISTED).map((item) => item.label);
  const more = items.length - labels.length;
  return labels.join(", ") + (more > 0 ? ` and ${more} more` : "");
}

function busiestFile(items: ArchitectureNode[]): { fileId: string; items: ArchitectureNode[] } | null {
  const byFile = new Map<string, ArchitectureNode[]>();
  for (const item of items) byFile.set(item.fileId, [...(byFile.get(item.fileId) ?? []), item]);
  const best = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0];
  return best ? { fileId: best[0], items: best[1] } : null;
}

function withFacts(station: Station, facts: string): Station {
  return { ...station, facts: facts.slice(0, MAX_TEXT) };
}

export function suggestTour(city: CityModel): Tour {
  const root = city.nodes.find((n) => n.id === city.rootId);
  if (!root) return emptyTour();
  const children = childrenByParent(city.nodes);
  const files = city.nodes.filter((n) => n.type === "file" || n.type === "empty_file").length;
  const folders = city.nodes.filter((n) => n.type === "folder" || n.type === "empty_folder").length - 1;
  const rootTypes = describeTypes(extensionCounts(root, children));
  const stations: Station[] = [];

  const overviewText = `${files} files in ${Math.max(0, folders)} folders${rootTypes ? `, mostly ${rootTypes}` : ""}.`;
  stations.push({
    ...withFacts(newStation(root.id, `Welcome to ${root.name}`, overviewText), `Repository ${root.name}: ${overviewText}`),
    layers: { ...ARCH_OFF },
  });

  const topFolders = (children.get(root.id) ?? [])
    .filter((n) => n.type === "folder")
    .sort((a, b) => (b.metrics.fileCount ?? 0) - (a.metrics.fileCount ?? 0) || a.name.localeCompare(b.name))
    .slice(0, MAX_FOLDER_STATIONS);
  for (const folder of topFolders) {
    const types = describeTypes(extensionCounts(folder, children));
    const text = `${folder.metrics.fileCount ?? 0} files${types ? `, mostly ${types}` : ""}.`;
    stations.push(withFacts(newStation(folder.id, folder.name, text), `Folder ${folder.path}: ${text}`));
  }

  const byKind = (kind: ArchitectureKind) => city.architecture.filter((item) => item.kind === kind);
  const apis = byKind("api");
  const databases = byKind("database");
  const externals = byKind("external");
  const servers = byKind("server");

  const api = busiestFile(apis);
  if (api) {
    const text = `${apis.length} API ${apis.length === 1 ? "route" : "routes"} in total. This file has: ${listLabels(api.items)}.`;
    stations.push({
      ...withFacts(newStation(api.fileId, "API gates", text), `API routes. File ${api.fileId}: ${listLabels(api.items)}. Total routes: ${apis.length}.`),
      layers: { apiGates: true },
    });
  }
  const database = busiestFile(databases);
  if (database) {
    const text = `Database access found in ${new Set(databases.map((d) => d.fileId)).size} file(s). Here: ${listLabels(database.items)}.`;
    stations.push({
      ...withFacts(newStation(database.fileId, "Databases", text), `Database access. File ${database.fileId}: ${listLabels(database.items)}.`),
      layers: { databases: true, dataPaths: apis.length > 0 },
    });
  }
  const external = busiestFile(externals);
  if (external) {
    const text = `Calls to outside services: ${listLabels(external.items)}.`;
    stations.push({
      ...withFacts(newStation(external.fileId, "External services", text), `External calls. File ${external.fileId}: ${listLabels(external.items)}.`),
      layers: { externalServices: true },
    });
  }
  const server = busiestFile(servers);
  if (server) {
    const text = `Servers and containers: ${listLabels(server.items)}.`;
    stations.push({
      ...withFacts(newStation(server.fileId, "Servers and containers", text), `Servers. File ${server.fileId}: ${listLabels(server.items)}.`),
      layers: { servers: true },
    });
  }

  stations.push(withFacts(newStation(root.id, "That was the tour", "Thanks for listening. Questions?"), "Closing station."));
  return { version: 1, name: `${root.name} tour`, stations };
}

export function stationFacts(city: CityModel, station: Station): string {
  if (station.facts) return station.facts;
  const node = city.nodes.find((n) => n.id === station.nodeId);
  if (!node) return station.title || "A place in the code base.";
  const labels = city.architecture.filter((item) => item.fileId === node.id).map((item) => `${item.kind}: ${item.label}`);
  const base =
    node.type === "folder" || node.type === "empty_folder"
      ? `Folder ${node.path || node.name}: ${node.metrics.fileCount ?? 0} files.`
      : `File ${node.path}${node.metrics.lines ? `, ${node.metrics.lines} lines` : ""}.`;
  return `${base}${labels.length ? ` Found here: ${labels.slice(0, MAX_LISTED).join("; ")}.` : ""}`.slice(0, MAX_TEXT);
}
