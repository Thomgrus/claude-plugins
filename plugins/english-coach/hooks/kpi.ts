import type { Monthly, Totals, Turn } from '../types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const NBSP = '\u00a0'

const sum = (list: Turn[], pick: (turn: Turn) => number) => list.reduce((total, turn) => total + pick(turn), 0)

export const ZERO: Totals = { turns: 0, findings: 0, words: 0, clean: 0, level: 0 }

export const totalsOf = (list: Turn[]): Totals => ({
  turns: list.length,
  findings: sum(list, turn => turn.tips.length),
  words: sum(list, turn => turn.words),
  clean: list.filter(turn => turn.tips.length === 0).length,
  level: Math.max(0, ...list.map(turn => turn.level)),
})

export const add = (a: Totals, b: Totals): Totals => ({
  turns: a.turns + b.turns,
  findings: a.findings + b.findings,
  words: a.words + b.words,
  clean: a.clean + b.clean,
  level: Math.max(a.level, b.level),
})

export const rates = (totals: Totals) => ({
  perTurn: totals.turns === 0 ? '–' : (totals.findings / totals.turns).toFixed(2),
  per100: totals.words === 0 ? '–' : ((totals.findings * 100) / totals.words).toFixed(1),
  clean: totals.turns === 0 ? '–' : `${Math.round((totals.clean * 100) / totals.turns)}%`,
})

export const totalsRow = (label: string, totals: Totals) => {
  const { perTurn, per100, clean } = rates(totals)
  return `| ${label} | ${totals.turns} | ${perTurn} | ${per100} | ${clean} | ${totals.words} |`
}

const rateRow = (label: string, totals: Totals) => {
  const { perTurn, per100, clean } = rates(totals)
  return `| ${label} | ${totals.turns} | ${perTurn} | ${per100} | ${clean} |`
}

export const row = (label: string, list: Turn[]) => totalsRow(label, totalsOf(list))

export const table = (rows: string[]) =>
  ['| | Turns | Findings per turn | Errors per 100 words | Clean turns | Words |', '|---|---|---|---|---|---|', ...rows].join('\n')

export const rateTable = (first: string, rows: string[]) =>
  [`| ${first} | Turns | Findings per turn | Errors per 100 words | Clean turns |`, '|---|---|---|---|---|', ...rows].join('\n')

const local = (ts: number) => new Date(ts - new Date(ts).getTimezoneOffset() * 60000).toISOString()

export const day = (ts: number) => local(ts).slice(0, 10)

export const dayLabel = (d: string) => `${Number(d.slice(8, 10))}${NBSP}${MONTHS[Number(d.slice(5, 7)) - 1]}`

export const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]}${NBSP}${m.slice(0, 4)}`

export const when = (ts: number, now: number) => {
  const iso = local(ts)
  const d = iso.slice(0, 10)
  const time = iso.slice(11, 16)
  if (d === day(now)) return `Today ${time}`
  return `${WEEKDAYS[new Date(`${d}T00:00:00Z`).getUTCDay()]} ${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${time}`
}

export const month = (ts: number) => day(ts).slice(0, 7)

export const nextDay = (ts: number) => new Date(ts).setHours(24, 0, 0, 0)

export const rawFrom = (now: number) => {
  const date = new Date(now)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1)
}

export const merge = (list: Monthly[]) => {
  const merged: Monthly = {}
  for (const months of list) {
    for (const [key, totals] of Object.entries(months)) merged[key] = add(merged[key] ?? ZERO, totals)
  }
  return merged
}

export const monthly = (list: Turn[]) => merge(list.map(turn => ({ [month(turn.ts)]: totalsOf([turn]) })))

export const byMonth = (months: Monthly) =>
  Object.entries(months)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, totals]) => totalsRow(`${key} · L${totals.level}`, totals))

const days = (list: Turn[]) => [...new Set(list.map(turn => day(turn.ts)))]

export const dayCount = (list: Turn[]) => days(list).length

export const dayRows = (list: Turn[]) =>
  days(list)
    .slice(-14)
    .reverse()
    .map(d => rateRow(dayLabel(d), totalsOf(list.filter(turn => day(turn.ts) === d))))

export const monthRows = (months: Monthly) =>
  Object.entries(months)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, totals]) => rateRow(monthLabel(key), totals))

export const levelChange = (months: Monthly) => {
  const known = Object.entries(months)
    .filter(([, totals]) => totals.level > 0)
    .sort(([a], [b]) => a.localeCompare(b))
  const current = known.at(-1)?.[1].level
  const since = known.findIndex((_, i) => known.slice(i).every(([, totals]) => totals.level === current))
  const first = known[since]
  const before = known[since - 1]
  return first === undefined || before === undefined ? '' : `Level ${current} since ${monthLabel(first[0])}, level ${before[1].level} before.`
}

export const categories = (list: Turn[]) => {
  const counts: Record<string, number> = {}
  for (const tip of list.flatMap(turn => turn.tips)) {
    const name = tip.category || 'other'
    counts[name] = (counts[name] ?? 0) + 1
  }
  return Object.entries(counts).sort(([, a], [, b]) => b - a)
}

export const repeats = (list: Turn[], wrong: string) =>
  list
    .slice(-30)
    .flatMap(turn => turn.tips)
    .filter(tip => tip.wrong.toLowerCase() === wrong.toLowerCase()).length

export const byDay = (list: Turn[]) =>
  days(list)
    .slice(-14)
    .reverse()
    .map(d => {
      const turns = list.filter(turn => day(turn.ts) === d)
      return row(`${d} · L${Math.max(...turns.map(turn => turn.level))}`, turns)
    })

export const recent = (list: Turn[]) =>
  list
    .slice(-8)
    .reverse()
    .map(turn =>
      turn.tips.length === 0
        ? `- ✓ clean (${turn.words} words)`
        : `- ${turn.tips.length} tip(s), ${turn.words} words: ${turn.tips
            .map(tip => `“${tip.wrong}” → “${tip.fix}”${tip.category === '' ? '' : ` [${tip.category}]`}`)
            .join('; ')}`,
    )
    .join('\n')

const CHART_STYLE =
  '<style>.bar{fill:#d97757}.dot{fill:#2f7d4f}.axis{stroke:#9b9a93}.grid,.day{stroke:#e5e3da}@media (prefers-color-scheme:dark){.dot{fill:#6bc58f}.axis{stroke:#7c7a73}.grid,.day{stroke:#45443f}}</style>'

export const barChart = (list: Turn[]) => {
  const width = 448
  const height = 116
  const base = 100
  const top = 10
  const step = width / 30
  const shown = list.slice(-30)
  const max = Math.max(3, ...shown.map(turn => turn.tips.length))
  const y = (n: number) => (base - ((base - top) * n) / max).toFixed(1)
  const grid = Array.from({ length: max }, (_, k) => `<line class="grid" x1="0" x2="${width}" y1="${y(k + 1)}" y2="${y(k + 1)}"/>`).join('')
  const breaks = shown
    .map((turn, i) =>
      i > 0 && day(turn.ts) !== day(shown[i - 1]?.ts ?? turn.ts)
        ? `<line class="day" x1="${(i * step).toFixed(1)}" x2="${(i * step).toFixed(1)}" y1="${top - 4}" y2="${height}" stroke-dasharray="3 3"/>`
        : '',
    )
    .join('')
  const marks = shown
    .map((turn, i) =>
      turn.tips.length === 0
        ? `<circle class="dot" cx="${(i * step + step / 2).toFixed(1)}" cy="${base + 8}" r="3.5"/>`
        : `<rect class="bar" x="${(i * step + 3).toFixed(1)}" y="${y(turn.tips.length)}" width="${(step - 6).toFixed(1)}" height="${(base - Number(y(turn.tips.length))).toFixed(1)}" rx="2"/>`,
    )
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${CHART_STYLE}${grid}${breaks}<line class="axis" x1="0" x2="${width}" y1="${base}" y2="${base}"/>${marks}</svg>`
}
