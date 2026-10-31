import { BucketSchema, type Bucket } from "@euscan/shared";

export type Command =
  | { command: "scan"; path: string; json: boolean; failOn: Bucket | null }
  | { command: "help" }
  | { command: "version" };

/** A mistake in how the command was called; the CLI prints it with the usage text. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export const USAGE = `Usage: euscan scan [path] [--json] [--fail-on <bucket>]

Find third-party service dependencies, their risks and their EU alternatives.

Options:
  --json               Print the raw result as JSON (for CI).
  --fail-on <bucket>   Exit with code 1 if any finding is in this bucket:
                       personal-data | known-exposure | noise. Off by default.
  -h, --help           Show this help.
  -v, --version        Show the version.
`;

/** Parses command-line arguments (without the node and script paths). */
export function parseArgs(argv: readonly string[]): Command {
  const args = [...argv];
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) return { command: "help" };
  if (args.includes("-v") || args.includes("--version")) return { command: "version" };

  const [command, ...rest] = args;
  if (command !== "scan") throw new UsageError(`Unknown command "${command ?? ""}".`);

  let path: string | null = null;
  let json = false;
  let failOn: Bucket | null = null;

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i] ?? "";
    if (arg === "--json") {
      json = true;
    } else if (arg === "--fail-on" || arg.startsWith("--fail-on=")) {
      const value = arg === "--fail-on" ? rest[(i += 1)] : arg.slice("--fail-on=".length);
      const parsed = BucketSchema.safeParse(value);
      if (!parsed.success) {
        throw new UsageError(`--fail-on needs one of: ${BucketSchema.options.join(", ")}.`);
      }
      failOn = parsed.data;
    } else if (arg.startsWith("-")) {
      throw new UsageError(`Unknown option "${arg}".`);
    } else if (path === null) {
      path = arg;
    } else {
      throw new UsageError(`Only one path can be scanned at a time (got "${path}" and "${arg}").`);
    }
  }

  return { command: "scan", path: path ?? ".", json, failOn };
}
