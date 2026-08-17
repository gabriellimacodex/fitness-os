# Movement Library operations

PRD 04 ships a public, text-only read path. The current published catalog is
empty. That is valid runtime behavior and is not PRD completion.

## Authoring

1. Add a candidate detail and append one manifest record in
   `packages/domain/src/movement-library`.
2. Commit the source first so the content digest and commit SHA exist.
3. Independent Movement/safety and intended-reader reviews inspect that commit.
4. The Human Review Authority adds the privacy-minimized receipt file under
   `docs/execution/content-reviews/movements/`.
5. CI must prove the manifest is append-only against the merge base.

## Version increment

Any user-visible text change increments `contentVersion` by one and appends a
`revise` or `republish` record. Existing manifest records are never edited.

## Withdrawal

Append a `withdraw` record that keeps the last version and digest. The
identifier stays reserved. Do not delete history.

## Rollback

Redeploy a known reviewed commit, or publish a higher corrected version.
Do not restore a prior version known to contain unsafe guidance.

## Failure

Invalid API configuration and provider failures render a generic unavailable
state. Movement API successes and errors set `Cache-Control: no-store`.

## Active stops

- `HUMAN_PERCEPTION_REQUIRED` until two published entries have valid receipts
- `EXTERNAL_CREDENTIAL_REQUIRED` before provisioning the production review key
