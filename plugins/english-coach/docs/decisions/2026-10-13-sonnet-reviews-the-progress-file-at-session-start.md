# Sonnet reviews the progress file at session start, and the main agent gets no rule

## Status

Accepted

## Context

The progress file (`~/.claude/english-coach/progress.md`) tracks the learner's tip level, recurring mistakes and mastered patterns; their native language is a plugin setting ([Haiku checks each message](2026-10-13-haiku-checks-each-message-in-the-background.md)). Haiku reads it on every check to pick which mistakes matter. Keeping it up to date through the main agent would cost a rule in its context on every session (about 700 tokens, sent again after a compaction) and Edit calls in the main conversation. The tips Haiku gives are already stored per message in `$.store`, with their category: a better source.

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

## Amended 2026-11-02: the cap is sized from the ask

The fixed 4,000-token cap was wrong on two counts, and every review failed with `the reply hit the token cap`, so the file was never rewritten and Sonnet was called again at each session start.

- The file outgrew "about 450 tokens": a real `progress.md` of 7,187 characters (French examples, arrows, quotes) comes back as about 2,800 tokens on its own.
- `usage.output_tokens` counts thinking. At its default effort `claude-sonnet-5-5` thinks before it writes: on that file, 12 turns, the reply took 4,561 output tokens with `maxTokens` 4,000 and 4,766 with 32,000, for a whole file of 7,356 and 7,542 characters that kept every section. At `low` and `medium` effort it took 2,780 to 2,816 tokens for a whole file.

`review()` now asks for `maxTokens` = 4,000 + the ask's length in characters, at most 64,000 (the engine's ceiling), and a reply is cut when `output_tokens` reaches that cap. The reply is the file rewritten from the ask, and a token holds more than one character here, so the ask's length bounds the reply; the 4,000 leave room for thinking, about 2,000 in these runs. The 4,000-token cap in the Decision above reads as this cap, and a review of this file takes about 25 seconds, not 6 to 7.3.

Not chosen: `effort: 'low'` with the 4,000 cap. It halves the time (12 s instead of 25 s) and the tokens, but the file alone already takes 2,800 of the 4,000, so the next few patterns would hit the cap again; `low` and `medium` each lost a section in one of two runs, where the default effort kept them in both (small samples); and the review is the judgment this record gave Sonnet for, run in the background at most once per 10 messages, where speed does not matter. One `medium` run cut the file from 7,187 to 2,673 characters, a loss `keepsSections` does not catch. The effort stays the model's own.
