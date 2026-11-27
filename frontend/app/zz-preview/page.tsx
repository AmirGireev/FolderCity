"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { fetchCity } from "../../src/city/api";
import { useCityStore } from "../../src/city/store";

const files: Record<string, string> = {
  "app/main.py": "from app.db import load\n\n\n@app.get(\"/users\")\ndef users():\n    return load()\n",
  "app/db.py": "import psycopg2\n\nconn = psycopg2.connect('x')\n",
};

export default function Preview() {
  const router = useRouter();
  useEffect(() => {
    const scan = {
      schemaVersion: "1.0" as const, rootName: "demo", directories: ["app"], emptyDirectories: [], truncated: false,
      files: Object.entries(files).map(([path, content]) => ({ path, size: content.length, content, omitted: null, isEmpty: false })),
    };
    fetchCity(scan).then((city) => {
      useCityStore.getState().setCity(city, new Map(Object.entries(files)), scan);
      router.push("/city");
    });
  }, [router]);
  return <p>loading</p>;
}
