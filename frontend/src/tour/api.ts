// Asks the backend to write speaker notes for tour stations with the language model.
import { request } from "../chat/api";

export interface StationFactsRequest {
  id: string;
  facts: string;
}

export interface StationTextResponse {
  id: string;
  title: string;
  text: string;
}

export async function fetchStationTexts(repoName: string, stations: StationFactsRequest[]): Promise<StationTextResponse[]> {
  const response = await request<{ texts: StationTextResponse[] }>("/tour/texts", {
    method: "POST",
    body: JSON.stringify({ repoName, stations }),
  });
  return response.texts;
}
