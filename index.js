
createStructure()

function createLunrIndex() {
  const fs = require('fs')
  const lunr = require('lunr')
  const items = require('./verses.json')

  var idx = lunr(function () {
    this.ref('ref')
    this.field('text')
    items.forEach(function (doc) {
      this.add(doc)
    }, this)
  })

  fs.writeFileSync('./index.json', JSON.stringify(idx))
}


function createVerseMap() {
  const fs = require('fs')
  const items = require('./verses.json')
  const map = {}
  items.forEach(item => {
    delete item.verse
    delete item.chapter
    delete item.book
    map[item.ref] = item
  })
  fs.writeFileSync('./docs/verse-map.json', JSON.stringify(map))
}



function createStructure() {

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
            .length
            // .map(ckey => book.chapters[ckey])
          return book
        })
      return work
    })

  fs.writeFileSync('./docs/structure.json', JSON.stringify(works))

}
