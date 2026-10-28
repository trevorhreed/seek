// Parses scripture references ("alma 32:21", "1 ne 3:7", "d&c 76:22-24", "Isaiah 2-14") against a canon.

// Common abbreviations that neither the book name nor the study-site slug covers.
const EXTRA_ALIASES = {
  'dc': ['d&c', 'dandc', 'doctrineandcovenants', 'doctrine&covenants'],
  'song': ['songofsolomon', 'songofsongs', 'solomonssong', 'sos', 'canticles'],
  'ps': ['psalm', 'psa', 'pss'],
  'philip': ['phil', 'php'],
  'philem': ['phlm'],
  'judg': ['jdg', 'jgs'],
  'matt': ['mt'],
  'mark': ['mk'],
  'luke': ['lk'],
  'john': ['jn'],
  'rev': ['revelations'],
  'w-of-m': ['wom', 'wofm'],
  'js-m': ['jsm', 'josephsmithmatthew'],
  'js-h': ['jsh', 'josephsmithhistory'],
  'a-of-f': ['aof', 'aoff', 'articlesoffaith'],
  'morm': ['mrm'],
  'moro': ['mni'],
  'hel': ['hela']
}

const REFERENCE = /^\s*(.+?)(\s*)(\d+)(?:\s*[:.]\s*(\d+))?(?:\s*[-–—]\s*(\d+)(?:\s*[:.]\s*(\d+))?)?\s*$/

const normalizeBook = text => text
  .toLowerCase()
  .trim()
  .replace(/^(i{1,3})\s+/, (_, numeral) => String(numeral.length))
  .replace(/^(first|second|third)\s+/, (_, word) => ({ first: '1', second: '2', third: '3' })[word])
  .replace(/[\s.\-—–'’]/g, '')

export const createBookResolver = canon => {
  const aliases = new Map()
  const names = []
  for (const book of canon.books) {
    const keys = [book.name, book.slug, ...(EXTRA_ALIASES[book.slug] ?? [])].map(normalizeBook)
    keys.forEach(key => aliases.set(key, book))
    names.push([normalizeBook(book.name), book])
  }

  return text => {
    const key = normalizeBook(text)
    if (!key) return null
    if (aliases.has(key)) return aliases.get(key)
    // Fall back to an unambiguous prefix, so "isa", "deuter" and "1 thess" work without listing every spelling.
    const matches = names.filter(([name]) => name.startsWith(key))
    return matches.length === 1 ? matches[0][1] : null
  }
}

// Returns { book, start, end } where start/end are verse ids (end exclusive), or null. A bare book name only
// parses when allowBareBook is set, since "job", "mark" and "acts" are also ordinary search words.
export const createReferenceParser = (canon, { allowBareBook = false } = {}) => {
  const resolveBook = createBookResolver(canon)

  return text => {
    if (allowBareBook) {
      const book = resolveBook(text)
      if (book) return { book, start: book.start, end: book.end }
    }

    const match = REFERENCE.exec(text)
    if (!match) return null
    const [, bookText, , c1, v1, n2, v2] = match
    const book = resolveBook(bookText)
    if (!book) return null

    // Single-chapter books (Jude, Enos, …) are usually cited by verse alone: "jude 3".
    const singleChapter = book.chapters.length === 1
    let startChapter = Number(c1)
    let startVerse = v1 ? Number(v1) : null
    if (singleChapter && !v1 && startChapter > 1) {
      startVerse = startChapter
      startChapter = 1
    }

    let endChapter = startChapter
    let endVerse = startVerse
    if (n2 && v2) {
      endChapter = Number(n2)
      endVerse = Number(v2)
    } else if (n2 && startVerse !== null) {
      endVerse = Number(n2)
    } else if (n2) {
      endChapter = Number(n2)
    }

    const start = canon.verseId(book, startChapter, startVerse ?? 1)
    if (start < 0) return null
    const lastVerse = endVerse ?? book.chapters[endChapter - 1]
    const last = canon.verseId(book, endChapter, lastVerse)
    if (last < start) return null
    return { book, start, end: last + 1 }
  }
}

// Digit runs at least this long are split into chapter:verse guesses even with a space before them ("alma 3221").
const MIN_SPACED_COMPACT_DIGITS = 3
const MAX_CANDIDATES = 24

// Resolves loose references to every plausible passage, best first, for the search box: "1ne11" is 1 Nephi
// 1:1 or 1 Nephi 11, and "ne222" is 2:22 or 22:2 in any of 1–4 Nephi. Returns [] when nothing fits.
export const createReferenceFinder = canon => {
  const parse = createReferenceParser(canon)
  const aliases = new Map()
  const names = []
  const families = new Map()
  for (const book of canon.books) {
    [book.name, book.slug, ...(EXTRA_ALIASES[book.slug] ?? [])].forEach(key => aliases.set(normalizeBook(key), book))
    names.push([normalizeBook(book.name), [book]])
    // Numbered books (1 Nephi, 2 Kings) also answer to their unnumbered base name or slug.
    const numbered = /^\d\s+(.+)$/.exec(book.name)
    if (!numbered) continue
    for (const key of new Set([numbered[1], book.slug.replace(/^\d-/, '')].map(normalizeBook))) {
      if (!families.has(key)) families.set(key, [])
      families.get(key).push(book)
    }
  }
  names.push(...families)

  const resolveBooks = text => {
    const key = normalizeBook(text)
    if (!key) return []
    if (aliases.has(key)) return [aliases.get(key)]
    if (families.has(key)) return families.get(key)
    // An unambiguous prefix of one book or one family of numbered books.
    const groups = names.filter(([name]) => name.startsWith(key)).map(([, books]) => books)
    const distinct = new Set(groups.map(books => books.map(book => book.slug).join()))
    return distinct.size === 1 ? groups[0] : []
  }

  // Each guess is [chapter, verse | null]; verse-level splits come first, the whole-chapter reading last.
  const compactGuesses = digits => {
    const guesses = []
    for (let i = 1; i < digits.length; i++) {
      const chapter = digits.slice(0, i)
      const verse = digits.slice(i)
      if (verse.startsWith('0')) continue
      guesses.push([Number(chapter), Number(verse)])
    }
    guesses.push([Number(digits), null])
    return guesses
  }

  return text => {
    const match = REFERENCE.exec(text)
    if (!match) return []
    const [, bookText, gap, digits, verse, rangeEnd] = match
    const compact = verse === undefined && rangeEnd === undefined && digits.length > 1 &&
      (gap === '' || digits.length >= MIN_SPACED_COMPACT_DIGITS)
    const books = resolveBooks(bookText)
    if (!compact) {
      if (books.length === 1) {
        const ref = parse(text)
        return ref ? [ref] : []
      }
      const suffix = text.slice(match.index + bookText.length)
      return books.flatMap(book => parse(`${book.name}${suffix}`) ?? [])
    }

    const candidates = []
    for (const [chapter, verseNumber] of compactGuesses(digits)) {
      for (const book of books) {
        const start = canon.verseId(book, chapter, verseNumber ?? 1)
        if (start < 0) continue
        const end = verseNumber === null ? canon.chapterRange(book, chapter)[1] : start + 1
        candidates.push({ book, start, end })
      }
    }
    return candidates.slice(0, MAX_CANDIDATES)
  }
}
