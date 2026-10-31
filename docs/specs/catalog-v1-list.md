# Spec: the first 30 catalog entries

**Owner:** Catalog agent, verified by the project lead · **Deadline:** end of validation week 1

Draft all 30 as `status: draft`, with sources. The project lead verifies each one and switches it to `status: verified`.

| # | Service | Category | Expected bucket |
| --- | --- | --- | --- |
| 1 | AWS (SDK, S3, SES, etc.) | cloud-infra | known-exposure |
| 2 | Google Cloud / Firebase | cloud-infra | known-exposure |
| 3 | Microsoft Azure | cloud-infra | known-exposure |
| 4 | Vercel | hosting | known-exposure |
| 5 | Netlify | hosting | known-exposure |
| 6 | Supabase | database | personal-data |
| 7 | MongoDB Atlas | database | personal-data |
| 8 | Clerk | auth | personal-data |
| 9 | Auth0 (Okta) | auth | personal-data |
| 10 | Resend | email-transactional | personal-data |
| 11 | SendGrid (Twilio) | email-transactional | personal-data |
| 12 | Postmark | email-transactional | personal-data |
| 13 | Mailchimp | email-marketing | personal-data |
| 14 | Google Analytics | analytics | personal-data |
| 15 | Mixpanel | analytics | personal-data |
| 16 | PostHog | analytics | personal-data |
| 17 | Segment | analytics | personal-data |
| 18 | Sentry | error-tracking | personal-data |
| 19 | Datadog | observability | personal-data |
| 20 | Stripe | payments | known-exposure |
| 21 | PayPal | payments | known-exposure |
| 22 | OpenAI | ai-llm | personal-data |
| 23 | Anthropic | ai-llm | personal-data |
| 24 | Twilio | sms-voice | personal-data |
| 25 | Algolia | search | personal-data |
| 26 | Cloudflare | cdn | known-exposure |
| 27 | LaunchDarkly | feature-flags | noise |
| 28 | Intercom | support-chat | personal-data |
| 29 | Zendesk | support-chat | personal-data |
| 30 | Pusher | observability | personal-data |

Notes:
- Ownership and data-location facts change (acquisitions, new EU regions). Always check the provider's own legal or subprocessor page and record the date.
- Some of these offer EU data regions. Record that in `data.locations`; it lowers data-location risk but not jurisdiction exposure. Say so in `data.notes`.
- For each, list at least two EU alternatives when realistic ones exist; otherwise list one and explain the gap.
