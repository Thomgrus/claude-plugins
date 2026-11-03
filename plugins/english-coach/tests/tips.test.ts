import { expect, test } from 'claude-code/testing'

import { countWords, splitTips, stripPasted } from '../hooks/tips'

test('stripPasted removes blockquote lines, nested and indented ones included', async () => {
  expect(stripPasted('The customer wrote:\n> i have buy your product\n  > > since three month\nCan you answer?')).toBe('The customer wrote:\nCan you answer?')
})

test('stripPasted removes fenced blocks of backticks and tildes, and keeps inline code', async () => {
  const text = ['Fix `parse` please.', '```ts', '// the user have rights', '```', '', '', 'Then:', '~~~', 'Erreur : fichier introuvable', '```', 'still inside', '~~~', 'Thanks.'].join('\n')
  expect(stripPasted(text)).toBe('Fix `parse` please.\n\nThen:\nThanks.')
})

test('stripPasted runs an unclosed fence to the end of the message', async () => {
  expect(stripPasted('Here is the log:\n```\nerror who make crash\nmore')).toBe('Here is the log:')
})

test('stripPasted leaves nothing of a message that is only a fence', async () => {
  expect(stripPasted('```\nfix: correct the bug who make crash\n```\n')).toBe('')
  expect(countWords(stripPasted('```\nfix: correct the bug who make crash\n```\n'))).toBe(0)
})

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

test('splitTips drops a tip whose fix is the same sentence and keeps the others', async () => {
  const split = splitTips(
    ['English tips:', '- "Bump the version." → " Bump the version. " [none]', '- "human on the loop" → "human in the loop" [preposition]'].join('\n'),
  )
  expect(split?.tips).toEqual([{ wrong: 'human on the loop', fix: 'human in the loop', note: '', category: 'preposition' }])
})

test('splitTips reads a list of only same-sentence tips like a none line', async () => {
  const text = ['Done.', '', 'English tips:', '- "It works." → "It works." [none]', '- "Ship it." → "Ship it." [none]', '', 'Bye.'].join('\n')
  expect(splitTips(text)).toEqual({ body: 'Done.', tips: [], tail: 'Bye.' })
  expect(splitTips('Done.\n\nEnglish tips: none\n\nBye.')).toEqual({ body: 'Done.', tips: [], tail: 'Bye.' })
})
