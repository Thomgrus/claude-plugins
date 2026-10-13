import { expect, test } from 'claude-code/testing'

import { countWords, splitTips } from '../hooks/tips'

test('splitTips reads tips with category and note', async () => {
  const split = splitTips(
    ['Done.', '', 'English tips:', '- "doing effort" → "making an effort" [calque] French "faire"', '- "i" → "I" [capitalization]', '', 'Ganbatte!'].join('\n'),
  )
  expect(split?.body).toBe('Done.')
  expect(split?.tail).toBe('Ganbatte!')
  expect(split?.tips).toEqual([
    { wrong: 'doing effort', fix: 'making an effort', note: 'French "faire"', category: 'calque' },
    { wrong: 'i', fix: 'I', note: '', category: 'capitalization' },
  ])
})

test('splitTips accepts a bold header and tips without category', async () => {
  const split = splitTips(['Ok.', '**English tips:**', '- "stats ?" -> "stats?"'].join('\n'))
  expect(split?.tips).toEqual([{ wrong: 'stats ?', fix: 'stats?', note: '', category: '' }])
})

test('splitTips returns null without tips', async () => {
  expect(splitTips('All good.')).toBeNull()
  expect(splitTips('English tips:\n\nNothing to fix.')).toBeNull()
})

test('splitTips skips a tip line it cannot read and keeps the others', async () => {
  const split = splitTips(
    ['English tips:', '- "Ok n\'oublions pas" → write it in English, e.g. "Let\'s not forget" [other]', '- "human on the loop" → "human in the loop" [preposition]'].join('\n'),
  )
  expect(split?.tips).toEqual([{ wrong: 'human on the loop', fix: 'human in the loop', note: '', category: 'preposition' }])
  expect(splitTips('English tips:\n- "Ok n\'oublions pas" → write it in English')).toBeNull()
})

test('countWords skips code, inline code and links', async () => {
  expect(countWords('Run `npm test` then\n```\nls -la\n```\nsee https://example.com now 42')).toBe(4)
})

test('splitTips reads a none line as a clean message, in its common spellings', async () => {
  for (const line of ['English tips: none', '**English tips:** none', 'English tips: (none)', '`English tips: none` — all good']) {
    expect(splitTips(`Done.\n${line}`)?.tips).toEqual([])
  }
})

test('splitTips ignores a tips list inside a code fence', async () => {
  const fenced = ['```', 'English tips:', '- "a" → "b"', '```'].join('\n')
  expect(splitTips(fenced)).toBeNull()
  expect(splitTips(`${fenced}\nEnglish tips:\n- "c" → "d"`)?.tips).toEqual([{ wrong: 'c', fix: 'd', note: '', category: '' }])
})
