# Documentation

The "why" of the code lives here, not in the code. Each family has a writing trigger, a naming
convention, and a template.

| Family | Write when | Naming | Template |
| --- | --- | --- | --- |
| `decisions/` | an architecture, provider, data-model, security, deployment, or workflow decision is made — including a well-considered rejection | `YYYY-MM-DD-slug.md`, date of the decision | `decisions/TEMPLATE.md` |
| `solutions/` | a failure has been diagnosed and the diagnostic path is worth reusing | `YYYY-MM-DD-slug.md`, date the problem was understood | `solutions/TEMPLATE.md` |

Entries aren't listed here. Find them by `grep` on the symptom or the constraint, and by
incoming links — from the code they constrain, from the project's instructions, and from each
other. A file index would be a second source of truth to keep in sync.

Rules that hold for every family:

- One file per entry. Never a shared, growing "lessons learned" page.
- The filename tells the lifecycle: a date prefix means a point in time — add an entry, correct
  by dated annotation, never rewrite silently; a bare name means a living document, edited in
  place.
- The document ships in the SAME commit as the code it explains. One written after the fact
  usually never gets written at all.
- A pointer back to the document, placed in the code it constrains, obeys the same rule as any
  other comment: add one only where its absence would let someone confidently make a change
  that is wrong in a non-obvious way. There, the document is unfindable exactly when it would
  matter. Anywhere else, it is noise that ages badly like any other comment.
- Standard relative markdown links only (`../solutions/…`). No wikilinks.
- A corrected entry is never rewritten silently: a dated annotation says what was wrong and what
  disproved it.
- No `.gitkeep`. A folder exists once it has its first real entry.
