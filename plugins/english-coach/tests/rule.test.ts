import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { ModelCompleteResult } from 'claude-code'

import { keepsSections, reviewAsk, TEMPLATE, unwrap } from '../hooks/rule'

const USAGE = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
const TIPS = 'English tips:\n- "doing effort" → "making an effort" [calque]'

const PROGRESS = '# English progress\n\n## Current tip level: 2 (Natural phrasing)\n'

test('a missing progress file is created from the template', async ($, on) => {
  const written: string[] = []
  on('session.id', () => ({ value: 'a' }))
  on('env.get', () => ({ value: '/home/t' }))
  on('clock.now', () => ({ value: 1000 }))
  on('clock.after', () => ({ value: undefined }))
  on('model.complete', () => ({ value: { isAnswered: true, text: TIPS, usage: USAGE } }))
  on('fs.exists', () => ({ value: false }))
  on('fs.write', ($, e) => {
    written.push(e.path)
    return { value: undefined }
  })
  on('fs.read', () => ({ value: '' }))
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))

  await $.prompt.submit({ text: 'hello', wait: true, origin: { kind: 'composer' } })
  expect(written).toEqual(['/home/t/.claude/english-coach/progress.md'])
})

test('a checked message is stored as a turn with the coach tips', async ($, on) => {
  on('session.id', () => ({ value: 'a' }))
  on('env.get', () => ({ value: '/home/t' }))
  on('clock.now', () => ({ value: 1000 }))
  on('clock.after', () => ({ value: undefined }))
  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => ({ value: PROGRESS }))
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))
  on('model.complete', () => ({ value: { isAnswered: true, text: TIPS, usage: USAGE } }))
  on('store.get', () => ({ value: undefined }))
  const saved = new Promise(resolve =>
    on('store.set', ($, e) => {
      resolve(e)
      return { value: undefined }
    }),
  )

  await $.prompt.submit({ text: 'i am doing effort', wait: true, origin: { kind: 'composer' } })
  expect(await saved).toEqual({
    key: 'session:a',
    value: [{ turnId: '1000', ts: 1000, words: 4, level: 2, tips: [{ wrong: 'doing effort', fix: 'making an effort', note: '', category: 'calque' }] }],
  })
})

test('the check asks Haiku at low effort for up to 600 tokens', async ($, on) => {
  on('session.id', () => ({ value: 'a' }))
  on('env.get', () => ({ value: '/home/t' }))
  on('clock.now', () => ({ value: 1000 }))
  on('clock.after', () => ({ value: undefined }))
  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => ({ value: PROGRESS }))
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  const asked = new Promise(resolve =>
    on('model.complete', ($, e) => {
      resolve({ model: e.model, effort: e.effort, maxTokens: e.maxTokens })
      return { value: { isAnswered: true, text: TIPS, usage: USAGE } }
    }),
  )

  await $.prompt.submit({ text: 'i am doing effort', wait: true, origin: { kind: 'composer' } })
  expect(await asked).toEqual({ model: 'haiku', effort: 'low', maxTokens: 600 })
})

test('a failed check is logged and stores no turn', async ($, on) => {
  const stored: unknown[] = []
  on('session.id', () => ({ value: 'a' }))
  on('env.get', () => ({ value: '/home/t' }))
  on('clock.now', () => ({ value: 1000 }))
  on('clock.after', () => ({ value: undefined }))
  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => ({ value: PROGRESS }))
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: USAGE } }))
  on('store.set', ($, e) => {
    stored.push(e)
    return { value: undefined }
  })
  const logged = new Promise(resolve =>
    on('ui.log', ($, e) => {
      resolve(e.text)
      return { value: undefined }
    }),
  )

  await $.prompt.submit({ text: 'i am doing effort', wait: true, origin: { kind: 'composer' } })
  expect(String(await logged)).toContain('the check failed (api-error 529 overloaded)')
  expect(stored).toEqual([])
})

test('a reply without a tips list is logged with its start', async ($, on) => {
  on('session.id', () => ({ value: 'a' }))
  on('env.get', () => ({ value: '/home/t' }))
  on('clock.now', () => ({ value: 1000 }))
  on('clock.after', () => ({ value: undefined }))
  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => ({ value: PROGRESS }))
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))
  on('model.complete', () => ({ value: { isAnswered: true, text: 'Sure, here is my answer.', usage: USAGE } }))
  const logged = new Promise(resolve =>
    on('ui.log', ($, e) => {
      resolve(e.text)
      return { value: undefined }
    }),
  )

  await $.prompt.submit({ text: 'i am doing effort', wait: true, origin: { kind: 'composer' } })
  expect(String(await logged)).toContain('no tips list in the reply: "Sure, here is my answer."')
})

test('the review writes the file Sonnet returns without the progress tags it was given', async ($, on) => {
  const turns = Array.from({ length: 10 }, (_, i) => ({ turnId: String(i), ts: i + 1, words: 5, level: 2, tips: [] }))
  const written: string[] = []
  on('session.id', () => ({ value: 'me' }))
  on('env.get', () => ({ value: '/home/t' }))
  on('clock.now', () => ({ value: 1000 }))
  on('clock.after', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'english' } }))
  on('store.keys', () => ({ value: ['session:a'] }))
  on('store.get', (_$, e) => ({ value: e.key === 'session:a' ? turns : undefined }))
  on('store.set', () => ({ value: undefined }))
  on('fs.read', () => ({ value: PROGRESS }))
  on('model.complete', () => ({ value: { isAnswered: true, text: `<progress>\n${PROGRESS}\n</progress>`, usage: USAGE } }))
  const write = new Promise(resolve =>
    on('fs.write', (_$, e) => {
      written.push(e.text)
      resolve(e)
      return { value: undefined }
    }),
  )
  on('session.start', (_$, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  await write
  expect(written).toEqual([PROGRESS])
})

const reviewRun = async (
  $: Parameters<TestBody>[0],
  on: Parameters<TestBody>[1],
  reply: ModelCompleteResult,
  reads: string[] = [PROGRESS, PROGRESS],
) => {
  const turns = Array.from({ length: 10 }, (_, i) => ({ turnId: String(i), ts: i + 1, words: 5, level: 2, tips: [] }))
  const writes: string[] = []
  const sets: unknown[] = []
  let stored: (value: unknown) => void = () => undefined
  const saved = new Promise(resolve => (stored = resolve))
  on('session.id', () => ({ value: 'me' }))
  on('env.get', () => ({ value: '/home/t' }))
  on('clock.now', () => ({ value: 1000 }))
  on('clock.after', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'english' } }))
  on('store.keys', () => ({ value: ['session:a'] }))
  on('store.get', (_$, e) => ({ value: e.key === 'session:a' ? turns : undefined }))
  on('store.set', (_$, e) => {
    sets.push(e)
    stored(e)
    return { value: undefined }
  })
  on('fs.read', () => ({ value: reads.shift() ?? PROGRESS }))
  on('fs.write', (_$, e) => {
    writes.push(e.text)
    return { value: undefined }
  })
  on('model.complete', () => ({ value: reply }))
  const logged = new Promise(resolve =>
    on('ui.log', (_$, e) => {
      resolve(e.text)
      return { value: undefined }
    }),
  )
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  return { logged, saved, writes, sets }
}

test('a review that hits the token cap is logged and writes nothing', async ($, on) => {
  const run = await reviewRun($, on, { isAnswered: true, text: PROGRESS, usage: { ...USAGE, output_tokens: 4000 } })
  expect(String(await run.logged)).toContain('the progress review failed (the reply hit the token cap)')
  expect(run.writes).toEqual([])
})

test('a review that loses a section is logged and writes nothing', async ($, on) => {
  const run = await reviewRun($, on, { isAnswered: true, text: '# English progress\n\nNothing here.', usage: USAGE })
  expect(String(await run.logged)).toContain('the progress review failed (the reply lost a section)')
  expect(run.writes).toEqual([])
})

test('a review is dropped when progress.md changed meanwhile', async ($, on) => {
  const run = await reviewRun($, on, { isAnswered: true, text: PROGRESS, usage: USAGE }, [PROGRESS, `${PROGRESS}\nedited`])
  expect(String(await run.logged)).toContain('the progress review was dropped: progress.md changed meanwhile')
  expect(run.writes).toEqual([])
  expect(run.sets).toEqual([])
})

test('a review that gets no response logs the reason', async ($, on) => {
  const run = await reviewRun($, on, { isAnswered: false, reason: 'api-error', status: null, error: 'unknown', usage: USAGE })
  expect(String(await run.logged)).toContain('the progress review failed (api-error no response unknown)')
})

test('a written review moves review:at to the newest reviewed turn', async ($, on) => {
  const run = await reviewRun($, on, { isAnswered: true, text: PROGRESS, usage: USAGE })
  expect(await run.saved).toEqual({ key: 'review:at', value: 10 })
  expect(run.writes).toEqual([PROGRESS])
})

test('a failed turn save is logged', async ($, on) => {
  on('session.id', () => ({ value: 'a' }))
  on('env.get', () => ({ value: '/home/t' }))
  on('clock.now', () => ({ value: 1000 }))
  on('clock.after', () => ({ value: undefined }))
  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => ({ value: PROGRESS }))
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))
  on('model.complete', () => ({ value: { isAnswered: true, text: TIPS, usage: USAGE } }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => {
    throw new Error('store full')
  })
  const logged = new Promise(resolve =>
    on('ui.log', ($, e) => {
      resolve(e.text)
      return { value: undefined }
    }),
  )

  await $.prompt.submit({ text: 'i am doing effort', wait: true, origin: { kind: 'composer' } })
  expect(String(await logged)).toContain('the turn was not saved')
})

test('unwrap strips a BOM, the progress tags and a CRLF code fence', async () => {
  expect(unwrap('\uFEFFHere it is:\n<progress>\n```markdown\r\n# English progress\r\n```\n</progress>')).toBe('# English progress')
  expect(unwrap('  # English progress\n')).toBe('# English progress')
})

test('keepsSections reads CRLF and trailing spaces, and refuses a lost heading, title or level', async () => {
  expect(keepsSections(TEMPLATE, TEMPLATE.replace(/\n/g, '  \r\n'))).toBe(true)
  expect(keepsSections(TEMPLATE, TEMPLATE.replace('## Mastered\n', ''))).toBe(false)
  expect(keepsSections(TEMPLATE, TEMPLATE.replace('# English progress', '# Progress'))).toBe(false)
  expect(keepsSections(TEMPLATE, TEMPLATE.replace('## Current tip level: 1 (Basics)', '## Current tip level'))).toBe(false)
})

test('reviewAsk lists every tip and leaves out an empty category', async () => {
  const turns = [
    { turnId: 'a', ts: 1, words: 3, level: 1, tips: [{ wrong: 'x', fix: 'y', note: '', category: '' }, { wrong: 'p', fix: 'q', note: '', category: 'calque' }] },
    { turnId: 'b', ts: 2, words: 3, level: 1, tips: [] },
  ]
  expect(reviewAsk('file', '2026-10-13', turns)).toContain('<tips messages="2" clean="1">\n- "x" → "y"\n- "p" → "q" [calque]\n</tips>')
})
