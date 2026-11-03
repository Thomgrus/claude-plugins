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

test('splitTips reads a bullet whose fix is an unquoted no-change phrase as a clean message', async () => {
  for (const bullet of [
    '- "Run the linter and fix whatever it reports, but don\'t touch the generated files in `src/gen/`." → none',
    '- "I\'ve been working on this migration for two days and I\'m still not sure the rollback works." → no big mistake [none] ',
    '- "Can you add a retry with exponential backoff to the HTTP client? Three attempts should be enough." → no big mistake',
    '- "Run `npm run test:e2e -- --grep "login flow"` and tell me which specs fail." → (no mistake)',
  ]) {
    expect(splitTips(`English tips:\n${bullet}`)).toEqual({ body: '', tips: [], tail: '' })
  }
})

test('splitTips skips a no-change bullet and keeps the real tip after it', async () => {
  const text = ['English tips:', '- "Can you add a test for the edge case?" → fine, no tip', '- "the file exist" → "the file exists" [verb-form]'].join('\n')
  expect(splitTips(text)?.tips).toEqual([{ wrong: 'the file exist', fix: 'the file exists', note: '', category: 'verb-form' }])
})

test('splitTips still refuses a bullet whose unquoted fix is not a no-change phrase', async () => {
  expect(splitTips('English tips:\n- "x" → rewrite it')).toBeNull()
})

test('stripPasted removes a fence inside a list item, however deep it is indented', async () => {
  expect(stripPasted('my steps:\n1. run it\n    ```sh\n    npm test\n    ```\n2. it fail')).toBe('my steps:\n1. run it\n2. it fail')
  expect(stripPasted('see:\n- the log\n      ```\n      boom\n      ```\nit crash')).toBe('see:\n- the log\nit crash')
})

test('stripPasted closes a fence only on a marker at least as long as the one that opened it', async () => {
  expect(stripPasted('````md\n```\ninner\n```\nstill fenced\n````\nafter')).toBe('after')
})

test('splitTips does not read a bullet that quotes a fix after a no-change word as unchanged', async () => {
  for (const bullet of ['- "a b" → ok, but use "c d"', '- "a b" → correct form is "c d"', '- "a b" → none of these, say "c d"']) {
    expect(splitTips(`English tips:\n${bullet}`)).toBeNull()
  }
})

test('countWords counts words in any script and skips punctuation and numbers', async () => {
  expect(countWords('Привет, как дела?')).toBe(3)
  expect(countWords('— 42 !')).toBe(0)
})
