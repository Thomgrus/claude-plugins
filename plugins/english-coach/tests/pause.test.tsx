import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const USAGE = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
const TIPS = 'English tips:\n- "doing effort" → "making an effort" [calque]'
const PROGRESS = '# English progress\n\n## Current tip level: 2 (Natural phrasing)\n'
const PANE_PROPS = { title: 'English coach', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as const
const BAND_PROPS = { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} } as const
const STATUS = 'English coach paused in this project · /english resume'
const HINT = '**Paused in this project.** Your messages here are not checked or counted. Run `/english resume` to start again.'
const CHECKING = 'English coach · checking your message…'

const project = (on: Parameters<TestBody>[1], { git, paused = false }: { git?: string; paused?: boolean } = {}) => {
  const store = new Map<string, unknown>(paused ? [['paused:/w', true]] : [])
  const statuses: (string | undefined)[] = []
  on('session.id', () => ({ value: 'a' }))
  on('session.cwd', () => ({ value: '/w' }))
  on('env.get', () => ({ value: '/home/t' }))
  on('fs.exists', () => ({ value: true }))
  on('fs.read', (_$, e) => {
    if (e.path !== '/w/.git') return { value: PROGRESS }
    if (git === undefined) throw new Error('EISDIR')
    return { value: git }
  })
  on('store.get', (_$, e) => ({ value: store.get(e.key) as never }))
  on('store.set', (_$, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  on('store.delete', (_$, e) => {
    store.delete(e.key)
    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...store.keys()] }))
  on('ui.status', (_$, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  return { store, statuses }
}

const english = ($: Parameters<TestBody>[0], args: string) =>
  $.command.run({ command: 'english', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })

test('/english pause stores the project key and sets the status, /english resume clears both', async ($, on) => {
  const { store, statuses } = project(on)

  const paused = await english($, 'pause')
  expect(paused.text).toContain('English coach paused in this project')
  expect([...store]).toEqual([['paused:/w', true]])
  expect(statuses).toEqual([STATUS])

  const resumed = await english($, ' Resume ')
  expect(resumed.text).toContain('English coach resumed in this project')
  expect([...store]).toEqual([])
  expect(statuses).toEqual([STATUS, undefined])
})

test('another argument returns the usage line and changes nothing', async ($, on) => {
  const { store, statuses } = project(on)

  const run = await english($, 'stop')
  expect(run.text).toBe('Usage: `/english` opens the pane, `/english pause` stops the checks in this project, `/english resume` starts them again.')
  expect([...store]).toEqual([])
  expect(statuses).toEqual([])
})

test('in a worktree the pause is keyed by the main checkout', async ($, on) => {
  const { store } = project(on, { git: 'gitdir: /main/.git/worktrees/x\n' })

  await english($, 'pause')
  expect([...store.keys()]).toEqual(['paused:/main'])
})

test('a paused project sends nothing to Haiku and stores no turn', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  const { store } = project(on, { paused: true })
  let calls = 0
  on('model.complete', () => {
    calls += 1
    return { value: { isAnswered: true, text: TIPS, usage: USAGE } }
  })
  on('prompt.submit', (_$, e) => ({ text: e.text, context: e.context }))

  await $.prompt.submit({ text: 'i am doing effort', wait: true, origin: { kind: 'composer' } })
  await clock.settle()
  expect(calls).toBe(0)
  expect([...store.keys()]).toEqual(['paused:/w'])
})

test('a check that ends after the project was paused stores no turn and clears its band', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  const { store } = project(on)
  on('model.complete', async () => {
    await clock.sleep(100)
    return { value: { isAnswered: true, text: TIPS, usage: USAGE } }
  })
  on('prompt.submit', (_$, e) => ({ text: e.text, context: e.context }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  await $.prompt.submit({ text: 'i am doing effort', wait: true, origin: { kind: 'composer' } })
  await clock.settle()
  const checking = await $.ui.mount({ plugin: 'english-coach', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })
  expect(await checking.find({ type: 'Text', text: CHECKING })).toBeDefined()
  await checking.unmount()

  store.set('paused:/w', true)
  await clock.advance(100)
  expect([...store.keys()]).toEqual(['paused:/w'])
  const band = await $.ui.mount({ plugin: 'english-coach', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })
  expect(await band.find({ type: 'Text', text: CHECKING })).toBeUndefined()
  expect(await band.find({ type: 'Text', text: 'making an effort' })).toBeUndefined()
  await band.unmount()
})

const start = async ($: Parameters<TestBody>[0], on: Parameters<TestBody>[1]) => {
  mock.clock(on, { now: 1000 })
  on('command.register', () => ({ value: { command: 'english' } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: false })
}

test('a session that starts in a paused project sets the status', { options: { nativeLanguage: 'French' } }, async ($, on) => {
  const { statuses } = project(on, { paused: true })

  await start($, on)
  expect(statuses).toEqual([STATUS])
})

test('a failed read of the pause state at session start is logged', { options: { nativeLanguage: 'French' } }, async ($, on) => {
  const logs: string[] = []
  on('session.id', () => ({ value: 'a' }))
  on('session.cwd', () => ({ value: '/w' }))
  on('fs.read', () => {
    throw new Error('EISDIR')
  })
  on('store.keys', () => ({ value: [] }))
  on('ui.log', (_$, e) => {
    logs.push(e.text)
    return { value: undefined }
  })

  await start($, on)
  expect(logs.filter(line => line.startsWith('the pause state was not read: ')).length).toBe(1)
})

test('the pane shows the paused hint only while the project is paused', { options: { nativeLanguage: 'French' } }, async ($, on) => {
  const { store } = project(on, { paused: true })

  const paused = await $.ui.mount({ plugin: 'english-coach', surface: 'terminal', component: 'Pane', requestId: 'english', props: PANE_PROPS })
  expect(await paused.find({ type: 'Markdown', text: HINT })).toBeDefined()
  await paused.unmount()

  store.delete('paused:/w')
  const resumed = await $.ui.mount({ plugin: 'english-coach', surface: 'terminal', component: 'Pane', requestId: 'english', props: PANE_PROPS })
  expect(await resumed.find({ type: 'Markdown', text: HINT })).toBeUndefined()
  await resumed.unmount()
})
