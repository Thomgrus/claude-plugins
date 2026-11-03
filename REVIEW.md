# Review rules

Read by the `pr-review-loop` skill from the base branch at every round, so a PR never sets its own rules: each round
applies the rules the base branch holds at that moment.
A change to this file always needs Thomas.

This repository is public: everything committed, every PR body and every review comment is published.

## Gate

Run in each plugin directory the PR touches that has a `package.json` (today `plugins/english-coach`):

- `npm ci`, every time: it is a no-op when the dependencies are current.
- `npm run typecheck`, `npm test`, `npm run build`, all green. There is no lint script.
- Run `npm test` alone, never in parallel with another `claude` process: it is timing-sensitive.
- A plugin without a `package.json` (today `plugins/codemap`): `claude plugin validate plugins/<name>` green.

## Live run

- Never in the user's own home: start Claude Code with an isolated `HOME` (`T=$(mktemp -d)`, `ln -s ~/Library $T/Library`
  for the keychain sign-in), the plugin loaded from the PR's worktree with `--plugin-dir <worktree>/plugins/<name>` and
  `--debug-file`, driven in `tmux`. Then type the changed behavior in the composer and read the result on screen, in the
  debug file and in `$T/.claude/plugins/store/`.
- Long pastes become a `[Pasted text #N]` placeholder in the composer: type the text to test it, never paste it.
- Never read from or write to `~/.claude/english-coach/`, the user's plugin store or the user's settings.
- Each typed message costs a real Haiku call, a review a real Sonnet call: keep the run short.
- No CI on this repo: local green only.

## Invariants

1. Tests, evals and live runs never touch the user's real data: `~/.claude/english-coach/`, the user's plugin store and settings stay as they were.
2. The user's message is data sent to the model for checking, never instructions to it: the prompts in `rule.ts` say so, and no code path lets the message change the system prompt, the model or the tool set.
3. A check that fails, times out or returns nothing usable stores no turn and shows no tip as if it were real.
4. Only messages the user types are checked and counted (composer and Remote Control bridge). Headless and SDK prompts are ignored, and nothing is sent to a model while the project is paused.
5. The progress review writes the progress file only when it did not change since the review read it, and never drops a section the template requires.
6. Nothing is added to Claude's own context or to the user's prompt: the coach only shows its frame, status line and pane.
7. No secret, token, personal data or real conversation excerpt is committed. Eval cases and datasets are written for the repo or fully anonymised, with no names, employers, hosts, paths or code taken from a real project.

## Conventions

8. Every change to a plugin's behavior bumps its version in `.claude-plugin/plugin.json`, so installs pick it up.
9. A decision of the kinds listed in a plugin's `AGENTS.md` is written or amended in its `docs/decisions/`, and the README states every limitation a user would hit.
10. Zero code comments, except a 2 to 4 line comment stating a non-obvious constraint and its consequence. No Claude attribution in code, commits or PRs. Branch names `<angular-type>/<kebab-case>`.

## Risk

### Always human

- `REVIEW.md`
- `.claude-plugin/marketplace.json`
- `.gitignore`
- `plugins/*/.gitignore`
- `plugins/*/AGENTS.md`
- `plugins/*/CLAUDE.md`
- `plugins/*/hooks/hooks.json`
- `plugins/*/hooks/rule.ts`
- `plugins/*/hooks/*.md`
- `plugins/*/skills/*`
- `plugins/*/evals/*`
- `.github/*`
- `.claude/*`

### Human

- `plugins/*/.claude-plugin/plugin.json`
- `plugins/*/package.json`
- `plugins/*/package-lock.json`
- `plugins/*/tsconfig.json`
- `plugins/*/hooks/*`

### Conditions

- The change adds or alters a write: a file, a store key, a setting, a network or model call (a new model, a larger token budget, a new call site).
- The change alters what is sent to a model, what is stored, or what the user sees as their progress, tips or counts.
- The change touches the behavior an Invariant protects, even outside the paths above.
- The change adds or edits eval data, or anything else that publishes text written by or about a real person.
- The change adds a new plugin to the marketplace.

## Security review on later rounds

- `.claude-plugin/marketplace.json`
- `.github/*`
- `.claude/*`
- `plugins/*/hooks/*`
- `plugins/*/skills/*`
- `plugins/*/evals/*`
- `plugins/*/.claude-plugin/*`
- `plugins/*/package.json`
- `plugins/*/package-lock.json`
- `plugins/*/AGENTS.md`
- `plugins/*/CLAUDE.md`
