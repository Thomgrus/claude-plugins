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

test('the band shows the coach tips above the prompt', async ($, on) => {
  on('session.id', () => ({ value: 'a' }))
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
