import { expect, test } from 'claude-code/testing'

const REPLY = [
  'Done.',
  '',
  'English tips:',
  '- "in his repo" → "in its repo" [pronoun]',
  `- "i'm happy" → "I'm happy" [capitalization]`,
  '',
  'Ganbatte!',
].join('\n')

test('the tips card validates on desktop and terminal', async ($, on) => {
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    const { Markdown } = $.ui.resolve(e)
    return <Markdown text={e.props.text} />
  })
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({
      plugin: 'english-coach',
      surface,
      component: 'AssistantMessage',
      props: { text: REPLY, isFirstOfReply: true },
    })
    expect(await ui.find({ type: 'Text', text: "I'm happy" })).toBeDefined()
    expect(await ui.find({ type: 'Markdown', text: 'Done.' })).toBeDefined()
    expect(await ui.find({ type: 'Markdown', text: 'Ganbatte!' })).toBeDefined()
    await ui.unmount()
  }
})

test('the pane draws history from every session on desktop', async ($, on) => {
  const turn = { turnId: 't1', ts: Date.UTC(2026, 9, 7), words: 10, level: 1, tips: [{ wrong: 'doing effort', fix: 'making an effort', note: '', category: 'calque' }] }
  on('store.keys', () => ({ value: ['session:a', 'session:b', 'other'] }))
  on('store.get', () => ({ value: [turn] }))
  on('session.id', () => ({ value: 'a' }))
  on('session.cwd', () => ({ value: '/w' }))
  const ui = await $.ui.mount({
    plugin: 'english-coach',
    surface: 'desktop',
    component: 'Pane',
    requestId: 'english',
    props: { title: 'English coach', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  })
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  expect(await ui.find({ type: 'Markdown', text: '| All sessions | 2 | 1.00 | 10.0 | 0% | 20 |' })).toBeDefined()
  await ui.unmount()
})

const PANE_PROPS = { title: 'English coach', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as const

test('the pane has a Close button on desktop that closes it', async ($, on) => {
  on('store.keys', () => ({ value: [] }))
  on('store.get', () => ({ value: undefined }))
  on('session.id', () => ({ value: 'a' }))
  on('session.cwd', () => ({ value: '/w' }))
  const closed: string[] = []
  on('ui.close', ($, e) => {
    closed.push(e.id)
    return { value: undefined }
  })
  const ui = await $.ui.mount({ plugin: 'english-coach', surface: 'desktop', component: 'Pane', requestId: 'english', props: PANE_PROPS })
  const button = await ui.find({ type: 'Button', text: 'Close' })
  expect(button?.props.role).toBe('dismiss')
  await ui.press({ key: button?.key ?? '' })
  expect(closed).toEqual(['english'])
  await ui.unmount()
})

test('the pane has no Close button on the terminal', async ($, on) => {
  on('store.keys', () => ({ value: [] }))
  on('store.get', () => ({ value: undefined }))
  on('session.id', () => ({ value: 'a' }))
  on('session.cwd', () => ({ value: '/w' }))
  const ui = await $.ui.mount({ plugin: 'english-coach', surface: 'terminal', component: 'Pane', requestId: 'english', props: PANE_PROPS })
  expect(await ui.find({ type: 'Markdown', text: 'All sessions' })).toBeDefined()
  expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
  await ui.unmount()
})

test('a refused close is logged and the press does not throw', async ($, on) => {
  on('store.keys', () => ({ value: [] }))
  on('store.get', () => ({ value: undefined }))
  on('session.id', () => ({ value: 'a' }))
  on('session.cwd', () => ({ value: '/w' }))
  on('ui.close', () => ({ deny: 'kept open' }))
  const logged = new Promise<string>(resolve =>
    on('ui.log', ($, e) => {
      resolve(e.text)
      return { value: undefined }
    }),
  )
  const ui = await $.ui.mount({ plugin: 'english-coach', surface: 'desktop', component: 'Pane', requestId: 'english', props: PANE_PROPS })
  const button = await ui.find({ type: 'Button', text: 'Close' })
  await ui.press({ key: button?.key ?? '' })
  expect(await logged).toContain('the pane was not closed')
  await ui.unmount()
})

test('the band shows the coach tips above the prompt', async ($, on) => {
  on('session.id', () => ({ value: 'a' }))
  on('session.cwd', () => ({ value: '/w' }))
  on('env.get', () => ({ value: '/home/t' }))
  on('clock.now', () => ({ value: 1000 }))
  on('clock.after', () => ({ value: undefined }))
  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => ({ value: '' }))
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))
  on('model.complete', () => ({
    value: {
      isAnswered: true,
      text: 'English tips:\n- "doing effort" → "making an effort" [calque]',
      usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    },
  }))
  on('store.get', () => ({ value: undefined }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  const saved = new Promise(resolve =>
    on('store.set', () => {
      resolve(undefined)
      return { value: undefined }
    }),
  )

  await $.prompt.submit({ text: 'i am doing effort', wait: true, origin: { kind: 'composer' } })
  await saved
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({
      plugin: 'english-coach',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
    })
    expect(await ui.find({ type: 'Text', text: 'making an effort' })).toBeDefined()
    await ui.unmount()
  }
})

test('a message with nothing left to check clears the band of the previous one', async ($, on) => {
  on('session.id', () => ({ value: 'a' }))
  on('session.cwd', () => ({ value: '/w' }))
  on('env.get', () => ({ value: '/home/t' }))
  on('clock.now', () => ({ value: 1000 }))
  on('clock.after', () => ({ value: undefined }))
  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => ({ value: '' }))
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))
  on('model.complete', () => ({
    value: {
      isAnswered: true,
      text: 'English tips:\n- "doing effort" → "making an effort" [calque]',
      usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    },
  }))
  on('store.get', () => ({ value: undefined }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  const saved = new Promise(resolve =>
    on('store.set', () => {
      resolve(undefined)
      return { value: undefined }
    }),
  )
  const props = { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} } as const

  await $.prompt.submit({ text: 'i am doing effort', wait: true, origin: { kind: 'composer' } })
  await saved
  const before = await $.ui.mount({ plugin: 'english-coach', surface: 'terminal', component: 'AbovePrompt', props })
  expect(await before.find({ type: 'Text', text: 'making an effort' })).toBeDefined()
  await before.unmount()

  await $.prompt.submit({ text: '> i have buy your product\n```\nfix: the bug who make crash\n```', wait: true, origin: { kind: 'composer' } })
  const after = await $.ui.mount({ plugin: 'english-coach', surface: 'terminal', component: 'AbovePrompt', props })
  expect(await after.find({ type: 'Text', text: 'making an effort' })).toBeUndefined()
  await after.unmount()
})

test('Hide dismisses the band on the surface that pressed it until the next message', async ($, on) => {
  let now = 1000
  on('session.id', () => ({ value: 'a' }))
  on('session.cwd', () => ({ value: '/w' }))
  on('env.get', () => ({ value: '/home/t' }))
  on('clock.now', () => ({ value: now++ }))
  on('clock.after', () => ({ value: undefined }))
  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => ({ value: '' }))
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))
  on('model.complete', () => ({
    value: {
      isAnswered: true,
      text: 'English tips:\n- "doing effort" → "making an effort" [calque]',
      usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    },
  }))
  on('store.get', () => ({ value: undefined }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  let saves = 0
  let onSave = () => {}
  on('store.set', () => {
    saves++
    onSave()
    return { value: undefined }
  })
  const savedCount = (n: number) => new Promise<void>(resolve => (saves >= n ? resolve() : (onSave = () => saves >= n && resolve())))
  const props = { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} } as const
  const mount = (surface: 'desktop' | 'terminal') => $.ui.mount({ plugin: 'english-coach', surface, component: 'AbovePrompt', props })

  await $.prompt.submit({ text: 'i am doing effort', wait: true, origin: { kind: 'composer' } })
  await savedCount(1)

  const terminal = await mount('terminal')
  expect(await terminal.find({ type: 'Text', text: 'making an effort' })).toBeDefined()
  expect(await terminal.findAll({ type: 'Button' })).toHaveLength(0)
  await terminal.unmount()

  const desktop = await mount('desktop')
  const hide = await desktop.find({ type: 'Button', text: 'Hide' })
  expect(hide?.props.role).toBe('dismiss')
  await desktop.press({ key: hide?.key ?? '' })
  expect(await desktop.find({ type: 'Button', text: 'Hide' })).toBeUndefined()
  await desktop.unmount()

  const hidden = await mount('desktop')
  expect(await hidden.find({ type: 'Text', text: 'making an effort' })).toBeUndefined()
  await hidden.unmount()

  const kept = await mount('terminal')
  expect(await kept.find({ type: 'Text', text: 'making an effort' })).toBeDefined()
  await kept.unmount()

  await $.prompt.submit({ text: 'i am doing effort again', wait: true, origin: { kind: 'composer' } })
  await savedCount(2)
  const next = await mount('desktop')
  expect(await next.find({ type: 'Text', text: 'making an effort' })).toBeDefined()
  expect(await next.find({ type: 'Button', text: 'Hide' })).toBeDefined()
  await next.unmount()
})

test('the tips card under a reply has no Hide button', async ($, on) => {
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    const { Markdown } = $.ui.resolve(e)
    return <Markdown text={e.props.text} />
  })
  const ui = await $.ui.mount({ plugin: 'english-coach', surface: 'desktop', component: 'AssistantMessage', props: { text: REPLY, isFirstOfReply: true } })
  expect(await ui.find({ type: 'Text', text: "I'm happy" })).toBeDefined()
  expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
  await ui.unmount()
})
