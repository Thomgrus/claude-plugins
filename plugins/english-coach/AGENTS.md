# english-coach

Claude Code plugin (a mod of function hooks). Checks: `npm run typecheck`, `npm test`, `npm run build`. Run `npm run types` once first to lay down `.claude-plugin/types/`: it runs one short `claude -p` call on Haiku with the plugin loaded.

## Documentation

Before rederiving a fix or re-litigating a constraint, search `docs/solutions/` and
`docs/decisions/`.

- An architecture, provider, data-model, security, deployment, or workflow decision — made or
  materially changed — gets written or amended in `docs/decisions/` (`docs/decisions/TEMPLATE.md`).
- A diagnosed failure with a diagnostic path worth reusing gets written in `docs/solutions/`
  (`docs/solutions/TEMPLATE.md`).

Keep this file itself small — edit it only when guidance must color future work across the
whole repo. Case-by-case detail belongs in `docs/solutions/` instead.

See `docs/README.md` for the full routing table.
