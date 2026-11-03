# A second model call proofreads each fix before it is shown

## Status

Rejected

## Context

The Haiku check can return a tip whose fix is itself wrong English, such as `"I work on this since two weeks" → "I'm working on this since two weeks"`. The user then learns the mistake from the coach. In the runs measured, wrong fixes were about 0 to 3% of tips.

This covers the fix of a tip only, not whether the tip should exist.

## Decision

Not adopted. A second call would have proofread each fix and dropped the wrong ones before they reach the band, the pane or the history.

It was benchmarked on 68 real tips taken from 46 Haiku calls, nearly all of them right, plus 15 made-up fixes (7 right, 8 wrong):

- Haiku at `low` effort, four prompt variants: dropped 12 to 34% of the right tips across runs.
- Haiku at `medium` effort: dropped 5 of 68 right tips; on the made-up fixes it caught 7 of 8 wrong ones and dropped 1 of 7 right ones.
- Sonnet at `low` effort, phrase only: dropped 5 of 68 right tips, such as "Did you see the error" and "the file exists."; with the message as context, 20 of 68.

Also not chosen:

- a stricter `COACH` rule asking for a fix with no mistake left in it: the fix graders scored 101 of 102 with it and 102 of 102 without, no measurable effect;
- dropping a tip whose fix still holds the quoted words: right fixes often do, such as `"not logged" → "not logged in"`.

## Consequences

- At its best setting the second call drops about 7% of right tips to catch wrong fixes that are at most 3% of tips, and it adds a model call to every checked message.
- Wrong fixes are caught in the evals instead, by the `fix` graders of [the eval cases](2026-11-02-haiku-check-eval-cases-generated-from-a-dataset.md).
- Reopen this if the wrong-fix rate in the evals rises, or if a check drops well under 1% of right tips.
