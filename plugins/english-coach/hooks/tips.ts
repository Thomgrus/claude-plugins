import type { Tip } from '../types'

export const HEADER = /^\s*(?:#+\s*)?(?:\*\*)?English tips:?(?:\*\*)?:?\s*$/i
export const NONE = /^\s*(?:#+\s*)?[`*]*English tips:?[`*]*:?\s*[`*(]*none\b[).`*]*(?:\s*$|\s+[—–-])/i
const QUOTED = /^\s*(?:[-*]|\d+\.)\s*["“](.+?)["”]\s*(?:→|->|=>)\s*["“](.+?)["”](?=\s*(?:\[|$|[—–(-]))\s*(.*)$/
export const ITEM = /^\s*(?:[-*]|\d+\.)\s*["“](.+?)["”]\s*(?:→|->|=>)\s*["“](.+?)["”]\s*(.*)$/
export const UNCHANGED = /^\s*(?:[-*]|\d+\.)\s*["“](.+?)["”]\s*(?:→|->|=>)[\s([]*(?:none|no (?:big )?mistake|no tip|no change|fine|correct|ok)\b(?!.*["“”]).*$/i
const BULLET = /^\s*(?:[-*]|\d+\.)\s/
const FENCE = /^\s*(?:```|~~~)/
const OPEN = /^\s*(`{3,}(?=[^`]*$)|~{3,})/
const CLOSE = /^\s*(`{3,}|~{3,})\s*$/
const PASTE = /^\s*<(\/?)pasted_content(?:\s[^>]*)?>\s*$/

const outsideFence = (lines: string[], index: number) => lines.slice(0, index).filter(line => FENCE.test(line)).length % 2 === 0

const toTip = (match: RegExpExecArray): Tip => {
  const rest = match[3] ?? ''
  const category = /\[([\w -]+)\]/.exec(rest)?.[1] ?? ''
  const note = rest
    .replace(/\[[^\]]*\]/g, '')
    .replace(/^[\s()—–-]+|[\s()]+$/g, '')
    .trim()
  return { wrong: match[1] ?? '', fix: match[2] ?? '', note, category }
}

export const splitTips = (text: string) => {
  if (!/english tips/i.test(text)) return null
  const lines = text.split('\n')
  const none = lines.findLastIndex((line, i) => NONE.test(line) && outsideFence(lines, i))
  if (none >= 0) {
    return { body: lines.slice(0, none).join('\n').trimEnd(), tips: [] as Tip[], tail: lines.slice(none + 1).join('\n').trim() }
  }
  const start = lines.findLastIndex((line, i) => HEADER.test(line) && outsideFence(lines, i))
  if (start < 0) return null

  const tips: Tip[] = []
  let end = start + 1
  for (const line of lines.slice(start + 1)) {
    const match = QUOTED.exec(line) ?? ITEM.exec(line)
    const unchanged = match ? null : UNCHANGED.exec(line)
    if (match) tips.push(toTip(match))
    else if (unchanged) tips.push({ wrong: unchanged[1] ?? '', fix: unchanged[1] ?? '', note: '', category: '' })
    else if (!BULLET.test(line) && (line.trim() !== '' || tips.length > 0)) break
    end++
  }
  if (tips.length === 0) return null

  return {
    body: lines.slice(0, start).join('\n').trimEnd(),
    tips: tips.filter(tip => tip.wrong.trim() !== tip.fix.trim()),
    tail: lines.slice(end).join('\n').trim(),
  }
}

export const stripPasted = (text: string) => {
  const kept: string[] = []
  let fence = ''
  let pasting = false
  for (const line of text.split(/\r?\n/)) {
    const tag = PASTE.exec(line)
    if (tag && fence === '') {
      pasting = tag[1] === ''
      continue
    }
    if (tag && pasting && tag[1] === '/') {
      pasting = false
      fence = ''
      continue
    }
    if (fence !== '') {
      const close = CLOSE.exec(line)?.[1] ?? ''
      if (close[0] === fence[0] && close.length >= fence.length) fence = ''
      continue
    }
    const open = OPEN.exec(line)?.[1] ?? ''
    if (open !== '') fence = open
    else if (!/^\s*>/.test(line)) kept.push(line)
  }
  return kept
    .join('\n')
    .replace(/\n(?:[ \t]*\n){2,}/g, '\n\n')
    .trim()
}

export const countWords = (text: string) =>
  text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .split(/\s+/)
    .filter(word => /\p{L}/u.test(word)).length

const CHEERS = ['Nice work!', 'Well written!', 'Spot on!', 'Keep it up!', 'Clean and clear!', 'Great English!']

export const cheer = (text: string) => CHEERS[[...text].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0) % CHEERS.length] ?? CHEERS[0]
