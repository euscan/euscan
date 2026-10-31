import type { DependencyKind, ScanFile, ServiceRule } from "@euscan/shared";
import { lineAt, servicesMatching, type RawMatch } from "../match.js";

const SECTIONS: ReadonlyArray<readonly [section: string, kind: DependencyKind]> = [
  ["dependencies", "runtime"],
  ["optionalDependencies", "runtime"],
  ["peerDependencies", "runtime"],
  ["devDependencies", "dev"],
];

/** True for any `package.json`, at the root or in a subfolder. */
export function isPackageJson(path: string): boolean {
  return path === "package.json" || path.endsWith("/package.json");
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Finds the line of `"name":` inside a section, falling back to the section line, then line 1. */
function findLine(content: string, section: string, name: string): number {
  const sectionMatch = new RegExp(`"${escapeRegExp(section)}"\\s*:`).exec(content);
  const from = sectionMatch?.index ?? 0;
  const keyPattern = new RegExp(`"${escapeRegExp(name)}"\\s*:`, "g");
  keyPattern.lastIndex = from;
  const keyMatch = keyPattern.exec(content);
  if (keyMatch) return lineAt(content, keyMatch.index);
  return sectionMatch ? lineAt(content, sectionMatch.index) : 1;
}

/** Detects catalog services among the dependencies declared in a package.json. */
export function detectNpm(file: ScanFile, services: readonly ServiceRule[]): RawMatch[] {
  if (!isPackageJson(file.path)) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(file.content);
  } catch {
    return [];
  }
  if (!isRecord(parsed)) return [];

  const matches: RawMatch[] = [];
  for (const [section, kind] of SECTIONS) {
    const deps = parsed[section];
    if (!isRecord(deps)) continue;
    for (const name of Object.keys(deps).sort()) {
      for (const service of servicesMatching(services, (s) => s.detect.npm, name)) {
        matches.push({
          serviceId: service.id,
          file: file.path,
          line: findLine(file.content, section, name),
          match: name,
          detector: "npm",
          kind,
        });
      }
    }
  }
  return matches;
}
