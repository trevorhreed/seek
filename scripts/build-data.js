#!/usr/bin/env node
// Turns data/verses.json (one object per verse) into the compact file the app loads: the canon's structure
// once, then every verse's text in canonical order, so a verse's position in `text` is its id.

import { copyFile, readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = resolve(ROOT, 'data/verses.json')
const DEST = resolve(ROOT, 'src/data/scriptures.json')
// Built by `npm run embeddings` and committed, since embedding every verse takes minutes.
const SEMANTIC_FILES = ['vectors.bin', 'related.bin']

// Slugs match churchofjesuschrist.org study URLs so ids double as outbound links.
const WORKS = [
  {
    id: 'ot', source: 'The Old Testament', name: 'Old Testament', short: 'OT',
    books: [
      ['Genesis', 'gen'], ['Exodus', 'ex'], ['Leviticus', 'lev'], ['Numbers', 'num'], ['Deuteronomy', 'deut'],
      ['Joshua', 'josh'], ['Judges', 'judg'], ['Ruth', 'ruth'], ['1 Samuel', '1-sam'], ['2 Samuel', '2-sam'],
      ['1 Kings', '1-kgs'], ['2 Kings', '2-kgs'], ['1 Chronicles', '1-chr'], ['2 Chronicles', '2-chr'],
      ['Ezra', 'ezra'], ['Nehemiah', 'neh'], ['Esther', 'esth'], ['Job', 'job'], ['Psalms', 'ps'],
      ['Proverbs', 'prov'], ['Ecclesiastes', 'eccl'], ['Song of Solomon', 'song', "Solomon's Song"],
      ['Isaiah', 'isa'], ['Jeremiah', 'jer'], ['Lamentations', 'lam'], ['Ezekiel', 'ezek'], ['Daniel', 'dan'],
      ['Hosea', 'hosea'], ['Joel', 'joel'], ['Amos', 'amos'], ['Obadiah', 'obad'], ['Jonah', 'jonah'],
      ['Micah', 'micah'], ['Nahum', 'nahum'], ['Habakkuk', 'hab'], ['Zephaniah', 'zeph'], ['Haggai', 'hag'],
      ['Zechariah', 'zech'], ['Malachi', 'mal']
    ]
  },
  {
    id: 'nt', source: 'The New Testament', name: 'New Testament', short: 'NT',
    books: [
      ['Matthew', 'matt'], ['Mark', 'mark'], ['Luke', 'luke'], ['John', 'john'], ['Acts', 'acts'],
      ['Romans', 'rom'], ['1 Corinthians', '1-cor'], ['2 Corinthians', '2-cor'], ['Galatians', 'gal'],
      ['Ephesians', 'eph'], ['Philippians', 'philip'], ['Colossians', 'col'], ['1 Thessalonians', '1-thes'],
      ['2 Thessalonians', '2-thes'], ['1 Timothy', '1-tim'], ['2 Timothy', '2-tim'], ['Titus', 'titus'],
      ['Philemon', 'philem'], ['Hebrews', 'heb'], ['James', 'james'], ['1 Peter', '1-pet'], ['2 Peter', '2-pet'],
      ['1 John', '1-jn'], ['2 John', '2-jn'], ['3 John', '3-jn'], ['Jude', 'jude'], ['Revelation', 'rev']
    ]
  },
  {
    id: 'bofm', source: 'Book of Mormon', name: 'Book of Mormon', short: 'BoM',
    books: [
      ['1 Nephi', '1-ne'], ['2 Nephi', '2-ne'], ['Jacob', 'jacob'], ['Enos', 'enos'], ['Jarom', 'jarom'],
      ['Omni', 'omni'], ['Words of Mormon', 'w-of-m'], ['Mosiah', 'mosiah'], ['Alma', 'alma'],
      ['Helaman', 'hel'], ['3 Nephi', '3-ne'], ['4 Nephi', '4-ne'], ['Mormon', 'morm'], ['Ether', 'ether'],
      ['Moroni', 'moro']
    ]
  },
  {
    id: 'dc-testament', source: 'Doctrine & Covenants', name: 'Doctrine and Covenants', short: 'D&C',
    books: [['D&C', 'dc']]
  },
  {
    id: 'pgp', source: 'The Pearl of Great Price', name: 'Pearl of Great Price', short: 'PGP',
    books: [
      ['Moses', 'moses'], ['Abraham', 'abr'], ['Joseph Smith—Matthew', 'js-m'],
      ['Joseph Smith—History', 'js-h'], ['Articles of Faith', 'a-of-f']
    ]
  }
]

const build = async () => {
  const verses = JSON.parse(await readFile(SOURCE, 'utf8'))

  const byBook = new Map()
  for (const verse of verses) {
    if (!byBook.has(verse.book)) byBook.set(verse.book, [])
    byBook.get(verse.book).push(verse)
  }

  const text = []
  const works = WORKS.map(({ id, source, name, short, books }) => ({
    id, name, short,
    books: books.map(([bookName, slug, sourceName = bookName]) => {
      const bookVerses = byBook.get(sourceName)
      if (!bookVerses) throw new Error(`No verses for ${sourceName}`)
      byBook.delete(sourceName)
      const chapters = []
      for (const verse of bookVerses) {
        if (verse.work !== source) throw new Error(`${verse.ref} is in ${verse.work}, expected ${source}`)
        const chapter = Number(verse.chapter)
        const expected = (chapters[chapter - 1] ?? 0) + 1
        if (Number(verse.verse) !== expected) throw new Error(`${verse.ref} is out of order`)
        chapters[chapter - 1] = expected
        text.push(verse.text)
      }
      if (chapters.includes(undefined)) throw new Error(`${sourceName} is missing a chapter`)
      return { name: bookName, slug, chapters }
    })
  }))

  if (byBook.size) throw new Error(`Unmapped books: ${[...byBook.keys()].join(', ')}`)

  await mkdir(dirname(DEST), { recursive: true })
  await writeFile(DEST, JSON.stringify({ works, text }))
  for (const file of SEMANTIC_FILES) {
    await copyFile(resolve(ROOT, 'data/semantic', file), resolve(dirname(DEST), file))
  }
  console.log(`Wrote ${text.length} verses to ${DEST}`)
}

build().catch(err => {
  console.error(err)
  process.exit(1)
})
