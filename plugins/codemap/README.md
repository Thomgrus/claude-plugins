# codemap

Claude finds a local repository from its name or from a business term (component, technology, domain), and records every repository it clones. No more guessed paths.

```bash
claude plugin marketplace add Thomgrus/claude-plugins
claude plugin install codemap@tgruson-public
```

## How it works

Two indexes, both plain files you can edit:

- **Symlinks**: `~/repo/<name>` points to each local repository.
- **Metadata**: `~/Workspace/projects/<tenant>/CODEMAP.md` describes each repository of a tenant (domain, stack, role, keywords), so "the billing API" or "our k8s ingress" resolves to a path.

Repositories live under `~/Workspace/projects/<tenant>/<group path>/<repo>`. A tenant is the organization that owns the repository: `github.com/acme/billing-api` goes to `acme/billing-api`. Claude infers the tenant from the working directory.

At session start, a hook tells Claude to resolve a repository through the `codemap:codemap` skill before acting on it, and to register each clone. Nothing exists yet on first use: the first registration creates the symlink directory and the tenant's `CODEMAP.md`.

## Settings

Set at install, or later in `/config`:

| Setting | Default | |
|---|---|---|
| `linksDir` | `~/repo` | One symlink per repository |
| `projectsDir` | `~/Workspace/projects` | Root of `<tenant>/<group path>/<repo>` |

## Limitations

- The session-start rule reaches the main conversation. Subagents get it only if Claude Code runs session hooks for them, which is not documented.
- A repository outside `projectsDir` can be registered, but Claude cannot infer its tenant from the working directory.

## Development

```bash
claude --plugin-dir plugins/codemap
```
