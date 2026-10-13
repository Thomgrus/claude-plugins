# Haiku checks each message in the background and its tips show above the prompt

## Status

Accepted

## Context

Tips written by the main agent at the end of its answer arrive only when the whole turn is done, sometimes minutes later, and cost main-model tokens. `$.model.complete` lets a plugin call a small model on its own, and the `AbovePrompt` band is drawn while the main agent is still working.

Work started inside a `prompt.submit` hook belongs to that dispatch: when it is abandoned (the person interrupts, a hook above settles first, the budget runs out), `next.signal` aborts and the `$` calls in flight with it end. Awaiting the check inside the hook would instead hold every message back until Haiku answers.

## Decision

`prompt.submit` awaits `next(e)` first. The check starts only for counted origins (`composer`, `bridge`) and only when the prompt was not dropped, so `sdk` prompts (headless runs, evals) and prompts another hook drops are ignored.

- The message is cut once at 8,000 characters; the cut text is both what Haiku reads and what the word count uses.
- `$.clock.after(0, …)` runs `coach()` in `hooks/register.tsx` in its own dispatch, so the call is neither aborted with the submit hook nor in the message's way.
- `coach()` calls `$.model.complete` with model `haiku`, the system prompt `COACH` and `ask(progress, message)` from `hooks/rule.ts`, `maxTokens` 600, `effort` `low`, `timeoutMs` 30,000.
- The atom `check` holds `{ id, tips }`: `id` is `$.clock.now()` at submit, `tips` is `null` while Haiku works. A result is written only if `check.id` still matches, so a newer message wins over a late answer.
- The `AbovePrompt` hook draws other plugins' content (`next(e)`) first, then "checking your message…" or the tips card from `card()`. It yields the band to a survey.
- `splitTips` in `hooks/tips.ts` reads the reply: the last `English tips:` header outside a code fence, then one tip per bullet line. `English tips: none` means a clean message.
- On failure (no answer, a reply without a tips list, or a thrown error), `check` is cleared and a line goes to `$.ui.log`. No turn is stored. `session.start` also clears `check`, so a band left by a crash does not survive into the next session.

Not chosen: tips in the main answer (late, and on the main model); awaiting Haiku in `prompt.submit` (delays every message); a subagent (it runs inside the main turn and shows only when it ends).

## Consequences

- Each typed message costs one Haiku call: about 250 tokens of system prompt, the progress file (about 450 tokens), the message, and up to 600 tokens out.
- A bench of 64 calls (16 messages, 10 with known mistakes and 6 clean, at the default effort and at `low`, twice each) gave a median of 1.11 s at the default effort and 1.05 s at `low`, p95 5.0 s and 4.5 s, worst call 7.7 s and 5.9 s; expected mistakes found 37/40 and 39/40; no clean message flagged at either level. The slow calls were the hardest messages, where Haiku spent 900 to 1,600 output tokens, most likely thinking, which `low` shortens.
- The `AssistantMessage` card hook stays, so older transcripts that carry an `English tips:` list still draw their card.
- A failed check leaves no turn in the history, so `/english` counts only checked messages.
