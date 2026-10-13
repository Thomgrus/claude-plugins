# Sonnet reviews the progress file at session start, and the main agent gets no rule

## Status

Accepted

## Context

The progress file (`~/.claude/english-coach/progress.md`) tracks the learner's native language, tip level, recurring mistakes and mastered patterns. Haiku reads it on every check to pick which mistakes matter. Keeping it up to date through the main agent would cost a rule in its context on every session (about 700 tokens, sent again after a compaction) and Edit calls in the main conversation. The tips Haiku gives are already stored per message in `$.store`, with their category: a better source.

## Decision

- `prompt.submit` adds no context. It creates the progress file from `TEMPLATE` when it is missing and reads it for the Haiku check.
- `session.start` schedules `review()` in `hooks/register.tsx` with `$.clock.after(0, …)`, outside the start dispatch.
- `review()` collects the stored turns newer than `review:at` in the store. With fewer than `REVIEW_AFTER` (10) it does nothing.
- Otherwise it calls `$.model.complete` with model `sonnet`, the system prompt `REVIEW` and `reviewAsk(progress, today, turns)` from `hooks/rule.ts`, `maxTokens` 4,000, `timeoutMs` 120,000. The reply is the whole updated file; `unwrap` strips `<progress>` tags, a preamble and a code fence around it.
- The file is written only if the reply did not hit the 4,000-token cap, `keepsSections(before, after)` holds (same title line, a `Current tip level` line, every H1/H2 heading of the old file, read across CRLF and trailing spaces), and the file on disk has not changed since it was read. Otherwise a line goes to `$.ui.log` and the file is left as it was.
- After a write, `review:at` is the newest reviewed turn's time.

Not chosen: Haiku for the review (judging patterns across many tips is harder than one message, and speed does not matter here); an Edit-style diff instead of the whole file (more ways to fail for a file of about 450 tokens); a rule asking the main agent to keep the file (main-context tokens on every session, for a source worse than the stored tips).

## Consequences

- The main agent's context carries nothing from the plugin.
- Each review costs one Sonnet call: the progress file and the tips in, the file out. In a local run with 12 seeded turns plus 4 earlier sessions, it answered in 6 to 7.3 seconds.
- The file changes at most once per session start, and only after 10 new checked messages, so a level-up shows from the next session.
- An edit made to the file while the review runs wins; that review is dropped and runs again at the next session start.
- `REVIEW` forbids invented examples; the local runs quoted only stored tips.
