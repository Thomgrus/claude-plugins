export type Tip = { wrong: string; fix: string; note: string; category: string }
export type Turn = { turnId: string; ts: number; words: number; level: number; tips: Tip[] }
export type Totals = { turns: number; findings: number; words: number; clean: number; level: number }
export type Monthly = Record<string, Totals>
export type View = 'overview' | 'tips' | 'history'

declare module 'claude-code' {
  interface PluginState {
    'english-coach': {
      revision: number
      check: { id: number; tips: Tip[] | null; hiddenOn?: string[] } | null
      view: View
    }
  }
}
