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

  const studyUrl = (book, chapter, verse) => {
    const base = `${STUDY_URL}/${book.work.id}/${book.slug}/${chapter}`
    return verse ? `${base}.${verse}?lang=eng#p${verse}` : `${base}?lang=eng`
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
    studyUrl,
    book: slug => bySlug.get(slug),
    work: id => workById.get(id)
  }
}
