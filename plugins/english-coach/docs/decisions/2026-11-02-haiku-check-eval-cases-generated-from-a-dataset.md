# The Haiku check is evaluated by regex cases generated from a labelled dataset

## Status

Accepted

## Context

A change to the coach prompt, the tips format or the model could make Haiku miss mistakes, flag correct English, or answer in a shape `splitTips()` cannot read. Nothing measured that: the plugin tests mock `$.model.complete`, so they never see a real reply. `claude plugin eval` runs a real model on YAML cases and grades the reply, but each case is a static file, and 38 hand-written cases would drift from the prompt and the parser they test.

This does not cover the Sonnet progress review, the band, or the pane.

## Decision

`evals/dataset.json` holds the labelled messages: each one has an id, the message, its big mistakes (`category`, `wrong`, `fix`, a `match` regex) and its traps (correct phrases a tip must not quote). Every message is written for the suite and holds no personal data.

`evals/generate.ts` (`npm run evals:generate`) writes one `evals/cases/<id>/case.yaml` per entry. It imports `COACH`, `ask()` and `TEMPLATE` from `hooks/rule.ts` and `HEADER`, `ITEM` and `NONE` from `hooks/tips.ts`, so a case asks what production asks and grades with the patterns production parses. Each case gets these regex graders:

- `format`: the reply has a `none` line, or a header followed by a tip line, each on a line of its own;
- `clean`, for a message without mistakes: the reply has a `none` line;
- `mistake-<n>-<category>`: a tip line quotes the mistake, with at most four words around it;
- `trap-<n>` (`not_contains`): no tip line quotes the trap.

`evals/cases.check.ts` runs with `npm test` and fails when the cases drift from the dataset or from `splitTips()`. It runs under `node --test`, since `claude plugin test` cannot read files.

Not chosen:

- hand-written cases, which drift from `COACH` and `splitTips()`;
- a model grader, which costs a call per case and adds its own errors;
- a code grader calling `splitTips()`, which the case schema does not offer.

## Consequences

- After any change to `COACH`, `TEMPLATE`, `HEADER`, `ITEM`, `NONE` or the dataset, run `npm run evals:generate` and commit the cases. `npm test` catches a missing case or a grader that reads a reply differently from `splitTips()`, but not a stale prompt.
- The cases differ from production. Production replaces the system prompt with `COACH` and sets `effort: 'low'` and `maxTokens: 600`. A case appends `COACH` to the default system prompt and sets neither, since the schema has no field for them.
- The graders read a reply more loosely than `splitTips()`, which takes the last header outside a code fence and prefers a `none` line to a list. A reply with several headers, a header in a fence, or a `none` line next to a list can pass a grader on a part `splitTips()` ignores.
- A tip that quotes a whole sentence around the mistake fails its `mistake` grader. The cap keeps a tip on the phrase at fault, and a reply that quotes the whole sentence scores lower than it reads.
- The first run with these graders passed 34 of 114 runs (38 cases, 3 runs each). The score is a baseline to compare against, not a target.
- Results land in `evals/results/`, which git ignores.
