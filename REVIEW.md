# Review rules

## What Important means here

A bug a user would hit, personal data committed or sent somewhere new, or a broken Invariant. Style, naming and refactors are Nit at most.

## Cap the nits

Report at most five Nits per review.

## Do not report

- What the Gate already checks: type errors, failing tests, plugin validation.
- `package-lock.json`, and anything but personal data in generated eval cases.

## Gate

- `npm run typecheck`, `npm test`, `npm run build` in the touched plugin.

## Live run

- Isolated `HOME`, plugin loaded with `--plugin-dir`.

## Invariants

1. No personal data in the repo.

## Conventions

2. Zero code comments, no Claude attribution.

## Risk

### Always human

- `REVIEW.md`
- `plugins/*/evals/*`

### Human

- `plugins/*/hooks/*`

### Conditions

- The change adds personal data or sends it somewhere new.

## Security review on later rounds

- `plugins/*/hooks/*`
- `plugins/*/evals/*`
