import type { DependencyKind, Detector, ServiceRule } from "@euscan/shared";

/** A raw detector hit, before it is turned into a Finding. */
export interface RawMatch {
  serviceId: string;
  file: string;
  /** 1-based line number. */
  line: number;
  match: string;
  detector: Detector;
  kind: DependencyKind;
}

/**
 * Matches a name against a catalog pattern.
 * `name` matches exactly; a pattern ending in `*` matches any name starting with the prefix
 * (for example `@aws-sdk/*` or `AWS_*`).
 */
export function nameMatches(pattern: string, name: string): boolean {
  if (pattern.endsWith("*")) return name.startsWith(pattern.slice(0, -1));
  return pattern === name;
}

/** Returns the services whose patterns (picked by `select`) match `name`. */
export function servicesMatching(
  services: readonly ServiceRule[],
  select: (service: ServiceRule) => readonly string[],
  name: string,
): ServiceRule[] {
  return services.filter((service) => select(service).some((pattern) => nameMatches(pattern, name)));
}

/** 1-based line number of a character offset in `text`. */
export function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}
