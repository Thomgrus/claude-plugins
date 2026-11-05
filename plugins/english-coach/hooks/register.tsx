import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderNode, Timer } from 'claude-code'

import type { Monthly, Tip, Totals, Turn, View } from '../types'
import {
  add,
  barChart,
  byDay,
  byMonth,
  categories,
  day,
  dayCount,
  dayLabel,
  dayRows,
  levelChange,
  merge,
  month,
  monthLabel,
  monthly,
  monthRows,
  nextDay,
  rates,
  rateTable,
  rawFrom,
  recent,
  repeats,
  row,
  table,
  totalsOf,
  totalsRow,
  when,
  ZERO,
} from './kpi'
import { ask, COACH, keepsSections, levelOf, PROGRESS_PATH, REVIEW, REVIEW_AFTER, reviewAsk, TEMPLATE, unwrap } from './rule'
import { cheer, countWords, splitTips, stripPasted } from './tips'

const PANE = 'english'
const COUNTED = ['composer', 'bridge']
const CUT = 8000
const NATIVE_KEY = 'english-coach.nativeLanguage'
const NATIVE_STORE = 'native'
const NATIVE_QUESTION = 'The English coach looks for the calques and false friends your native language brings. Which one is it?'
const NATIVE_HINT = '_Set `english-coach.nativeLanguage` in `/config`: the coach then looks for the calques and false friends your native language brings._'
const WORKTREE = /^gitdir:\s*(.+)\/\.git\/worktrees\/[^/]+\s*$/m
const PAUSED_STATUS = 'English coach paused in this project · /english resume'
const PAUSED_HINT = '**Paused in this project.** Your messages here are not checked or counted. Run `/english resume` to start again.'
const PAUSED_NOTE = 'Your messages here are not checked or counted. Run /english resume to start again.'
const NATIVE_NOTE = 'Set it in Customize › Plugins › english-coach › Settings: the coach then looks for the calques and false friends your native language brings.'
const ROLLED_NOTE = 'No recent turns: older months keep totals only, see History.'
const LEVELS = ['', 'Basics', 'Natural phrasing', 'Nuance']
const VIEWS = [
  ['overview', 'Overview', 'o'],
  ['tips', 'Tips', 't'],
  ['history', 'History', 'h'],
] as const
const USAGE = 'Usage: `/english` opens the pane, `/english pause` stops the checks in this project, `/english resume` starts them again, `/english native <language>` sets your native language and `/english native` clears it.'

const revision = atom({ plugin: 'english-coach', key: 'revision' } as const, 0)
const check = atom({ plugin: 'english-coach', key: 'check' } as const, null)
const view = atom({ plugin: 'english-coach', key: 'view' } as const, 'overview' as View)

let saving: Promise<unknown> = Promise.resolve()
let midnight: Timer | undefined

async function progressPath($: Pick<EngineInterface, 'env'>) {
  const home = (await $.env.get('HOME')) || (await $.env.get('USERPROFILE'))
  if (!home) throw new Error('HOME is not set')
  return `${home}/${PROGRESS_PATH}`
}

const why = (reply: { reason: string; status?: number | null; error?: string }) =>
  reply.status === undefined ? reply.reason : `${reply.reason} ${reply.status ?? 'no response'} ${reply.error}`

async function pausedKey($: Pick<EngineInterface, 'session' | 'fs'>) {
  const cwd = await $.session.cwd()
  const git = await $.fs.read(`${cwd}/.git`).catch(() => '')
  return `paused:${WORKTREE.exec(git)?.[1] ?? cwd}`
}

const isPaused = async ($: Pick<EngineInterface, 'store' | 'session' | 'fs'>) => (await $.store.get(await pausedKey($))) === true

async function setPaused($: Pick<EngineInterface, 'store' | 'state' | 'ui' | 'session' | 'fs'>, paused: boolean) {
  const key = await pausedKey($)
  await (paused ? $.store.set(key, true) : $.store.delete(key))
  $.ui.status(paused ? PAUSED_STATUS : undefined)
  if (paused) await update($, check, () => null)
  await update($, revision, n => n + 1)
}

const sessions = ($: Pick<EngineInterface, 'store'>, keys: string[]) =>
  Promise.all(keys.map(async key => ((await $.store.get(key)) ?? []) as Turn[]))

async function coach($: Pick<EngineInterface, 'model' | 'store' | 'state' | 'ui' | 'session' | 'fs'>, id: number, session: string, progress: string, native: string, text: string) {
  const reply = await $.model.complete({ model: 'haiku', system: COACH, prompt: ask(progress, native, text), maxTokens: 600, effort: 'low', timeoutMs: 30000 })
  if (await isPaused($)) {
    await update($, check, current => (current?.id === id ? null : current))
    return
  }
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
  const prompt = reviewAsk(progress, day(await $.clock.now()), turns)
  const cap = Math.min(4000 + prompt.length, 64000)
  const reply = await $.model.complete({ model: 'sonnet', system: REVIEW, prompt, maxTokens: cap, timeoutMs: 120000 })
  const file = reply.isAnswered ? unwrap(reply.text) : ''
  const cut = reply.isAnswered && reply.usage.output_tokens >= cap
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

async function askNative($: Pick<EngineInterface, 'store' | 'state' | 'ui' | 'config'>) {
  if ((await $.store.get('native:asked')) !== undefined) return
  await $.store.set('native:asked', true)
  const value = (await $.ui.ask(NATIVE_QUESTION, { options: ['French', 'Spanish', 'German'], header: 'English' })).trim()
  if (value === '') return
  const deny = await keepNative($, value)
  if (deny !== undefined) $.ui.log(`the native language was kept in the coach's store, not in the settings: ${deny}`)
}

async function keepNative($: Pick<EngineInterface, 'store' | 'state' | 'config'>, value: string) {
  const deny = await $.config.set({ key: NATIVE_KEY, value }).then(
    result => result.deny,
    error => String(error),
  )
  await setNative($, deny === undefined ? '' : value)
  return deny
}

async function setNative($: Pick<EngineInterface, 'store' | 'state'>, value: string) {
  await (value === '' ? $.store.delete(NATIVE_STORE) : $.store.set(NATIVE_STORE, value))
  await update($, revision, n => n + 1)
}

function nativeReply(value: string, deny: string | undefined, setting: string) {
  const done = value === '' ? 'Native language cleared.' : `Native language set to ${value}.`
  if (deny === undefined) return done
  if (value === '' && setting !== '') return `Native language not cleared: the settings refused the change (${deny}), and the \`${NATIVE_KEY}\` setting (${setting}) still applies.`
  const kept = value === '' ? '' : ', so the coach keeps it in its own store'
  const wins = setting === '' ? '.' : `, and the \`${NATIVE_KEY}\` setting (${setting}) still wins.`
  return `${done} The settings refused the change (${deny})${kept}${wins}`
}

async function nativeOf($: Pick<EngineInterface, 'store'>, setting: string) {
  return setting !== '' ? setting : String((await $.store.get(NATIVE_STORE)) ?? '')
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

function card({ Box, Button, Text }: ReturnType<EngineInterface['ui']['resolve']>, tips: Tip[], text: string, onHide?: () => void) {
  const hide = onHide && (
    <Button role="dismiss" onPress={onHide}>
      Hide
    </Button>
  )
  return tips.length === 0 ? (
    <Box flexDirection="row" justifyContent="space-between" alignItems="center" borderStyle="round" paddingX={1} marginTop={1}>
      <Box flexDirection="row" gap={1}>
        <Text color="green" bold>✓ No English findings</Text>
        <Text dimColor>{cheer(text)}</Text>
      </Box>
      {hide}
    </Box>
  ) : (
    <Box flexDirection="column" borderStyle="round" paddingX={1} marginTop={1}>
      <Box flexDirection="row" justifyContent="space-between" alignItems="center">
        <Text bold>English tips · {tips.length}</Text>
        {hide}
      </Box>
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

type Pane = { ui: ReturnType<EngineInterface['ui']['resolve']>; all: Turn[]; mine: Turn[]; months: Monthly; now: number; total: Totals }

const plural = (n: number, word: string) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`

function strip({ ui: { Box, Text }, all, mine, months, total }: Pane, status: (string | false)[]) {
  const rolled = all.length === 0 ? Object.entries(months).sort(([a], [b]) => a.localeCompare(b)).at(-1) : undefined
  const level = all.at(-1)?.level ?? rolled?.[1].level ?? 0
  const session = totalsOf(mine)
  const note = (title: string, text: string) => (
    <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
      <Text color="warning" bold>
        {title}
      </Text>
      <Text dimColor>{text}</Text>
    </Box>
  )
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" flexWrap="wrap" justifyContent="space-between" columnGap={1}>
        {level > 0 ? (
          <Box flexDirection="row" gap={1}>
            <Text bold>{`Level ${level}`}</Text>
            <Text dimColor>{rolled === undefined ? (LEVELS[level] ?? '') : `${LEVELS[level] ?? ''} · highest in ${monthLabel(rolled[0])}`}</Text>
          </Box>
        ) : (
          <Text dimColor>No turns yet</Text>
        )}
        {total.turns > 0 && (
          <Box flexDirection="row" gap={1}>
            <Text dimColor>This session</Text>
            <Text>{`${plural(session.turns, 'turn')}, ${plural(session.findings, 'finding')}`}</Text>
          </Box>
        )}
      </Box>
      {status.includes('paused') && note('Paused in this project.', PAUSED_NOTE)}
      {status.includes('native') && note('Native language not set.', NATIVE_NOTE)}
      {status.includes('checking') && (
        <Text dimColor italic>
          Checking your message…
        </Text>
      )}
    </Box>
  )
}

function emptyView({ ui: { Box, Text } }: Pane) {
  return (
    <Box borderStyle="round" paddingX={1}>
      <Text>Write your next message in English: the coach checks it and your figures start here.</Text>
    </Box>
  )
}

function overview({ ui, all, mine, total }: Pane) {
  const { Box, Markdown, Text } = ui
  const session = totalsOf(mine)
  const same = session.turns === total.turns
  const ours = rates(session)
  const theirs = rates(total)
  const tile = (label: string, value: string, overall: string) => (
    <Box flexDirection="column" borderStyle="round" paddingX={1} minWidth={20} flexGrow={1}>
      <Text dimColor>{label}</Text>
      <Markdown text={`### ${value}`} />
      {same ? (
        <Text dimColor>only session so far</Text>
      ) : (
        <Box flexDirection="row" gap={1}>
          <Text>{overall}</Text>
          <Text dimColor>all sessions</Text>
        </Box>
      )}
    </Box>
  )
  const shown = Math.min(all.length, 30)
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="row" flexWrap="wrap" gap={1}>
        {tile('Findings per turn', ours.perTurn, theirs.perTurn)}
        {tile('Errors per 100 words', ours.per100, theirs.per100)}
        {tile('Clean turns', ours.clean, theirs.clean)}
        {tile('Words', session.words.toLocaleString('en-US'), total.words.toLocaleString('en-US'))}
      </Box>
      {all.length === 0 && <Text dimColor>{ROLLED_NOTE}</Text>}
      {all.length > 0 && (
        <Box flexDirection="column">
          <Text bold>Last 30 turns</Text>
          {'Svg' in ui && <ui.Svg source={barChart(all)} alt={`Findings per turn for the last ${shown} turns`} />}
          <Text dimColor>
            {shown < 30 ? `${plural(shown, 'turn')} so far: the chart fills up to 30.` : 'One bar per turn, one line per finding. Green dot: clean turn. Dashed line: a new day.'}
          </Text>
        </Box>
      )}
    </Box>
  )
}

function tipsView({ ui: { Box, Text }, all, mine, now }: Pane) {
  const shown = all.slice(-8).reverse()
  const latest = [...shown.filter(turn => mine.includes(turn)), ...shown.filter(turn => !mine.includes(turn))]
  const boundary = latest.findIndex(turn => !mine.includes(turn))
  const told = new Set<string>()
  const items: RenderNode[] = []
  let clean = 0
  const flush = () => {
    if (clean > 0) items.push(<Text color="success">{`✓ ${plural(clean, 'clean turn')}`}</Text>)
    clean = 0
  }
  const tipRow = (tip: Tip) => {
    const key = tip.wrong.toLowerCase()
    const count = told.has(key) ? 0 : repeats(all, tip.wrong)
    told.add(key)
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
          <Text color="error" strikethrough>
            {tip.wrong}
          </Text>
          <Text dimColor>→</Text>
          <Text color="success" bold>
            {tip.fix}
          </Text>
          {tip.category !== '' && <Text dimColor>{tip.category}</Text>}
        </Box>
        {tip.note !== '' && (
          <Text dimColor italic>
            {tip.note}
          </Text>
        )}
        {count >= 3 && <Text color="warning">{`${count} times in the last 30 turns`}</Text>}
      </Box>
    )
  }
  for (const [i, turn] of latest.entries()) {
    if (i === boundary) {
      flush()
      items.push(<Text dimColor>Other sessions</Text>)
    }
    if (turn.tips.length === 0) {
      clean += 1
      continue
    }
    flush()
    items.push(
      <Box flexDirection="column">
        <Text dimColor>{`${when(turn.ts, now)}, ${plural(turn.words, 'word')}`}</Text>
        {turn.tips.map(tipRow)}
      </Box>,
    )
  }
  flush()
  const counts = categories(all)
  const top = counts[0]?.[1] ?? 1
  const first = all[0]
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="row" gap={1}>
        <Text bold>Recent tips</Text>
        <Text dimColor>last 8 turns</Text>
      </Box>
      {latest.length === 0 && <Text dimColor>{ROLLED_NOTE}</Text>}
      {latest.length > 0 && latest.every(turn => turn.tips.length === 0) && <Text dimColor>No tips in the last 8 turns.</Text>}
      {items}
      {first !== undefined && counts.length > 0 && (
        <Box flexDirection="column">
          <Box flexDirection="row" gap={1}>
            <Text bold>By category</Text>
            <Text dimColor>{`since ${dayLabel(day(first.ts))}`}</Text>
          </Box>
          {counts.map(([name, n]) => (
            <Box flexDirection="row" gap={1}>
              <Box width={15}>
                <Text>{name}</Text>
              </Box>
              <Box flexGrow={1}>
                <Box width={`${Math.max(1, Math.round((n * 100) / top))}%`} height={1} backgroundColor="claude" />
              </Box>
              <Box width={4} justifyContent="flex-end">
                <Text>{String(n)}</Text>
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}

function historyView({ ui: { Box, Markdown, Text }, all, months }: Pane) {
  const days = dayRows(all)
  const first = all[0]
  const firstMonth = first === undefined ? undefined : month(first.ts)
  const rolled = Object.keys(months).some(key => firstMonth === undefined || key < firstMonth)
  const change = levelChange(months)
  const heading = (title: string, note?: string) => (
    <Box flexDirection="row" gap={1}>
      <Text bold>{title}</Text>
      {note !== undefined && <Text dimColor>{note}</Text>}
    </Box>
  )
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        {heading('By day', 'Last 14 days with turns')}
        {days.length === 0 ? <Text dimColor>No days kept.</Text> : <Markdown text={rateTable('Day', days)} />}
        {dayCount(all) > 14 && (
          <Text dimColor italic>
            Older days are counted in By month.
          </Text>
        )}
      </Box>
      <Box flexDirection="column">
        {heading('By month')}
        <Markdown text={rateTable('Month', monthRows(months))} />
        {change !== '' && <Text dimColor>{change}</Text>}
        {rolled && (
          <Text dimColor italic>
            {`${firstMonth === undefined ? 'Older months' : `Months before ${monthLabel(firstMonth)}`} keep totals only: no days, no tips.`}
          </Text>
        )}
      </Box>
    </Box>
  )
}

export const register: Register = (on, options) => {
  const native = String(options.nativeLanguage ?? '').trim()

  on('session.start', async ($, e, next) => {
    await $.command
      .register({ name: 'english', description: 'Open the English coach pane, pause and resume the checks, or set your native language', argumentHint: '[pause|resume|native <language>]', immediate: true })
      .catch(error => $.ui.log(`/english was not registered: ${String(error)}`))
    await update($, check, () => null).catch(error => $.ui.log(`the check band was not reset: ${String(error)}`))
    await isPaused($).then(
      paused => paused && $.ui.status(PAUSED_STATUS),
      error => $.ui.log(`the pause state was not read: ${String(error)}`),
    )
    $.clock.after(0, () => review($).catch(error => $.ui.log(`the progress review failed: ${String(error)}`)))
    if (native === '' && e.isInteractive) $.clock.after(0, () => askNative($).catch(error => $.ui.log(`the native language was not asked: ${String(error)}`)))
    await rollUp($).catch(error => $.ui.log(`the roll-up failed: ${String(error)}`))
    return next(e)
  })

  on('session.attach', { surface: 'desktop' }, async ($, e, next) => {
    if (native === '') $.clock.after(0, () => askNative($).catch(error => $.ui.log(`the native language was not asked: ${String(error)}`)))
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const result = await next(e)
    if (!COUNTED.includes(e.origin.kind) || result.drop !== undefined) return result
    await (async () => {
      const paused = await isPaused($)
      $.ui.status(paused ? PAUSED_STATUS : undefined)
      if (paused) return
      const text = stripPasted(e.text).slice(0, CUT).replace(/[\uD800-\uDBFF]$/, '')
      if (countWords(text) === 0) {
        await update($, check, () => null)
        return
      }
      const path = await progressPath($)
      if (!(await $.fs.exists(path))) await $.fs.write(path, TEMPLATE)
      const progress = await $.fs.read(path)
      const [id, session, language] = await Promise.all([$.clock.now(), $.session.id(), nativeOf($, native)])
      await update($, check, () => ({ id, tips: null }))
      $.clock.after(0, () =>
        coach($, id, session, progress, language, text).catch(async error => {
          $.ui.log(`the check failed: ${String(error)}`)
          await update($, check, current => (current?.id === id && current.tips === null ? null : current)).catch(cleared =>
            $.ui.log(`the check band was not cleared: ${String(cleared)}`),
          )
        }),
      )
    })().catch(error => $.ui.log(`the coach did not start: ${String(error)}`))
    return result
  })

  on('command.run', { command: 'english' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'pause' || arg === 'resume') {
      const paused = arg === 'pause'
      return setPaused($, paused).then(
        () => ({ text: paused ? 'English coach paused in this project: your messages here are not checked until `/english resume`.' : 'English coach resumed in this project: your messages here are checked again.' }),
        error => ({ text: `the coach was not ${paused ? 'paused' : 'resumed'} (${String(error)})` }),
      )
    }
    const [verb = '', ...words] = e.args.trim().split(/\s+/)
    if (verb.toLowerCase() === 'native') {
      const value = words.join(' ')
      return keepNative($, value).then(
        deny => ({ text: nativeReply(value, deny, native) }),
        error => ({ text: `the native language was not ${value === '' ? 'cleared' : 'set'} (${String(error)})` }),
      )
    }
    if (arg !== '') return { text: USAGE }
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
    if (current === null || e.props.hasSurvey || current.hiddenOn?.includes(e.surface)) return next(e)
    const ui = $.ui.resolve(e)
    const { Box, Text } = ui
    const theirs = await next(e)
    const hide = () =>
      update($, check, latest =>
        latest?.id === current.id && !latest.hiddenOn?.includes(e.surface) ? { ...latest, hiddenOn: [...(latest.hiddenOn ?? []), e.surface] } : latest,
      ).catch(error =>
        $.ui.log(`the tips were not hidden: ${String(error)}`),
      )
    return (
      <Box flexDirection="column">
        {theirs}
        {current.tips === null ? (
          <Box borderStyle="round" paddingX={1}>
            <Text dimColor>English coach · checking your message…</Text>
          </Box>
        ) : (
          card(ui, current.tips, String(current.id), e.surface !== 'terminal' ? hide : undefined)
        )}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    await read($, revision)
    const keys = await $.store.keys()
    const sessionKeys = keys.filter(key => key.startsWith('session:'))
    const [turns, rollups, id, paused, language] = await Promise.all([
      sessions($, sessionKeys),
      Promise.all(keys.filter(key => key.startsWith('rollup:')).map(async key => ((await $.store.get(key)) ?? {}) as Monthly)),
      $.session.id(),
      isPaused($),
      nativeOf($, native),
    ])
    const all = turns.flat().sort((x, y) => x.ts - y.ts)
    const months = merge([...rollups, monthly(all)])
    const mine = turns[sessionKeys.indexOf(`session:${id}`)] ?? []

    const ui = $.ui.resolve(e)
    const { Box, Button, Markdown } = ui
    if (e.surface === 'terminal') {
      const section = (title: string, body: string) => `**${title}**\n\n${body || '_No turns yet._'}`
      const days = byDay(all)
      const monthList = byMonth(months)
      return (
        <Box flexDirection="column" gap={1}>
          {paused && <Markdown text={PAUSED_HINT} />}
          {language === '' && <Markdown text={NATIVE_HINT} />}
          <Markdown text={table([totalsRow('All sessions', Object.values(months).reduce(add, ZERO)), row('This session', mine)])} />
          <Markdown text={section('By day', days.length === 0 ? '' : table(days))} />
          <Markdown text={section('By month', monthList.length === 0 ? '' : table(monthList))} />
          <Markdown text={section('Recent turns', recent(all))} />
        </Box>
      )
    }

    const [selected, current] = await Promise.all([read($, view), read($, check)])
    const now = selected === 'tips' ? await $.clock.now() : 0
    midnight?.cancel()
    midnight =
      selected === 'tips'
        ? $.clock.after(nextDay(now) - now, () => update($, revision, n => n + 1).catch(error => $.ui.log(`the pane was not refreshed: ${String(error)}`)))
        : undefined
    const pane: Pane = { ui, all, mine, months, now, total: Object.values(months).reduce(add, ZERO) }
    const empty = pane.total.turns === 0
    const body = empty ? emptyView(pane) : selected === 'tips' ? tipsView(pane) : selected === 'history' ? historyView(pane) : overview(pane)
    return (
      <Box flexDirection="column" gap={1}>
        <Button role="dismiss" onPress={() => $.ui.close({ id: PANE }).catch(error => $.ui.log(`the pane was not closed: ${String(error)}`))}>
          Close
        </Button>
        {strip(pane, [paused && 'paused', language === '' && 'native', current?.tips === null && 'checking'])}
        {!empty && (
          <Box flexDirection="row" flexWrap="wrap" gap={1}>
            {VIEWS.map(([key, label, hotkey]) => (
              <Button
                variant={key === selected ? 'primary' : 'secondary'}
                hotkey={hotkey}
                onPress={() => update($, view, () => key).catch(error => $.ui.log(`the view was not changed: ${String(error)}`))}
              >
                {label}
              </Button>
            ))}
          </Box>
        )}
        {body}
      </Box>
    )
  })
}
