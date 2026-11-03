import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

import { splitTips, stripPasted } from '../hooks/tips.ts'

type Mistake = { category: string; wrong: string; fix: string; match: string; fixMatch?: string }
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

const REPLIES = [
  NONE_REPLY,
  'Done.\n\n**English tips:** none',
  'Done.\n\n`English tips: none` — all good',
  `${TIPS}- "a" → "b" [grammar]`,
  'Done.\n\n## English tips\n\n1. "a" -> "b"',
  `${TIPS}- "a" → write it in English\n- "c" → "d" [grammar]`,
  `${TIPS}- "a whole sentence that is fine." → none`,
  `${TIPS}- "a whole sentence that is fine." → fine, no tip\n- "c" → "d" [grammar]`,
  `${TIPS}- "a whole sentence that is fine." → (no mistake)`,
  `${TIPS}Nothing to fix.`,
  `${TIPS}See below.\n- "a" → "b"`,
  'Done. English tips: none',
  'Done.\n\nEnglish tips: none of the above apply here',
  'Done.',
]

test('every dataset entry has a generated case with one grader per mistake and trap', () => {
  assert.deepEqual(readdirSync(new URL('cases/', root)).sort(), entries.map(entry => entry.id).sort())
  for (const entry of entries) {
    const names = graders(entry.id).map(found => found.name ?? '')
    assert.equal(names.filter(name => name.startsWith('mistake-')).length, (entry.mistakes ?? []).length, entry.id)
    assert.equal(names.filter(name => name.startsWith('fix-')).length, (entry.mistakes ?? []).length, entry.id)
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

test('a fix grader passes the dataset fix, alone or in a whole sentence', () => {
  for (const entry of entries) {
    for (const [i, mistake] of (entry.mistakes ?? []).entries()) {
      const pattern = grader(entry.id, `fix-${i + 1}-${mistake.category}`)
      for (const [wrong, fix] of [[mistake.wrong, mistake.fix], [`As I said in the call yesterday, ${mistake.wrong} today.`, `As I said in the call yesterday, ${mistake.fix} today.`]]) {
        const reply = `${TIPS}- "${wrong}" → "${fix}" [${mistake.category}]`
        assert.equal(splitTips(reply)?.tips[0]?.wrong, wrong, `${entry.id}: ${reply}`)
        assert.doesNotMatch(reply, pattern, `${entry.id}: ${reply}`)
      }
    }
  }
})

const LISTED_CONTEXT_ONLY = ['precise']

test('a fix grader fails a fix that keeps the mistake, alone or in a whole sentence', () => {
  for (const entry of entries) {
    for (const [i, mistake] of (entry.mistakes ?? []).entries()) {
      const pattern = grader(entry.id, `fix-${i + 1}-${mistake.category}`)
      const sentence = LISTED_CONTEXT_ONLY.includes(entry.id) ? 'As I said in the call yesterday, can you' : 'As I said in the call yesterday,'
      for (const [wrong, fix] of [[mistake.wrong, `${mistake.wrong} now`], [`${sentence} ${mistake.wrong} today.`, `${sentence} ${mistake.wrong} now.`]]) {
        const reply = `${TIPS}- "${wrong}" → "${fix}" [${mistake.category}]`
        assert.match(reply, pattern, `${entry.id}: ${reply}`)
      }
    }
  }
})

const NARROWED: Record<string, { right: string[]; wrong: string[] }> = {
  'blocked-since': { right: ['Actually, we currently use', 'Actually we now use'], wrong: ['We actually use'] },
  precise: { right: ['be more precise about what you mean', 'Can you be clear and precise'], wrong: ['can you precise what you mean', 'to precise it'] },
  'control-migrations': { right: ['check that the version control is clean', 'check the access control'], wrong: ['control that it runs', 'please control that'] },
}

test('a fix grader narrowed by fixMatch passes a right fix that holds the mistake word and fails a wrong one', () => {
  const narrowed = entries.flatMap(entry => (entry.mistakes ?? []).flatMap((mistake, i) => (mistake.fixMatch ? [{ entry, mistake, i }] : [])))
  assert.deepEqual(narrowed.map(({ entry }) => entry.id).sort(), Object.keys(NARROWED).sort())
  for (const { entry, mistake, i } of narrowed) {
    const pattern = grader(entry.id, `fix-${i + 1}-${mistake.category}`)
    const reply = (fix: string) => `${TIPS}- "${mistake.wrong}" → "${fix}" [${mistake.category}]`
    for (const fix of NARROWED[entry.id]?.right ?? []) {
      assert.match(fix, new RegExp(mistake.match, 'i'), `${entry.id}: ${fix}`)
      assert.doesNotMatch(reply(fix), pattern, `${entry.id}: ${fix}`)
    }
    for (const fix of NARROWED[entry.id]?.wrong ?? []) assert.match(reply(fix), pattern, `${entry.id}: ${fix}`)
  }
})
