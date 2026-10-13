import type { Monthly, Totals, Turn } from '../types'

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

export const totalsRow = (label: string, totals: Totals) => {
  if (totals.turns === 0) return `| ${label} | 0 | – | – | – | 0 |`
  const ep100 = totals.words === 0 ? '–' : ((totals.findings * 100) / totals.words).toFixed(1)
  return `| ${label} | ${totals.turns} | ${(totals.findings / totals.turns).toFixed(2)} | ${ep100} | ${Math.round((totals.clean * 100) / totals.turns)}% | ${totals.words} |`
}

export const row = (label: string, list: Turn[]) => totalsRow(label, totalsOf(list))

export const table = (rows: string[]) =>
  ['| | Turns | Findings per turn | Errors per 100 words | Clean turns | Words |', '|---|---|---|---|---|---|', ...rows].join('\n')

export const day = (ts: number) => new Date(ts - new Date(ts).getTimezoneOffset() * 60000).toISOString().slice(0, 10)

export const month = (ts: number) => day(ts).slice(0, 7)

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

export const byDay = (list: Turn[]) => {
  const days = [...new Set(list.map(turn => day(turn.ts)))].slice(-14).reverse()
  return days.map(d => {
    const turns = list.filter(turn => day(turn.ts) === d)
    return row(`${d} · L${Math.max(...turns.map(turn => turn.level))}`, turns)
  })
}

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

export const barChart = (list: Turn[]) => {
  const width = 360
  const height = 110
  const step = width / 30
  const shown = list.slice(-30)
  const max = Math.max(3, ...shown.map(turn => turn.tips.length))
  const bars = shown
    .map((turn, i) => {
      const x = i * step + 2
      if (turn.tips.length === 0) {
        return `<circle cx="${x + step / 2 - 2}" cy="${height - 18}" r="3" fill="#3fa66b"/>`
      }
      const h = ((height - 30) * turn.tips.length) / max
      return `<rect x="${x}" y="${height - 20 - h}" width="${step - 4}" height="${h}" rx="2" fill="#d97757"/>`
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><line x1="0" y1="${height - 20}" x2="${width}" y2="${height - 20}" stroke="#888" stroke-width="1"/>${bars}<text x="0" y="${height - 4}" font-size="11" fill="#888" font-family="sans-serif">findings per turn, last 30 turns (green dot = clean turn)</text></svg>`
}
