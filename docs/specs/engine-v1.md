# Spec: engine v1

**Owner:** Engine agent · **Depends on:** contracts in packages/shared, catalog-format.md

## Goal

`scan(files, catalog) -> ScanResult`: a pure, deterministic function that finds catalog services in a repo's files and explains each finding with evidence.

## Input

- `files`: array of `{ path: string, content: string }` (the CLI reads the disk, not the engine).
- `catalog`: parsed, validated service rules from packages/rules.

## Detectors in v1

1. **npm**: `package.json` `dependencies` vs `devDependencies` (record which). Match against `detect.npm`.
2. **env**: `.env.example`, `.env.sample`, `.env.template` (never real `.env` files). Match variable names against `detect.env`.

Later (not v1): lockfiles, pypi, Dockerfile, Terraform, GitHub Actions, domain strings in source.

## Output: one Finding per (service, file, match)

```ts
{
  serviceId: "resend",
  bucket: "personal-data",          // from the catalog, downgraded to "noise" for devDependencies
  confidence: "inferred",           // "confirmed" only when the catalog entry is verified AND the match is a runtime dependency
  evidence: { file: "package.json", line: 24, match: "resend", detector: "npm", ruleVersion: "2026-10-31" },
  dependencyKind: "runtime"         // runtime | dev | config
}
```

## Grade (A–E)

- Only `personal-data` findings affect the grade; `known-exposure` is reported separately; `noise` is listed last.
- Draft rule: A = 0 personal-data services outside the EU/EEA; B = 1; C = 2–3; D = 4–5; E = 6+. The project lead will tune this after the golden-repo results.
- The result includes sub-scores: jurisdiction, data control, operational dependency (simple counts in v1).

## Done when

- Tests with fixtures for each detector, including a devDependency case and a missing-file case.
- Same input → byte-identical JSON output.
- QA's golden-repo test reaches 9/10 recall on personal-data services.
