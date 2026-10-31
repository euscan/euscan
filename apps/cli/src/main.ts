import { resolve } from "node:path";
import { scan } from "@euscan/core";
import { CatalogError, loadCatalog } from "@euscan/rules";
import type { Catalog, ScanFile } from "@euscan/shared";
import { parseArgs, USAGE, UsageError, type Command } from "./args.js";
import { collectFiles } from "./collect.js";
import { formatReport } from "./format.js";

export const VERSION = "0.0.0";

/** Exit codes: 0 = done, 1 = a `--fail-on` bucket was found, 2 = usage, catalog or file error. */
export const EXIT = { ok: 0, failOn: 1, error: 2 } as const;

export interface Io {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

export interface RunOptions {
  /** Defaults to the catalog shipped with @euscan/rules. */
  catalog?: Catalog;
}

/** Runs the CLI and returns the exit code. Never calls process.exit, so it is easy to test. */
export function run(argv: readonly string[], io: Io, options: RunOptions = {}): number {
  let command: Command;
  try {
    command = parseArgs(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      io.stderr(`${error.message}\n\n${USAGE}`);
      return EXIT.error;
    }
    throw error;
  }

  if (command.command === "help") {
    io.stdout(USAGE);
    return EXIT.ok;
  }
  if (command.command === "version") {
    io.stdout(`${VERSION}\n`);
    return EXIT.ok;
  }

  let catalog: Catalog;
  try {
    catalog = options.catalog ?? loadCatalog();
  } catch (error) {
    if (error instanceof CatalogError) {
      io.stderr(`${error.message}\n`);
      return EXIT.error;
    }
    throw error;
  }

  const root = resolve(command.path);
  let files: ScanFile[];
  try {
    files = collectFiles(root);
  } catch (error) {
    io.stderr(`Cannot read "${command.path}": ${error instanceof Error ? error.message : String(error)}\n`);
    return EXIT.error;
  }

  const result = scan(files, catalog);
  io.stdout(command.json ? `${JSON.stringify(result, null, 2)}\n` : formatReport(result, catalog, command.path));

  const failOn = command.failOn;
  if (failOn !== null && result.findings.some((f) => f.bucket === failOn)) {
    return EXIT.failOn;
  }
  return EXIT.ok;
}
