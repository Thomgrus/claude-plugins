import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Monthly, Tip, Turn } from '../types'
import { add, barChart, byDay, byMonth, day, merge, monthly, rawFrom, recent, row, table, totalsRow, ZERO } from './kpi'
import { ask, COACH, keepsSections, levelOf, PROGRESS_PATH, REVIEW, REVIEW_AFTER, reviewAsk, TEMPLATE, unwrap } from './rule'
import { cheer, countWords, splitTips } from './tips'

const PANE = 'english'
const COUNTED = ['composer', 'bridge']
const CUT = 8000

const revision = atom({ plugin: 'english-coach', key: 'revision' } as const, 0)
const check = atom({ plugin: 'english-coach', key: 'check' } as const, null)

let saving: Promise<unknown> = Promise.resolve()

async function progressPath($: Pick<EngineInterface, 'env'>) {
  const home = (await $.env.get('HOME')) || (await $.env.get('USERPROFILE'))
  if (!home) throw new Error('HOME is not set')
  return `${home}/${PROGRESS_PATH}`
}

const why = (reply: { reason: string; status?: number | null; error?: string }) =>
  reply.status === undefined ? reply.reason : `${reply.reason} ${reply.status ?? 'no response'} ${reply.error}`

const sessions = ($: Pick<EngineInterface, 'store'>, keys: string[]) =>
  Promise.all(keys.map(async key => ((await $.store.get(key)) ?? []) as Turn[]))

async function coach($: Pick<EngineInterface, 'model' | 'store' | 'state' | 'ui'>, id: number, session: string, progress: string, text: string) {
  const reply = await $.model.complete({ model: 'haiku', system: COACH, prompt: ask(progress, text), maxTokens: 600, effort: 'low', timeoutMs: 30000 })
  const tips = reply.isAnswered ? splitTips(reply.text)?.tips : undefined
  if (tips === undefined) {
    await update($, check, current => (current?.id === id ? null : current))
    $.ui.log(`the check failed (${reply.isAnswered ? `no tips list in the reply: ${JSON.stringify(reply.text.slice(0, 300))}` : why(reply)})`)
    return
  }
  await update($, check, current => (current?.id === id ? { id, tips } : current))
  const key = `session:${session}`
  const turn: Turn = { turnId: String(id), ts: id, words: countWords(text), level: levelOf(progress), tips }
  const append = saving.then(async () => $.store.set(key, [...(((await $.store.get(key)) ?? []) as Turn[]), turn]))
  saving = append.catch(() => undefined)
  await append.catch(error => $.ui.log(`the turn was not saved: ${String(error)}`))
  await update($, revision, n => n + 1)
}

async function review($: Pick<EngineInterface, 'model' | 'store' | 'clock' | 'env' | 'fs' | 'ui'>) {
  const since = ((await $.store.get('review:at')) ?? 0) as number
  const keys = (await $.store.keys()).filter(key => key.startsWith('session:'))
  const turns = (await sessions($, keys)).flat().filter(turn => turn.ts > since)
  if (turns.length < REVIEW_AFTER) return
  const path = await progressPath($)
  const progress = await $.fs.read(path)
  const reply = await $.model.complete({ model: 'sonnet', system: REVIEW, prompt: reviewAsk(progress, day(await $.clock.now()), turns), maxTokens: 4000, timeoutMs: 120000 })
  const file = reply.isAnswered ? unwrap(reply.text) : ''
  const cut = reply.isAnswered && reply.usage.output_tokens >= 4000
  if (!reply.isAnswered || cut || !keepsSections(progress, file)) {
    $.ui.log(`the progress review failed (${!reply.isAnswered ? why(reply) : cut ? 'the reply hit the token cap' : 'the reply lost a section'})`)
    return
  }
  if ((await $.fs.read(path)) !== progress) {
    $.ui.log('the progress review was dropped: progress.md changed meanwhile')
    return
  }
  await $.fs.write(path, `${file}\n`)
  await $.store
    .set('review:at', Math.max(...turns.map(turn => turn.ts)))
    .catch(error => $.ui.log(`progress.md was rewritten but review:at was not saved: ${String(error)}`))
}

async function rollUp($: Pick<EngineInterface, 'store' | 'clock' | 'session'>) {
  const before = rawFrom(await $.clock.now())
  const current = `session:${await $.session.id()}`
  const keys = (await $.store.keys()).filter(key => key.startsWith('session:') && key !== current)
  const lists = await sessions($, keys)
  for (const [i, key] of keys.entries()) {
    const turns = lists[i] ?? []
    const first = turns[0]
    if (first === undefined || turns.some(turn => turn.ts >= before)) continue
    await $.store.set(`rollup:${key.slice('session:'.length)}:${first.turnId}`, monthly(turns))
    await $.store.delete(key)
  }
}

function card({ Box, Text }: ReturnType<EngineInterface['ui']['resolve']>, tips: Tip[], text: string) {
  return tips.length === 0 ? (
    <Box flexDirection="row" gap={1} borderStyle="round" paddingX={1} marginTop={1}>
      <Text color="green" bold>✓ No English findings</Text>
      <Text dimColor>{cheer(text)}</Text>
    </Box>
  ) : (
    <Box flexDirection="column" borderStyle="round" paddingX={1} marginTop={1}>
      <Text bold>English tips · {tips.length}</Text>
      {tips.map(tip => (
        <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
          <Text color="red" strikethrough>{tip.wrong}</Text>
          <Text dimColor>→</Text>
          <Text color="green" bold>{tip.fix}</Text>
          {tip.category !== '' && <Text dimColor>[{tip.category}]</Text>}
          {tip.note !== '' && <Text dimColor italic>{tip.note}</Text>}
        </Box>
      ))}
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command
      .register({ name: 'english', description: 'Open the English coach pane', immediate: true })
      .catch(error => $.ui.log(`/english was not registered: ${String(error)}`))
    await update($, check, () => null).catch(error => $.ui.log(`the check band was not reset: ${String(error)}`))
    $.clock.after(0, () => review($).catch(error => $.ui.log(`the progress review failed: ${String(error)}`)))
    await rollUp($).catch(error => $.ui.log(`the roll-up failed: ${String(error)}`))
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const result = await next(e)
    if (!COUNTED.includes(e.origin.kind) || result.drop !== undefined) return result
    await (async () => {
      const path = await progressPath($)
      if (!(await $.fs.exists(path))) await $.fs.write(path, TEMPLATE)
      const progress = await $.fs.read(path)
      const [id, session] = await Promise.all([$.clock.now(), $.session.id()])
      const text = e.text.slice(0, CUT).replace(/[\uD800-\uDBFF]$/, '')
      await update($, check, () => ({ id, tips: null }))
      $.clock.after(0, () =>
        coach($, id, session, progress, text).catch(async error => {
          $.ui.log(`the check failed: ${String(error)}`)
          await update($, check, current => (current?.id === id && current.tips === null ? null : current)).catch(cleared =>
            $.ui.log(`the check band was not cleared: ${String(cleared)}`),
          )
        }),
      )
    })().catch(error => $.ui.log(`the coach did not start: ${String(error)}`))
    return result
  })

  on('command.run', { command: 'english' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: 'English coach' })
    return opened.isPlaced ? {} : { text: `the pane could not open (${opened.reason})` }
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const split = splitTips(e.props.text)
    if (!split) return next(e)

    const ui = $.ui.resolve(e)
    const { Box, Markdown } = ui
    const body = split.body === '' ? null : await next({ ...e, props: { ...e.props, text: split.body } })

    return (
      <Box flexDirection="column">
        {body}
        {card(ui, split.tips, split.body)}
        {split.tail !== '' && <Markdown text={split.tail} />}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, check)
    if (current === null || e.props.hasSurvey) return next(e)
    const ui = $.ui.resolve(e)
    const { Box, Text } = ui
    const theirs = await next(e)
    return (
      <Box flexDirection="column">
        {theirs}
        {current.tips === null ? (
          <Box borderStyle="round" paddingX={1}>
            <Text dimColor>English coach · checking your message…</Text>
          </Box>
        ) : (
          card(ui, current.tips, String(current.id))
        )}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    await read($, revision)
    const keys = await $.store.keys()
    const sessionKeys = keys.filter(key => key.startsWith('session:'))
    const [turns, rollups, id] = await Promise.all([
      sessions($, sessionKeys),
      Promise.all(keys.filter(key => key.startsWith('rollup:')).map(async key => ((await $.store.get(key)) ?? {}) as Monthly)),
      $.session.id(),
    ])
    const all = turns.flat().sort((x, y) => x.ts - y.ts)
    const months = merge([...rollups, monthly(all)])
    const mine = turns[sessionKeys.indexOf(`session:${id}`)] ?? []

    const section = (title: string, body: string) => `**${title}**\n\n${body || '_No turns yet._'}`
    const summary = table([totalsRow('All sessions', Object.values(months).reduce(add, ZERO)), row('This session', mine)])
    const days = byDay(all)
    const monthRows = byMonth(months)
    const daily = section('By day', days.length === 0 ? '' : table(days))
    const perMonth = section('By month', monthRows.length === 0 ? '' : table(monthRows))
    const latest = section('Recent turns', recent(all))

    const ui = $.ui.resolve(e)
    const { Box, Markdown } = ui
    return (
      <Box flexDirection="column" gap={1}>
        <Markdown text={summary} />
        {e.surface !== 'terminal' && 'Svg' in ui && <ui.Svg source={barChart(all)} alt={`Findings per turn for the last ${Math.min(all.length, 30)} turns`} />}
        <Markdown text={daily} />
        <Markdown text={perMonth} />
        <Markdown text={latest} />
      </Box>
    )
  })
}
