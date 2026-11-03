import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ask, COACH, TEMPLATE } from '../hooks/rule.ts'
import { HEADER, ITEM, NONE } from '../hooks/tips.ts'

type Mistake = { category: string; wrong: string; fix: string; match: string }
type Entry = { id: string; message: string; mistakes?: Mistake[]; traps?: string[] }

const NATIVE = 'French'

const TOOLS = ['Read', 'Glob', 'Grep', 'NotebookRead', 'Skill', 'AskUserQuestion', 'Agent', 'TodoWrite', 'TaskCreate', 'TaskGet', 'TaskList', 'TaskUpdate', 'TaskStop', 'ToolSearch']

const SPACE = '[^\\S\\n]'
const line = (pattern: RegExp) => pattern.source.replaceAll('^', '(?<![^\\n])').replaceAll('$', '(?![^\\n])').replaceAll('\\s', SPACE)
const LIST = `${line(HEADER)}\\n(?:${SPACE}*(?:(?:[-*]|\\d+\\.)${SPACE}[^\\n]*)?\\n)*${line(ITEM)}`
const ANY = '[^"”\\n]*'
const BEFORE = '[ \\t]*(?:[^"”\\s]+[ \\t]+){0,4}[^"”\\s]*'
const AFTER = '[^"”\\s]*(?:[ \\t]+[^"”\\s]+){0,4}[ \\t]*'
const quoting = (before: string, fragment: string, after: string) => `^[ \\t]*(?:[-*]|\\d+\\.)[ \\t]*["“]${before}(?:${fragment})${after}["”][ \\t]*(?:→|->|=>)`

const regex = (name: string, pattern: string, match: 'contains' | 'not_contains') => ({ name, type: 'regex', pattern, flags: 'im', match })

const graders = (entry: Entry) => [
  regex('format', `${line(NONE)}|${LIST}`, 'contains'),
  ...((entry.mistakes ?? []).length === 0 ? [regex('clean', line(NONE), 'contains')] : []),
  ...(entry.mistakes ?? []).map((mistake, i) => regex(`mistake-${i + 1}-${mistake.category}`, quoting(BEFORE, mistake.match, AFTER), 'contains')),
  ...(entry.traps ?? []).map((trap, i) => regex(`trap-${i + 1}`, quoting(ANY, trap, ANY), 'not_contains')),
]

const yaml = (value: unknown, indent = ''): string => {
  if (Array.isArray(value)) return value.map(item => `\n${indent}- ${yaml(item, `${indent}  `).trimStart()}`).join('')
  if (value !== null && typeof value === 'object') {
    return Object.entries(value)
      .map(([key, inner]) => `\n${indent}${key}:${typeof inner === 'object' ? yaml(inner, `${indent}  `) : ` ${yaml(inner)}`}`)
      .join('')
  }
  return JSON.stringify(value)
}

const caseFile = (entry: Entry) => {
  const mistakes = entry.mistakes ?? []
  const tags = [mistakes.length === 0 ? 'clean' : 'mistakes', ...(entry.traps ? ['trap'] : []), ...new Set(mistakes.map(mistake => mistake.category))]
  return `${yaml({
    schema_version: '1.1',
    name: entry.id,
    description: mistakes.length === 0 ? 'Clean message' : mistakes.map(mistake => `"${mistake.wrong}" → "${mistake.fix}" [${mistake.category}]`).join('; '),
    tags,
    execution: {
      model: 'haiku',
      max_turns: 1,
      disallowed_tools: TOOLS,
      append_system_prompt: COACH,
      prompt: ask(TEMPLATE, NATIVE, entry.message),
    },
    graders: graders(entry),
  }).trimStart()}\n`
}

const root = dirname(fileURLToPath(import.meta.url))
const entries: Entry[] = JSON.parse(readFileSync(join(root, 'dataset.json'), 'utf8'))
rmSync(join(root, 'cases'), { recursive: true, force: true })
for (const entry of entries) {
  mkdirSync(join(root, 'cases', entry.id), { recursive: true })
  writeFileSync(join(root, 'cases', entry.id, 'case.yaml'), caseFile(entry))
}
console.log(`${entries.length} cases`)
