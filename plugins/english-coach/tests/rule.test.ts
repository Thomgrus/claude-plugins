import { expect, test } from 'claude-code/testing'

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
