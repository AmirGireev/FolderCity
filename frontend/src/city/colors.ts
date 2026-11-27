// Picks colors for buildings (by file extension) and platforms (by nesting level).
import type { CityNode } from "../types/cityModel";

const EXTENSION_COLORS: Record<string, string> = {
  ".py": "#3b82c4",
  ".ts": "#2f74c0",
  ".tsx": "#38a3d6",
  ".js": "#e0b61f",
  ".jsx": "#e5c84a",
  ".json": "#8c8c8c",
  ".md": "#6aa84f",
  ".css": "#a855c7",
  ".html": "#e0662f",
  ".yml": "#c7587a",
  ".yaml": "#c7587a",
  ".sql": "#d98a2b",
};

const FALLBACK_COLOR = "#9aa5b1";

export function hashedColor(text: string): string {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360}, 45%, 55%)`;
}

export function colorForExtension(extension: string | undefined): string {
  if (!extension) return FALLBACK_COLOR;
  return EXTENSION_COLORS[extension] ?? hashedColor(extension);
}

export function platformColor(node: CityNode): string {
  const level = Math.round(node.dimensions.position.y / 0.5);
  const lightness = Math.min(48, 22 + level * 4);
  return `hsl(215, 14%, ${lightness}%)`;
}

export const HOVER_COLOR = "#ffffff";
export const SELECTED_COLOR = "#ff4d6d";
