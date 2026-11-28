// Asks the backend for a verified patch for one finding.
import { request } from "../chat/api";

export interface FixResponse {
  ok: boolean;
  reason: string;
  startLine: number;
  endLine: number;
  explanation: string;
  diff: string;
  before: string;
  after: string;
}

export function requestFix(path: string, content: string, rule: string, line: number): Promise<FixResponse> {
  return request<FixResponse>("/fix", { method: "POST", body: JSON.stringify({ path, content, rule, line }) });
}
