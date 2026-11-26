"use client";

import { useEffect, useState, type DragEvent } from "react";
import {
  directoryFromDrop,
  fromFileList,
  pickDirectory,
  supportsDirectoryPicker,
} from "../src/scan/adapters";
import { scanTree, type FsDirectory } from "../src/scan/scanTree";
import { summarize } from "../src/scan/summary";
import type { ScanResult } from "../src/types/scan";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const PREVIEW_CHARS = 20_000;

// <input webkitdirectory> ist kein Standard-Attribut und fehlt in den React-Typen.
const directoryInputProps = { webkitdirectory: "", directory: "" } as Record<string, string>;

export function ImportPanel() {
  const [canPick, setCanPick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [githubUrl, setGithubUrl] = useState("");

  useEffect(() => setCanPick(supportsDirectoryPicker()), []);

  async function run(label: string, job: () => Promise<ScanResult | null>) {
    setBusy(true);
    setError(null);
    try {
      const result = await job();
      if (result) {
        setScan(result);
        setSource(label);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
    } finally {
      setBusy(false);
    }
  }

  const scanDirectory = async (dir: FsDirectory | null, problem: string) => {
    if (!dir) throw new Error(problem);
    return scanTree(dir);
  };

  function onPick() {
    void run("Ordner-Auswahl", async () => {
      const dir = await pickDirectory();
      return dir ? scanTree(dir) : null; // null = Dialog abgebrochen
    });
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    // Muss synchron passieren: Nach dem Ereignis sind die Einträge nicht mehr abrufbar.
    const dir = directoryFromDrop(event.dataTransfer.items);
    void run("Drag-and-drop", () => scanDirectory(dir, "Bitte genau einen Ordner ablegen (keine einzelnen Dateien)."));
  }

  function onFallback(files: FileList | null) {
    const dir = files ? fromFileList(Array.from(files)) : null;
    void run("Notlösung (ohne leere Ordner)", () => scanDirectory(dir, "Das war kein Ordner."));
  }

  function onGithub() {
    void run("GitHub", async () => {
      const response = await fetch(`${API_URL}/import/github`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: githubUrl }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
        const detail = typeof body?.detail === "string" ? body.detail : `Fehler ${response.status}`;
        throw new Error(detail);
      }
      return (await response.json()) as ScanResult;
    });
  }

  function download() {
    if (!scan) return;
    const blob = new Blob([JSON.stringify(scan, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${scan.rootName}.scan.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const summary = scan ? summarize(scan) : null;
  const json = scan ? JSON.stringify(scan, null, 2) : "";

  return (
    <section className="import" aria-busy={busy}>
      <h2>Ordner einlesen</h2>

      <div className="import-options">
        {canPick && (
          <button type="button" onClick={onPick} disabled={busy}>
            Ordner auswählen
          </button>
        )}

        <div
          className={`dropzone${dragging ? " dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          data-testid="dropzone"
        >
          Ordner hierher ziehen
        </div>

        <label className="fallback">
          Notlösung (keine leeren Ordner):{" "}
          <input type="file" {...directoryInputProps} onChange={(e) => onFallback(e.target.files)} disabled={busy} />
        </label>

        <form
          className="github"
          onSubmit={(e) => {
            e.preventDefault();
            onGithub();
          }}
        >
          <input
            type="url"
            placeholder="https://github.com/besitzer/repo"
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            required
          />
          <button type="submit" disabled={busy}>
            GitHub-Repo einlesen
          </button>
        </form>
      </div>

      {busy && <p>Lese ein…</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {scan && summary && (
        <div className="result" data-testid="result">
          <h3>
            „{scan.rootName}“ eingelesen <small>({source})</small>
          </h3>
          <ul>
            <li>{summary.folders} Ordner, davon {summary.emptyFolders} leer</li>
            <li>{summary.files} Dateien, davon {summary.emptyFiles} leer</li>
            <li>{summary.withoutContent} Dateien ohne Inhalt (Bilder, Binärdateien, zu groß)</li>
          </ul>
          {summary.truncated && (
            <p className="warning">
              Nicht alles wurde eingelesen: Es gilt ein Limit von 400 Dateien (und 50 Ordnerebenen).
            </p>
          )}
          <button type="button" onClick={download}>
            JSON herunterladen
          </button>
          <details>
            <summary>JSON ansehen</summary>
            <pre>{json.length > PREVIEW_CHARS ? json.slice(0, PREVIEW_CHARS) + "\n… (gekürzt)" : json}</pre>
          </details>
        </div>
      )}
    </section>
  );
}
