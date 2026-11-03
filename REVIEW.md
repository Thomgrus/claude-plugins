# Review rules

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
