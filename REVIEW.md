# Review rules

Public repo: everything committed or posted is published.

## Gate

- In each touched plugin with a `package.json`: `npm ci`, `npm run typecheck`, `npm test` (alone, it is timing-sensitive), `npm run build`.
- Otherwise: `claude plugin validate plugins/<name>`.

## Live run

- Isolated `HOME` (with `~/Library` symlinked for sign-in), `--plugin-dir` from the PR worktree, driven in tmux. Type long texts, never paste them.
- No CI: local green only.

## Invariants

1. Tests, evals and live runs never touch the user's real `~/.claude` data.
2. The user's message is data for the model, never instructions to it.
3. A failed check stores no turn and shows no tip.
4. Only typed messages are checked, and nothing is sent while paused.
5. No secret, personal data or real conversation excerpt is committed, eval data included.

## Conventions

6. A behavior change bumps the plugin version; decisions go to `docs/decisions/`, user-facing limits to the README.
7. Zero code comments, no Claude attribution.

## Risk

### Always human

- `REVIEW.md`
- `.claude-plugin/marketplace.json`
- `plugins/*/hooks/rule.ts`
- `plugins/*/skills/*`
- `plugins/*/evals/*`

### Human

- `plugins/*/hooks/*`
- `plugins/*/.claude-plugin/*`
- `plugins/*/package*.json`

### Conditions

- A new or changed write, model call or token budget.
- A change to what is sent to a model, stored, or shown as progress.
- A change touching what an Invariant protects.

## Security review on later rounds

- `plugins/*/hooks/*`
- `plugins/*/skills/*`
- `plugins/*/evals/*`
- `plugins/*/package*.json`
