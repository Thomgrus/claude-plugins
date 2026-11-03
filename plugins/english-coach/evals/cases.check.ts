import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

import { splitTips, stripPasted } from '../hooks/tips.ts'

type Mistake = { category: string; wrong: string; fix: string; match: string }
type Entry = { id: string; message: string; mistakes?: Mistake[]; traps?: string[] }
type Field = 'name' | 'pattern' | 'flags' | 'match'

const root = new URL('./', import.meta.url)
const entries: Entry[] = JSON.parse(readFileSync(new URL('dataset.json', root), 'utf8'))

const visibleTraps = (entry: Entry) => (entry.traps ?? []).filter(trap => new RegExp(trap, 'i').test(stripPasted(entry.message)))

const graders = (id: string) => {
  const found: Partial<Record<Field, string>>[] = []
  for (const line of readFileSync(new URL(`cases/${id}/case.yaml`, root), 'utf8').split('\n')) {
    const field = /^\s*(- )?(name|pattern|flags|match): (".*")$/.exec(line)
    if (!field) continue
    if (field[1]) found.push({})
    const current = found.at(-1)
    if (current) current[field[2] as Field] = JSON.parse(field[3] ?? '""')
  }
  return found
}

const grader = (id: string, name: string) => {
  const found = graders(id).find(entry => entry.name === name)
  assert.ok(found?.pattern, `${id}: no ${name} grader`)
  return new RegExp(found.pattern, found.flags)
}

const TIPS = 'Done.\n\nEnglish tips:\n'
const NONE_REPLY = 'Done.\n\nEnglish tips: none'

const LF_REPLIES = [
  NONE_REPLY,
  'Done.\n\n**English tips:** none',
  'Done.\n\n`English tips: none` — all good',
  `${TIPS}- "a" → "b" [grammar]`,
  `${TIPS}- "a" → "b" [grammar]\n\nBye.`,
  'Done.\n\n## English tips\n\n1. "a" -> "b"',
  `${TIPS}- "a" → write it in English\n- "c" → "d" [grammar]`,
  `${TIPS}- "a whole sentence that is fine." → none`,
  `${TIPS}- "a whole sentence that is fine." → none\n\nBye.`,
  `${TIPS}- "a whole sentence that is fine." → fine, no tip\n- "c" → "d" [grammar]`,
  `${TIPS}- "a whole sentence that is fine." → (no mistake)`,
  `${TIPS}Nothing to fix.`,
  `${TIPS}See below.\n- "a" → "b"`,
  'Done. English tips: none',
  'Done.\n\nEnglish tips: none of the above apply here',
  'Done.',
]

const REPLIES = [...LF_REPLIES, ...LF_REPLIES.map(reply => reply.replaceAll('\n', '\r\n'))]

test('every dataset entry has a generated case with one grader per mistake and trap', () => {
  assert.deepEqual(readdirSync(new URL('cases/', root)).sort(), entries.map(entry => entry.id).sort())
  for (const entry of entries) {
    const names = graders(entry.id).map(found => found.name ?? '')
    assert.equal(names.filter(name => name.startsWith('mistake-')).length, (entry.mistakes ?? []).length, entry.id)
    assert.equal(names.filter(name => name.startsWith('trap-')).length, visibleTraps(entry).length, entry.id)
    assert.equal(names.includes('clean'), (entry.mistakes ?? []).length === 0, entry.id)
  }
})

test('the format grader accepts exactly the replies splitTips can read', () => {
  for (const entry of entries) {
    const format = grader(entry.id, 'format')
    for (const reply of REPLIES) assert.equal(format.test(reply), splitTips(reply) !== null, `${entry.id}: ${reply}`)
  }
})

test('the clean grader accepts exactly the replies splitTips reads as clean', () => {
  for (const entry of entries.filter(entry => (entry.mistakes ?? []).length === 0)) {
    const clean = grader(entry.id, 'clean')
    for (const reply of REPLIES) assert.equal(clean.test(reply), splitTips(reply)?.tips.length === 0, `${entry.id}: ${reply}`)
  }
})

test('every mistake is in its message and its grader matches only a tip on it', () => {
  for (const entry of entries) {
    for (const [i, mistake] of (entry.mistakes ?? []).entries()) {
      assert.match(entry.message, new RegExp(mistake.match, 'i'), entry.id)
      const reply = `${TIPS}- "${mistake.wrong}" → "${mistake.fix}" [${mistake.category}]`
      assert.equal(splitTips(reply)?.tips[0]?.wrong, mistake.wrong, entry.id)
      const pattern = grader(entry.id, `mistake-${i + 1}-${mistake.category}`)
      assert.match(reply, pattern, entry.id)
      assert.doesNotMatch(NONE_REPLY, pattern, entry.id)
    }
  }
})

test('a mistake grader never matches a no-change bullet on its mistake', () => {
  for (const entry of entries) {
    for (const [i, mistake] of (entry.mistakes ?? []).entries()) {
      const pattern = grader(entry.id, `mistake-${i + 1}-${mistake.category}`)
      for (const fix of ['none', 'no big mistake', '(no mistake)', 'fine, no tip', `"${mistake.wrong}" [none]`]) {
        const reply = `${TIPS}- "${mistake.wrong}" → ${fix}`
        assert.equal(splitTips(reply)?.tips.length ?? 0, 0, `${entry.id}: ${reply}`)
        assert.doesNotMatch(reply, pattern, `${entry.id}: ${reply}`)
      }
    }
  }
})

test('every trap is in its message and the grader of each trap left in the prompt catches a tip on it', () => {
  for (const entry of entries) {
    for (const trap of entry.traps ?? []) assert.match(entry.message, new RegExp(trap, 'i'), entry.id)
    for (const [i, trap] of visibleTraps(entry).entries()) {
      const quoted = new RegExp(trap, 'i').exec(stripPasted(entry.message))?.[0]
      assert.ok(quoted, `${entry.id}: ${trap}`)
      const pattern = grader(entry.id, `trap-${i + 1}`)
      assert.match(`${TIPS}- "${quoted}" → "something else" [grammar]`, pattern, entry.id)
      assert.doesNotMatch(NONE_REPLY, pattern, entry.id)
    }
  }
})
