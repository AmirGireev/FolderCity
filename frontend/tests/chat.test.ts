// Tests the chat: indexing once, asking, opening the first reference and handling errors.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/chat/api";
import { MAX_QUESTION_LENGTH, useChatStore } from "../src/chat/chatStore";
import { openReference } from "../src/chat/references";
import { useCityStore } from "../src/city/store";
import type { CityModel } from "../src/types/cityModel";
import type { ScanResult } from "../src/types/scan";
import minimal from "../../schema/examples/minimal.city.json";

vi.mock("../src/chat/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/chat/api")>();
  return { ...original, indexRepo: vi.fn(), askQuestion: vi.fn(), fetchStatus: vi.fn() };
});

import { askQuestion, fetchStatus, indexRepo } from "../src/chat/api";

const city = minimal as unknown as CityModel;
const scan: ScanResult = { schemaVersion: "1.0", rootName: "minimal", directories: [], emptyDirectories: [], files: [], truncated: false };
const index = vi.mocked(indexRepo);
const ask = vi.mocked(askQuestion);

function answer(references = [{ file: "src/main.py", startLine: 5, endLine: 20 }], text = "Found it.") {
  return { answer: text, references, mode: "ai" as const, cached: false };
}

beforeEach(() => {
  vi.resetAllMocks();
  useChatStore.getState().reset();
  useCityStore.getState().setCity(city, new Map(), scan);
  index.mockResolvedValue({ repoHash: "h1", chunks: 3, cached: false, searchMode: "hybrid" });
});

describe("opening a reference", () => {
  it("marks the lines, selects the file and flies there", () => {
    expect(openReference({ file: "src/main.py", startLine: 5, endLine: 20 })).toBe(true);
    const state = useCityStore.getState();
    expect(state.selectedId).toBe("src/main.py");
    expect(state.highlight).toMatchObject({ fileId: "src/main.py", startLine: 5, endLine: 20 });
    expect(state.cameraRequest).toMatchObject({ nodeId: "src/main.py", instant: false });
  });

  it("ignores files that are not in the city", () => {
    expect(openReference({ file: "nope.py", startLine: 1, endLine: 2 })).toBe(false);
    expect(useCityStore.getState().selectedId).toBeNull();
  });
});

describe("asking", () => {
  it("indexes the repo once, answers and opens the first reference", async () => {
    ask.mockResolvedValue(answer([{ file: "src/db.py", startLine: 2, endLine: 14 }, { file: "src/main.py", startLine: 1, endLine: 3 }]));
    await useChatStore.getState().ask("Where is the database class?");
    await useChatStore.getState().ask("And again?");
    expect(index).toHaveBeenCalledTimes(1);
    expect(index).toHaveBeenCalledWith(scan);
    expect(ask).toHaveBeenCalledWith("h1", "Where is the database class?");
    const state = useChatStore.getState();
    expect(state.messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(state.messages[1].references).toHaveLength(2);
    expect(useCityStore.getState().selectedId).toBe("src/db.py");
    expect(useCityStore.getState().highlight).toMatchObject({ startLine: 2, endLine: 14 });
    expect(state.busy).toBe("idle");
  });

  it("does not jump anywhere when there are no references", async () => {
    ask.mockResolvedValue(answer([], "I could not find that."));
    await useChatStore.getState().ask("Where is the moon?");
    expect(useCityStore.getState().selectedId).toBeNull();
    expect(useChatStore.getState().messages[1].text).toBe("I could not find that.");
  });

  it("indexes again once when the server forgot the repo", async () => {
    ask.mockRejectedValueOnce(new ApiError(404, "This repo is not indexed yet.")).mockResolvedValueOnce(answer());
    index.mockResolvedValueOnce({ repoHash: "h1", chunks: 1, cached: false, searchMode: "hybrid" }).mockResolvedValueOnce({ repoHash: "h2", chunks: 1, cached: false, searchMode: "hybrid" });
    await useChatStore.getState().ask("Where?");
    expect(index).toHaveBeenCalledTimes(2);
    expect(ask).toHaveBeenLastCalledWith("h2", "Where?");
    expect(useChatStore.getState().messages[1].error).toBeUndefined();
  });

  it("shows server errors such as the rate limit as a message", async () => {
    ask.mockRejectedValue(new ApiError(429, "Too many requests. Try again in 30 seconds."));
    await useChatStore.getState().ask("Where?");
    const last = useChatStore.getState().messages[1];
    expect(last).toMatchObject({ role: "assistant", error: true, text: "Too many requests. Try again in 30 seconds." });
    expect(useChatStore.getState().busy).toBe("idle");
  });

  it("shows indexing errors and can try again", async () => {
    index.mockRejectedValueOnce(new Error("network down")).mockResolvedValueOnce({ repoHash: "h1", chunks: 1, cached: false, searchMode: "keyword" });
    ask.mockResolvedValue(answer());
    await useChatStore.getState().ask("Where?");
    expect(useChatStore.getState().messages[1].text).toBe("network down");
    await useChatStore.getState().ask("Where?");
    expect(useChatStore.getState().messages.at(-1)?.error).toBeUndefined();
  });

  it("explains when there is no scan data", async () => {
    useCityStore.getState().setCity(city);
    await useChatStore.getState().ask("Where?");
    expect(useChatStore.getState().messages[1].text).toContain("no scan data");
    expect(index).not.toHaveBeenCalled();
  });

  it("ignores empty questions and cuts very long ones", async () => {
    ask.mockResolvedValue(answer());
    await useChatStore.getState().ask("   ");
    expect(useChatStore.getState().messages).toHaveLength(0);
    await useChatStore.getState().ask("x".repeat(MAX_QUESTION_LENGTH + 100));
    expect(ask.mock.calls[0][1]).toHaveLength(MAX_QUESTION_LENGTH);
  });

  it("starts fresh when another city is loaded", async () => {
    ask.mockResolvedValue(answer());
    await useChatStore.getState().ask("Where?");
    useCityStore.getState().setCity({ ...city }, new Map(), scan);
    expect(useChatStore.getState().messages).toEqual([]);
    expect(useChatStore.getState().repoHash).toBeNull();
  });

  it("loads the assistant status and survives a failing server", async () => {
    vi.mocked(fetchStatus).mockResolvedValueOnce({ ai: false, embeddings: true });
    await useChatStore.getState().loadStatus();
    expect(useChatStore.getState().status).toEqual({ ai: false, embeddings: true });
    vi.mocked(fetchStatus).mockRejectedValueOnce(new Error("down"));
    await useChatStore.getState().loadStatus();
    expect(useChatStore.getState().status).toBeNull();
  });
});
