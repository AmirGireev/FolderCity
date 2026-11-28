// The state of fix suggestions: one entry per finding, shown under the finding in the inspector.
import { create } from "zustand";
import { useCityStore } from "../city/store";
import type { Finding } from "../types/cityModel";
import { requestFix, type FixResponse } from "./api";

export type FixEntry =
  | { status: "loading" }
  | { status: "done"; result: FixResponse }
  | { status: "error"; message: string };

interface FixState {
  entries: Record<string, FixEntry>;
  request: (finding: Finding) => Promise<void>;
  dismiss: (findingId: string) => void;
  reset: () => void;
}

export const useFixStore = create<FixState>((set, get) => ({
  entries: {},

  request: async (finding) => {
    if (get().entries[finding.id]?.status === "loading") return;
    const content = useCityStore.getState().contents.get(finding.fileId);
    if (typeof content !== "string") {
      set((state) => ({ entries: { ...state.entries, [finding.id]: { status: "error", message: "The code of this file is not available." } } }));
      return;
    }
    set((state) => ({ entries: { ...state.entries, [finding.id]: { status: "loading" } } }));
    try {
      const result = await requestFix(finding.fileId, content, finding.rule, finding.line);
      set((state) => ({ entries: { ...state.entries, [finding.id]: { status: "done", result } } }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "The fix could not be created.";
      set((state) => ({ entries: { ...state.entries, [finding.id]: { status: "error", message } } }));
    }
  },

  dismiss: (findingId) =>
    set((state) => {
      const entries = { ...state.entries };
      delete entries[findingId];
      return { entries };
    }),

  reset: () => set({ entries: {} }),
}));

useCityStore.subscribe((state, previous) => {
  if (state.city !== previous.city) useFixStore.getState().reset();
});
