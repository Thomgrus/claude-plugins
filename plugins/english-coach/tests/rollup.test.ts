import { expect, test } from 'claude-code/testing'

import type { Turn } from '../types'
import { byMonth, monthly, rawFrom } from '../hooks/kpi'

const tip = { wrong: 'a', fix: 'b', note: '', category: 'other' }
const turn = (turnId: string, month: number, day: number, tips: number): Turn => ({
  turnId,
  ts: Date.UTC(2026, month - 1, day, 10),
  words: 10,
  level: 1,
  tips: Array(tips).fill(tip),
})

test('rawFrom is the first day of the previous month, across a year', async () => {
  expect(rawFrom(Date.UTC(2026, 9, 7, 12))).toBe(Date.UTC(2026, 8, 1))
  expect(rawFrom(Date.UTC(2027, 0, 15))).toBe(Date.UTC(2026, 11, 1))
})

test('monthly totals feed the by-month rows, newest first', async () => {
  const months = monthly([turn('a', 7, 30, 2), turn('b', 8, 1, 0), turn('c', 8, 2, 1)])
  expect(months).toEqual({
    '2026-07': { turns: 1, findings: 2, words: 10, clean: 0, level: 1 },
    '2026-08': { turns: 2, findings: 1, words: 20, clean: 1, level: 1 },
  })
  expect(byMonth(months)).toEqual(['| 2026-08 · L1 | 2 | 0.50 | 5.0 | 50% | 20 |', '| 2026-07 · L1 | 1 | 2.00 | 20.0 | 0% | 10 |'])
})

test('session start rolls up other sessions older than last month and keeps the rest raw', async ($, on) => {
  const store: Record<string, unknown> = {
    'session:old': [turn('o1', 7, 30, 2), turn('o2', 8, 1, 0)],
    'session:mixed': [turn('m1', 8, 31, 1), turn('m2', 9, 1, 0)],
    'session:me': [turn('s1', 6, 1, 1)],
  }
  on('session.id', () => ({ value: 'me' }))
  on('clock.now', () => ({ value: Date.UTC(2026, 9, 8) }))
  on('command.register', () => ({ value: { command: 'english' } }))
  on('store.keys', () => ({ value: Object.keys(store) }))
  on('store.get', (_$, e) => ({ value: store[e.key] }))
  on('store.set', (_$, e) => {
    store[e.key] = e.value
    return { value: undefined }
  })
  on('store.delete', (_$, e) => {
    delete store[e.key]
    return { value: undefined }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  expect(Object.keys(store).sort()).toEqual(['rollup:old:o1', 'session:me', 'session:mixed'])
  expect(store['rollup:old:o1']).toEqual({
    '2026-07': { turns: 1, findings: 2, words: 10, clean: 0, level: 1 },
    '2026-08': { turns: 1, findings: 0, words: 10, clean: 1, level: 1 },
  })
})
