# Security policy

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through GitHub: open the **Security** tab of this repository and choose **Report a vulnerability**. We aim to answer within 7 days and to agree on a disclosure date with you.

## Scope

EUscan reads untrusted repositories, so these are in scope:

- reading files outside the scanned folder (path traversal, symbolic links),
- crashes or runaway time and memory on crafted repositories,
- executing anything from a scanned repository,
- leaking secrets, including values from real `.env` files (EUscan must never open them),
- unsafe permissions or injection in the GitHub workflows of this repository.

Wrong or outdated catalog facts are not security issues. Please open a normal issue for those.

## Supported versions

Only the latest commit on `main` is supported during the preview.
