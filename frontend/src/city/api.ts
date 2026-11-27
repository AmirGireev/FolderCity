// Asks the backend to turn a scan result into a city layout.
import type { CityModel } from "../types/cityModel";
import type { ScanResult } from "../types/scan";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function fetchCity(scan: ScanResult): Promise<CityModel> {
  const response = await fetch(`${API_URL}/city`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(scan),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    throw new Error(typeof body?.detail === "string" ? body.detail : `City layout failed (${response.status}).`);
  }
  return (await response.json()) as CityModel;
}
