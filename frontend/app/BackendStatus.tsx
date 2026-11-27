// Shows whether the backend is reachable.
"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Status = "checking…" | "reachable" | "not reachable";

export function BackendStatus() {
  const [status, setStatus] = useState<Status>("checking…");

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((r) => r.json())
      .then((body: { status?: string }) =>
        setStatus(body.status === "ok" ? "reachable" : "not reachable"),
      )
      .catch(() => setStatus("not reachable"));
  }, []);

  return (
    <p className="status" data-status={status}>
      <span className="dot" aria-hidden="true" />
      Backend: {status}
    </p>
  );
}
