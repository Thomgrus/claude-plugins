# English coach

A Claude Code plugin for people who practise English while they work with Claude.

- Each message you send is checked by Haiku, and the tips show in a frame above the prompt, while Claude is still working.
- Each tip has a category. A clean message gets a short "No English findings" card.
- Outside the terminal (desktop app, mobile, VS Code), **Hide** on the card dismisses it on that surface until your next message. It is not a pause: the next message is checked as usual. Two windows of the same surface on one session share the dismiss.
- `/english` opens a pane with your progress across all sessions: findings per turn, errors per 100 words, clean turns and words, a chart of the last 30 turns, a by-day table, a by-month table and the recent turns. It opens even while Claude is still working.
- A progress file tracks your recurring mistakes and your tip level. Sonnet reviews it from your tips when a session starts.
- `/english pause` stops the checks in the current project, for a demo or when you write in another language on purpose, and `/english resume` starts them again. The status line and the pane say when the coach is paused.
- `/english native <language>` sets your native language, and `/english native` clears it.

## Install

```bash
claude plugin marketplace add Thomgrus/claude-plugins
claude plugin install english-coach@tgruson-public
```

Restart Claude Code. The first session asks for your native language, unless the install already did: the coach uses it to look for the calques and false friends it brings. In the terminal it asks when the session starts; in the desktop app, which has no install form, it asks when the window opens the session. Change it later with `/english native <language>`, in `/config` (*Native language · english-coach*) in the terminal, or in Customize › Plugins › english-coach › Settings in the desktop app. Your first message creates the progress file at `~/.claude/english-coach/progress.md`; edit it to start at a higher tip level.

## How it works

- **What is counted**: only messages you type (desktop, terminal, remote). Headless and SDK prompts are ignored.
- **The check**: each message you type costs one Haiku call (your progress file and the message in, a short list of tips out). See [docs/decisions](docs/decisions/2026-10-13-haiku-checks-each-message-in-the-background.md).
- **The review**: when a session starts and 10 messages were checked since the last review, one Sonnet call rewrites the progress file from the stored tips. Nothing is added to Claude's context. See [docs/decisions](docs/decisions/2026-10-13-sonnet-reviews-the-progress-file-at-session-start.md).
- **History**: each turn is stored in the plugin's store, one key per session. See [docs/decisions](docs/decisions/2026-10-13-turn-history-in-store-one-key-per-session.md).
- **Roll-ups**: sessions older than last month are rolled up into monthly totals when a session starts. See [docs/decisions](docs/decisions/2026-10-07-monthly-roll-ups-one-key-per-rolled-session.md).
- **The native language**: it is the plugin setting `nativeLanguage`. When the settings refuse a change, as the desktop app does until `/reload-plugins` ([anthropics/claude-code#100926](https://github.com/anthropics/claude-code/issues/100926)), the coach keeps the language in its own store instead. A filled setting always wins over the stored one. See [docs/decisions](docs/decisions/2026-10-13-haiku-checks-each-message-in-the-background.md).
- **The pause**: `/english pause` stores one key per project in the plugin's store, so it survives a restart. Worktrees share the pause of their main checkout. While paused, nothing is sent to Haiku and no turn is stored. See [docs/decisions](docs/decisions/2026-11-02-pause-per-project-in-store.md).

## Limitations

- **Surfaces**: used in the terminal and in Claude Code Desktop. Not tested in the VS Code extension.
- **Pasted text**: blockquotes (lines starting with `>`) and fenced code blocks are removed before the check, so Haiku never reads them and they do not count toward the word totals. A message with nothing else is not checked. Inline quotes, inline code and indented code are still sent; Haiku is told to ignore them, and they still count. A fence opens at any indent, so a fence inside a list item is removed too; the cost is that a lone indented line of three backticks, never closed, removes the rest of the message from the check. The tag lines the composer wraps around a multi-line paste are removed too; the pasted prose is checked like typed text. What is left is cut at 8,000 characters.
- **Parallel sessions**: turns are never lost, since each session has its own key. Two sessions that start together can both run the Sonnet review. The review checks that the progress file did not change before writing it, but that is not a lock.
- **Pause scope**: the pause follows the folder the session starts in. A subfolder, a submodule or a symlinked path of a paused project is not paused. Other sessions already open in the project stop or restart their checks at once. Their status line catches up on their next message, and their open pane shows the change only when it is reopened or a check redraws it.
- **Native language question**: it is asked once, in the first terminal session or the first desktop window, whichever comes first, even if that session cannot show the dialog. A session opened by another session in the desktop app kept the first option once with no dialog seen; if that happens, set the right language with `/english native <language>`.
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

### Evals

The eval cases in `evals/cases/` are generated from `evals/dataset.json` and the production prompt and patterns. Regenerate them after changing either, and commit them:

```bash
npm run evals:generate
```

Run them with Haiku in a throwaway `HOME`, so the run never reads or writes your own coach data. On macOS, link `Library` so the CLI finds its login:

```bash
mkdir -p /tmp/eval-home && ln -sfn ~/Library /tmp/eval-home/Library
HOME=/tmp/eval-home claude plugin eval . --ablation none --runs 3 --trust-plugin --no-publish
```

Why the cases look the way they do, and what they miss: [docs/decisions](docs/decisions/2026-11-02-haiku-check-eval-cases-generated-from-a-dataset.md).
