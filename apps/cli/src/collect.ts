import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { isEnvTemplate, isPackageJson } from "@euscan/core";
import type { ScanFile } from "@euscan/shared";

/** Folders that never hold the project's own dependency declarations. */
export const IGNORED_DIRS: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".turbo",
  "vendor",
  ".venv",
]);

/** Files bigger than this are skipped (1 MB). */
export const MAX_FILE_BYTES = 1_000_000;

/** Bounds that keep a scan of an untrusted or huge repository fast and safe. */
export interface CollectLimits {
  /** Deepest folder level walked below the root. Deeper folders are skipped. */
  maxDepth: number;
  /** Folder entries visited before the scan stops with an error. */
  maxEntries: number;
  /** Total bytes of collected file content before the scan stops with an error. */
  maxTotalBytes: number;
}

export const DEFAULT_LIMITS: CollectLimits = {
  maxDepth: 30,
  maxEntries: 300_000,
  maxTotalBytes: 50_000_000,
};

const wanted = (path: string): boolean => isPackageJson(path) || isEnvTemplate(path);

/**
 * Collects the files the scanner understands, with paths relative to `root` using `/`.
 * Reads only package.json files and env templates; real `.env` files are never opened.
 * Symbolic links are never followed (directory entries are not stat-ed through links),
 * so a scanned repository cannot point the scanner outside its own tree or into a loop.
 */
export function collectFiles(root: string, limits: CollectLimits = DEFAULT_LIMITS): ScanFile[] {
  const files: ScanFile[] = [];
  let entriesSeen = 0;
  let totalBytes = 0;

  const walk = (dir: string, depth: number): void => {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
    for (const entry of entries) {
      entriesSeen += 1;
      if (entriesSeen > limits.maxEntries) {
        throw new Error(`the project has more than ${limits.maxEntries} files and folders; scan a subfolder instead.`);
      }
      // Dirent types come from lstat: a symlink is neither a directory nor a file here, so it is skipped.
      if (entry.isSymbolicLink()) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name) && depth < limits.maxDepth) walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const path = relative(root, full).split(sep).join("/");
      if (!wanted(path)) continue;
      const size = statSync(full).size;
      if (size > MAX_FILE_BYTES) continue;
      totalBytes += size;
      if (totalBytes > limits.maxTotalBytes) {
        throw new Error(`the collected files exceed ${limits.maxTotalBytes} bytes; scan a subfolder instead.`);
      }
      files.push({ path, content: readFileSync(full, "utf8") });
    }
  };

  if (statSync(root).isFile()) {
    throw new Error(`"${root}" is a file; pass the project folder instead.`);
  }
  walk(root, 0);
  return files;
}
