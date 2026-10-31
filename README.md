# EUscan

**Know your dependencies. Understand your risks. Build your exit plan.**

EUscan scans a code repository and lists the third-party services it depends on, such as email, auth, analytics, error tracking, payments, cloud and AI. For each service it shows who owns it, whether the owner sits outside the EU/EEA, how hard it is to move away, and which European alternatives exist. It ends with a simple **A–E sovereignty grade**.

> **Status: early preview (v0).** The scanner works and is tested on real open-source repositories, but the catalog is small (35 services, 25 EU alternatives) and most entries are still `draft`. Expect false negatives.

## What it reads today

- `package.json` files (dependencies, devDependencies, optional and peer dependencies), in every folder of a monorepo.
- Env templates: `.env.example`, `.env.sample`, `.env.template` and `.env.dist`. Only variable names are read, never values. **Real `.env` files are never opened.**

It does **not** yet read Python, PHP, Go, Ruby or Rust manifests, lockfiles, Dockerfiles, Terraform or CI files. A project with no `package.json` gets the grade **"not assessed"**, never a free "A".

Nothing from the scanned repository is installed or executed. Symbolic links are not followed, and the walk is bounded (depth 30, 300,000 entries, 50 MB of collected files).

## Quick start

EUscan is not published on npm yet. Run it from source (Node.js 20 or newer):

```bash
git clone https://github.com/euscan/euscan.git
cd euscan
npm ci
npm run build
node apps/cli/dist/index.js scan /path/to/your/project
```

Options:

```
--json               Print the raw result as JSON (for CI).
--fail-on <bucket>   Exit with code 1 if any finding is in this bucket:
                     personal-data | known-exposure | noise. Off by default.
```

Exit codes: `0` success, `1` a `--fail-on` bucket was found, `2` usage or read error.

In JSON output, `grade` is `"A"`–`"E"` or `"not-assessed"`. Treat `"not-assessed"` as "no result", not as a pass. `coverage` tells you how many `package.json` files and env templates were read.

## How findings are sorted

- **Personal data:** services that may process personal data of your users (email, auth, analytics, error tracking…).
- **Known exposure:** hard-to-move infrastructure (cloud, payments, CDN).
- **Noise:** dev-only tooling, never shipped to production.
- **Integrations:** services that only appear inside plugin, provider or connector folders. These are options the project offers its own users, so they are listed separately and do not count towards the grade.

Every finding carries the file and line it came from, and a confidence label: **confirmed** (verified catalog entry), **inferred** (draft entry or indirect signal) or **unknown**.

The grade counts distinct third-country services that may process personal data: A = 0, B = 1, C = 2–3, D = 4–5, E = 6 or more. These thresholds are a draft.

## What it is not

EUscan is a dependency inventory and risk assessment tool. It is **not** legal advice and **not** a GDPR, NIS2 or DORA certification. Finding an SDK does not prove that personal data leaves the EU: many services offer EU regions or self-hosting. Read each finding as "check this", not "you are in breach".

Alternatives are ranked by technical fit, never by commission. The catalog has no affiliate links.

## Repo layout

```
packages/shared   shared types and contracts (Zod)
packages/core     the scan engine: scan(files, catalog) -> ScanResult
packages/rules    the catalog: services/*.yaml, alternatives/*.yaml
apps/cli          the euscan command
e2e/golden        hand-checked results for real repositories
docs/             specs and decisions
```

## Contributing to the catalog

Every catalog entry needs an official source and a `last_verified_at` date. New entries start as `status: draft`; only the maintainer marks an entry `verified`. See `docs/specs/catalog-format.md`.

## Security

See [SECURITY.md](SECURITY.md).

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
