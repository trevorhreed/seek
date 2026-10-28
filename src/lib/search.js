// A small full-text engine over the verse list: tokenize, stem (with KJV archaic endings), build an inverted
// index, and rank with BM25. Runs the same in Node (tests) and in the browser (a Web Worker builds the index).

const BM25_K1 = 1.2
const BM25_B = 0.75
const PREFIX_WEIGHT = 0.6
const MAX_PREFIX_EXPANSIONS = 40
const MIN_PREFIX_LENGTH = 2
const PHRASE_BONUS = 1.5
const MAX_PHRASE_BONUS_CHECKS = 3000

const WORD = /[a-z0-9æ]+(?:['’][a-z]+)*/g

// Words whose endings look like suffixes but aren't, or whose stems would collide with common words.
const STEM_EXCEPTIONS = new Set([
  'thee', 'here', 'were', 'there', 'where', 'whence', 'hence',
  'priest', 'honest', 'forest', 'harvest', 'interest', 'manifest', 'request', 'guest', 'conquest', 'earnest',
  'modest', 'behest', 'contest', 'protest', 'wrest', 'chest', 'nest', 'pest', 'test', 'vest', 'jest', 'lest',
  'best', 'rest', 'west', 'quest', 'crest', 'everlasting', 'king', 'thing', 'nothing', 'something', 'anything',
  'morning', 'evening', 'during', 'offspring', 'spring', 'string', 'wing', 'ring', 'sing', 'bring', 'cling'
])

// Ordered longest-first; [suffix, replacement, minimum stem length left after stripping].
const SUFFIXES = [
  ['iest', 'i', 2], ['ieth', 'i', 2], ['ied', 'i', 2], ['ies', 'i', 2],
  ['edst', '', 3], ['eth', '', 3], ['est', '', 3], ['ing', '', 3], ['ed', '', 3], ['es', '', 3], ['s', '', 3]
]

const normalizeWord = word => word
  .replace(/æ/g, 'ae')
  .replace(/['’]s$/, '')
  .replace(/['’]/g, '')

export const stem = word => {
  if (STEM_EXCEPTIONS.has(word) || /\d/.test(word)) return word
  // Short words only fold y to i, so "cry" meets "cries" and "cried".
  if (word.length < 4) return word.length === 3 && word.endsWith('y') ? word.slice(0, -1) + 'i' : word
  let result = word
  for (const [suffix, replacement, minLength] of SUFFIXES) {
    if (!result.endsWith(suffix)) continue
    const base = result.slice(0, -suffix.length)
    if (base.length < minLength) continue
    // Keep "glass", "this", "jesus" whole; their final s isn't a plural.
    if (suffix === 's' && /(ss|is|us)$/.test(result)) continue
    result = base + replacement
    break
  }
  if (result.length > 2 && result.endsWith('y')) result = result.slice(0, -1) + 'i'
  if (/([bdgmnprt])\1$/.test(result)) result = result.slice(0, -1)
  if (result.length > 3 && result.endsWith('e')) result = result.slice(0, -1)
  return result
}

// Calls fn(word, start, end) for each word, where word is lowercased and normalized and start/end index into text.
export const forEachWord = (text, fn) => {
  const lower = text.toLowerCase()
  WORD.lastIndex = 0
  let match
  while ((match = WORD.exec(lower))) {
    fn(normalizeWord(match[0]), match.index, match.index + match[0].length)
  }
}

export const tokenize = text => {
  const words = []
  forEachWord(text, word => words.push(word))
  return words
}

export const stems = text => tokenize(text).map(stem)

// Splits a query into required terms, quoted phrases and -excluded terms. The last bare term is a prefix
// while the user is still typing it (no trailing space).
export const parseQuery = query => {
  const terms = []
  const phrases = []
  const excluded = []
  const pattern = /(-?)"([^"]*)("?)|(-?)([^\s"]+)/g
  let endsInBareTerm = false
  let match
  while ((match = pattern.exec(query))) {
    const [, phraseNegated, phrase, , termNegated, term] = match
    endsInBareTerm = false
    if (phrase !== undefined) {
      const words = stems(phrase)
      if (phraseNegated) excluded.push(...words)
      else {
        if (words.length > 1) phrases.push(words)
        words.forEach(word => terms.push({ stem: word, raw: word, prefix: false }))
      }
    } else if (termNegated) {
      excluded.push(...stems(term))
    } else {
      tokenize(term).forEach(word => terms.push({ stem: stem(word), raw: word, prefix: false }))
      endsInBareTerm = pattern.lastIndex === query.length
    }
  }
  const last = terms.at(-1)
  if (last && endsInBareTerm) last.prefix = last.raw.length >= MIN_PREFIX_LENGTH
  return { terms: dedupeTerms(terms), phrases, excluded }
}

const dedupeTerms = terms => {
  const seen = new Map()
  for (const term of terms) {
    const existing = seen.get(term.stem)
    if (existing) existing.prefix = existing.prefix && term.prefix
    else seen.set(term.stem, { ...term })
  }
  return [...seen.values()]
}

export const buildIndex = texts => {
  const postings = new Map()
  const docLengths = new Uint16Array(texts.length)
  let totalLength = 0

  texts.forEach((text, id) => {
    const words = stems(text)
    docLengths[id] = words.length
    totalLength += words.length
    for (const word of words) {
      let list = postings.get(word)
      if (!list) postings.set(word, (list = { ids: [], tfs: [] }))
      const last = list.ids.length - 1
      if (list.ids[last] === id) list.tfs[last]++
      else {
        list.ids.push(id)
        list.tfs.push(1)
      }
    }
  })

  const terms = [...postings.keys()].sort()
  const termData = new Map(terms.map(term => {
    const { ids, tfs } = postings.get(term)
    return [term, { ids: Int32Array.from(ids), tfs: Uint16Array.from(tfs) }]
  }))

  return { texts, terms, termData, docLengths, avgLength: totalLength / texts.length }
}

const lowerBound = (sorted, value) => {
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid] < value) lo = mid + 1
    else hi = mid
  }
  return lo
}

// The stems a query term matches, with a weight: its own stem at full weight, plus (while typing) every
// indexed stem that starts with what's been typed, most common first.
const expandTerm = (index, term) => {
  const matches = new Map()
  if (index.termData.has(term.stem)) matches.set(term.stem, 1)
  if (term.prefix) {
    const expansions = []
    for (let i = lowerBound(index.terms, term.raw); i < index.terms.length; i++) {
      const candidate = index.terms[i]
      if (!candidate.startsWith(term.raw)) break
      if (!matches.has(candidate)) expansions.push(candidate)
    }
    expansions
      .sort((a, b) => index.termData.get(b).ids.length - index.termData.get(a).ids.length)
      .slice(0, MAX_PREFIX_EXPANSIONS)
      .forEach(candidate => matches.set(candidate, PREFIX_WEIGHT))
  }
  return matches
}

const containsSequence = (haystack, needle) => {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer
    }
    return true
  }
  return false
}

// Returns { ids, partial, matched, unscoped } where ids are in-scope verse ids best-first, partial is true when
// no verse had every term (so these match only some), matched is the set of stems to highlight, and unscoped is
// every match ignoring scope.
export const search = (index, query, { scope = null, order = 'relevance' } = {}) => {
  const { terms, phrases, excluded } = parseQuery(query)
  const empty = { ids: new Int32Array(0), partial: false, matched: new Set(), unscoped: new Int32Array(0) }
  if (!terms.length) return empty

  const docCount = index.texts.length
  const scores = new Float32Array(docCount)
  const coverage = new Uint8Array(docCount)
  const groupBest = new Float32Array(docCount)
  const groupStamp = new Int16Array(docCount).fill(-1)
  const touched = []
  const matched = new Set()

  terms.forEach((term, group) => {
    for (const [candidate, weight] of expandTerm(index, term)) {
      matched.add(candidate)
      const { ids, tfs } = index.termData.get(candidate)
      const idf = Math.log(1 + (docCount - ids.length + 0.5) / (ids.length + 0.5))
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i]
        const tf = tfs[i]
        const norm = 1 - BM25_B + BM25_B * index.docLengths[id] / index.avgLength
        const score = weight * idf * tf * (BM25_K1 + 1) / (tf + BM25_K1 * norm)
        if (groupStamp[id] !== group) {
          if (coverage[id] === 0) touched.push(id)
          groupStamp[id] = group
          groupBest[id] = score
          coverage[id]++
          scores[id] += score
        } else if (score > groupBest[id]) {
          scores[id] += score - groupBest[id]
          groupBest[id] = score
        }
      }
    }
  })

  const excludedIds = new Uint8Array(docCount)
  for (const word of excluded) {
    const data = index.termData.get(word)
    if (data) data.ids.forEach(id => { excludedIds[id] = 1 })
  }

  const stemCache = new Map()
  const stemsOf = id => {
    if (!stemCache.has(id)) stemCache.set(id, stems(index.texts[id]))
    return stemCache.get(id)
  }

  let candidates = touched.filter(id => !excludedIds[id])
  if (phrases.length) {
    candidates = candidates.filter(id => phrases.every(phrase => containsSequence(stemsOf(id), phrase)))
  }

  const full = candidates.filter(id => coverage[id] === terms.length)
  let partial = false
  if (full.length) candidates = full
  else if (candidates.length) {
    const best = Math.max(...candidates.map(id => coverage[id]))
    candidates = candidates.filter(id => coverage[id] === best)
    partial = true
  }

  // Kept before scoping so the filter chips can show how many matches each work has.
  const unscoped = Int32Array.from(candidates)

  if (scope) candidates = candidates.filter(id => scope[id])

  const byScore = (a, b) => scores[b] - scores[a] || a - b
  candidates.sort(byScore)

  // Reward the top verses where unquoted terms appear side by side in the order typed.
  if (terms.length > 1 && !partial) {
    const sequence = terms.map(term => term.stem)
    candidates.slice(0, MAX_PHRASE_BONUS_CHECKS).forEach(id => {
      if (containsSequence(stemsOf(id), sequence)) scores[id] *= PHRASE_BONUS
    })
    candidates.sort(byScore)
  }

  if (order === 'canonical') candidates.sort((a, b) => a - b)

  return { ids: Int32Array.from(candidates), partial, matched, unscoped }
}
