import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { ConfigSetResult, ConfigValue, ToolCallResult } from 'claude-code'

import { ask } from '../hooks/rule'

const USAGE = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
const PROGRESS = '# English progress\n\n## Current tip level: 1 (Basics)\n'
const PANE_PROPS = { title: 'English coach', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as const
const HINT = '_Set `english-coach.nativeLanguage` in `/config`: the coach then looks for the calques and false friends your native language brings._'

test('ask adds the native language tag only when it is set', async () => {
  expect(ask('file', 'French', 'hi')).toBe('<progress>\nfile\n</progress>\n\n<native-language>French</native-language>\n\n<message>\nhi\n</message>')
  expect(ask('file', '', 'hi')).toBe('<progress>\nfile\n</progress>\n\n<message>\nhi\n</message>')
})

test('the native language setting reaches Haiku', { options: { nativeLanguage: ' French ' } }, async ($, on) => {
  on('session.id', () => ({ value: 'a' }))
  on('env.get', () => ({ value: '/home/t' }))
  on('clock.now', () => ({ value: 1000 }))
  on('clock.after', () => ({ value: undefined }))
  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => ({ value: PROGRESS }))
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  const prompt = new Promise(resolve =>
    on('model.complete', ($, e) => {
      resolve(e.prompt)
      return { value: { isAnswered: true, text: 'English tips: none', usage: USAGE } }
    }),
  )

  await $.prompt.submit({ text: 'i am doing effort', wait: true, origin: { kind: 'composer' } })
  expect(String(await prompt)).toContain('<native-language>French</native-language>')
})

const start = async (
  $: Parameters<TestBody>[0],
  on: Parameters<TestBody>[1],
  { asked, answer, save = value => ({ value }), isInteractive = true }: { asked?: boolean; answer: () => ToolCallResult; save?: (value: ConfigValue) => ConfigSetResult; isInteractive?: boolean },
) => {
  const events: unknown[] = []
  let afters = 0
  let settle: () => void = () => undefined
  let read: () => void = () => undefined
  const done = new Promise<void>(resolve => (settle = resolve))
  const checked = new Promise<void>(resolve => (read = resolve))
  on('session.id', () => ({ value: 'me' }))
  on('env.get', () => ({ value: '/home/t' }))
  on('clock.now', () => ({ value: 1000 }))
  on('clock.after', () => {
    afters += 1
    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'english' } }))
  on('store.keys', () => ({ value: [] }))
  on('store.get', (_$, e) => {
    if (e.key === 'native:asked') read()
    return { value: e.key === 'native:asked' ? asked : undefined }
  })
  on('store.set', (_$, e) => {
    events.push({ set: e.key })
    return { value: undefined }
  })
  on('tool.call', (_$, e) => {
    events.push({ ask: e.tool })
    return answer()
  })
  on('config.set', (_$, e) => {
    events.push({ config: e.key, value: e.value })
    settle()
    return save(e.value)
  })
  on('ui.log', (_$, e) => {
    events.push({ log: e.text })
    settle()
    return { value: undefined }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive })
  return { events, afters, done, checked }
}

const QUESTION = 'The English coach looks for the calques and false friends your native language brings. Which one is it?'
const answered = (value: string) => () => ({ result: { questions: [], answers: { [QUESTION]: value } } }) as ToolCallResult

test('the first interactive session asks once and saves the answer', async ($, on) => {
  const run = await start($, on, { answer: answered('French') })
  await run.done
  expect(run.events).toEqual([{ set: 'native:asked' }, { ask: 'AskUserQuestion' }, { config: 'english-coach.nativeLanguage', value: 'French' }])
})

test('a session after the question was asked does not ask again', async ($, on) => {
  const run = await start($, on, { asked: true, answer: answered('French') })
  await run.checked
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: false })
  expect(run.events).toEqual([])
})

test('a session with the setting filled does not schedule the question', { options: { nativeLanguage: 'French' } }, async ($, on) => {
  const run = await start($, on, { answer: answered('French') })
  expect(run.afters).toBe(1)
})

test('a non-interactive session does not schedule the question', async ($, on) => {
  const run = await start($, on, { isInteractive: false, answer: answered('French') })
  expect(run.afters).toBe(1)
})

test('a dismissed question is logged and saves nothing', async ($, on) => {
  const run = await start($, on, { answer: () => ({ deny: 'dismissed' }) })
  await run.done
  expect(run.events.length).toBe(3)
  expect(String((run.events[2] as { log: string }).log)).toContain('the native language was not asked')
})

test('a refused save is logged', async ($, on) => {
  const run = await start($, on, { answer: answered('French'), save: () => ({ deny: 'read-only' }) })
  await run.done
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: false })
  expect(run.events).toContainEqual({ log: 'the native language was not saved: read-only' })
})

test('the pane shows the setting hint only while it is empty', async ($, on) => {
  on('store.keys', () => ({ value: [] }))
  on('session.id', () => ({ value: 'a' }))
  const ui = await $.ui.mount({ plugin: 'english-coach', surface: 'terminal', component: 'Pane', requestId: 'english', props: PANE_PROPS })
  expect(await ui.find({ type: 'Markdown', text: HINT })).toBeDefined()
  await ui.unmount()
})

test('the pane has no hint once the setting is filled', { options: { nativeLanguage: 'French' } }, async ($, on) => {
  on('store.keys', () => ({ value: [] }))
  on('session.id', () => ({ value: 'a' }))
  const ui = await $.ui.mount({ plugin: 'english-coach', surface: 'terminal', component: 'Pane', requestId: 'english', props: PANE_PROPS })
  expect(await ui.find({ type: 'Markdown', text: HINT })).toBeUndefined()
  await ui.unmount()
})
