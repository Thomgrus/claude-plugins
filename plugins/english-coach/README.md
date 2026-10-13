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

Restart Claude Code. The first session asks for your native language, unless the install already did: the coach uses it to look for the calques and false friends it brings. Change it later in `/config` (*Native language · english-coach*). Your first message creates the progress file at `~/.claude/english-coach/progress.md`; edit it to start at a higher tip level.

## How it works

- **What is counted**: only messages you type (desktop, terminal, remote). Headless and SDK prompts are ignored.
- **The check**: each message you type costs one Haiku call (your progress file and the message in, a short list of tips out). See [docs/decisions](docs/decisions/2026-10-13-haiku-checks-each-message-in-the-background.md).
- **The review**: when a session starts and 10 messages were checked since the last review, one Sonnet call rewrites the progress file from the stored tips. Nothing is added to Claude's context. See [docs/decisions](docs/decisions/2026-10-13-sonnet-reviews-the-progress-file-at-session-start.md).
- **History**: each turn is stored in the plugin's store, one key per session. See [docs/decisions](docs/decisions/2026-10-13-turn-history-in-store-one-key-per-session.md).
- **Roll-ups**: sessions older than last month are rolled up into monthly totals when a session starts. See [docs/decisions](docs/decisions/2026-10-07-monthly-roll-ups-one-key-per-rolled-session.md).

## Limitations

- **Surfaces**: used in the terminal and in Claude Code Desktop. Not tested in the VS Code extension.
- **Pasted text**: Haiku is told to ignore code and pasted or quoted text, but pasted text still counts toward the word totals. A message is cut at 8,000 characters before the check.
- **Parallel sessions**: turns are never lost, since each session has its own key. Two sessions that start together can both run the Sonnet review. The review checks that the progress file did not change before writing it, but that is not a lock.
- **Privacy**: every message you type is sent to Haiku. The store and the progress file keep excerpts of your messages in plain text.

## Development

```bash
npm install
npm run types
npm run typecheck
npm test
npm run build
```

`npm run types` lays down the engine types in `.claude-plugin/types/`. To try an edit in Claude Code Desktop, see [docs/solutions](docs/solutions/2026-10-07-desktop-runs-stale-plugin-code.md).
