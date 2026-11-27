// The area for scanning folders and GitHub repos.
"use client";

import { useEffect, useState, type DragEvent } from "react";
import {
  directoryFromDrop,
  fromFileList,
  pickDirectory,
  supportsDirectoryPicker,
} from "../src/scan/adapters";
import { fetchCity } from "../src/city/api";
import { useCityStore } from "../src/city/store";
import { scanTree, type FsDirectory } from "../src/scan/scanTree";
import { summarize } from "../src/scan/summary";
import type { ScanResult } from "../src/types/scan";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const PREVIEW_CHARS = 20_000;


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
        useCityStore.getState().setCity(await fetchCity(result));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setBusy(false);
    }
  }

  const scanDirectory = async (dir: FsDirectory | null, problem: string) => {
    if (!dir) throw new Error(problem);
    return scanTree(dir);
  };

  function onPick() {
    void run("Folder picker", async () => {
      const dir = await pickDirectory();
      return dir ? scanTree(dir) : null;
    });
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);

    const dir = directoryFromDrop(event.dataTransfer.items);
    void run("Drag-and-drop", () => scanDirectory(dir, "Please drop exactly one folder (no single files)."));
  }

  function onFallback(files: FileList | null) {
    const dir = files ? fromFileList(Array.from(files)) : null;
    void run("Fallback (no empty folders)", () => scanDirectory(dir, "That was not a folder."));
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
        const detail = typeof body?.detail === "string" ? body.detail : `Error ${response.status}`;
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
      <h2>Scan a folder</h2>

      <div className="import-options">
        {canPick && (
          <button type="button" onClick={onPick} disabled={busy}>
            Pick a folder
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
          Drag a folder here
        </div>

        <label className="fallback">
          Fallback (no empty folders):{" "}
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
            placeholder="https://github.com/owner/repo"
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            required
          />
          <button type="submit" disabled={busy}>
            Scan GitHub repo
          </button>
        </form>
      </div>

      {busy && <p>Scanning…</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {scan && summary && (
        <div className="result" data-testid="result">
          <h3>
            “{scan.rootName}” scanned <small>({source})</small>
          </h3>
          <ul>
            <li>{summary.folders} folders, {summary.emptyFolders} of them empty</li>
            <li>{summary.files} files, {summary.emptyFiles} of them empty</li>
            <li>{summary.withoutContent} files without content (images, binary files, too large)</li>
          </ul>
          {summary.truncated && (
            <p className="warning">
              Not everything was scanned: the limit is 400 files (and 50 folder levels).
            </p>
          )}
          <button type="button" onClick={download}>
            Download JSON
          </button>
          <details>
            <summary>View JSON</summary>
            <pre>{json.length > PREVIEW_CHARS ? json.slice(0, PREVIEW_CHARS) + "\n… (shortened)" : json}</pre>
          </details>
        </div>
      )}
    </section>
  );
}
