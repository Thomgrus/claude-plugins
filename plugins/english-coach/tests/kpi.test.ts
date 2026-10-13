import { expect, test } from 'claude-code/testing'

import type { Turn } from '../types'
import { byDay, row } from '../hooks/kpi'

const tip = { wrong: 'a', fix: 'b', note: '', category: 'other' }
const turns: Turn[] = [
  { turnId: 't1', ts: new Date(2026, 9, 6, 10).getTime(), words: 20, level: 1, tips: [tip, tip] },
  { turnId: 't2', ts: new Date(2026, 9, 7, 10).getTime(), words: 30, level: 1, tips: [] },
  { turnId: 't3', ts: new Date(2026, 9, 7, 11).getTime(), words: 50, level: 2, tips: [tip] },
]

test('row computes findings per turn, errors per 100 words and clean rate', async () => {
  expect(row('All', turns)).toBe('| All | 3 | 1.00 | 3.0 | 33% | 100 |')
  expect(row('None', [])).toBe('| None | 0 | – | – | – | 0 |')
})

test('byDay lists newest day first with its highest level', async () => {
  expect(byDay(turns)).toEqual(['| 2026-10-07 · L2 | 2 | 0.50 | 1.3 | 50% | 80 |', '| 2026-10-06 · L1 | 1 | 2.00 | 10.0 | 0% | 20 |'])
})
