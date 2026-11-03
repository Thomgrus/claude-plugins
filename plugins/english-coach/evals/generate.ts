import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ask, COACH, TEMPLATE } from '../hooks/rule.ts'
import { HEADER, ITEM, NONE, stripPasted, UNCHANGED } from '../hooks/tips.ts'

type Mistake = { category: string; wrong: string; fix: string; match: string }
type Entry = { id: string; message: string; mistakes?: Mistake[]; traps?: string[] }

const NATIVE = 'French'

const TOOLS = ['Read', 'Glob', 'Grep', 'NotebookRead', 'Skill', 'AskUserQuestion', 'Agent', 'TodoWrite', 'TaskCreate', 'TaskGet', 'TaskList', 'TaskUpdate', 'TaskStop', 'ToolSearch']

const SPACE = '(?:[^\\S\\r\\n]|\\r(?=[^\\n]))'
const BLANK = `${SPACE}*\\r?`
const CLASS_SPACE = '\\t\\v\\f\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff'
const line = (pattern: RegExp) =>
  pattern.source.replaceAll('^', '(?<![^\\n])').replaceAll('$', '\\r?(?![^\\n])').replaceAll('[\\s', `[${CLASS_SPACE}`).replaceAll('\\s', SPACE)
const BULLET = `${SPACE}*(?:[-*]|\\d+\\.)${SPACE}`
const ARROW = '(?:→|->|=>)'
const LIST = `${line(HEADER)}\\n(?:(?:${BULLET}[^\\n]*|${BLANK})\\n)*(?:${line(ITEM)}|${line(UNCHANGED)})`
const OTHER = `(?!${line(ITEM)})(?!${line(UNCHANGED)})${BULLET}[^\\n]*`
const TAIL = `(?=${SPACE}*(?:\\[|\\r?(?![^\\n])|[—–(-]))`
const SAME_FIX = (name: string) => `${SPACE}*["“]${SPACE}*(?-i:\\k<${name}>)${SPACE}*["”](?:${TAIL}|(?![^\\n]*["”]${TAIL}))`
const KEPT = (name: string) =>
  `(?:${SPACE}*(?:[-*]|\\d+\\.)${SPACE}*["“]${SPACE}*(?<${name}>[^\\n]+?)${SPACE}*["”]${SPACE}*${ARROW}${SAME_FIX(name)}[^\\n]*|(?!${line(ITEM)})${line(UNCHANGED)}[^\\n]*)`
const CLEAN = `${line(NONE)}|${line(HEADER)}(?:\\n(?:${BLANK}|${OTHER}))*\\n${KEPT('first')}(?:\\n(?:${KEPT('next')}|${OTHER}))*(?![^\\n])(?!\\n${BULLET})`
const UNCHANGED_FIX = UNCHANGED.source.slice(UNCHANGED.source.indexOf(ARROW) + ARROW.length, UNCHANGED.source.indexOf(')\\b') + 3).replaceAll('[\\s', '[ \\t').replaceAll('\\s', '[ \\t]')
const ANY_BEFORE = '(?:[^"”\\s][^"”\\n]*)?'
const ANY_AFTER = '(?:[^"”\\n]*[^"”\\s])?'
const BEFORE = '(?:[^"”\\s]+[ \\t]+){0,4}[^"”\\s]*'
const AFTER = '[^"”\\s]*(?:[ \\t]+[^"”\\s]+){0,4}'
const quoting = (before: string, fragment: string, after: string) =>
  `^[ \\t]*(?:[-*]|\\d+\\.)[ \\t]*["“][ \\t]*(?<quote>${before}(?:${fragment})${after})[ \\t]*["”][ \\t]*${ARROW}(?!${SAME_FIX('quote')})(?!${UNCHANGED_FIX})`

const regex = (name: string, pattern: string, match: 'contains' | 'not_contains') => ({ name, type: 'regex', pattern, flags: 'im', match })

const visibleTraps = (entry: Entry) => (entry.traps ?? []).filter(trap => new RegExp(trap, 'i').test(stripPasted(entry.message)))

const graders = (entry: Entry) => [
  regex('format', `${line(NONE)}|${LIST}`, 'contains'),
  ...((entry.mistakes ?? []).length === 0 ? [regex('clean', CLEAN, 'contains')] : []),
  ...(entry.mistakes ?? []).map((mistake, i) => regex(`mistake-${i + 1}-${mistake.category}`, quoting(BEFORE, mistake.match, AFTER), 'contains')),
  ...visibleTraps(entry).map((trap, i) => regex(`trap-${i + 1}`, quoting(ANY_BEFORE, trap, ANY_AFTER), 'not_contains')),
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
      prompt: ask(TEMPLATE, NATIVE, stripPasted(entry.message)),
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
