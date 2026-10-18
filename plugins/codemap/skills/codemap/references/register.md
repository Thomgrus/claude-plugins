# Register a repository

A registered repository has both a symlink and a metadata entry in its tenant's `CODEMAP.md`.

## Location

A repository lives at `${user_config.projectsDir}/<tenant>/{path}/<repo>`:

```text
github.com/acme/billing-api                          → ${user_config.projectsDir}/acme/billing-api
gitlab.example.com/globex/platform/payments/gateway  → ${user_config.projectsDir}/globex/platform/payments/gateway
```

Clone new repositories there. If the user points to a repository outside the projects root, register it where it is and say that tenant resolution from `pwd` will not work inside it.

## Create the symlink

1. Default the name to the repository basename unless the user supplied another name.
2. Inspect an existing target before changing it.
3. If it already points to the same repository, leave it unchanged.
4. If it points elsewhere, ask before replacing it.

```bash
mkdir -p ${user_config.linksDir}
ls -l ${user_config.linksDir}/<name>
ln -s ${user_config.projectsDir}/<tenant>/{path}/<repo> ${user_config.linksDir}/<name>
```

## Write the metadata

Write only to the repository's tenant file, `${user_config.projectsDir}/<tenant>/CODEMAP.md`. If it does not exist, create it with a `# CODEMAP — <tenant>` heading.

```markdown
## <name>
- **Path**: `${user_config.linksDir}/<name>`
- **Domain**: <domain>
- **Stack**: <technologies>
- **Role**: <one or two sentences>
- **Keywords**: <lowercase, comma-separated keywords>
```

- Add keywords without duplicates.
- Include abbreviations the user actually employs, such as `es`, `k8s`, `pg`, or `bff`.
- Add environment keywords when relevant, such as `dev-back` or `prd-front`.
- Do not repeat the repository name in keywords; its heading already covers it.
- Never register a repository in another tenant's map.
