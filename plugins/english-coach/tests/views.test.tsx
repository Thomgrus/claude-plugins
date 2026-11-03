import { expect, test } from 'claude-code/testing'

const PANE_PROPS = { title: 'English coach', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as const
const NOW = new Date(2026, 9, 7, 22, 30).getTime()
const ROLLED = {
  '2026-07': { turns: 1, findings: 2, words: 10, clean: 0, level: 1 },
  '2026-08': { turns: 3, findings: 0, words: 30, clean: 3, level: 2 },
}
const turn = (turnId: string, ts: number, wrong: string) => ({ turnId, ts, words: 10, level: 1, tips: [{ wrong, fix: 'fixed', note: '', category: '' }] })

test('the strip names the highest level of the latest month when every turn is rolled up', async ($, on) => {
  on('store.keys', () => ({ value: ['rollup:old:o1'] }))
  on('store.get', ($, e) => ({ value: e.key === 'rollup:old:o1' ? ROLLED : undefined }))
  on('session.id', () => ({ value: 'a' }))
  on('session.cwd', () => ({ value: '/w' }))
  const ui = await $.ui.mount({ plugin: 'english-coach', surface: 'desktop', component: 'Pane', requestId: 'english', props: PANE_PROPS })
  expect(await ui.find({ type: 'Text', text: 'Level 2' })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: 'highest in' }))?.text).toBe('Natural phrasing · highest in Aug 2026')
  expect(await ui.find({ type: 'Text', text: 'older months keep totals only' })).toBeDefined()
  await ui.unmount()
})

test('the tips of other sessions come after this session under a marker', async ($, on) => {
  const store: Record<string, unknown> = {
    'session:a': [turn('m1', NOW - 7_200_000, 'mine wrong')],
    'session:b': [turn('o1', NOW - 3_600_000, 'other wrong')],
  }
  on('store.keys', () => ({ value: Object.keys(store) }))
  on('store.get', ($, e) => ({ value: store[e.key] }))
  on('session.id', () => ({ value: 'a' }))
  on('session.cwd', () => ({ value: '/w' }))
  on('clock.now', () => ({ value: NOW }))
  on('clock.after', () => ({ value: undefined }))
  const ui = await $.ui.mount({ plugin: 'english-coach', surface: 'desktop', component: 'Pane', requestId: 'english', props: PANE_PROPS })
  const tips = await ui.find({ type: 'Button', text: 'Tips' })
  await ui.press({ key: tips?.key ?? '' })
  const texts = (await ui.findAll({ type: 'Text' })).map(node => node.text)
  expect(texts.filter(text => ['mine wrong', 'Other sessions', 'other wrong'].includes(text))).toEqual(['mine wrong', 'Other sessions', 'other wrong'])
  await ui.unmount()
})

test('the tips view waits until midnight to refresh', async ($, on) => {
  on('store.keys', () => ({ value: ['session:a'] }))
  on('store.get', () => ({ value: [turn('m1', NOW - 3_600_000, 'mine wrong')] }))
  on('session.id', () => ({ value: 'a' }))
  on('session.cwd', () => ({ value: '/w' }))
  on('clock.now', () => ({ value: NOW }))
  const waits: number[] = []
  on('clock.after', ($, e) => {
    waits.push(e.ms)
    return { value: undefined }
  })
  const ui = await $.ui.mount({ plugin: 'english-coach', surface: 'desktop', component: 'Pane', requestId: 'english', props: PANE_PROPS })
  expect(waits).toEqual([])
  const tips = await ui.find({ type: 'Button', text: 'Tips' })
  await ui.press({ key: tips?.key ?? '' })
  expect(await ui.find({ type: 'Text', text: 'mine wrong' })).toBeDefined()
  expect(waits).toContain(90 * 60 * 1000)
  await ui.unmount()
})
