// Talks to the backend: indexes a repo once and asks questions about it.
import type { ScanResult } from "../types/scan";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface Reference {
  file: string;
  startLine: number;
  endLine: number;
}

export interface IndexResponse {
  repoHash: string;
  chunks: number;
  cached: boolean;
  searchMode: "hybrid" | "keyword";
}

export interface AskResponse {
  answer: string;
  references: Reference[];
  mode: "ai" | "search";
  cached: boolean;
}

export interface AssistantStatus {
  ai: boolean;
  embeddings: boolean;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    throw new ApiError(response.status, typeof body?.detail === "string" ? body.detail : `Error ${response.status}`);
  }
  return (await response.json()) as T;
}

export const indexRepo = (scan: ScanResult) =>
  request<IndexResponse>("/index", { method: "POST", body: JSON.stringify(scan) });

export const askQuestion = (repoHash: string, question: string) =>
  request<AskResponse>("/ask", { method: "POST", body: JSON.stringify({ repoHash, question }) });

export const fetchStatus = () => request<AssistantStatus>("/assistant/status");
