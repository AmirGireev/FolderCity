// The area for scanning folders and GitHub repos.
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type DragEvent } from "react";
import { directoryFromDrop, pickDirectory, supportsDirectoryPicker } from "../src/scan/adapters";
import { fetchCity } from "../src/city/api";
import { useCityStore } from "../src/city/store";
import { scanTree, type FsDirectory } from "../src/scan/scanTree";
import { summarize } from "../src/scan/summary";
import type { ScanResult } from "../src/types/scan";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const PREVIEW_CHARS = 20_000;

export function ImportPanel() {
  const router = useRouter();
  const hasCity = useCityStore((state) => state.city !== null);
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
        useCityStore.getState().setCity(await fetchCity(result), new Map(result.files.map((f) => [f.path, f.content])), result);
        router.push(`/city${window.location.search}`);
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
      <div className="card">
        <h2>Scan a folder</h2>
        <p className="hint">Folders are read in your browser. Secrets, build folders and lock files are skipped.</p>

        <div className="import-options">
          {canPick && (
            <button type="button" className="btn primary big" onClick={onPick} disabled={busy}>
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
            <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
              <path
                d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.2l1.8 2H19.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
            <span>Drag a folder here</span>
          </div>

          <div className="divider">
            <span>or a public GitHub repo</span>
          </div>

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
              aria-label="GitHub repo URL"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              required
            />
            <button type="submit" className="btn primary" disabled={busy}>
              Scan GitHub repo
            </button>
          </form>
        </div>

        {busy && (
          <p className="busy">
            <span className="spinner" aria-hidden="true" /> Scanning…
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>

      {scan && summary && (
        <div className="card result" data-testid="result">
          <h3>
            “{scan.rootName}” scanned <small>({source})</small>
          </h3>
          <ul className="stats">
            <li>
              <strong>{summary.folders}</strong> folders, {summary.emptyFolders} of them empty
            </li>
            <li>
              <strong>{summary.files}</strong> files, {summary.emptyFiles} of them empty
            </li>
            <li>
              <strong>{summary.withoutContent}</strong> files without content (images, binary files, too large)
            </li>
          </ul>
          {summary.truncated && (
            <p className="warning">Not everything was scanned: the limit is 600 files (and 50 folder levels).</p>
          )}
          <div className="result-actions">
            {hasCity && (
              <Link className="btn primary" href={`/city${typeof window === "undefined" ? "" : window.location.search}`}>
                Open the city again
              </Link>
            )}
            <button type="button" className="btn" onClick={download}>
              Download JSON
            </button>
          </div>
          <details>
            <summary>View JSON</summary>
            <pre>{json.length > PREVIEW_CHARS ? json.slice(0, PREVIEW_CHARS) + "\n… (shortened)" : json}</pre>
          </details>
        </div>
      )}
    </section>
  );
}
