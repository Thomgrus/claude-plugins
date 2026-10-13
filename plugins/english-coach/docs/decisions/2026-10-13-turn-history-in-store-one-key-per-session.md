# Turn history lives in $.store, one key per session

## Status

Accepted

## Context

The progress pane shows KPIs across all sessions. `$.state` is per session and its values reset when the app restarts. `$.store` persists across sessions, holds 4 MiB in total, and has no atomic update: a read-modify-write of one shared key from two sessions can lose a write.

## Decision

When the Haiku check of a message ends ([Haiku checks each message](2026-10-13-haiku-checks-each-message-in-the-background.md)), `coach()` in `hooks/register.tsx` appends one `Turn` (`types/index.d.ts`: turn id, time, words, tip level, tips) to the key `session:<session id>`. The session id is read when the message is submitted, so a `/clear` during the check does not move the turn to the next session. Appends from one process run one after another through a promise chain, so two checks ending together do not overwrite each other.

The pane reads every `session:*` and `rollup:*` key and merges them by time. `$.state` keeps only what drives redraws: `revision` and `check`.

Not chosen: one shared history key (concurrent sessions would overwrite each other); `$.state` (lost on restart); a file under `~/.claude` (needs its own locking and parsing).

## Consequences

- Two sessions never write the same key, so concurrent sessions do not lose turns.
- About 200 bytes per turn: the 4 MiB cap holds roughly 20k turns. Old sessions are folded into [monthly roll-ups](2026-10-07-monthly-roll-ups-one-key-per-rolled-session.md).
- The pane reads every key on each redraw; cheap at this size.
- A failed check stores no turn, so the KPIs count only checked messages.
