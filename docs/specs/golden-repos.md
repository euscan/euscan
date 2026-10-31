# Spec: golden repos (e2e/golden)

**Owner:** QA · **Approved by:** project lead, 2026-10-31 · **Depends on:** engine-v1.md, catalog-v1-list.md

## Goal

Measure, on real projects, whether the scanner finds the services those projects actually use. This is the "9/10 recall on personal-data services" check from `engine-v1.md`, and the evidence the project lead uses to tune the grade.

## The 10 repos

Public open-source projects, pinned to an exact commit:

| # | Repo | Commit | Why |
| --- | --- | --- | --- |
| 1 | calcom/cal.com | a5ee96f77edd644439e7de8c3255ccb2eb2c5941 | Large SaaS monorepo, many integrations |
| 2 | documenso/documenso | 503cd1aa1c7507ef8cadf476a7998bec7673f6d2 | E-signature, email and storage |
| 3 | dubinc/dub | 6b463b4bdd9ed2fd9aa416f67b5b77d317b1471e | Link management, Vercel-native |
| 4 | formbricks/formbricks | 4a76e22e8246314afd524453095aea085a10709f | Surveys, European company |
| 5 | twentyhq/twenty | cda8e601773b4d47bb17a9df9a8cf06361442547 | CRM, no `.env.example` at root (edge case) |
| 6 | Infisical/infisical | d9799b72730a11dbf54cfa3ff8540e6f7e66c058 | Security product, few npm manifests |
| 7 | mfts/papermark | ed19717ec02a1ac79aecf5569159aa9d2d869312 | Single-package Next.js app |
| 8 | umami-software/umami | 559e3c607c23d2c72d9bd4f6481bda428255323c | Privacy analytics, expected low exposure |
| 9 | openstatusHQ/openstatus | f8057fbe1f17e8eef6b0fc7c28b73cbccdaa0a62 | Many env templates across apps |
| 10 | plausible/analytics | 02cfac1517e1fef8178afe134a9b42f309f1aa77 | EU (Estonia) Elixir app; expected grade A or close |

## What is stored

For each repo, `e2e/golden/<name>/`:

- `snapshot/` — only the files the CLI collects (`package.json` files and env templates such as `.env.example`), copied unchanged at the pinned commit, keeping their relative paths. No source code, no real `.env` files.
- `SOURCE.md` — repo URL, commit, license, date copied.
- `expected.json` — the hand-checked ground truth:

```json
{
  "repo": "calcom/cal.com",
  "commit": "a5ee96f…",
  "mustFind": ["stripe", "sendgrid"],
  "mustNotFind": [],
  "notes": "Why each service is expected, with a link to the line in the upstream repo."
}
```

`mustFind` lists catalog service ids that the snapshot files really reference (runtime dependency or env template variable). A service only used as a devDependency is not in `mustFind` for personal data; it must appear as `noise` instead. `mustNotFind` lists services a naive scanner might wrongly report.

## How ground truth is made

1. Claude reads each snapshot and the project's own docs (README, self-hosting env docs) and writes `expected.json` with a reason and upstream link per service.
2. The project lead spot-checks at least 3 repos by opening the linked lines.
3. Ground truth never comes from running the scanner; the test compares the scanner against it.

## The test

`e2e/golden/golden.test.ts` (Vitest):

- For each repo: read `snapshot/` into `ScanFile[]` the same way the CLI does, run `scan(files, loadCatalog())`.
- Recall per repo: found ∩ mustFind / mustFind. Overall recall: summed over all repos.
- **Pass:** overall recall ≥ 0.9, no `mustNotFind` service reported, and no devDependency ranked `personal-data`.
- Determinism: scanning the same snapshot twice gives byte-identical JSON.
- The test prints a per-repo table (grade, found, missed) so the project lead can tune the grade rule.

## Out of scope

- Scanning live websites (for example a company's public site). The CLI reads repositories only; a website mode would be a separate feature after the go/no-go decision.
- Lockfiles, pypi, Docker, Terraform and source-code domain detection (not in engine v1).

## Licensing

All 10 projects are open source. Only manifest and env-template files are copied, with attribution in `SOURCE.md`. If a license forbids redistribution of those files, replace the repo.
