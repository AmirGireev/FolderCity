"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Status = "prüfe…" | "erreichbar" | "nicht erreichbar";

export function BackendStatus() {
  const [status, setStatus] = useState<Status>("prüfe…");

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((r) => r.json())
      .then((body: { status?: string }) =>
        setStatus(body.status === "ok" ? "erreichbar" : "nicht erreichbar"),
      )
      .catch(() => setStatus("nicht erreichbar"));
  }, []);

  return (
    <p className="status" data-status={status}>
      Backend: {status}
    </p>
  );
}
