// The chat state: messages, indexing of the repo and the automatic opening of the first reference.
import { create } from "zustand";
import { useCityStore } from "../city/store";
import { ApiError, askQuestion, fetchStatus, indexRepo, type AssistantStatus, type Reference } from "./api";
import { openReference } from "./references";

export const MAX_QUESTION_LENGTH = 500;

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  references: Reference[];
  mode?: "ai" | "search";
  error?: boolean;
}

export type Busy = "idle" | "indexing" | "asking";

interface ChatState {
  messages: ChatMessage[];
  busy: Busy;
  repoHash: string | null;
  status: AssistantStatus | null;
  reset: () => void;
  loadStatus: () => Promise<void>;
  ask: (question: string) => Promise<void>;
}

let nextId = 1;

export const useChatStore = create<ChatState>((set, get) => {
  const push = (message: Omit<ChatMessage, "id" | "references"> & { references?: Reference[] }) =>
    set((state) => ({ messages: [...state.messages, { references: [], ...message, id: nextId++ }] }));

  async function ensureIndexed(force: boolean): Promise<string> {
    const known = get().repoHash;
    if (known && !force) return known;
    const scan = useCityStore.getState().scan;
    if (!scan) throw new Error("There is no scan data to search in. Scan the folder again.");
    set({ busy: "indexing" });
    const result = await indexRepo(scan);
    set({ repoHash: result.repoHash });
    return result.repoHash;
  }

  return {
    messages: [],
    busy: "idle",
    repoHash: null,
    status: null,

    reset: () => set({ messages: [], busy: "idle", repoHash: null }),

    loadStatus: async () => {
      try {
        set({ status: await fetchStatus() });
      } catch {
        set({ status: null });
      }
    },

    ask: async (raw) => {
      const question = raw.trim().slice(0, MAX_QUESTION_LENGTH);
      if (!question || get().busy !== "idle") return;
      push({ role: "user", text: question });
      try {
        let hash = await ensureIndexed(false);
        set({ busy: "asking" });
        let result;
        try {
          result = await askQuestion(hash, question);
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 404) throw error;
          hash = await ensureIndexed(true);
          set({ busy: "asking" });
          result = await askQuestion(hash, question);
        }
        push({ role: "assistant", text: result.answer, references: result.references, mode: result.mode });
        if (result.references.length > 0) openReference(result.references[0]);
      } catch (error) {
        push({ role: "assistant", text: error instanceof Error ? error.message : "Something went wrong.", error: true });
      } finally {
        set({ busy: "idle" });
      }
    },
  };
});

useCityStore.subscribe((state, previous) => {
  if (state.city !== previous.city) useChatStore.getState().reset();
});
