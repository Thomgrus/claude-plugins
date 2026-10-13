# Desktop keeps running the old plugin code after an edit

## Symptom

An edit to the plugin has no effect in Claude Code Desktop, even after `/reload-plugins` or an app restart.

## Cause

An installed plugin runs from its cache copy, `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>`, not from the source folder. The cache is refreshed only when the version changes.

## Fix

1. Bump `version` in `.claude-plugin/plugin.json`.
2. `claude plugin marketplace update <marketplace>`
3. `claude plugin update english-coach@<marketplace>`
4. Restart the app.

## Prevention rule

Always bump the plugin version before testing an edit in an installed copy. Not CI-mechanizable.
