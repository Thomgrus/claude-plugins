---
name: codemap
description: Resolve and register local Git repositories by name, component, technology, or domain. Use before repository work when the path is not established, and after cloning a repository.
---

# Codemap

Resolve repository paths before repository work. Never guess a path.

If access to the index is denied, request access only to the exact paths below; do not bypass it by guessing.

## Data model

- `${user_config.linksDir}/<name>`: one symlink per local repository, across all tenants.
- `${user_config.projectsDir}/<tenant>/CODEMAP.md`: per-tenant metadata for domains, technologies, roles, and keywords.
- `${user_config.projectsDir}/<tenant>/{path}/<repo>`: real repository location.

A tenant is the organization that owns the repository: the GitHub organization or user, or the GitLab top-level group. On a self-hosted forge whose top-level groups do not name the organization, the tenant is the organization behind the host. `{path}` keeps the remaining groups and subgroups; it is empty for a simple `org/repo`.

## Resolve the tenant

Start with `pwd`.

- Under `${user_config.projectsDir}/<tenant>/...`: use the first segment after the projects root.
- Otherwise use a tenant already established in the conversation.
- If the repository name or remote organization identifies a likely tenant, state the inference and confirm it before writing tenant metadata.
- If still uncertain, search every `${user_config.projectsDir}/*/CODEMAP.md`, report the matched tenant, and confirm before writing.

Never write a tenant `CODEMAP.md` while the tenant remains uncertain.

## Route the lookup

### Repository name

Search symlink names, then resolve the real path:

```bash
find ${user_config.linksDir} -maxdepth 1 -type l | grep -i '<term>'
readlink ${user_config.linksDir}/<name>
```

Use a unique direct match. If several repositories match, present the candidates for selection. If none match, continue with semantic lookup.

### Component, technology, or domain

Search the tenant metadata:

```bash
grep -n -i -B 1 -A 5 '<term>' ${user_config.projectsDir}/<tenant>/CODEMAP.md
```

Try the full phrase, meaningful individual terms, and established abbreviations such as `es`/`elastic`, `pg`/`postgres`, and `k8s`/`kubernetes`.

- One semantic match: state the repository and why it matched, then confirm before acting.
- Several matches: list candidates.
- No tenant match: search other tenant maps if the tenant may be wrong, then ask the user to point to the repository.

Codemap identifies location and ownership, not implementation facts: inspect the repository itself before drawing conclusions about it.

## Register

Read [register.md](references/register.md) before registering.

Register when:

- a repository is cloned during the task;
- the user points to an unindexed repository;
- the user's domain term is missing from the repository keywords;
- the repository has no metadata entry and its role has been established.

Ask before renaming or deleting a symlink, overwriting a conflicting symlink, or changing existing metadata beyond additive keywords.

Mention what was registered and in which tenant.
