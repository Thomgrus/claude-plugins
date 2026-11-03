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

## Amended 2026-11-03: quoted and fenced text is removed before the check

An eval run of 38 messages, 3 runs each, showed Haiku at `low` effort correcting text the prompt tells it to ignore: a customer's blockquote and a `//` comment inside a fenced block were corrected in 3 runs out of 3, after `COACH` named both word for word.

`stripPasted` in `hooks/tips.ts` now removes blockquote lines (optional spaces, then `>`) and fenced blocks (opened by three or more backticks or tildes at any indent, closed only by the same character at least as many times; an unclosed fence runs to the end of the message) before the 8,000-character cut, and collapses the blank lines they leave. The cut text in the Decision above reads as the stripped, cut text: it is what Haiku reads and what the word count uses, so a long pasted log no longer uses up the cut. A message with no word left is not checked: no Haiku call, no turn, and the band of the previous check is cleared.

A fence opens at any indent so that a fence inside a list item is removed. The cost: a lone indented line of three backticks in prose, never closed, removes the rest of the message from the check. A fence opened only at up to three spaces, as CommonMark does, was tried and reverted, since it sent the fenced logs of list items to Haiku.

`splitTips` drops a tip whose fix repeats the quoted text, and reads a bullet whose fix starts with a no-change word (`none`, `no mistake`, `no big mistake`, `no tip`, `no change`, `fine`, `correct`, `ok`) and quotes nothing after it as no tip. Haiku writes both shapes for sentences it found correct.

`COACH` keeps its rule on quoted and pasted text: inline quotes, inline code and indented code still reach Haiku.

## Amended 2026-11-03: the tags around a paste are removed

The terminal composer sends a multi-line paste wrapped in tag lines, `<pasted_content id="…">` before it and `</pasted_content id="…">` after, with the same id on both. `stripPasted` kept them: they counted as 4 words in the turn, and Haiku read them while `COACH` tells it never to check pasted text. A one-line paste reaches the hook as typed text, with no tags.

`stripPasted` now drops the tag lines and reads the message in one pass:

- The pasted prose is kept and checked like typed text; fences and blockquotes inside a paste are removed like any other.
- A paste ends only at the closing tag with its opening tag's id, so a tag line inside a pasted log ends nothing.
- A fence left open inside a paste ends at its closing tag, so the typed text after the paste is checked.
- A paste that starts inside a fence the user typed is hidden with that fence, which stays open after it. If the pasted text closed that fence, the lines it let through are dropped at the closing tag.
- An opening tag with no matching closing tag after it starts nothing; inside a typed fence it is code like the rest of the fence.

Not chosen: pairing an opening tag with the next tag line of any kind (a closing tag in a pasted log ended the paste early, tags typed in two code blocks hid the prose between them, and each opening tag rescanned the message); ignoring tags inside a typed fence (a pasted fence marker then closed the typed fence, and the typed text after the paste was swallowed).

Consequences:

- Tags the user types with a real paste's shape and the same id are read as a paste: an opening tag typed in a code block and a matching closing tag typed alone on a line outside it hide the typed text after them.
- A paste that starts inside a typed fence, closes it and opens a fence of its own lets the pasted prose between those two fences through to the check.
- A tag on the same line as other text, or a renamed tag, is not recognised and counts again.

## Amended 2026-11-03: Hide dismisses the band per surface kind

In the desktop app the band could not be hidden until the next message. The terminal has its own way to hide it; the desktop app had none.

The atom `check` now holds `{ id, tips, hiddenOn? }`. Outside the terminal (`e.surface !== 'terminal'`, the same rule as the pane's close button), the band's card carries a **Hide** button with `role="dismiss"` on its first line. A press adds `e.surface` to `hiddenOn`, and the `AbovePrompt` hook yields to `next(e)` on any surface listed there. The update acts only when `check.id` still matches the card that was drawn, so a click on an old card never hides newer tips, and it adds a surface at most once. The next message writes a new `{ id, tips: null }`, which drops `hiddenOn`: Hide is a dismiss of the card on screen, not a pause. The card under an assistant reply gets no button.

The key is the surface kind because `ui.render` events carry `e.surface` but no client id; only `session.attach` and `session.detach` name a client.

Not chosen: setting `check` to `null` on Hide (it also hid the band on a terminal attached to the same session); a per-window dismiss (no client id at render time).

Consequences:

- Two clients of the same surface kind on one session share the dismiss: Hide in one desktop window hides the band in the other.
- A terminal attached to the same session keeps its band when a desktop client hides it.
