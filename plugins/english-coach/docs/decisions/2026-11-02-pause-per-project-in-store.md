# The pause is a store key per project, shared by its worktrees

## Status

Accepted

## Context

Sometimes the checks get in the way: a demo, a pairing session, or a project where you write in another language on purpose. Uninstalling the plugin or emptying the native language setting is too blunt for that, and a pause in one project should not stop the checks in the others. The pause must survive a restart and reach every session opened in the same project, including its git worktrees, which Claude Code opens at another path.

This does not cover a time-limited pause, or a pause for one session only.

## Decision

`/english pause` stores `paused:<main checkout>` = `true` in `$.store`, and `/english resume` deletes the key. `pausedKey()` in `hooks/register.tsx` reads `<cwd>/.git`: when it is a worktree file (`gitdir: <main>/.git/worktrees/<name>`), the key uses `<main>`; otherwise it uses the session's cwd as it is.

`isPaused()` is read in three places:

- `prompt.submit` returns before any Haiku call;
- `coach()` checks again after Haiku answers, and drops the turn and its band if the project was paused in the meantime;
- `session.start` sets the status line, and the pane shows a paused hint.

One command carries it: `/english [pause|resume]`. A bare `/english` still opens the pane, and any other argument returns the usage line.

Not chosen:

- a global pause, which would stop the checks in every project to quiet one;
- a project-scoped user setting, since `$.config.set` has no scope and writes the same value for every project;
- separate `/english-pause` and `/english-resume` commands, which add two entries to the command list for one switch.

## Consequences

- All the worktrees of a repository share its pause. Pausing in one pauses the others and the main checkout.
- Submodules, subfolders and symlinked paths each get their own key, since the key is the cwd string unless `.git` is a worktree file. A session started in a subfolder of a paused project is not paused.
- The status line and the pane of other running sessions in the same project update only on their next submit or session start. The checks themselves stop at once, since `prompt.submit` reads the store each time.
- A check already running when the pause lands still costs its Haiku call, but stores no turn and clears its band.
- A paused project keeps its key in the store until `/english resume`. Nothing expires it.
