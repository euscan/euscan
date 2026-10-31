import { hasNonEuHosting, type Alternative, type Bucket, type Catalog, type Coverage, type Finding, type ScanResult } from "@euscan/shared";

const SECTION_TITLES: ReadonlyArray<readonly [Bucket, string]> = [
  ["personal-data", "PERSONAL DATA: services that may receive personal data"],
  ["known-exposure", "KNOWN EXPOSURE: infrastructure that is hard to move"],
  ["noise", "NOISE: dev-only tooling, never in production"],
];

const INTEGRATIONS_TITLE =
  "INTEGRATIONS: optional connectors this project offers to its users (plugins, providers); not counted in the grade";

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

/** An alternative's name, flagged when its default hosting runs on a non-EU/EEA provider. */
export function alternativeLabel(alternative: Alternative): string {
  if (!hasNonEuHosting(alternative.hosting)) return alternative.name;
  const providers = alternative.hosting
    .filter((h) => !h.optional)
    .map((h) => `${h.provider}, ${h.provider_country}`)
    .join("; ");
  return `${alternative.name} (runs on ${providers})`;
}


/**
 * Formats a scan result as a plain-text report for the terminal.
 * A project without any package.json is reported as "not assessed" instead of grade A,
 * because the scanner only reads JavaScript manifests and env templates.
 * `coverageOverride` replaces `result.coverage` (kept for callers that pass it explicitly).
 */
export function formatReport(
  result: ScanResult,
  catalog: Catalog,
  target: string,
  coverageOverride?: Coverage,
): string {
  const altNames = new Map(catalog.alternatives.map((a) => [a.id, alternativeLabel(a)]));
  const lines: string[] = [];
  const coverage = coverageOverride ?? result.coverage;
  const notAssessed =
    result.grade === "not-assessed" ||
    (coverage !== undefined && coverage.manifests === 0 && result.findings.length === 0);

  lines.push(`EUscan report for ${target}`);
  lines.push("");
  if (notAssessed) {
    lines.push("Sovereignty grade: not assessed  (no package.json found; this project is probably not JavaScript/TypeScript)");
  } else {
    lines.push(
      `Sovereignty grade: ${result.grade}  (${plural(
        result.summary.thirdCountryPersonalDataServices,
        "third-country service",
      )} that may process personal data)`,
    );
  }
  lines.push(`Files scanned: ${result.filesScanned} · Catalog version: ${result.catalogVersion}`);
  if (result.summary.integrationServices > 0) {
    lines.push(
      `Integrations offered to users: ${plural(result.summary.integrationServices, "service")} (listed separately, not counted in the grade)`,
    );
  }
  if (coverage !== undefined) {
    lines.push(
      `Coverage: ${plural(coverage.manifests, "package.json file")}, ${plural(coverage.envTemplates, "env template")}. ` +
        "Only JavaScript/TypeScript manifests and env templates are read; Python, PHP, Go, Ruby and Rust dependencies are not checked yet.",
    );
  }

  const sections: Array<readonly [string, Finding[], boolean]> = [
    ...SECTION_TITLES.map(
      ([bucket, title]) =>
        [
          title,
          result.findings.filter((f) => f.bucket === bucket && f.dependencyKind !== "integration"),
          bucket !== "noise",
        ] as const,
    ),
    [INTEGRATIONS_TITLE, result.findings.filter((f) => f.dependencyKind === "integration"), false] as const,
  ];

  for (const [title, inBucket, showAlternatives] of sections) {
    const byService = new Map<string, Finding[]>();
    for (const finding of inBucket) {
      byService.set(finding.serviceId, [...(byService.get(finding.serviceId) ?? []), finding]);
    }

    // The integrations section only appears when there is something to show.
    if (byService.size === 0 && title === INTEGRATIONS_TITLE) continue;

    lines.push("");
    lines.push(`${title} (${byService.size})`);
    if (byService.size === 0) {
      lines.push("  none found");
      continue;
    }

    for (const findings of byService.values()) {
      const first = findings[0];
      if (!first) continue;
      const origin = first.thirdCountry ? "outside the EU/EEA" : "EU/EEA";
      lines.push(`  ${first.serviceName}  [${first.confidence}]  ${first.category}, ${origin}`);
      for (const f of findings) {
        lines.push(`    ${f.evidence.file}:${f.evidence.line}  ${f.evidence.match}  (${f.evidence.detector}, ${f.dependencyKind})`);
      }
      if (showAlternatives && first.thirdCountry && first.alternatives.length > 0) {
        const names = first.alternatives.map((id) => altNames.get(id) ?? id);
        lines.push(`    EU alternatives: ${names.join(", ")}`);
      }
    }
  }

  lines.push("");
  lines.push(result.disclaimer);
  return `${lines.join("\n")}\n`;
}
