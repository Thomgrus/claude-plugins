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
- `coach()` calls `$.model.complete` with model `haiku`, the system prompt `COACH` and `ask(progress, native, message)` from `hooks/rule.ts`, `maxTokens` 600, `effort` `low`, `timeoutMs` 30,000.
- The atom `check` holds `{ id, tips }`: `id` is `$.clock.now()` at submit, `tips` is `null` while Haiku works. A result is written only if `check.id` still matches, so a newer message wins over a late answer.
- The `AbovePrompt` hook draws other plugins' content (`next(e)`) first, then "checking your message…" or the tips card from `card()`. It yields the band to a survey.
- The native language is the plugin setting `nativeLanguage` (`userConfig` in `.claude-plugin/plugin.json`), not a section of the progress file: Claude Code asks for it when the plugin is enabled, `/config` shows it as a row, and a change reloads the plugin. `ask()` passes it to Haiku as a `<native-language>` tag; Haiku looks for that language's calques and false friends only when it knows it.
- While the setting is empty, the first interactive `session.start` asks once with `$.ui.ask` and saves the answer with `$.config.set`. The store flag `native:asked` is set before the question, so a dismissed dialog is not asked again; the `/english` pane then shows a hint until the setting is filled.
- `splitTips` in `hooks/tips.ts` reads the reply: the last `English tips:` header outside a code fence, then one tip per bullet line. `English tips: none` means a clean message.
- On failure (no answer, a reply without a tips list, or a thrown error), `check` is cleared and a line goes to `$.ui.log`. No turn is stored. `session.start` also clears `check`, so a band left by a crash does not survive into the next session.

Not chosen: tips in the main answer (late, and on the main model); awaiting Haiku in `prompt.submit` (delays every message); a subagent (it runs inside the main turn and shows only when it ends); the native language in the progress file with a reminder line each session (a nag in the transcript until the file is edited); Claude Code's `language` setting (it sets the language Claude answers in, which an English learner sets to English or leaves unset).

## Consequences

- Each typed message costs one Haiku call: about 250 tokens of system prompt, the progress file (about 450 tokens), the message, and up to 600 tokens out.
- A bench on 13 October 2026 (Claude Code 2.1.295, Haiku 5.5) sent 100 messages, 60 with 77 labelled mistakes and 40 clean, five times at each effort. Without `effort` the call sends none, so Haiku uses its API default, `medium`. With the template's unknown native language, `low` found 60 % of the mistakes against 72 % at `medium`: it answered `none` on twice as many messages with mistakes, mostly calques and false friends. With `French` as the native language, `low` found 73 % against 74 %, a gap within noise (95 % interval −6.6 to +5.1 points), with a median of 0.97 s against 1.10 s, p95 1.5 s against 2.7 s, worst call 3.9 s against 11.8 s; 1 clean message flagged out of 200 against 0. An extra prompt rule with calque examples gained nothing at `low` and flagged 6 clean messages out of 200, so it was not kept. Some `medium` calls went past 600 output tokens (up to 812), most likely thinking, which `maxTokens` does not bound; no `low` call did. Labels were written by an agent, not a native speaker, and the runs covered one 11-minute window. The bench gave the native language in the progress file; the `<native-language>` tag that carries it now was checked in one live run, not benched.
- The `AssistantMessage` card hook stays, so older transcripts that carry an `English tips:` list still draw their card.
- A failed check leaves no turn in the history, so `/english` counts only checked messages.
