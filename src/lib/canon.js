// Navigates the canon structure from scriptures.json. A verse id is its index in canonical order, so books,
// chapters and works are all contiguous [start, end) id ranges.

const STUDY_URL = 'https://www.churchofjesuschrist.org/study/scriptures'

export const createCanon = ({ works }) => {
  const books = []
  const chapterStarts = []
  const chapterOwners = []
  let id = 0

  const workList = works.map((work, workIndex) => {
    const start = id
    const workBooks = work.books.map(book => {
      const bookStart = id
      const firstChapter = chapterStarts.length
      const entry = { ...book, work, workIndex, index: books.length, start: bookStart, firstChapter }
      book.chapters.forEach(count => {
        chapterStarts.push(id)
        chapterOwners.push(entry)
        id += count
      })
      entry.end = id
      books.push(entry)
      return entry
    })
    return { ...work, books: workBooks, index: workIndex, start, end: id }
  })
  chapterStarts.push(id)

  const verseCount = id

  // Binary search for the chapter whose range contains the id.
  const chapterIndexOf = verseId => {
    let lo = 0
    let hi = chapterStarts.length - 2
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (chapterStarts[mid] <= verseId) lo = mid
      else hi = mid - 1
    }
    return lo
  }

  const locate = verseId => {
    const chapterIndex = chapterIndexOf(verseId)
    const book = chapterOwners[chapterIndex]
    return {
      id: verseId,
      book,
      work: book.work,
      chapter: chapterIndex - book.firstChapter + 1,
      verse: verseId - chapterStarts[chapterIndex] + 1
    }
  }

  const chapterRange = (book, chapter) => {
    const chapterIndex = book.firstChapter + chapter - 1
    return [chapterStarts[chapterIndex], chapterStarts[chapterIndex + 1]]
  }

  const verseId = (book, chapter, verse = 1) => {
    if (chapter < 1 || chapter > book.chapters.length) return -1
    if (verse < 1 || verse > book.chapters[chapter - 1]) return -1
    return chapterRange(book, chapter)[0] + verse - 1
  }

  const label = verseId => {
    const { book, chapter, verse } = locate(verseId)
    return `${book.name} ${chapter}:${verse}`
  }

  // "Alma 32:21", "Alma 32:21–23", "Isaiah 2–14" or "Isaiah" for the [start, end) id range.
  const rangeLabel = (start, end) => {
    const from = locate(start)
    const to = locate(end - 1)
    if (start === from.book.start && end === from.book.end) return from.book.name
    const head = `${from.book.name} ${from.chapter}`
    const wholeChapters = from.verse === 1 && end === chapterRange(to.book, to.chapter)[1]
    if (wholeChapters) return from.chapter === to.chapter ? head : `${head}–${to.chapter}`
    if (from.chapter === to.chapter) {
      return from.verse === to.verse ? `${head}:${from.verse}` : `${head}:${from.verse}–${to.verse}`
    }
    return `${head}:${from.verse}–${to.chapter}:${to.verse}`
  }

  // The study site takes a paragraph id (or range of them) to highlight: …/alma/32?lang=eng&id=p21-p23#p21
  const studyUrl = (book, chapter, verse = null, lastVerse = verse) => {
    const base = `${STUDY_URL}/${book.work.id}/${book.slug}/${chapter}?lang=eng`
    if (!verse) return base
    const id = lastVerse > verse ? `p${verse}-p${lastVerse}` : `p${verse}`
    return `${base}&id=${id}#p${verse}`
  }

  const bySlug = new Map(books.map(book => [book.slug, book]))
  const workById = new Map(workList.map(work => [work.id, work]))

  return {
    works: workList,
    books,
    verseCount,
    locate,
    chapterRange,
    verseId,
    label,
    rangeLabel,
    studyUrl,
    book: slug => bySlug.get(slug),
    work: id => workById.get(id)
  }
}
