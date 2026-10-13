# Sessions older than last month are rolled up into monthly totals, one key per rolled session

## Status

Accepted

## Context

Each turn takes about 200 bytes in `$.store`, which holds 4 MiB in all: roughly 20k turns. The pane needs raw turns only for its recent views ("By day" shows 14 days, "Recent turns" 8 turns, the chart 30 turns); older history only feeds totals. `$.store` has no atomic update, and several sessions can start at the same time.

This does not change how a turn is recorded ([turn history](2026-10-13-turn-history-in-store-one-key-per-session.md)).

## Decision

On `session.start`, `rollUp` in `hooks/register.tsx` reads every `session:*` key except the current session's. When all its turns are older than `rawFrom(now)` (`hooks/kpi.ts`: the first day of the previous month, UTC), it writes `rollup:<session id>:<first turn id>` with the totals per month (`Monthly` in `types/index.d.ts`: turns, findings, words, clean turns, highest level), then deletes the raw key. The pane merges roll-ups and raw turns by month for "All sessions" and a "By month" table.

Not chosen: one shared `month:<YYYY-MM>` key (two sessions rolling up at once would overwrite each other's totals); rolling up the current month too (the recent views would go empty at the start of each month).

## Consequences

- The key and its value come only from the raw turns, so two sessions rolling up the same session write the same thing: no double count, no loss.
- A resumed session that was already rolled up starts a new raw key; its later roll-up gets its own key, named by its first turn.
- Accepted risk: a session idle for over a month, resumed while another session is rolling it up, can lose the turn written between the read and the delete.
- A rolled session costs about 100 bytes per month it spans, so the 4 MiB cap is years away.
