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

## Amended 2026-11-03: the cases send the stripped message and the graders read like `splitTips()`

`generate.ts` also imports `stripPasted` and `UNCHANGED` from `hooks/tips.ts`:

- Each case sends `stripPasted(message)`, what the plugin sends. A trap that `stripPasted` removes never reaches Haiku, so it gets no grader. `cases.check.ts` still checks that every trap is in its message.
- `clean` passes on a `none` line, or on a list whose readable bullets all repeat their quote or give a no-change word as their fix, which `splitTips()` reads as clean.
- A `mistake` grader rejects a tip whose fix repeats the quote or starts with a no-change word, since `splitTips()` reads neither as a tip. The no-change words are cut from the source of `UNCHANGED` at its first `)\b`; `cases.check.ts` fails if a mistake grader passes a no-change bullet.

Consequences:

- Regenerate the cases after any change to `stripPasted` or `UNCHANGED` too.
- The graders are still looser than `splitTips()` on an unquoted fix that is not a no-change word: `→ looks good`, `→ unchanged` or `→ okay` passes a `mistake` grader, while `splitTips()` reads no tip: it skips that bullet, and a reply with no other tip line counts as unreadable, so the plugin logs a failed check and stores no turn.
- A run on 3 November 2026 passed 78 of 114 runs, against 34 of 114 for the first run. Four of the seven trap graders are gone, since `stripPasted` removes their text, so the trap scores of the two runs are not comparable.

## Amended 2026-11-03: a fix grader fails a fix that keeps the mistake

A tip can name the right mistake and give a fix that is still wrong, such as `"depends of" → "depends from"`. The `mistake` grader passed it. Each mistake now also gets a `fix-<n>-<category>` grader (`not_contains`): it fails the case when a tip whose quote holds the mistake, with any text around it, gives a fix that still matches the mistake.

- The fix side is checked against the mistake's `match`. A mistake sets `fixMatch` in `dataset.json` when `match` would also reject a right fix: `blocked-since`, `precise` and `control-migrations` do, so "we currently use", "be more precise" or "version control" pass.
- A `capitalization` mistake is matched case-sensitively on the fix side, so `"i tried" → "I tried"` passes. Every other pattern stays case-insensitive.
- `cases.check.ts` checks that each fix grader passes the dataset's own fix and fails a fix that keeps the mistake, alone or in a whole sentence, and that each `fixMatch` passes right fixes holding the mistake's word.

A production guard was measured and rejected: [a second call proofreads each fix](2026-11-03-a-second-call-proofreads-each-fix.md).

Consequences:

- A wrong fix is caught by the evals, not shown less often to the user.
- A `fixMatch` lists the words around the mistake it looks for. A wrong fix in a context it does not list, such as "Can you also precise what…" or "do the control that…", passes. Each attempt to widen the lists also failed right fixes.
- A run on 3 November 2026 with the fix graders passed 77 of 114 runs; the fix graders passed 100 of 102. Both failures were real: Haiku kept the false friend, `"Actually we use" → "Actually, we use"`.
