# English coach

A Claude Code plugin for people who practise English while they work with Claude.

- Each message you send is checked by Haiku, and the tips show in a frame above the prompt, while Claude is still working.
- Each tip has a category. A clean message gets a short "No English findings" card.
- `/english` opens a pane with your progress across all sessions: findings per turn, errors per 100 words, clean turns and words, a chart of the last 30 turns, a by-day table, a by-month table and the recent turns. It opens even while Claude is still working.
- A progress file tracks your recurring mistakes and your tip level. Sonnet reviews it from your tips when a session starts.

## Install

```bash
claude plugin marketplace add Thomgrus/claude-plugins
claude plugin install english-coach@tgruson-public
```

Restart Claude Code. Your first message creates the progress file at `~/.claude/english-coach/progress.md`. Edit it if you want: set your native language, or start at a higher tip level.

## How it works

- **What is counted**: only messages you type (desktop, terminal, remote). Headless and SDK prompts are ignored.
- **The check**: each message you type costs one Haiku call (your progress file and the message in, a short list of tips out). See [docs/decisions](docs/decisions/2026-10-13-haiku-checks-each-message-in-the-background.md).
- **The review**: when a session starts and 10 messages were checked since the last review, one Sonnet call rewrites the progress file from the stored tips. Nothing is added to Claude's context. See [docs/decisions](docs/decisions/2026-10-13-sonnet-reviews-the-progress-file-at-session-start.md).
- **History**: each turn is stored in the plugin's store, one key per session. See [docs/decisions](docs/decisions/2026-10-13-turn-history-in-store-one-key-per-session.md).
- **Roll-ups**: sessions older than last month are rolled up into monthly totals when a session starts. See [docs/decisions](docs/decisions/2026-10-07-monthly-roll-ups-one-key-per-rolled-session.md).

## Development

```bash
npm install
npm run types
npm run typecheck
npm test
npm run build
```

`npm run types` lays down the engine types in `.claude-plugin/types/`. To try an edit in Claude Code Desktop, see [docs/solutions](docs/solutions/2026-10-07-desktop-runs-stale-plugin-code.md).
