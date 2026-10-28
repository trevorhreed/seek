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

const REFERENCE = /^\s*(.+?)\s*(\d+)(?:\s*[:.]\s*(\d+))?(?:\s*[-–—]\s*(\d+)(?:\s*[:.]\s*(\d+))?)?\s*$/

const normalizeBook = text => text
  .toLowerCase()
  .replace(/[\s.\-—–'’]/g, '')
  .replace(/^(i{1,3})(?=[a-z])/, numeral => String(numeral.length))
  .replace(/^(first|second|third)/, word => ({ first: '1', second: '2', third: '3' })[word])

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
    const [, bookText, c1, v1, n2, v2] = match
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
