// Inspector section with the lint and rule findings of a file, a jump to the line and a verified fix suggestion.
"use client";

import { useMemo } from "react";
import { canSuggestFix, findingsByFile } from "../../src/city/findings";
import { useCityStore } from "../../src/city/store";
import { parseDiff } from "../../src/fix/diff";
import { useFixStore, type FixEntry } from "../../src/fix/fixStore";

function FixView({ findingId, entry }: { findingId: string; entry: FixEntry }) {
  const dismiss = useFixStore((state) => state.dismiss);

  if (entry.status === "loading") return <p className="note">Writing a patch and checking it on a copy…</p>;
  if (entry.status === "error") {
    return (
      <p className="note error-note" role="alert">
        {entry.message}
      </p>
    );
  }
  const { result } = entry;
  if (!result.ok) {
    return (
      <div className="fix-view" data-testid="fix-view">
        <p className="note">No safe patch found: {result.reason}</p>
        <button type="button" className="btn small" onClick={() => dismiss(findingId)}>
          Close
        </button>
      </div>
    );
  }
  return (
    <div className="fix-view" data-testid="fix-view">
      {result.explanation && <p className="note">{result.explanation}</p>}
      <pre className="diff">
        {parseDiff(result.diff).map((line, index) => (
          <span key={index} className={`diff-line ${line.kind}`}>
            {line.text === "" ? " " : line.text}
          </span>
        ))}
      </pre>
      <p className="note">
        Checked on a copy: no syntax errors, the finding is gone and no new findings. FolderCity never changes your files.
      </p>
      <div className="tour-buttons">
        <button type="button" className="btn small primary" onClick={() => void navigator.clipboard?.writeText(result.diff)}>
          Copy patch
        </button>
        <button type="button" className="btn small" onClick={() => dismiss(findingId)}>
          Close
        </button>
      </div>
    </div>
  );
}

export function FindingsInfo({ fileId }: { fileId: string }) {
  const city = useCityStore((state) => state.city);
  const highlightLines = useCityStore((state) => state.highlightLines);
  const entries = useFixStore((state) => state.entries);
  const requestFix = useFixStore((state) => state.request);

  const findings = useMemo(() => (city ? findingsByFile(city.findings).get(fileId) ?? [] : []), [city, fileId]);

  return (
    <div className="findings-info" data-testid="findings-info">
      <h4>Lint and rule findings ({findings.length})</h4>
      {findings.length === 0 ? (
        <p className="none">None</p>
      ) : (
        <>
          <p className="note">Hints from a linter and simple rules, not proven bugs.</p>
          <ul>
            {findings.map((finding) => (
              <li key={finding.id}>
                <span className={`sev ${finding.severity}`}>{finding.severity}</span>
                <button type="button" className="finding-link" onClick={() => highlightLines(fileId, finding.line, finding.line)}>
                  {finding.rule} · line {finding.line}
                </button>
                <span className="finding-message">{finding.message}</span>
                {canSuggestFix(fileId) && !entries[finding.id] && (
                  <button type="button" className="btn small" onClick={() => void requestFix(finding)}>
                    Suggest fix
                  </button>
                )}
                {entries[finding.id] && <FixView findingId={finding.id} entry={entries[finding.id]} />}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
