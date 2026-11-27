// Opens a reference from an answer: marks the lines in the code viewer and flies the camera to the building.
import { useCityStore } from "../city/store";
import type { Reference } from "./api";

export function openReference(reference: Reference): boolean {
  const state = useCityStore.getState();
  if (!state.nodesById.has(reference.file)) return false;
  state.highlightLines(reference.file, reference.startLine, reference.endLine);
  state.flyTo(reference.file);
  return true;
}
