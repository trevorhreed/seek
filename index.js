const fs = require('fs')
const items = require('./verses.json')

let works = {}

items.forEach(item => {
  if (!works[item.work]) {
    works[item.work] = {
      name: item.work,
      type: 'work',
      books: {}
    }
  }
  if (!works[item.work].books[item.book]) {
    works[item.work].books[item.book] = {
      name: item.book,
      type: 'book',
      chapters: {}
    }
  }
  if (!works[item.work].books[item.book].chapters[item.chapter]) {
    works[item.work].books[item.book].chapters[item.chapter] = {
      name: item.chapter,
      type: 'chapter',
      verses: 0
    }
  }
  works[item.work]
    .books[item.book]
    .chapters[item.chapter]
    .verses = Math.max(
      works[item.work]
        .books[item.book]
        .chapters[item.chapter]
        .verses,
      parseInt(item.verse)
    )
})

works = Object
  .keys(works)
  .map(wkey => {
    const work = works[wkey]
    work.books = Object
      .keys(work.books)
      .map(bkey => {
        const book = work.books[bkey]
        book.chapters = Object
          .keys(book.chapters)
          .map(ckey => book.chapters[ckey])
        return book
      })
    return work
  })

fs.writeFileSync('./structure.json', JSON.stringify(works, null, 2))
