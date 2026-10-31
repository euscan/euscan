import type { ScanFile, ServiceRule } from "@euscan/shared";
import { servicesMatching, type RawMatch } from "../match.js";

const ENV_TEMPLATE = /(^|\/)\.env\.(example|sample|template|dist)$/;
const ASSIGNMENT = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;

/**
 * True for env templates such as `.env.example`.
 * Real `.env` files are never scanned: they can hold secrets.
 */
export function isEnvTemplate(path: string): boolean {
  return ENV_TEMPLATE.test(path);
}

/** Detects catalog services from variable names in an env template. Values are never read. */
export function detectEnv(file: ScanFile, services: readonly ServiceRule[]): RawMatch[] {
  if (!isEnvTemplate(file.path)) return [];

  const matches: RawMatch[] = [];
  const lines = file.content.split(/\r?\n/);
  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) return;
    const name = ASSIGNMENT.exec(line)?.[1];
    if (name === undefined) return;
    for (const service of servicesMatching(services, (s) => s.detect.env, name)) {
      matches.push({
        serviceId: service.id,
        file: file.path,
        line: index + 1,
        match: name,
        detector: "env",
        kind: "config",
      });
    }
  });
  return matches;
}
