# Spec: catalog format (v1)

**Owner:** Catalog agent · **Contract:** `ServiceRule` and `Alternative` in packages/shared

## Goal

One YAML file per service in `packages/rules/services/` and one per EU alternative in `packages/rules/alternatives/`. The catalog is the product's main asset: accuracy beats size.

## Service file

```yaml
# packages/rules/services/<id>.yaml
id: resend                      # lowercase, unique, matches the file name
name: Resend
category: email-transactional   # see categories below
status: draft                   # draft | verified (only the project lead sets verified)
bucket: personal-data           # noise | personal-data | known-exposure
owner:
  company: Resend, Inc.
  hq_country: US                # ISO 3166-1 alpha-2
  parent_company: null          # set when owned by a larger group
jurisdiction:
  third_country: true           # outside the EU/EEA
  cloud_act_exposure: yes       # yes | partly | no | unknown
data:
  may_process_personal_data: true
  locations: ["US", "EU (sending region optional)"]
  notes: "Account data and logs stored in the US even when sending from the EU region."
detect:
  npm: ["resend"]
  pypi: []
  env: ["RESEND_API_KEY"]
  domains: ["api.resend.com"]
  docker_images: []
  terraform_providers: []
  github_actions: []
alternatives: [lettermint, ahasend]   # ordered by technical fit; never by partner status
migration_effort: low           # low | medium | high
confidence: inferred            # confirmed | inferred | unknown
sources:
  - url: https://example.com/official-page
    claim: "Where account data is stored"
last_verified_at: 2026-10-31    # the date a human or agent checked the sources
```

## Alternative file

```yaml
# packages/rules/alternatives/<id>.yaml
id: lettermint
name: Lettermint
category: email-transactional
owner:
  company: "[TO VERIFY]"
  hq_country: NL
url: https://lettermint.co
open_source: false
self_hostable: false
feature_gaps: []                # honest list of what it can't do vs. the US service
hosting:                        # who runs the infrastructure; an EU company may still use a US hyperscaler
  - provider: "Hetzner Online GmbH"
    provider_country: DE        # the provider's HQ decides its jurisdiction
    locations: [DE]             # where the data physically sits
    optional: false             # true for an extra region the customer can choose
notes: ""                       # facts that fit nowhere else, with "to verify" where unconfirmed
partner:
  status: none                  # none | affiliate | direct-deal | sponsored
  referral_url: null
  disclosure: null
sources:
  - url: https://lettermint.co
    claim: "Company and hosting location"
last_verified_at: 2026-10-31
```

The CLI flags an alternative whose default hosting runs on a non-EU/EEA provider, e.g. "Hanko (runs on Amazon Web Services, US)".

## Categories (v1)

`cloud-infra`, `hosting`, `database`, `storage`, `auth`, `email-transactional`, `email-marketing`, `analytics`, `error-tracking`, `observability`, `payments`, `ai-llm`, `sms-voice`, `search`, `cdn`, `feature-flags`, `support-chat`, `dev-tooling`.

## Rules

- No source, no claim: unknown facts are `confidence: unknown`, never guessed.
- Entries older than 180 days since `last_verified_at` are flagged as stale by CI.
- `bucket: noise` is for tools that never see production user data (linters, CI-only tooling).
- `bucket: known-exposure` is for infrastructure that is hard to move (hyperscalers, payment processors): reported, not pushed as "switch now".

## Done when

- The Zod schema in packages/shared validates both example files.
- A CI check fails on any catalog file that doesn't validate or is missing `sources`.
