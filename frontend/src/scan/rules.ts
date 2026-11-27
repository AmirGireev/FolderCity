// Scan rules: what is ignored and which limits apply.
export const SKIP_DIRECTORIES: readonly string[] = [
  "node_modules", ".git", "venv", ".venv", "dist", "build", ".next", "__pycache__",
];

export const SKIP_FILE_EXACT: readonly string[] = [
  ".env", "package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "bun.lockb",
];
export const SKIP_FILE_PREFIXES: readonly string[] = [".env."];
export const SKIP_FILE_SUFFIXES: readonly string[] = [".env", ".lock"];

export const BINARY_EXTENSIONS: readonly string[] = [
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp", ".tif", ".tiff", ".avif", ".heic", ".psd",
  ".mp4", ".mov", ".avi", ".mkv", ".webm", ".mp3", ".wav", ".ogg", ".flac", ".aac",
  ".zip", ".tar", ".gz", ".tgz", ".bz2", ".xz", ".7z", ".rar", ".jar", ".war",
  ".pdf", ".exe", ".dll", ".so", ".dylib", ".bin", ".class", ".o", ".a", ".pyc", ".wasm",
  ".woff", ".woff2", ".ttf", ".otf", ".eot", ".sqlite", ".db", ".iso", ".dmg",
];

export const ENV_TEMPLATES: readonly string[] = [".env.example", ".env.sample", ".env.template", ".env.dist"];

export interface ScanLimits {
  maxFileBytes: number;
  maxFiles: number;
  maxDepth: number;
}

export const DEFAULT_LIMITS: ScanLimits = {
  maxFileBytes: 1_048_576,
  maxFiles: 600,
  maxDepth: 50,
};


export const WHITESPACE = " \t\n\r\f\v";

const skipDirectories = new Set(SKIP_DIRECTORIES);
const binaryExtensions = new Set(BINARY_EXTENSIONS);

export function shouldSkipDirectory(name: string): boolean {
  return skipDirectories.has(name);
}


export function isEnvTemplate(name: string): boolean {
  return ENV_TEMPLATES.includes(name);
}

export function redactEnvTemplate(text: string): string {
  const names: string[] = [];
  for (const raw of text.split(/\r?\n|\r/)) {
    let line = raw.trim();
    if (line === "" || line.startsWith("#") || !line.includes("=")) continue;
    if (line.startsWith("export ")) line = line.slice("export ".length).trimStart();
    const name = line.slice(0, line.indexOf("=")).trim();
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) names.push(name);
  }
  return names.map((name) => `${name}=\n`).join("");
}

export function shouldSkipFile(name: string): boolean {
  if (isEnvTemplate(name)) return false;
  return (
    SKIP_FILE_EXACT.includes(name) ||
    SKIP_FILE_PREFIXES.some((p) => name.startsWith(p)) ||
    SKIP_FILE_SUFFIXES.some((s) => name.endsWith(s))
  );
}

export function hasBinaryExtension(name: string): boolean {
  const dot = name.lastIndexOf(".");
  return dot > 0 && binaryExtensions.has(name.slice(dot).toLowerCase());
}

export function isBlankText(text: string): boolean {
  for (const ch of text) {
    if (!WHITESPACE.includes(ch)) return false;
  }
  return true;
}
